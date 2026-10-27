"""Shared analytics helpers for api/server.py and mcp/server.py."""
from __future__ import annotations

import json
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
RUNS_DIR = BASE_DIR / "runs"

CAST_FIRST_NAMES: dict[str, str] = {
    "Vivienne": "Vivienne Davenport",
    "Cassandra": "Cassandra Cole",
    "Bianca": "Bianca Noel",
    "Diane": "Diane Wentworth",
    "Petra": "Petra Voss",
    "Madison": "Madison Fleur",
}

_AGGRO_MARKERS = ["!", "never", "always", "excuse me", "frankly", "how dare"]


def read_lines(path: Path) -> list[dict]:
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


def load_run_events(file: str) -> list[dict]:
    """Load events from a run file. Returns [] on bad/missing path."""
    if file.startswith("."):
        return []
    path = (RUNS_DIR / file).resolve()
    if path.parent != RUNS_DIR.resolve() or not path.exists():
        return []
    return read_lines(path)


def latest_run() -> str | None:
    """Return the filename of the most recent run, or None."""
    files = sorted(RUNS_DIR.glob("*.jsonl"), key=lambda f: f.stat().st_mtime)
    return files[-1].name if files else None


def behavior_tier(composure: float) -> str:
    if composure >= 70:
        return "high"
    if composure >= 40:
        return "mid"
    return "low"


def compute_summary(events: list[dict]) -> dict:
    """Full analytics pass over a list of events. Returns the summary dict."""
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
            if e["composure"] < 20 and first_breakdown.get(e["speaker"]) is None:
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
                tier = behavior_tier(comp)
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

    return {
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
