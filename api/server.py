from __future__ import annotations

import asyncio
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).parent.parent
RUNS_DIR = BASE_DIR / "runs"
PERSONALITIES_DIR = BASE_DIR / "engine" / "personalities"

from api.analytics import (  # noqa: E402
    CAST_FIRST_NAMES,
    get_summary,
    load_run_events as _load_run_events_analytics,
    read_lines as _read_lines_analytics,
)

app = FastAPI(title="RHOUV API")

_active_run: dict = {"proc": None, "file": None}

# Model overrides for the next /run call (in-memory, resets on server restart).
_model_config: dict[str, str] = {}

# Engine parameter overrides (context windows etc.) — in-memory, reset on restart.
_engine_config: dict[str, int] = {}

# Approximate cost per 1M tokens (input, output) for known Magica-served models.
# These are estimates — check Magica's pricing page for exact figures.


class ModelConfigBody(BaseModel):
    personality: str | None = None
    director: str | None = None
    judge: str | None = None


class EngineConfigBody(BaseModel):
    public_context_window: int | None = None
    judge_context_window: int | None = None
    wine_amount: float | None = None

app.mount("/images", StaticFiles(directory=str(BASE_DIR / "images")), name="images")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _safe_run_path(file: str) -> Path:
    """Resolve path and verify it's inside RUNS_DIR."""
    if file.startswith("."):
        raise HTTPException(400, "invalid file")
    path = (RUNS_DIR / file).resolve()
    if path.parent != RUNS_DIR.resolve() or not path.exists():
        raise HTTPException(400, "invalid file")
    return path


def _read_lines(path: Path) -> list[dict]:
    return _read_lines_analytics(path)


@app.get("/runs")
def list_runs() -> list[str]:
    return sorted(
        f.name
        for f in RUNS_DIR.glob("*.jsonl")
        if not f.name.startswith(".")
    )


@app.get("/personas")
def get_personas() -> list[dict]:
    # Load all cards first so we can cross-reference secrets.
    all_data: dict[str, dict] = {}
    for f in PERSONALITIES_DIR.glob("*.yaml"):
        data = yaml.safe_load(f.read_text())
        all_data[data["name"]] = data

    personas = []
    for name, data in all_data.items():
        # Resolve whose secret this personality knows (mirrors build_secret_context in run.py).
        known_to_key = data.get("secret_known_to", "").strip().lower()
        known_about: str | None = None
        known_secret: str | None = None
        for other_name, other_data in all_data.items():
            if other_name != name and other_name.lower().startswith(known_to_key):
                known_about = other_name
                known_secret = other_data.get("secret", "")
                break

        personas.append(
            {
                "name": data["name"],
                "persona_type": data.get("archetype", ""),
                "quote": data.get("tagline", ""),
                "title_card_position": data.get("title_card_position", 99),
                "goal": data.get("goal", ""),
                "weakness": data.get("weakness", ""),
                "secret": data.get("secret", ""),
                "known_about": known_about,
                "known_secret": known_secret,
            }
        )
    return sorted(personas, key=lambda x: x["title_card_position"])


@app.get("/events")
def get_events(file: str = Query(...)) -> list[dict]:
    path = _safe_run_path(file)
    return _read_lines(path)

# streams to client using yield and asyncio.sleep to simulate real-time event streaming
# ... = required or return 400

@app.get("/replay")
async def replay_sse(
    file: str = Query(...), delay: float = 0.3
) -> StreamingResponse:
    path = _safe_run_path(file)
    events = _read_lines(path)

    async def generate():
        for event in events:
            yield f"data: {json.dumps(event)}\n\n"
            await asyncio.sleep(delay)
        yield 'data: {"type":"done"}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/run")
def start_run(personalities: int = 6, fast: bool = False) -> dict:
    """Spawn engine.run as a background subprocess, streaming events to a new JSONL file."""
    if _active_run["proc"] and _active_run["proc"].poll() is None:
        raise HTTPException(409, "run already in progress")

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    filename = f"episode_{ts}.jsonl"
    output_path = RUNS_DIR / filename
    RUNS_DIR.mkdir(exist_ok=True)

    python = str(BASE_DIR / ".venv" / "bin" / "python3.12")
    from engine.llm import MODELS
    cmd = [python, "-m", "engine.run", "--output", str(output_path)]
    if fast:
        cmd.append("--fast")
    if personalities < 6:
        cmd.extend(["--personalities", str(personalities)])
    for role, flag in [("personality", "--personality-model"),
                       ("director",    "--director-model"),
                       ("judge",       "--judge-model")]:
        model = _model_config.get(role) or MODELS.get(role)
        if model:
            cmd.extend([flag, model])
    for key, flag in [("public_context_window", "--public-context-window"),
                      ("judge_context_window",  "--judge-context-window"),
                      ("wine_amount",           "--wine-amount")]:
        val = _engine_config.get(key)
        if val is not None:
            cmd.extend([flag, str(val)])

    proc = subprocess.Popen(cmd, cwd=str(BASE_DIR))
    _active_run["proc"] = proc
    _active_run["file"] = filename
    return {"status": "started", "file": filename}


@app.get("/models")
async def list_models() -> list[dict]:
    """Return Magica's LLM model list from the public catalog endpoint.

    Uses /v1/llm/models.json (no auth required). Returns [] on failure.
    The litellm_id field is the model string to pass to the engine.
    Cost data comes directly from the catalog ($/M tokens).
    """
    base = os.getenv("OPENAI_API_BASE", "https://inference.magica.com/v1").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{base}/llm/models.json")
            resp.raise_for_status()
            raw = resp.json()
    except Exception:
        return []

    models_dict = raw.get("magica", {}).get("models", {})
    results = []
    for model_id, info in models_dict.items():
        cost = info.get("cost", {})
        results.append({
            "id": info.get("name", model_id),
            "litellm_id": f"openai/{model_id}",
            "input_per_m": cost.get("input"),
            "output_per_m": cost.get("output"),
            "reasoning": info.get("reasoning", False),
        })
    return sorted(results, key=lambda x: x["id"])


@app.get("/config/models")
def get_model_config() -> dict:
    """Return current model assignments (base defaults merged with any overrides)."""
    from engine.llm import MODELS
    return {role: _model_config.get(role, model) for role, model in MODELS.items()}


@app.post("/config/models")
def set_model_config(body: ModelConfigBody) -> dict:
    """Override model assignments for subsequent /run calls."""
    for role in ("personality", "director", "judge"):
        val = getattr(body, role)
        if val:
            _model_config[role] = val
    from engine.llm import MODELS
    return {role: _model_config.get(role, model) for role, model in MODELS.items()}


_ENGINE_DEFAULTS = {"public_context_window": 12, "judge_context_window": 40, "wine_amount": 1.0}


@app.get("/config/engine")
def get_engine_config() -> dict:
    """Return current engine parameter config (overrides merged with defaults)."""
    return {k: _engine_config.get(k, v) for k, v in _ENGINE_DEFAULTS.items()}


@app.post("/config/engine")
def set_engine_config(body: EngineConfigBody) -> dict:
    """Override engine parameters for subsequent /run calls."""
    if body.public_context_window is not None:
        _engine_config["public_context_window"] = body.public_context_window
    if body.judge_context_window is not None:
        _engine_config["judge_context_window"] = body.judge_context_window
    if body.wine_amount is not None:
        _engine_config["wine_amount"] = body.wine_amount
    return {k: _engine_config.get(k, v) for k, v in _ENGINE_DEFAULTS.items()}


@app.get("/run/status")
def run_status() -> dict:
    """Return whether a run is in progress and which file it's writing to."""
    proc = _active_run["proc"]
    if proc is None:
        return {"running": False, "file": None}
    running = proc.poll() is None
    return {"running": running, "file": _active_run["file"]}


@app.get("/eval/summary")
def eval_summary(runs: str = Query(...)) -> list[dict]:
    run_names = [r.strip() for r in runs.split(",") if r.strip()]
    results = []
    for name in run_names:
        summary = get_summary(name)
        if summary:
            results.append({"file": name, **summary})
    return results
