"""Shared analytics helpers for api/server.py and mcp/server.py."""
from __future__ import annotations

import json
from pathlib import Path

import yaml

BASE_DIR = Path(__file__).parent.parent
RUNS_DIR = BASE_DIR / "runs"
_PERSONALITIES_DIR = BASE_DIR / "engine" / "personalities"


def _load_cast_first_names() -> dict[str, str]:
    """Build {first_name: full_name} from personality YAML files."""
    result = {}
    for f in sorted(_PERSONALITIES_DIR.glob("*.yaml")):
        with open(f) as fh:
            card = yaml.safe_load(fh)
        full = card["name"]
        first = full.split()[0]
        result[first] = full
    return result


CAST_FIRST_NAMES: dict[str, str] = _load_cast_first_names()

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


_events_cache: dict[str, list[dict]] = {}
_summary_cache: dict[str, dict] = {}


def _is_complete(events: list[dict]) -> bool:
    """True if the run has a run_meta event (i.e. the engine finished)."""
    return any(e.get("type") == "run_meta" for e in events)


def load_run_events(file: str) -> list[dict]:
    """Load events from a run file. Returns [] on bad/missing path.

    Only caches complete runs (those with a run_meta event). Live runs grow as
    the engine writes events; caching a partial read would freeze stale data.
    """
    if file in _events_cache:
        return _events_cache[file]
    if file.startswith("."):
        return []
    path = (RUNS_DIR / file).resolve()
    if path.parent != RUNS_DIR.resolve() or not path.exists():
        return []
    result = read_lines(path)
    if _is_complete(result):
        _events_cache[file] = result
    return result


def get_summary(file: str) -> dict | None:
    """Load and summarize a run file.

    Only caches complete runs (those with a run_meta event). Incomplete/live
    runs are re-read each time so the summary stays current until the episode
    finishes, at which point caching kicks in.
    """
    if file in _summary_cache:
        return _summary_cache[file]
    events = load_run_events(file)
    if not events:
        return None
    summary = compute_summary(events)
    if _is_complete(events):
        _summary_cache[file] = summary
    return summary


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
    alliance_events: list[dict] = []
    behavior_buckets: dict[str, dict] = {
        "high": {"words": [], "aggro": []},
        "mid":  {"words": [], "aggro": []},
        "low":  {"words": [], "aggro": []},
    }
    # Per-personality drama action counts by class
    drama_stats: dict[str, dict[str, int]] = {}
    # Per-personality table_talk statement count
    talk_counts: dict[str, int] = {}
    # Composure of every personality sampled at each table_talk event.
    # {name: [{stmt: int, value: float}]} where stmt = running table_talk count.
    # Captures how each personality's composure evolves over the dinner's statement sequence.
    composure_timeline: dict[str, list] = {}
    _current_comp: dict[str, float] = {}  # latest composure per personality
    _seen_names: set[str] = set()         # personalities observed in this run
    _stmt_count: int = 0

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
            if e["composure"] < 45 and first_breakdown.get(e["speaker"]) is None:
                first_breakdown[e["speaker"]] = i
            spk = e.get("speaker") or ""
            if spk:
                _current_comp[spk] = e["composure"]
                _seen_names.add(spk)

        elif t in ("alliance_formed", "feud_declared"):
            alliance_events.append({"a": e["a"], "b": e["b"], "kind": e["kind"]})

        elif t == "interrupt":
            a = e.get("interruptor") or e.get("interrupter")
            b = e.get("target") or e.get("interrupted")
            if a and b:
                alliance_events.append({"a": a, "b": b, "kind": "feud"})

        elif t == "twist":
            twists.append({"idx": i, "event": e})

        elif t == "drama_action":
            speaker = e.get("speaker") or ""
            cls = e.get("action_class") or "scene"
            if speaker:
                drama_stats.setdefault(speaker, {"targeted": 0, "area": 0, "exit": 0, "scene": 0})
                drama_stats[speaker][cls] = drama_stats[speaker].get(cls, 0) + 1

        elif t == "table_talk":
            speaker = e.get("speaker") or ""
            if speaker:
                talk_counts[speaker] = talk_counts.get(speaker, 0) + 1
                _seen_names.add(speaker)
                _current_comp.setdefault(speaker, 100.0)
            # Snapshot every known personality's composure at this statement position.
            _stmt_count += 1
            for name in _seen_names:
                composure_timeline.setdefault(name, []).append({
                    "stmt": _stmt_count,
                    "value": _current_comp.get(name, 100.0),
                })
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

        # lobby_talk and pre_dinner_talk are intentionally excluded from
        # alliance_weights — private scenes shouldn't inflate public relationship weights.

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
        "alliance_events": alliance_events,
        "behavior_metrics": behavior_metrics,
        "drama_stats": drama_stats,
        "talk_counts": talk_counts,
        "composure_timeline": composure_timeline,
        "run_meta": run_meta,
    }
