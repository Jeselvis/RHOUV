"""RHOUV Analytics MCP Server.

Run via: python3.12 -m mcp.server
Registered in .claude/settings.local.json as 'rhouv-analytics'.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is on path so api.analytics resolves.
_ROOT = Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from mcp.server.mcpserver import MCPServer

from api.analytics import (
    CAST_FIRST_NAMES,
    RUNS_DIR,
    compute_summary,
    latest_run,
    load_run_events,
)
from engine.memory import MEMORY_PATH

mcp = MCPServer("rhouv-analytics", description="Query RHOUV episode analytics")


def _resolve(run: str | None) -> str | None:
    """Return run filename, defaulting to latest if None."""
    if run:
        return run
    return latest_run()


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_episodes() -> list[dict]:
    """List all recorded episode run files with timestamps."""
    files = sorted(RUNS_DIR.glob("*.jsonl"), key=lambda f: f.stat().st_mtime)
    return [
        {
            "file": f.name,
            "mtime": f.stat().st_mtime,
            "size_kb": round(f.stat().st_size / 1024, 1),
        }
        for f in files
    ]


@mcp.tool()
def get_leaderboard(run: str | None = None) -> dict:
    """Return ranked brand scores and behavior tiers for an episode.

    Args:
        run: Episode filename (e.g. episode_20261027T154356.jsonl).
             Defaults to latest episode.
    """
    filename = _resolve(run)
    if not filename:
        return {"error": "no episodes found"}
    events = load_run_events(filename)
    if not events:
        return {"error": f"no events in {filename}"}
    summary = compute_summary(events)
    ranked = sorted(summary["final_brand"].items(), key=lambda kv: kv[1], reverse=True)
    return {
        "file": filename,
        "leaderboard": [
            {"rank": i + 1, "name": name, "brand": score}
            for i, (name, score) in enumerate(ranked)
        ],
    }


@mcp.tool()
def get_personality_arc(name: str, run: str | None = None) -> dict:
    """Brand and composure arc over time for one personality.

    Args:
        name: First or full name (e.g. "Vivienne" or "Vivienne Davenport").
        run: Episode filename. Defaults to latest.
    """
    filename = _resolve(run)
    if not filename:
        return {"error": "no episodes found"}
    events = load_run_events(filename)
    if not events:
        return {"error": f"no events in {filename}"}

    # Resolve full name
    full_name = CAST_FIRST_NAMES.get(name.split()[0].capitalize(), name)

    summary = compute_summary(events)
    return {
        "file": filename,
        "name": full_name,
        "brand_arc": summary["brand_over_time"].get(full_name, []),
        "composure_arc": summary["composure_over_time"].get(full_name, []),
        "first_breakdown_idx": summary["first_breakdown"].get(full_name),
        "final_brand": summary["final_brand"].get(full_name),
    }


@mcp.tool()
def get_alliances(run: str | None = None) -> dict:
    """Weighted mention graph plus explicit alliance/feud events.

    Args:
        run: Episode filename. Defaults to latest.
    """
    filename = _resolve(run)
    if not filename:
        return {"error": "no episodes found"}
    events = load_run_events(filename)
    if not events:
        return {"error": f"no events in {filename}"}
    summary = compute_summary(events)
    edges = [
        {"pair": key, "weight": weight}
        for key, weight in sorted(
            summary["alliance_weights"].items(), key=lambda kv: kv[1], reverse=True
        )
    ]
    alliance_events = [
        e for e in events
        if e.get("type") in ("alliance_formed", "feud_declared")
    ]
    return {"file": filename, "edges": edges, "alliance_events": alliance_events}


@mcp.tool()
def get_memory_state() -> dict:
    """Current cross-episode memory: episode count, alliances, per-personality history."""
    if not MEMORY_PATH.exists():
        return {"error": "no memory file found — run at least one episode first"}
    import json
    with open(MEMORY_PATH) as fh:
        return json.load(fh)


@mcp.tool()
def get_episode_memory_injections(run: str | None = None) -> list[dict]:
    """What memory was injected into each personality at the start of this episode.

    Reads memory_loaded events from the episode JSONL.

    Args:
        run: Episode filename. Defaults to latest.
    """
    filename = _resolve(run)
    if not filename:
        return [{"error": "no episodes found"}]
    events = load_run_events(filename)
    if not events:
        return [{"error": f"no events in {filename}"}]
    return [e for e in events if e.get("type") == "memory_loaded"]


@mcp.tool()
def get_twists(run: str | None = None) -> dict:
    """All twist events with course context.

    Args:
        run: Episode filename. Defaults to latest.
    """
    filename = _resolve(run)
    if not filename:
        return {"error": "no episodes found"}
    events = load_run_events(filename)
    if not events:
        return {"error": f"no events in {filename}"}
    summary = compute_summary(events)
    return {"file": filename, "twists": summary["twists"]}


@mcp.tool()
def get_dialogue(
    run: str | None = None,
    speaker: str | None = None,
    course: str | None = None,
) -> dict:
    """Filtered table_talk and confessional events.

    Args:
        run: Episode filename. Defaults to latest.
        speaker: Filter to this speaker (first or full name). None = all.
        course: Filter to this course name (e.g. "appetizer"). None = all.
    """
    filename = _resolve(run)
    if not filename:
        return {"error": "no episodes found"}
    events = load_run_events(filename)
    if not events:
        return {"error": f"no events in {filename}"}

    full_speaker: str | None = None
    if speaker:
        full_speaker = CAST_FIRST_NAMES.get(speaker.split()[0].capitalize(), speaker)

    lines = []
    for e in events:
        if e.get("type") not in ("table_talk", "confessional"):
            continue
        if full_speaker and e.get("speaker") != full_speaker:
            continue
        if course and e.get("course", "").lower() != course.lower():
            continue
        lines.append(
            {
                "type": e["type"],
                "speaker": e.get("speaker"),
                "course": e.get("course"),
                "content": e.get("content"),
                "composure": e.get("composure"),
            }
        )
    return {"file": filename, "count": len(lines), "dialogue": lines}


@mcp.tool()
def compare_episodes() -> list[dict]:
    """Final brand scores across all recorded episodes."""
    files = sorted(RUNS_DIR.glob("*.jsonl"), key=lambda f: f.stat().st_mtime)
    results = []
    for f in files:
        from api.analytics import read_lines
        events = read_lines(f)
        if not events:
            continue
        summary = compute_summary(events)
        results.append({"file": f.name, "final_brand": summary["final_brand"]})
    return results


@mcp.tool()
def get_run_meta(run: str | None = None) -> dict:
    """Models used, token cost, and config for an episode.

    Args:
        run: Episode filename. Defaults to latest.
    """
    filename = _resolve(run)
    if not filename:
        return {"error": "no episodes found"}
    events = load_run_events(filename)
    if not events:
        return {"error": f"no events in {filename}"}
    summary = compute_summary(events)
    meta = summary.get("run_meta") or {}
    return {"file": filename, "run_meta": meta}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
