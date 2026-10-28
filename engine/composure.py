"""
composure.py — per-personality composure ledger and wine escalation.

Composure models the table energy arc of a real Housewives dinner: it starts
civil, builds through the courses, and somebody loses it over dessert.

Two inputs drive composure down:
  1. Targeted events — insults landed, secrets exposed, alliances called out.
     The dinner loop calls delta() when these happen.
  2. Wine accumulation — a global level that ticks up each course transition.
     wine_tick() nudges everyone's composure down uniformly.

Low composure changes how a personality speaks. The dinner loop calls
prompt_modifier() when building each personality's system prompt for their
turn. The modifier injects composure-state context — at high composure
nothing is injected; at critical levels the injection tells them their filter
is gone.

Per-personality composure_floor (set in the persona card, M2):
  Some personalities start more volatile. Petra is already half-gone.
  Diane holds until she can't. For M1 everyone starts at 100.
"""

from datetime import datetime, timezone

# Cool as a cucumber.
STARTING_COMPOSURE = 100.0

# How much the global wine level rises each course transition.
WINE_TICK_AMOUNT = 20.0

# How much wine level translates to composure drop per tick.
# Escalating: early courses loosen (small drop), dessert hits harder.
# Formula: drop = wine_level * WINE_COMPOSURE_FACTOR
# Tick 1 (level 20): ~5 pts.  Tick 2 (level 40): ~10 pts.  Total ~15 pts.
WINE_COMPOSURE_FACTOR = 0.25

# Thresholds and their prompt injections.
# Checked top-down; first match wins.
_LEVELS = [
    (70.0, None),  # composed — no injection
    (40.0, "You're getting irritated and your patience is thinning, though you're still holding it together. You're more clipped than usual."),
    (15.0, "Your composure is slipping. You're becoming direct in ways you normally wouldn't be. Things you've been sitting on are closer to the surface — and sometimes they come out."),
    (0.0,  "You've lost it. Your filter is gone. You say exactly what you think, including things you know you shouldn't. Secrets, grudges, real opinions — all of it is on the table now."),
]


class ComposureLedger:
    """Tracks composure per personality and global wine level."""

    def __init__(
        self,
        names: list[str],
        floors: dict[str, float] | None = None,
        wine_tick_amount: float = WINE_TICK_AMOUNT,
    ):
        """
        Args:
            names:            All personality names in the episode.
            floors:           Per-personality composure floors. Composure will not drop
                              below this value. Keyed by full name. Missing = 0.
            wine_tick_amount: How much the global wine level rises each course
                              transition. 0 = no wine effect. Default = WINE_TICK_AMOUNT.
        """
        self._composure: dict[str, float] = {name: STARTING_COMPOSURE for name in names}
        self._floors: dict[str, float] = floors or {}
        self._wine_tick_amount: float = wine_tick_amount
        self._wine_level: float = 0.0
        self._history: list[dict] = []

    def delta(self, name: str, amount: float, reason: str) -> dict:
        """Apply a composure change to one personality.

        Args:
            name:   Personality name. Negative amount = composure drops.
            amount: Change value. Insults and exposures are typically -10 to -25.
            reason: What caused the change — logged for eval tracking.

        Returns:
            Event dict logged to history.
        """
        if name not in self._composure:
            raise KeyError(f"Unknown personality: {name!r}")

        floor = self._floors.get(name, 0.0)
        unclamped = min(100.0, self._composure[name] + amount)
        new_value = max(floor, unclamped)
        floor_hit = amount < 0 and unclamped < floor
        self._composure[name] = new_value
        event = {
            "type":      "composure_delta",
            "speaker":   name,
            "delta":     amount,
            "composure": self._composure[name],
            "reason":    reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if floor_hit:
            event["floor_hit"] = True
        self._history.append(event)
        return event

    def wine_tick(self) -> list[dict]:
        """Advance the wine level by one course and drop everyone's composure.

        Called at each course transition. Returns one event per personality.
        The drop is proportional to wine level — early courses barely register,
        dessert hits harder because wine has been accumulating.
        """
        self._wine_level = min(100.0, self._wine_level + self._wine_tick_amount)
        drop = self._wine_level * WINE_COMPOSURE_FACTOR

        events = []
        for name in self._composure:
            events.append(self.delta(name, -drop, f"wine accumulation (level {self._wine_level:.0f})"))
        return events

    def prompt_modifier(self, name: str) -> str | None:
        """Return a composure-state injection for this personality's system prompt.

        Returns None when composure is high — no injection needed, normal voice.
        The dinner loop prepends this to the personality's turn prompt when non-None.
        """
        score = self._composure.get(name, STARTING_COMPOSURE)
        for threshold, text in _LEVELS:
            if score >= threshold:
                return text
        return _LEVELS[-1][1]

    def composure(self, name: str) -> float:
        """Current composure value for one personality."""
        return self._composure[name]

    def all_composures(self) -> dict[str, float]:
        """Snapshot of all composure values, for console display."""
        return dict(self._composure)

    def history(self) -> list[dict]:
        """Full list of composure events in chronological order."""
        return list(self._history)
