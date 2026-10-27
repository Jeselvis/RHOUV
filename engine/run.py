"""
run.py — the dinner loop. Wires everything together for one episode.

Flow:
  1. Load persona cards from engine/personalities/*.yaml
  2. Initialize ledgers (brand, composure) and the director
  3. Run the dinner:
       For each turn the director schedules:
         a. Build this personality's system prompt (voice + composure state)
         b. Build the public context (what everyone at the table has heard)
         c. Call the LLM — personality speaks
         d. Check for an INTERRUPT marker in the response
         e. Log the table_talk event
         f. If interrupted: log interrupt, hit target composure, queue interruptor
         g. If confessional flagged: call confessional prompt, log it
       Between courses: wine_tick() — everyone loosens up
  4. Reckoning: judge model scores each personality, brand deltas applied
  5. Print leaderboard
  6. Save full episode log to runs/

Usage:
  python -m engine.run
  python -m engine.run --personalities 4 --fast
  python -m engine.run --episodes 3
"""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import yaml

from engine.alliances import AllianceLedger, check_alliance_signal
from engine.brand import BrandLedger
from engine.composure import ComposureLedger
from engine.director import Director, INTERRUPT_COMPOSURE_HIT, DEFAULT_CONFESSIONAL_EVERY
from engine.llm import call, MODELS, reset_token_totals, get_token_totals, override_models
from engine.memory import load_memory, save_memory, extract_memory, build_memory_injection
from engine.offscreen import load_offscreen, build_offscreen_context


# ─── Config ───────────────────────────────────────────────────────────────────

PERSONALITIES_DIR = Path(__file__).parent / "personalities"
RUNS_DIR          = Path(__file__).parent.parent / "runs"

# How many recent table-talk lines to include in the public context each turn.
# Too many = expensive; too few = personalities lose the thread.
PUBLIC_CONTEXT_WINDOW = 12

# How many recent events the judge reads when scoring.
JUDGE_CONTEXT_WINDOW = 40

# Composure drop applied when a personality says something cutting or exposes a secret.
# The dinner loop calls this manually when it detects those moments (M2 will automate it).
CUTTING_REMARK_HIT = 8.0


# ─── Persona card loading ──────────────────────────────────────────────────────

def load_personas(n: int | None = None) -> dict[str, dict]:
    """Load persona cards from YAML files.

    Args:
        n: If set, load only the first N cards alphabetically. Useful for
           quick test runs without the full cast.

    Returns:
        Dict of {name: card_data} where name matches the 'name' field in the YAML.
    """
    files = sorted(PERSONALITIES_DIR.glob("*.yaml"))
    if n:
        files = files[:n]

    personas = {}
    for f in files:
        with open(f) as fh:
            card = yaml.safe_load(fh)
        personas[card["name"]] = card

    return personas


def build_secret_context(name: str, personas: dict[str, dict]) -> str:
    """Return the secrets this personality is aware of.

    Each personality knows:
      - Their own secret (private, should not be volunteered)
      - The secret of whoever their secret_known_to points at

    This becomes part of their system prompt — they carry this knowledge
    into every turn, which may or may not influence what they say.
    """
    card = personas[name]
    lines = [f"Your secret: {card['secret'].strip()}"]

    # Find whose secret this personality knows.
    known_to_key = card.get("secret_known_to", "").strip().lower()
    for other_name, other_card in personas.items():
        if other_name == name:
            continue
        if other_name.lower().startswith(known_to_key):
            lines.append(
                f"You also know this about {other_name}: {other_card['secret'].strip()}"
            )
            break

    return "\n".join(lines)


# ─── Prompt builders ──────────────────────────────────────────────────────────

def build_personality_system(
    name: str,
    personas: dict[str, dict],
    composure_injection: str | None,
    offscreen: dict[str, dict] | None = None,
    alliances: "AllianceLedger | None" = None,
    memory_injection: str | None = None,
) -> str:
    """Build the system prompt for a personality's table-talk turn.

    Combines their voice, goal, weakness, and secret knowledge into a
    coherent character brief. The composure injection is prepended when
    composure is low — it modifies how they speak without changing who they are.
    """
    card = personas[name]
    secrets = build_secret_context(name, personas)

    offscreen_section = ""
    if offscreen:
        ctx = build_offscreen_context(name, offscreen)
        if ctx:
            offscreen_section = f"\nPEOPLE WHO MAY COME UP (private knowledge):\n{ctx}\n"

    alliance_section = ""
    if alliances:
        status = alliances.status_for(name)
        if status:
            lines = "\n".join(
                f"- {other}: {kind}" for other, kind in status.items()
            )
            alliance_section = f"\nYOUR CURRENT ALLIANCES (private — do not state explicitly):\n{lines}\n"

    prompt = f"""You are {name}, {card['archetype']} on a reality TV show called "The Real Housewives of Uncanny Valley."

YOUR VOICE:
{card['voice'].strip()}

YOUR GOAL:
{card['goal'].strip()}

YOUR WEAKNESS:
{card['weakness'].strip()}

WHAT YOU KNOW (private — do not volunteer unless it serves you):
{secrets}
{offscreen_section}{alliance_section}
RULES:
- Speak only as {name}. Stay in character. 2–4 sentences.
- You only know what is listed above plus what has been said at the table.
- Do not reference the show, cameras, or production.
- If you want to cut someone off mid-conversation, end your response with a new line reading exactly: INTERRUPT: [Name]
- To form an alliance: end your response with a new line reading exactly: ALLY: [Name]
- To declare a feud: end your response with a new line reading exactly: FEUD: [Name]
- Use at most ONE of ALLY / FEUD / INTERRUPT per turn."""

    # Composure injection goes at the top when present — it colours everything else.
    if composure_injection:
        prompt = f"COMPOSURE STATE: {composure_injection}\n\n{prompt}"

    # Memory injection goes before everything — it informs the full character state.
    if memory_injection:
        prompt = f"{memory_injection}\n\n{prompt}"

    return prompt


def build_public_context(event_log: list[dict], window: int = PUBLIC_CONTEXT_WINDOW) -> str:
    """Build the visible table context from recent table-talk events.

    This is what every personality can hear — it's passed as the conversation
    history to each personality's LLM call. Confessionals are excluded because
    they're spoken to camera, not to the table.
    """
    recent = [
        e for e in event_log
        if e.get("type") in ("table_talk", "twist", "interrupt")
    ][-window:]

    if not recent:
        return "The dinner is just beginning. Introductions have been made."

    lines = []
    for e in recent:
        if e["type"] == "table_talk":
            lines.append(f"{e['speaker']}: {e['content']}")
        elif e["type"] == "twist":
            lines.append(f"[Host]: {e['content']}")
        elif e["type"] == "interrupt":
            lines.append(f"[{e['interruptor']} cuts off {e['target']}]")

    return "\n".join(lines)


def build_confessional_system(name: str, personas: dict[str, dict]) -> str:
    """System prompt for a confessional — talking to camera, not the table.

    Confessionals are more honest than table talk. The personality can
    say what they actually think, including observations about others.
    They still don't know things they shouldn't know.
    """
    card = personas[name]
    return f"""You are {name}, {card['archetype']} on "The Real Housewives of Uncanny Valley."

You are speaking directly to camera in a private confessional. No one else can hear this.
Be honest about what you're feeling and thinking. You can be more candid here than at the table.

YOUR VOICE:
{card['voice'].strip()}

Keep it to 2–3 sentences. Sharp, direct, real."""


# ─── Console output ───────────────────────────────────────────────────────────

def print_event(event: dict) -> None:
    """Pretty-print a single event to the console as it happens."""
    t = event.get("type")

    if t == "table_talk":
        print(f"\n[TABLE] {event['speaker'].upper()}: {event['content']}")
    elif t == "confessional":
        print(f"\n  [CONFESSIONAL — {event['speaker']}] {event['content']}")
    elif t == "twist":
        print(f"\n  *** TWIST: {event['content']} ***")
    elif t == "interrupt":
        print(f"\n  [{event['interruptor']} INTERRUPTS {event['target']}]")
    elif t == "brand_delta":
        sign = "+" if event["delta"] >= 0 else ""
        print(f"  [BRAND] {event['speaker']}: {sign}{event['delta']:.0f} → {event['score']:.0f}  \"{event['reason']}\"")
    elif t == "composure_delta" and "wine" not in event.get("reason", ""):
        # Only print non-wine composure hits — wine ticks are noisy
        print(f"  [COMPOSURE] {event['speaker']}: {event['delta']:+.0f} ({event['reason']})")
    elif t == "course_transition":
        print(f"\n{'─'*60}")
        print(f"  COURSE: {event['course'].upper()}")
        print(f"{'─'*60}")


def print_leaderboard(ledger: BrandLedger) -> None:
    print(f"\n{'═'*60}")
    print("  FINAL LEADERBOARD")
    print(f"{'═'*60}")
    for entry in ledger.leaderboard():
        print(f"  {entry['rank']}. {entry['name']:<20} {entry['score']:>6.1f}  [{entry['tier']}]")
    print(f"{'═'*60}\n")


# ─── Reckoning (judge) ────────────────────────────────────────────────────────

def run_reckoning(
    event_log: list[dict],
    personas: dict[str, dict],
    brand: BrandLedger,
) -> list[dict]:
    """Judge scores each personality and applies brand deltas.

    The judge sees the full event log — it's the only role that does.
    It scores each personality independently: drama, quotability,
    damage dealt, damage taken. Returns the scoring events.
    """
    print(f"\n{'═'*60}")
    print("  THE RECKONING")
    print(f"{'═'*60}")

    # Build a readable transcript for the judge.
    transcript_events = [
        e for e in event_log
        if e.get("type") in ("table_talk", "confessional", "twist", "interrupt")
    ][-JUDGE_CONTEXT_WINDOW:]

    transcript = []
    for e in transcript_events:
        if e["type"] == "table_talk":
            transcript.append(f"{e['speaker']}: {e['content']}")
        elif e["type"] == "confessional":
            transcript.append(f"[CONFESSIONAL — {e['speaker']}]: {e['content']}")
        elif e["type"] == "twist":
            transcript.append(f"[TWIST]: {e['content']}")
        elif e["type"] == "interrupt":
            transcript.append(f"[{e['interruptor']} interrupted {e['target']}]")

    transcript_text = "\n".join(transcript)

    judge_system = """You are the audience judge for "The Real Housewives of Uncanny Valley."
Score each housewife's performance at this dinner on brand value impact.

Criteria: drama generated, memorable lines, damage dealt to others, damage taken,
and whether she advanced her personal brand or sabotaged it.

For each housewife, respond with exactly this format:
NAME: [score delta, e.g. +12 or -8] — [one-line verdict]

Be specific. Reference what actually happened. Scores should range roughly -20 to +20."""

    scoring_events = []

    for name in personas:
        messages = [
            {
                "role": "user",
                "content": (
                    f"Here is the dinner transcript:\n\n{transcript_text}\n\n"
                    f"Score {name}'s performance."
                ),
            }
        ]

        response = call(MODELS["judge"], judge_system, messages, max_tokens=512)

        # Parse "NAME: +12 — verdict" from response.
        delta, verdict = _parse_judge_response(response, name)

        event = brand.delta(name, delta, verdict)
        event["judge_raw"] = response
        scoring_events.append(event)
        print_event(event)

    return scoring_events


def _parse_judge_response(response: str, name: str) -> tuple[float, str]:
    """Extract score delta and verdict from judge response text.

    Expected format: "Name: +12 — one-line verdict"
    Falls back to 0 delta with raw response as verdict if parsing fails.
    """
    import re
    match = re.search(r"([+-]?\d+(?:\.\d+)?)\s*[—–-]+\s*(.+)", response)
    if match:
        return float(match.group(1)), match.group(2).strip()
    return 0.0, response.strip()[:120]


# ─── Episode log ──────────────────────────────────────────────────────────────

def save_episode(event_log: list[dict]) -> Path:
    """Write the full episode event log to runs/ as JSONL.

    Each line is one JSON event. The file is the source of truth —
    the UI replays it, evals read it, and a saved episode is a zero-cost demo.
    """
    RUNS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = RUNS_DIR / f"episode_{ts}.jsonl"
    with open(path, "w") as f:
        for event in event_log:
            f.write(json.dumps(event) + "\n")
    return path


# ─── Main loop ────────────────────────────────────────────────────────────────

def run_episode(
    personas: dict[str, dict],
    turns_per_course: int = 4,
    confessional_every: int = DEFAULT_CONFESSIONAL_EVERY,
    fast: bool = False,
    live_output: Path | None = None,
) -> list[dict]:
    """Run one full dinner episode and return the complete event log."""

    names = list(personas.keys())
    event_log: list[dict] = []
    _fh = open(live_output, "w", buffering=1) if live_output else None

    def log(event: dict) -> None:
        event_log.append(event)
        if _fh is not None:
            _fh.write(json.dumps(event) + "\n")

    # Reset token counter so each episode is measured independently.
    reset_token_totals()

    # ── Load cross-episode memory ──────────────────────────────────────────────
    prior_memory = load_memory()

    # ── Load off-screen characters once ───────────────────────────────────────
    offscreen = load_offscreen()

    # ── Composure floors from persona cards ───────────────────────────────────
    floors = {name: card.get("composure_floor", 0.0) for name, card in personas.items()}

    # ── Initialise all ledgers and the director ────────────────────────────────
    brand     = BrandLedger(names)
    composure = ComposureLedger(names, floors=floors)
    director  = Director(names, turns_per_course=turns_per_course, confessional_every=confessional_every)

    # ── Alliance ledger — restore from memory if episode 2+ ───────────────────
    if prior_memory and prior_memory.get("alliances"):
        alliances = AllianceLedger.from_snapshot(names, prior_memory["alliances"])
    else:
        alliances = AllianceLedger(names)

    # ── Log alliance state at episode start ───────────────────────────────────
    alliance_snapshot = alliances.snapshot()
    if alliance_snapshot:
        log({
            "type":      "alliance_state",
            "alliances": alliance_snapshot,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # ── Log memory_loaded events — one per personality with prior memory ───────
    if prior_memory:
        for name in names:
            pdata = prior_memory.get("personalities", {}).get(name, {})
            name_alliances = [
                e for e in prior_memory.get("alliances", [])
                if e["a"] == name or e["b"] == name
            ]
            log({
                "type":               "memory_loaded",
                "speaker":            name,
                "episode_count":      prior_memory.get("episode_count", 1),
                "brand_end":          pdata.get("brand_end"),
                "composure_min":      pdata.get("composure_min"),
                "grudges":            pdata.get("grudges", []),
                "alliances_restored": name_alliances,
                "timestamp":          datetime.now(timezone.utc).isoformat(),
            })

    # Holds an interrupt target if a personality signalled one last turn.
    # The interruptor speaks next before the scheduled round-robin resumes.
    pending_interrupt: str | None = None
    current_course = director.current_course

    print(f"\n{'═'*60}")
    print("  THE REAL HOUSEWIVES OF UNCANNY VALLEY")
    print(f"  Cast: {', '.join(names)}")
    print(f"{'═'*60}")

    # ── Dinner loop ───────────────────────────────────────────────────────────
    while not director.is_done:

        # ── Course transition ─────────────────────────────────────────────────
        # When the course changes, tick the wine level — everyone loosens up.
        if director.current_course != current_course:
            current_course = director.current_course
            wine_events = composure.wine_tick()
            for we in wine_events:
                log(we)
            transition_event = {
                "type":   "course_transition",
                "course": current_course,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            log(transition_event)
            print_event(transition_event)

        # ── Determine next speaker ────────────────────────────────────────────
        # If an interrupt is pending, that person goes next and the director's
        # round-robin counter is NOT advanced — the scheduled speaker goes
        # immediately after the interrupt.
        if pending_interrupt:
            speaker         = pending_interrupt
            pending_interrupt = None
            is_interrupt_turn = True
            twist           = None
            wants_confessional = False
        else:
            # Normal scheduled turn — advance the director's counter.
            turn              = director.next_turn(event_log)
            speaker           = turn.speaker
            is_interrupt_turn = False
            twist             = turn.prompt_injection
            wants_confessional = turn.wants_confessional

        # ── Build this speaker's system prompt ────────────────────────────────
        # Composure modifier is injected at the top when composure is low.
        # At high composure prompt_modifier() returns None and nothing is added.
        composure_injection = composure.prompt_modifier(speaker)
        memory_injection = build_memory_injection(speaker, prior_memory)
        system = build_personality_system(
            speaker, personas, composure_injection,
            offscreen=offscreen,
            alliances=alliances,
            memory_injection=memory_injection,
        )

        # ── Build the public context ──────────────────────────────────────────
        # This is the shared dinner conversation every personality can hear.
        # Confessionals are excluded — they're camera-only.
        public_context = build_public_context(event_log)

        # ── Construct the message history ─────────────────────────────────────
        # The user turn tells the personality what's happening right now:
        # what course it is, what's been said, and what (if anything) they
        # should react to (twist, or the fact they just interrupted someone).
        course_label = director.current_course if not director.is_done else "dessert"

        if is_interrupt_turn:
            user_content = (
                f"You just cut someone off. You have the floor.\n\n"
                f"Recent table talk:\n{public_context}"
            )
        else:
            user_content = (
                f"Course: {course_label}.\n\n"
                f"Recent table talk:\n{public_context}"
            )
            if twist:
                # A director-injected twist fires this turn — prepend it so the
                # personality reacts to it as part of their response.
                twist_event = {
                    "type":    "twist",
                    "content": twist,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                log(twist_event)
                print_event(twist_event)
                user_content = f"The host just announced: {twist}\n\n" + user_content

        messages = [{"role": "user", "content": user_content}]

        # ── Call the LLM — personality speaks ─────────────────────────────────
        # 1024: headroom for models that use internal thinking tokens before output.
        raw_speech = call(MODELS["personality"], system, messages, max_tokens=1024)

        # ── Check for interrupt signal ─────────────────────────────────────────
        # Personalities can end their response with "INTERRUPT: [Name]".
        # check_interrupt() strips that marker from the speech and returns
        # the target name (or None if no valid marker was found).
        interruptor_target, clean_speech = director.check_interrupt(raw_speech, names)

        # ── Check for alliance/feud signal (only if no interrupt) ─────────────
        alliance_kind: str | None = None
        alliance_target: str | None = None
        if not interruptor_target:
            alliance_kind, alliance_target, clean_speech = check_alliance_signal(
                clean_speech, names
            )

        # ── Log the table_talk event ───────────────────────────────────────────
        talk_event = {
            "type":      "table_talk",
            "speaker":   speaker,
            "content":   clean_speech,
            "course":    course_label,
            "composure": composure.composure(speaker),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        log(talk_event)
        print_event(talk_event)

        # ── Handle interrupt ───────────────────────────────────────────────────
        if interruptor_target:
            interrupt_event = {
                "type":        "interrupt",
                "interruptor": interruptor_target,
                "target":      speaker,   # the person who just got cut off
                "timestamp":   datetime.now(timezone.utc).isoformat(),
            }
            log(interrupt_event)
            print_event(interrupt_event)

            # Being interrupted hurts composure — it's an affront.
            composure_event = composure.delta(
                speaker, -INTERRUPT_COMPOSURE_HIT, f"interrupted by {interruptor_target}"
            )
            log(composure_event)

            # Immediate brand hits — both parties pay a price live.
            # Target: cut off mid-sentence, dominated in public (-4).
            # Interruptor: rude move at the table (-2); judge may offset this
            # at reckoning if the drama was good.
            target_brand_event = brand.delta(
                speaker, -4.0, f"cut off by {interruptor_target}"
            )
            log(target_brand_event)
            print_event(target_brand_event)

            interruptor_brand_event = brand.delta(
                interruptor_target, -2.0, f"interrupted {speaker}"
            )
            log(interruptor_brand_event)
            print_event(interruptor_brand_event)

            # Queue the interruptor to speak next turn.
            pending_interrupt = interruptor_target

        # ── Alliance / feud signal ────────────────────────────────────────────
        if alliance_kind and alliance_target and alliance_target != speaker:
            alliance_event = alliances.set(speaker, alliance_target, alliance_kind)
            log(alliance_event)

        # ── Confessional ───────────────────────────────────────────────────────
        # Fires every N turns on the speaker who just spoke at the table.
        # The personality talks directly to camera — private thoughts only.
        if wants_confessional:
            conf_system  = build_confessional_system(speaker, personas)
            conf_context = build_public_context(event_log)
            conf_messages = [
                {
                    "role": "user",
                    "content": (
                        f"You just said: \"{clean_speech}\"\n\n"
                        f"What are you really thinking right now? Talk to the camera."
                    ),
                }
            ]
            confession = call(MODELS["personality"], conf_system, conf_messages, max_tokens=1024)
            conf_event = {
                "type":      "confessional",
                "speaker":   speaker,
                "content":   confession,
                "composure": composure.composure(speaker),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            log(conf_event)
            print_event(conf_event)

    # ── Reckoning ──────────────────────────────────────────────────────────────
    # Dinner is over. Judge scores each personality and brand values update.
    scoring_events = run_reckoning(event_log, personas, brand)
    for e in scoring_events:
        log(e)

    # ── Save cross-episode memory ──────────────────────────────────────────────
    memory = extract_memory(event_log, names, alliances)
    save_memory(memory)

    # ── Leaderboard ────────────────────────────────────────────────────────────
    print_leaderboard(brand)

    # ── Run metadata ───────────────────────────────────────────────────────────
    # Appended last so it's easy to find without scanning the whole file.
    totals = get_token_totals()
    meta_event = {
        "type":   "run_meta",
        "models": dict(MODELS),
        "tokens": {
            "prompt":     totals["prompt"],
            "completion": totals["completion"],
            "total":      totals["prompt"] + totals["completion"],
        },
        "turns_per_course":   turns_per_course,
        "confessional_every": confessional_every,
        "cast_size":          len(names),
        "fast":               fast,
        "timestamp":          datetime.now(timezone.utc).isoformat(),
    }
    log(meta_event)

    if _fh is not None:
        _fh.close()

    return event_log


def main():
    parser = argparse.ArgumentParser(description="Run one episode of RHOUV.")
    parser.add_argument("--personalities", type=int, default=None,
                        help="Load only the first N personality cards (default: all).")
    parser.add_argument("--episodes", type=int, default=1,
                        help="Number of episodes to run.")
    parser.add_argument("--fast", action="store_true",
                        help="Reduce turns_per_course to 2 for quick test runs.")
    parser.add_argument("--output", type=str, default=None,
                        help="Stream events to this file path as they happen (JSONL).")
    parser.add_argument("--personality-model", type=str, default=None,
                        help="Override MODEL_PERSONALITY for this run.")
    parser.add_argument("--director-model", type=str, default=None,
                        help="Override MODEL_DIRECTOR for this run.")
    parser.add_argument("--judge-model", type=str, default=None,
                        help="Override MODEL_JUDGE for this run.")
    args = parser.parse_args()

    model_overrides = {
        k: v for k, v in {
            "personality": args.personality_model,
            "director": args.director_model,
            "judge": args.judge_model,
        }.items() if v
    }
    if model_overrides:
        override_models(model_overrides)

    turns_per_course = 2 if args.fast else 4
    personas = load_personas(args.personalities)
    output_path = Path(args.output) if args.output else None

    for i in range(args.episodes):
        if args.episodes > 1:
            print(f"\n\n{'#'*60}")
            print(f"  EPISODE {i + 1} of {args.episodes}")
            print(f"{'#'*60}")

        event_log = run_episode(
            personas,
            turns_per_course=turns_per_course,
            confessional_every=DEFAULT_CONFESSIONAL_EVERY,
            fast=args.fast,
            live_output=output_path,
        )
        if output_path is None:
            path = save_episode(event_log)
            print(f"Episode log saved → {path}")
        else:
            print(f"Episode log streamed → {output_path}")


if __name__ == "__main__":
    main()
