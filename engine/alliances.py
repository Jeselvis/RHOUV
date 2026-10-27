"""
alliances.py — alliance and feud tracking between personalities.

Personalities signal alliances or feuds by appending a marker to their
table-talk turn (same pattern as INTERRUPT):

    ALLY: [Name]   — forms an alliance with that person
    FEUD: [Name]   — declares a feud with that person

At most one of ALLY / FEUD / INTERRUPT per turn. INTERRUPT takes priority
(checked first in the dinner loop); alliance signals only parsed when no
interrupt was found.

Alliances are undirected: ALLY: Diane from Vivienne sets the same edge as
ALLY: Vivienne from Diane.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone


class AllianceLedger:
    """Tracks ally/feud relationships between personalities."""

    def __init__(self, names: list[str]):
        self._names = list(names)
        # frozenset({a, b}) -> "ally" | "feud"
        self._edges: dict[frozenset, str] = {}

    def set(self, a: str, b: str, kind: str) -> dict:
        """Form an alliance or declare a feud between two personalities.

        Args:
            a:    First personality name.
            b:    Second personality name.
            kind: "ally" or "feud".

        Returns:
            Event dict suitable for logging to the episode JSONL.
        """
        if kind not in ("ally", "feud"):
            raise ValueError(f"Invalid alliance kind: {kind!r}")
        edge = frozenset({a, b})
        self._edges[edge] = kind
        event_type = "alliance_formed" if kind == "ally" else "feud_declared"
        return {
            "type":      event_type,
            "a":         a,
            "b":         b,
            "kind":      kind,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def status_for(self, name: str) -> dict[str, str]:
        """Returns {other_name: "ally"/"feud"} for this personality."""
        result = {}
        for edge, kind in self._edges.items():
            if name in edge:
                other = next(n for n in edge if n != name)
                result[other] = kind
        return result

    def snapshot(self) -> list[dict]:
        """Serializable list of all alliance edges for memory persistence."""
        return [
            {"a": sorted(edge)[0], "b": sorted(edge)[1], "kind": kind}
            for edge, kind in self._edges.items()
        ]

    @classmethod
    def from_snapshot(cls, names: list[str], snapshot: list[dict]) -> "AllianceLedger":
        """Restore an AllianceLedger from a saved snapshot."""
        ledger = cls(names)
        for entry in snapshot:
            edge = frozenset({entry["a"], entry["b"]})
            ledger._edges[edge] = entry["kind"]
        return ledger


# Regex: ALLY: [Name] or FEUD: [Name] at end of turn, optional trailing whitespace.
_SIGNAL_RE = re.compile(
    r"\n(ALLY|FEUD):\s*\[([^\]]+)\]\s*$",
    re.IGNORECASE,
)


def check_alliance_signal(
    speech: str, all_names: list[str]
) -> tuple[str | None, str | None, str]:
    """Parse an ALLY or FEUD marker from a personality's speech.

    Args:
        speech:    Raw LLM output for this turn.
        all_names: Full names of all personalities in the episode.

    Returns:
        (kind, target, clean_speech) where:
          - kind: "ally" or "feud", or None if no valid marker found.
          - target: Full name of the target personality, or None.
          - clean_speech: Speech with the marker stripped.
    """
    match = _SIGNAL_RE.search(speech)
    if not match:
        return None, None, speech

    kind = match.group(1).lower()
    raw_target = match.group(2).strip()
    clean_speech = speech[: match.start()].rstrip()

    # Resolve to a full name — match on first name or full name.
    target = None
    raw_lower = raw_target.lower()
    for name in all_names:
        if name.lower() == raw_lower or name.split()[0].lower() == raw_lower:
            target = name
            break

    if target is None:
        # Unknown name — ignore the marker, return original speech.
        return None, None, speech

    return kind, target, clean_speech
