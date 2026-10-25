from __future__ import annotations

import asyncio
import json
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

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
    personas = []
    for f in PERSONALITIES_DIR.glob("*.yaml"):
        data = yaml.safe_load(f.read_text())
        personas.append(
            {
                "name": data["name"],
                "persona_type": data.get("archetype", ""),
                "quote": data.get("tagline", ""),
                "title_card_position": data.get("title_card_position", 99),
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


def _load_run_events(file: str) -> list[dict]:
    if file.startswith("."):
        return []
    path = (RUNS_DIR / file).resolve()
    if path.parent != RUNS_DIR.resolve() or not path.exists():
        return []
    return _read_lines(path)


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

        run_meta = next((e for e in events if e.get("type") == "run_meta"), None)

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
                "run_meta": run_meta,
            }
        )

    return results
