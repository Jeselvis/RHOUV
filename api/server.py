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

CAST_FIRST_NAMES: dict[str, str] = {
    "Vivienne": "Vivienne Davenport",
    "Cassandra": "Cassandra Cole",
    "Bianca": "Bianca Noel",
    "Diane": "Diane Wentworth",
    "Petra": "Petra Voss",
    "Madison": "Madison Fleur",
}

app = FastAPI(title="RHOUV API")

_active_run: dict = {"proc": None, "file": None}

# Model overrides for the next /run call (in-memory, resets on server restart).
_model_config: dict[str, str] = {}

# Approximate cost per 1M tokens (input, output) for known Magica-served models.
# These are estimates — check Magica's pricing page for exact figures.
_COST_HINTS: dict[str, dict] = {
    "~anthropic/claude-haiku-latest":     {"input_per_m": 0.80,  "output_per_m": 4.00},
    "~anthropic/claude-sonnet-latest":    {"input_per_m": 3.00,  "output_per_m": 15.00},
    "~anthropic/claude-opus-latest":      {"input_per_m": 15.00, "output_per_m": 75.00},
    "deepseek/deepseek-v4.1-flash":       {"input_per_m": 0.07,  "output_per_m": 0.28},
    "deepseek/deepseek-r1":               {"input_per_m": 0.14,  "output_per_m": 0.56},
    "deepseek/deepseek-chat":             {"input_per_m": 0.14,  "output_per_m": 0.28},
    "google/gemini-2.5-flash":            {"input_per_m": 0.15,  "output_per_m": 0.60},
    "google/gemini-2.5-flash-lite":       {"input_per_m": 0.10,  "output_per_m": 0.40},
}


class ModelConfigBody(BaseModel):
    personality: str | None = None
    director: str | None = None
    judge: str | None = None

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
    events: list[dict] = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return events


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

    proc = subprocess.Popen(cmd, cwd=str(BASE_DIR))
    _active_run["proc"] = proc
    _active_run["file"] = filename
    return {"status": "started", "file": filename}


@app.get("/models")
async def list_models() -> list[dict]:
    """Proxy Magica's model list, enriched with static cost hints.

    Returns [] if OPENAI_API_BASE / OPENAI_API_KEY are not configured.
    The litellm_id field is the model string to pass to the engine.
    """
    base = os.getenv("OPENAI_API_BASE", "").rstrip("/")
    key = os.getenv("OPENAI_API_KEY", "")
    if not base or not key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{base}/models",
                headers={"Authorization": f"Bearer {key}"},
            )
            resp.raise_for_status()
            raw = resp.json()
    except Exception:
        return []

    items = raw.get("data", []) if isinstance(raw, dict) else raw
    results = []
    for item in items:
        model_id = item.get("id", "")
        cost = _COST_HINTS.get(model_id, {})
        results.append({
            "id": model_id,
            "litellm_id": f"openai/{model_id}",
            "input_per_m": cost.get("input_per_m"),
            "output_per_m": cost.get("output_per_m"),
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


@app.get("/run/status")
def run_status() -> dict:
    """Return whether a run is in progress and which file it's writing to."""
    proc = _active_run["proc"]
    if proc is None:
        return {"running": False, "file": None}
    running = proc.poll() is None
    return {"running": running, "file": _active_run["file"]}


def _load_run_events(file: str) -> list[dict]:
    if file.startswith("."):
        return []
    path = (RUNS_DIR / file).resolve()
    if path.parent != RUNS_DIR.resolve() or not path.exists():
        return []
    return _read_lines(path)


_AGGRO_MARKERS = ["!", "never", "always", "excuse me", "frankly", "how dare"]


def _behavior_tier(composure: float) -> str:
    if composure >= 70:
        return "high"
    if composure >= 40:
        return "mid"
    return "low"


@app.get("/eval/summary")
def eval_summary(runs: str = Query(...)) -> list[dict]:
    run_names = [r.strip() for r in runs.split(",") if r.strip()]
    results = []

    for name in run_names:
        events = _load_run_events(name)
        if not events:
            continue

        brand_over_time: dict[str, list] = {}
        final_brand: dict[str, float] = {}
        composure_over_time: dict[str, list] = {}
        first_breakdown: dict[str, int | None] = {v: None for v in CAST_FIRST_NAMES.values()}
        event_counts: dict[str, int] = {}
        twists: list[dict] = []
        alliance_weights: dict[str, float] = {}
        behavior_buckets: dict[str, dict] = {
            "high": {"words": [], "aggro": []},
            "mid":  {"words": [], "aggro": []},
            "low":  {"words": [], "aggro": []},
        }

        for i, e in enumerate(events):
            t = e["type"]
            event_counts[t] = event_counts.get(t, 0) + 1

            if t == "brand_delta":
                brand_over_time.setdefault(e["speaker"], []).append(
                    {"idx": i, "score": e["score"]}
                )
                final_brand[e["speaker"]] = e["score"]

            elif t == "composure_delta":
                composure_over_time.setdefault(e["speaker"], []).append(
                    {"idx": i, "value": e["composure"]}
                )
                if (
                    e["composure"] < 20
                    and first_breakdown.get(e["speaker"]) is None
                ):
                    first_breakdown[e["speaker"]] = i

            elif t == "twist":
                twists.append({"idx": i, "event": e})

            elif t == "table_talk":
                content = e.get("content") or ""
                speaker_first = (e.get("speaker") or "").split()[0]
                for fname, fullname in CAST_FIRST_NAMES.items():
                    if fname != speaker_first and fname in content:
                        pair = tuple(sorted([e["speaker"], fullname]))
                        key = f"{pair[0]}|{pair[1]}"
                        alliance_weights[key] = alliance_weights.get(key, 0) + 1.0

                if content:
                    comp = e.get("composure", 100)
                    tier = _behavior_tier(comp)
                    text_lower = content.lower()
                    n_words = len(content.split())
                    has_aggro = any(m in text_lower for m in _AGGRO_MARKERS)
                    behavior_buckets[tier]["words"].append(n_words)
                    behavior_buckets[tier]["aggro"].append(1 if has_aggro else 0)

        run_meta = next((e for e in events if e.get("type") == "run_meta"), None)

        behavior_metrics: dict[str, dict] = {}
        for tier, data in behavior_buckets.items():
            n = len(data["words"])
            behavior_metrics[tier] = {
                "n": n,
                "avg_words": round(sum(data["words"]) / n, 1) if n else 0,
                "aggro_rate": round(sum(data["aggro"]) / n, 3) if n else 0,
            }

        results.append(
            {
                "file": name,
                "total": len(events),
                "brand_over_time": brand_over_time,
                "final_brand": final_brand,
                "composure_over_time": composure_over_time,
                "first_breakdown": first_breakdown,
                "event_counts": event_counts,
                "twists": twists,
                "alliance_weights": alliance_weights,
                "behavior_metrics": behavior_metrics,
                "run_meta": run_meta,
            }
        )

    return results
