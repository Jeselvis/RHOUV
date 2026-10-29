"""drama.py — DRAMA: signal parsing, classification, and consequence application.

Personalities can end a turn with:
    DRAMA: [describe exactly what you do] [Name if targeting someone]

This module parses that signal, classifies the action into one of four categories,
and applies the corresponding brand/composure consequences.
"""

import re
from datetime import datetime, timezone


# ─── Signal parsing ────────────────────────────────────────────────────────────

_DRAMA_RE = re.compile(r"\nDRAMA:\s*(.+?)\s*$", re.IGNORECASE | re.DOTALL)

# Keywords for classification (checked after name matching)
_EXIT_KEYWORDS = ("leave", "walk out", "storm out", "exit", "step away", "go to lobby", "outside")
_AREA_KEYWORDS = ("flip", "overturn", "table", "smash", "sweep", "shatter", "knock over", "upend")


def check_drama_signal(
    speech: str,
    all_names: list[str],
) -> tuple[str | None, str | None, str, str]:
    """Parse a DRAMA: signal from a speech string.

    Returns:
        (action_class, target_or_None, description_text, clean_speech)

    action_class is one of: "targeted", "area", "exit", "scene", or None.
    clean_speech has the DRAMA: line stripped.
    """
    match = _DRAMA_RE.search(speech)
    if not match:
        return None, None, "", speech

    description = match.group(1).strip()
    clean_speech = speech[: match.start()].rstrip()

    # Classification: priority order
    desc_lower = description.lower()

    # 1. Name match → targeted
    target = None
    for name in all_names:
        first = name.split()[0]
        if first.lower() in desc_lower or name.lower() in desc_lower:
            target = name
            break

    if target is not None:
        return "targeted", target, description, clean_speech

    # 2. Exit keywords
    if any(kw in desc_lower for kw in _EXIT_KEYWORDS):
        return "exit", None, description, clean_speech

    # 3. Area/destruction keywords
    if any(kw in desc_lower for kw in _AREA_KEYWORDS):
        return "area", None, description, clean_speech

    # 4. Default
    return "scene", None, description, clean_speech


# ─── Consequence application ───────────────────────────────────────────────────

def apply_drama_consequences(
    action_class: str,
    speaker: str,
    target: str | None,
    all_names: list[str],
    composure,        # ComposureLedger
    brand,            # BrandLedger
    log_fn,           # callable(event_dict)
) -> None:
    """Apply brand/composure hits based on drama class.

    Classes and their consequences:
        targeted  — actor: -5 brand, -10 composure; target: -25 composure, -8 brand; bystanders: -5 composure
        area      — actor: -10 brand, -15 composure; bystanders: -20 composure
        exit      — actor: sets lobby_absent (handled in run.py); bystanders: -3 composure
        scene     — actor: -3 brand, -5 composure; bystanders: -3 composure
    """
    ts = datetime.now(timezone.utc).isoformat()
    bystanders = [n for n in all_names if n != speaker and n != target]

    if action_class == "targeted":
        ev = brand.delta(speaker, -5.0, f"physical action targeting {target}")
        log_fn(ev)
        ev = composure.delta(speaker, -10.0, f"drama: targeted {target}")
        log_fn(ev)
        if target:
            ev = composure.delta(target, -25.0, f"physically targeted by {speaker}")
            log_fn(ev)
            ev = brand.delta(target, -8.0, f"targeted by {speaker} (drama)")
            log_fn(ev)
        for name in bystanders:
            ev = composure.delta(name, -5.0, f"witnessed drama targeting {target}")
            log_fn(ev)

    elif action_class == "area":
        ev = brand.delta(speaker, -10.0, "area drama action")
        log_fn(ev)
        ev = composure.delta(speaker, -15.0, "drama: area action")
        log_fn(ev)
        for name in [n for n in all_names if n != speaker]:
            ev = composure.delta(name, -20.0, f"caught in {speaker}'s area drama")
            log_fn(ev)

    elif action_class == "exit":
        # Lobby_absent tracking is handled in run.py after this call.
        for name in bystanders:
            ev = composure.delta(name, -3.0, f"{speaker} walked out")
            log_fn(ev)

    elif action_class == "scene":
        ev = brand.delta(speaker, -3.0, "scene drama action")
        log_fn(ev)
        ev = composure.delta(speaker, -5.0, "drama: scene action")
        log_fn(ev)
        for name in bystanders:
            ev = composure.delta(name, -3.0, f"witnessed {speaker}'s scene")
            log_fn(ev)
