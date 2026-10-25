"""
brand.py — brand value ledger.

Tracks each personality's brand score across an episode. Every change is
recorded as an event dict so the event log has a full audit trail of who
gained or lost brand value, when, and why.

Brand value starts at 100 for all personalities. No floor or ceiling — the
judge can crater someone or send them stratospheric. Status tiers are derived
on read, not stored, so they always reflect current scores.

Status tiers (M2 will use these for promotion/demotion):
  Full Housewife   ≥ 100
  Friend of        60–99
  Guest            < 60
"""

from datetime import datetime, timezone


# Starting brand value for all personalities.
STARTING_VALUE = 100.0

# Status tier thresholds — derived from score, never stored.
TIERS = [
    (100.0, "Full Housewife"),
    (60.0,  "Friend of the Housewives"),
    (0.0,   "Guest"),
]


class BrandLedger:
    """Brand value ledger for one episode."""

    def __init__(self, names: list[str]):
        """
        Args:
            names: Personality names to track (must match persona card names exactly).
        """
        self._scores: dict[str, float] = {name: STARTING_VALUE for name in names}
        self._history: list[dict] = []

    def delta(self, name: str, amount: float, reason: str) -> dict:
        """Apply a brand value change and return the logged event.

        Args:
            name:   Personality name. Must be in the ledger.
            amount: Change in brand value (positive = gain, negative = loss).
            reason: One-line explanation — shown in console output and stored in log.

        Returns:
            Event dict with type, speaker, delta, new score, reason, and timestamp.

        Raises:
            KeyError: If name is not in the ledger.
        """
        if name not in self._scores:
            raise KeyError(f"Unknown personality: {name!r}")

        self._scores[name] += amount
        event = {
            "type":      "brand_delta",
            "speaker":   name,
            "delta":     amount,
            "score":     self._scores[name],
            "reason":    reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._history.append(event)
        return event

    def score(self, name: str) -> float:
        """Current brand value for one personality."""
        return self._scores[name]

    def leaderboard(self) -> list[dict]:
        """All personalities ranked by current score, highest first.

        Returns:
            List of dicts: {name, score, tier, rank}
        """
        ranked = sorted(self._scores.items(), key=lambda x: x[1], reverse=True)
        return [
            {
                "rank":  i + 1,
                "name":  name,
                "score": score,
                "tier":  _tier(score),
            }
            for i, (name, score) in enumerate(ranked)
        ]

    def history(self) -> list[dict]:
        """Full list of brand delta events in chronological order."""
        return list(self._history)


def _tier(score: float) -> str:
    """Derive status tier from score."""
    for threshold, label in TIERS:
        if score >= threshold:
            return label
    return TIERS[-1][1]
