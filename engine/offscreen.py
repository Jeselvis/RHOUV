"""
offscreen.py — off-screen character context for personality prompts.

Off-screen characters are people who may come up in conversation but never
sit at the dinner table. Each has a YAML card in engine/offscreen/ with an
associated_with list of first names (lowercased) indicating which personalities
have private knowledge about them.

build_offscreen_context() returns a formatted string for injection into a
personality's system prompt, covering only the characters relevant to them.
"""

from pathlib import Path

import yaml

OFFSCREEN_DIR = Path(__file__).parent / "offscreen"


def load_offscreen() -> dict[str, dict]:
    """Load all off-screen character cards keyed by name."""
    result = {}
    for f in sorted(OFFSCREEN_DIR.glob("*.yaml")):
        with open(f) as fh:
            card = yaml.safe_load(fh)
        result[card["name"]] = card
    return result


def build_offscreen_context(personality_name: str, offscreen: dict[str, dict]) -> str:
    """Facts about off-screen people relevant to this personality.

    Includes a character if the personality's first name (lowercased) appears
    in the character's associated_with list. Pulls known_facts bullets plus
    how_described_by_{firstname} if present.

    Returns "" if nothing relevant.
    """
    first = personality_name.split()[0].lower()
    sections = []

    for char_name, card in offscreen.items():
        associated = [s.lower() for s in card.get("associated_with", [])]
        if first not in associated:
            continue

        lines = [f"{char_name}:"]
        for fact in card.get("known_facts", []):
            lines.append(f"  - {fact}")

        desc_key = f"how_described_by_{first}"
        if desc_key in card:
            lines.append(f"  How you talk about them: {card[desc_key].strip()}")

        sections.append("\n".join(lines))

    return "\n\n".join(sections)
