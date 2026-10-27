"""
memory.py — cross-episode memory persistence.

Saves a summary of each episode to runs/memory.json so episode 2 can
inform personalities of what happened in episode 1.

Memory is extracted by pure event scanning — no LLM involved. The resulting
JSON is human-readable and directly queryable by MCP tools.

Schema:
{
  "episode_count": 2,
  "alliances": [{"a": "Vivienne Davenport", "b": "Diane Wentworth", "kind": "ally"}],
  "personalities": {
    "Vivienne Davenport": {
      "brand_end": 115.3,
      "composure_min": 45.2,
      "interruptions_received": ["Petra Voss"],
      "interruptions_given": [],
      "grudges": ["Petra Voss"]
    }
  }
}
"""

from __future__ import annotations

import json
from pathlib import Path

from engine.alliances import AllianceLedger

RUNS_DIR = Path(__file__).parent.parent / "runs"
MEMORY_PATH = RUNS_DIR / "memory.json"


def load_memory() -> dict | None:
    """Load saved memory. Returns None if no prior episodes."""
    if not MEMORY_PATH.exists():
        return None
    with open(MEMORY_PATH) as fh:
        return json.load(fh)


def save_memory(memory: dict) -> None:
    """Overwrite the memory file."""
    RUNS_DIR.mkdir(exist_ok=True)
    with open(MEMORY_PATH, "w") as fh:
        json.dump(memory, fh, indent=2)


def extract_memory(
    event_log: list[dict],
    names: list[str],
    alliances: AllianceLedger,
) -> dict:
    """Build memory from a completed episode event log.

    Pure event scanning — no LLM calls. Scans brand_delta for final scores,
    composure_delta for per-personality minimums, interrupt events for
    who interrupted whom, and alliance events.

    Returns a memory dict ready for save_memory().
    """
    # Track final brand scores and composure minimums.
    brand_end: dict[str, float] = {}
    composure_min: dict[str, float] = {name: 100.0 for name in names}
    interruptions_received: dict[str, list[str]] = {name: [] for name in names}
    interruptions_given: dict[str, list[str]] = {name: [] for name in names}

    # Load existing episode count if present.
    existing = load_memory()
    episode_count = (existing or {}).get("episode_count", 0) + 1

    for event in event_log:
        t = event.get("type")

        if t == "brand_delta":
            speaker = event.get("speaker")
            if speaker:
                brand_end[speaker] = event.get("score", 0.0)

        elif t == "composure_delta":
            speaker = event.get("speaker")
            comp = event.get("composure")
            if speaker and comp is not None:
                if comp < composure_min.get(speaker, 100.0):
                    composure_min[speaker] = comp

        elif t == "interrupt":
            interruptor = event.get("interruptor")
            target = event.get("target")
            if interruptor and target:
                interruptions_given[interruptor].append(target)
                interruptions_received[target].append(interruptor)

    # Grudges: people who interrupted you become grudges.
    personalities_data = {}
    for name in names:
        grudges = list(set(interruptions_received.get(name, [])))
        personalities_data[name] = {
            "brand_end":              brand_end.get(name, 100.0),
            "composure_min":          composure_min.get(name, 100.0),
            "interruptions_received": interruptions_received.get(name, []),
            "interruptions_given":    interruptions_given.get(name, []),
            "grudges":                grudges,
        }

    return {
        "episode_count": episode_count,
        "alliances":     alliances.snapshot(),
        "personalities": personalities_data,
    }


def build_memory_injection(name: str, memory: dict) -> str | None:
    """Prompt injection for one personality from prior episode memory.

    Returns None if no prior memory exists.

    Format:
        PREVIOUSLY (private — use to inform behavior, do not recap):
        - Last episode brand value: 115 (strong position)
        - Petra interrupted you — you haven't forgotten
        - Alliance with Diane held
        - Your lowest composure last episode: 45
    """
    if memory is None:
        return None

    pdata = memory.get("personalities", {}).get(name)
    if not pdata:
        return None

    lines = ["PREVIOUSLY (private — use to inform behavior, do not recap):"]

    brand_val = pdata.get("brand_end", 100.0)
    lines.append(f"- Last episode brand value: {brand_val:.0f}")

    for interruptor in pdata.get("interruptions_received", []):
        lines.append(f"- {interruptor} interrupted you — you haven't forgotten")

    # Alliances that include this name.
    for edge in memory.get("alliances", []):
        if edge["a"] == name or edge["b"] == name:
            other = edge["b"] if edge["a"] == name else edge["a"]
            kind = edge["kind"]
            verb = "held" if kind == "ally" else "declared"
            rel = "Alliance" if kind == "ally" else "Feud"
            lines.append(f"- {rel} with {other} {verb}")

    comp_min = pdata.get("composure_min", 100.0)
    lines.append(f"- Your lowest composure last episode: {comp_min:.0f}")

    if len(lines) == 1:
        return None

    return "\n".join(lines)
