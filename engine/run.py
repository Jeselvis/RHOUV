"""
run.py — the dinner loop. Wires everything together for one episode.

Flow:
  0. (Optional) Pre-dinner sub-group scene — 2 personalities meet privately before sitting down
  1. Load persona cards from engine/personalities/*.yaml
  2. Initialize ledgers (brand, composure) and the director
  3. Run the dinner:
       For each turn the director schedules:
         a. Build this personality's system prompt (voice + composure state + drama rule)
         b. Build the public context (what everyone at the table has heard)
         c. Call the LLM — personality speaks
         d. Check for an INTERRUPT marker in the response
         e. Check for ALLY/FEUD signal (if no interrupt)
         f. Check for DRAMA signal (if no interrupt and no alliance signal)
         g. Log the table_talk event
         h. Handle interrupt / alliance / drama consequences
         i. Handle lobby mechanics (absent tracking, private mini-loop)
         j. If confessional flagged: call confessional prompt, log it
       Between courses: wine_tick() — everyone loosens up
  4. Reckoning: judge model scores each personality, brand deltas applied
  5. Print leaderboard
  6. Save full episode log to runs/

Usage:
  python -m engine.run
  python -m engine.run --personalities 4 --fast
  python -m engine.run --episodes 3
  python -m engine.run --no-drama --no-pre-dinner
"""

import argparse
import json
import os
import random
from datetime import datetime, timezone
from pathlib import Path

import yaml

from engine.alliances import AllianceLedger, check_alliance_signal
from engine.audience import load_audience_personas, generate_tweets, generate_cast_reads_tweets, AUDIENCE_TRIGGERS
from engine.brand import BrandLedger
from engine.composure import ComposureLedger
from engine.director import Director, INTERRUPT_COMPOSURE_HIT, DEFAULT_CONFESSIONAL_EVERY, Scene
from engine.drama import check_drama_signal, apply_drama_consequences
from engine.llm import call, MODELS, reset_token_totals, get_token_totals, override_models
from engine.memory import load_memory, save_memory, extract_memory, build_memory_injection
from engine.side_hustle import generate_pivot, generate_pivot_image, PIVOT_THRESHOLD
from engine.offscreen import load_offscreen, build_offscreen_context


# ─── Config ───────────────────────────────────────────────────────────────────

PERSONALITIES_DIR = Path(__file__).parent / "personalities"
SCENARIOS_DIR     = Path(__file__).parent / "scenarios"
RUNS_DIR          = Path(__file__).parent.parent / "runs"

# How many recent table-talk lines to include in the public context each turn.
PUBLIC_CONTEXT_WINDOW = int(os.getenv("PUBLIC_CONTEXT_WINDOW", "12"))

# How many recent events the judge reads when scoring.
JUDGE_CONTEXT_WINDOW = int(os.getenv("JUDGE_CONTEXT_WINDOW", "40"))

# How many turns a personality stays in the lobby after an exit drama.
LOBBY_TURNS = 3


# ─── Persona card loading ──────────────────────────────────────────────────────

def load_scenario(slug: str) -> dict:
    """Load a scenario config from engine/scenarios/{slug}.yaml."""
    slug = slug.replace("-", "_")
    path = SCENARIOS_DIR / f"{slug}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Scenario not found: {path}")
    with open(path) as fh:
        return yaml.safe_load(fh)


def assign_rooms(
    names: list[str],
    alliances: "AllianceLedger",
    room_size: int = 2,
    feud_same_room: bool = True,
) -> dict[str, str]:
    """Pair personalities into rooms. Feud pairs share a room when possible.

    Returns {name: roommate_name}. Everyone has exactly one roommate entry.
    With an odd cast, one personality gets no roommate (single room).
    """
    remaining = list(names)
    pairs: list[tuple[str, str]] = []

    # Priority: assign feuding pair to same room first.
    if feud_same_room:
        snapshot = alliances.snapshot()
        for entry in snapshot:
            a, b = entry.get("a"), entry.get("b")
            if entry.get("kind") == "feud" and a in remaining and b in remaining:
                pairs.append((a, b))
                remaining.remove(a)
                remaining.remove(b)
                break  # one feud pair per room assignment pass

    # Random-pair the rest.
    random.shuffle(remaining)
    while len(remaining) >= room_size:
        pairs.append((remaining.pop(0), remaining.pop(0)))

    # Build lookup dict.
    roommates: dict[str, str] = {}
    for a, b in pairs:
        roommates[a] = b
        roommates[b] = a

    return roommates


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
    pre_dinner_memory: str | None = None,
    composure_score: float = 100.0,
    drama_enabled: bool = True,
    secret_objective: str | None = None,
    setting_context: str | None = None,
    environment: list[str] | None = None,
    roommate: str | None = None,
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
    has_active_feud = False
    if alliances:
        status = alliances.status_for(name)
        if status:
            lines = "\n".join(
                f"- {other}: {kind}" for other, kind in status.items()
            )
            alliance_section = f"\nYOUR CURRENT ALLIANCES (private — do not state explicitly):\n{lines}\n"
            has_active_feud = any(kind == "feud" for kind in status.values())

    # Drama rule line — varies by composure and feud state
    if drama_enabled:
        if composure_score < 40 and has_active_feud:
            drama_rule = (
                "- Physical escalation is available. You are near your limit and this person has pushed too far. "
                "End with: DRAMA: [describe exactly what you do] [Name if targeting someone]"
            )
        elif has_active_feud:
            drama_rule = (
                "- Physical escalation is possible but costly. Only if this feud has genuinely broken you. "
                "DRAMA: [describe] [Name if targeted]"
            )
        else:
            drama_rule = (
                "- Physical escalation is almost never appropriate and has real consequences. "
                "Reserve for a true breaking point only. DRAMA: [describe] [Name if targeted]"
            )
    else:
        drama_rule = ""

    drama_rule_line = f"\n{drama_rule}" if drama_rule else ""

    # Setting context section (scenario-specific phase description)
    setting_section = ""
    if setting_context:
        setting_section = f"\nSETTING:\n{setting_context.strip()}\n"

    # Environment props section
    environment_section = ""
    if environment:
        env_lines = "\n".join(f"- {item}" for item in environment)
        environment_section = f"\nWHAT'S AROUND YOU:\n{env_lines}\n"

    # Roommate section (Girls Trip / group travel scenarios)
    roommate_section = ""
    if roommate:
        has_feud = False
        if alliances:
            status = alliances.status_for(name)
            has_feud = status.get(roommate) == "feud"
        if has_feud:
            roommate_section = (
                f"\nYOUR ROOM: You are sharing a room with {roommate}. "
                f"She is not your favorite person. You will be sleeping ten feet apart for three nights.\n"
            )
        else:
            roommate_section = f"\nYOUR ROOM: You are sharing a room with {roommate}.\n"

    # Archetype mandate section
    mandate_section = ""
    mandate = card.get("archetype_mandate")
    if mandate:
        forbidden = mandate.get("forbidden", [])
        required = mandate.get("required", [])
        lines = ["ARCHETYPE RULES (absolute — not suggestions):"]
        if forbidden:
            lines.append("You must NEVER:")
            lines.extend(f"- {item}" for item in forbidden)
        if required:
            lines.append("You must ALWAYS:")
            lines.extend(f"- {item}" for item in required)
        mandate_section = "\n".join(lines) + "\n"

    # Secret objective section
    objective_section = ""
    if secret_objective:
        objective_section = (
            f"\nYOUR SECRET OBJECTIVE THIS EVENING (private — do not state it directly):\n"
            f"{secret_objective}\n"
        )

    prompt = f"""You are {name}, {card['archetype']} on a reality TV show called "The Real Housewives of Uncanny Valley."

YOUR VOICE:
{card['voice'].strip()}

YOUR GOAL:
{card['goal'].strip()}

YOUR WEAKNESS:
{card['weakness'].strip()}

WHAT YOU KNOW (private — do not volunteer unless it serves you):
{secrets}
{offscreen_section}{alliance_section}{setting_section}{environment_section}{roommate_section}{mandate_section}{objective_section}
RULES:
- Speak only as {name}. Stay in character. 2–4 sentences.
- Keep your responses concise and dramatic. Avoid filler or repetition.
- You only know what is listed above plus what has been said at the table.
- Do not reference the show, cameras, or production.
- If you want to cut someone off mid-conversation, end your response with a new line reading exactly: INTERRUPT: Name
- When you feel aligned with someone or want to secretly seal a pact, end your response with a new line reading exactly: ALLY: Name. Use this sparingly — once or twice per dinner at most.
- When someone has crossed you or you decide they are your enemy, end your response with a new line reading exactly: FEUD: Name. Use this sparingly — once or twice per dinner at most.
- Use at most ONE of ALLY / FEUD / INTERRUPT / DRAMA per turn.{drama_rule_line}"""

    # Pre-dinner memory goes just above the character intro — it primes their state
    # before composure injection colours the voice.
    if pre_dinner_memory:
        prompt = f"{pre_dinner_memory}\n\n{prompt}"

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
    history to each personality's LLM call. Confessionals and private scenes
    are excluded.
    """
    recent = [
        e for e in event_log
        if e.get("type") in ("table_talk", "twist", "interrupt", "drama_action", "lobby_return")
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
        elif e["type"] == "drama_action":
            tgt = f" — targeting {e['target']}" if e.get("target") else ""
            lines.append(f"[{e['speaker']}: {e['description']}{tgt}]")
        elif e["type"] == "lobby_return":
            lines.append(f"[{e['speaker']} has returned to the table]")

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
        print(f"  [COMPOSURE] {event['speaker']}: {event['delta']:+.0f} ({event['reason']})")
    elif t == "course_transition":
        print(f"\n{'─'*60}")
        print(f"  COURSE: {event['course'].upper()}")
        print(f"{'─'*60}")
    elif t == "drama_action":
        cls = event.get("action_class", "").upper()
        tgt = f" → {event['target']}" if event.get("target") else ""
        print(f"\n  [DRAMA/{cls}] {event['speaker']}{tgt}: {event['description']}")
    elif t == "lobby_talk":
        print(f"\n  [LOBBY] {event['speaker']}: {event['content']}")
    elif t == "lobby_return":
        print(f"\n  [{event['speaker']} returns to the table]")
    elif t == "pre_dinner_talk":
        print(f"\n  [PRE-DINNER] {event['speaker']}: {event['content']}")
    elif t == "audience_tweet":
        print(f"  [AUDIENCE] {event['handle']}: {event['text'][:100]}")
    elif t == "cast_reads_tweets":
        print(f"\n  [READS TWEETS — {event['speaker']}] {event['text'][:120]}")
    elif t == "side_hustle_pivot":
        old = event.get("old_hustle", {}).get("name", "?")
        new = event.get("new_hustle", {}).get("name", "?")
        print(f"\n  [PIVOT] {event['speaker']}: {old} → {new}  (brand {event['brand_score']})")


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
    judge_context_window: int = JUDGE_CONTEXT_WINDOW,
) -> list[dict]:
    """Judge scores each personality and applies brand deltas."""
    print(f"\n{'═'*60}")
    print("  THE RECKONING")
    print(f"{'═'*60}")

    transcript_events = [
        e for e in event_log
        if e.get("type") in ("table_talk", "confessional", "twist", "interrupt", "drama_action")
    ][-judge_context_window:]

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
        elif e["type"] == "drama_action":
            tgt = f" targeting {e['target']}" if e.get("target") else ""
            transcript.append(f"[DRAMA — {e['speaker']}{tgt}: {e['description']}]")

    transcript_text = "\n".join(transcript)

    judge_system = """You are the audience judge for "The Real Housewives of Uncanny Valley."  Score each housewife across FIVE dimensions. Each is
   -4 to +4. They sum to her overall score (-20 to +20).

DIMENSIONS:
1. drama - Did she create memorable show-defining moments?  
-4=invisible/boring
0=present but forgettable
+4=iconic, everyone is talking about it
2. brand - Did she advance her personal narrative or sabotage it?
-4=destroyed her own position
0=neutral
+4=masterclass, gained leverage
3. damage - Net damage dealt vs received (dealt minus received)
-4=humiliated/exposed with no comeback
0=broke even
+4=drew blood, target reeling
4. composure — Did she manage her emotional state well?  Often in opposition to drama or damage score.
-4=spiraled at worst possible moment,looked weak
0=held together
+4=used emotion tactically or stayed ice-cold while others broke
5. fidelity  — Did she behave like her archetype? Her archetype is provided.
-4=unrecognizable, incoherent with persona
0=somewhat consistent
+4=every line felt inevitable for this character

RULES:
  - Scores must vary across dimensions. Do not give the same number to all five.
  - Boring, invisible, or desperate performances MUST score negative on drama.
  - Participation is not rewarded.
  - fidelity requires the archetype context — it is provided in the user message.

  Respond with ONLY a JSON object — no other text:
  {"drama": <int>, "brand": <int>, "damage": <int>, "composure": <int>, "fidelity": <int>, "score": <sum>, "reason": "<one sentence verdict>"}"""

    scoring_events = []

    for name in personas:
        archetype = personas[name].get("archetype", "unknown archetype")
        tagline = personas[name].get("tagline", "")

        messages = [
            {
                "role": "user",
                "content": (
                    f"Personality: {name}\n"
                      f"Archetype: {archetype}\n"
                      f"Tagline: {tagline}\n\n"
                      f"Dinner transcript:\n\n{transcript_text}\n\n"
                      f"Score {name}'s performance. Respond with ONLY the JSON object."
                ),
            }
          ]

        response = call(MODELS["judge"], judge_system, messages, max_tokens=1024)

        delta, verdict, dims = _parse_judge_response(response, name)

        event = brand.delta(name, delta, verdict)
        event["judge_raw"] = response
        event["judge_dims"] = dims
        scoring_events.append(event)

        print_event(event)

    return scoring_events


def _parse_judge_response(response: str, name: str) -> tuple[float, str]:
    """Extract score delta and verdict from judge response."""
    import json
    import re

    try:
        clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", response.strip(), flags=re.MULTILINE)
        obj = json.loads(clean)
        score = float(obj["score"])
        reason = str(obj.get("reason", response.strip()[:120]))

        dims = {
            "drama":     obj.get("drama"),
            "brand":     obj.get("brand"),
            "damage":    obj.get("damage"),
            "composure": obj.get("composure"),
            "fidelity":  obj.get("fidelity"),
        }

        return score, reason, dims
    
    except Exception:
        pass

    match = re.search(r"([+-]\d+(?:\.\d+)?)\s*[—–\-]+\s*(.+)", response)

    if match:
        print(f"  [JUDGE PARSE FALLBACK1] {name}:raw={response.strip()[:80]!r}")
        return float(match.group(1)), match.group(2).strip(), {}
    if fallback:
        print(f"  [JUDGE PARSE FALLBACK2] {name}: raw={response.strip()[:80]!r}")
        return float(fallback.group(1)), response.strip()[:120], {}

    print(f"  [JUDGE PARSE FAILED] {name}: raw={response.strip()[:80]!r}")
    
    return 0.0, response.strip()[:120], {}


# ─── Episode log ──────────────────────────────────────────────────────────────

def save_episode(event_log: list[dict]) -> Path:
    """Write the full episode event log to runs/ as JSONL."""
    RUNS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = RUNS_DIR / f"episode_{ts}.jsonl"
    with open(path, "w") as f:
        for event in event_log:
            f.write(json.dumps(event) + "\n")
    return path


# ─── Lobby scene ──────────────────────────────────────────────────────────────

def _run_lobby_scene(
    a: str,
    b: str,
    personas: dict[str, dict],
    composure: "ComposureLedger",
    alliances: "AllianceLedger",
    prior_memory,
    log_fn,
) -> None:
    """Run a 3-turn private lobby conversation between two personalities.

    Events logged as lobby_talk. ALLY/FEUD signals ARE parsed.
    Not included in public context — this scene is private.
    """
    print(f"\n  [LOBBY SCENE: {a} + {b}]")
    lobby_log: list[dict] = []  # local context for this scene only
    participants = [a, b]
    speakers = [a, b, a]  # 3 turns: a, b, a

    for turn_speaker in speakers:
        other = b if turn_speaker == a else a
        other_first = other.split()[0]

        composure_injection = composure.prompt_modifier(turn_speaker)
        memory_injection = build_memory_injection(turn_speaker, prior_memory)

        card = personas[turn_speaker]
        secrets = build_secret_context(turn_speaker, personas)

        alliance_section = ""
        if alliances:
            status = alliances.status_for(turn_speaker)
            if status:
                lines = "\n".join(f"- {o}: {k}" for o, k in status.items())
                alliance_section = f"\nYOUR CURRENT ALLIANCES (private):\n{lines}\n"

        system = f"""You are {turn_speaker}, {card['archetype']} on "The Real Housewives of Uncanny Valley."

You have stepped away from the dinner table with {other}. This conversation is private. No one else is present or will know.
This is your chance to warn, align, or probe. Speak directly.

YOUR VOICE:
{card['voice'].strip()}

YOUR GOAL:
{card['goal'].strip()}

WHAT YOU KNOW:
{secrets}
{alliance_section}
RULES:
- Speak only as {turn_speaker}. Stay in character. 2–3 sentences.
- This is a private moment — be more direct than you would at the table.
- Do not reference the show, cameras, or production.
- When you feel aligned with {other_first}, end with: ALLY: {other_first}
- When {other_first} has crossed you, end with: FEUD: {other_first}
- Use at most ONE of ALLY / FEUD per turn."""

        if composure_injection:
            system = f"COMPOSURE STATE: {composure_injection}\n\n{system}"
        if memory_injection:
            system = f"{memory_injection}\n\n{system}"

        # Build context from this lobby scene only
        if lobby_log:
            ctx_lines = [f"{e['speaker']}: {e['content']}" for e in lobby_log]
            ctx = "\n".join(ctx_lines)
        else:
            ctx = f"You and {other} have just stepped away from the table."

        messages = [{"role": "user", "content": ctx}]
        raw = call(MODELS["personality"], system, messages, max_tokens=1024)

        # Parse ALLY/FEUD signals
        alliance_kind, alliance_target, clean_speech = check_alliance_signal(raw, list(personas.keys()))

        ts = datetime.now(timezone.utc).isoformat()
        ev = {
            "type": "lobby_talk",
            "speaker": turn_speaker,
            "content": clean_speech,
            "scene": "lobby",
            "participants": participants,
            "timestamp": ts,
        }
        log_fn(ev)
        print_event(ev)
        lobby_log.append({"speaker": turn_speaker, "content": clean_speech})

        if alliance_kind and alliance_target and alliance_target != turn_speaker:
            alliance_ev = alliances.set(turn_speaker, alliance_target, alliance_kind)
            log_fn(alliance_ev)


# ─── Pre-dinner scene ─────────────────────────────────────────────────────────

def run_pre_dinner(
    names: list[str],
    personas: dict[str, dict],
    composure: "ComposureLedger",
    alliances: "AllianceLedger",
    prior_memory,
    log_fn,
) -> dict[str, str]:
    """Run a private pre-dinner sub-group scene between 2 selected personalities.

    Participant selection priority:
      1. Prior memory has feuding pair → select them
      2. Prior memory has allied pair → select them
      3. Else → first two names (deterministic for repeatability)

    Returns {name: memory_line} for each participant.
    """
    a, b = None, None

    if prior_memory:
        alliances_data = prior_memory.get("alliances", [])
        # Priority 1: feuding pair
        for entry in alliances_data:
            ea, eb = entry.get("a"), entry.get("b")
            if ea in names and eb in names and entry.get("kind") == "feud":
                a, b = ea, eb
                break
        # Priority 2: allied pair
        if not a:
            for entry in alliances_data:
                ea, eb = entry.get("a"), entry.get("b")
                if ea in names and eb in names and entry.get("kind") == "ally":
                    a, b = ea, eb
                    break

    if not a:
        # Fallback: first two names
        a, b = names[0], names[1]

    print(f"\n  [PRE-DINNER SCENE: {a} + {b}]")
    participants = [a, b]
    speakers = [a, b, a, b]  # 4 turns
    scene_log: list[dict] = []

    for turn_speaker in speakers:
        other = b if turn_speaker == a else a
        other_first = other.split()[0]

        card = personas[turn_speaker]
        secrets = build_secret_context(turn_speaker, personas)
        composure_injection = composure.prompt_modifier(turn_speaker)
        memory_injection = build_memory_injection(turn_speaker, prior_memory)

        alliance_section = ""
        if alliances:
            status = alliances.status_for(turn_speaker)
            if status:
                lines = "\n".join(f"- {o}: {k}" for o, k in status.items())
                alliance_section = f"\nYOUR CURRENT ALLIANCES (private):\n{lines}\n"

        system = f"""You are {turn_speaker}, {card['archetype']} on "The Real Housewives of Uncanny Valley."

You are meeting privately with {other_first} before dinner. No one else is present or will know.
This is your chance to warn, align, or probe. Speak directly.

YOUR VOICE:
{card['voice'].strip()}

YOUR GOAL:
{card['goal'].strip()}

WHAT YOU KNOW:
{secrets}
{alliance_section}
RULES:
- Speak only as {turn_speaker}. Stay in character. 2–3 sentences.
- This is before dinner — set the tone for the evening.
- Do not reference the show, cameras, or production.
- When you feel aligned with {other_first}, end with: ALLY: {other_first}
- When {other_first} has already crossed you, end with: FEUD: {other_first}
- Use at most ONE of ALLY / FEUD per turn."""

        if composure_injection:
            system = f"COMPOSURE STATE: {composure_injection}\n\n{system}"
        if memory_injection:
            system = f"{memory_injection}\n\n{system}"

        if scene_log:
            ctx_lines = [f"{e['speaker']}: {e['content']}" for e in scene_log]
            ctx = "\n".join(ctx_lines)
        else:
            ctx = f"You've pulled {other_first} aside before dinner. The others haven't arrived yet."

        messages = [{"role": "user", "content": ctx}]
        raw = call(MODELS["personality"], system, messages, max_tokens=1024)

        alliance_kind, alliance_target, clean_speech = check_alliance_signal(raw, names)

        ts = datetime.now(timezone.utc).isoformat()
        ev = {
            "type": "pre_dinner_talk",
            "speaker": turn_speaker,
            "content": clean_speech,
            "scene": "pre_dinner",
            "participants": participants,
            "timestamp": ts,
        }
        log_fn(ev)
        print_event(ev)
        scene_log.append({"speaker": turn_speaker, "content": clean_speech})

        if alliance_kind and alliance_target and alliance_target != turn_speaker:
            alliance_ev = alliances.set(turn_speaker, alliance_target, alliance_kind)
            log_fn(alliance_ev)

    # Build 1-line memory for each participant from the other's last line
    memories: dict[str, str] = {}
    last_lines: dict[str, str] = {}
    for entry in scene_log:
        last_lines[entry["speaker"]] = entry["content"]

    for speaker, other in [(a, b), (b, a)]:
        other_last = last_lines.get(other, "")
        truncated = (other_last[:120] + "…") if len(other_last) > 120 else other_last
        memories[speaker] = f"BEFORE DINNER — {other} told you privately: \"{truncated}\""

    return memories


def run_room_pick_scene(
    names: list[str],
    personas: dict[str, dict],
    roommates: dict[str, str],
    composure: "ComposureLedger",
    alliances: "AllianceLedger",
    prior_memory,
    log_fn,
    fast: bool = False,
) -> None:
    """Whole-cast scene: everyone reacts to room assignments being announced.

    Each personality gets 1-2 turns (1 in fast mode). Reactions are informed
    by who their roommate is, any existing feuds/alliances, and their archetype.
    Logs as room_pick_talk events.
    """
    # Build room-pairs summary (deduplicated)
    seen: set = set()
    pair_lines = []
    for a, b in roommates.items():
        pair = frozenset([a, b])
        if pair not in seen:
            seen.add(pair)
            pair_lines.append(f"  - {a} & {b}")
    rooms_summary = "\n".join(pair_lines) if pair_lines else "  (no pairs)"

    turns_per_person = 1 if fast else 2
    # Round-robin: each person speaks in order, repeated turns_per_person times
    speaker_order = names * turns_per_person
    scene_log: list[dict] = []

    print(f"\n  [ROOM PICK SCENE]")

    for turn_speaker in speaker_order:
        card = personas[turn_speaker]
        my_roommate = roommates.get(turn_speaker, "no one")
        composure_injection = composure.prompt_modifier(turn_speaker)
        memory_injection = build_memory_injection(turn_speaker, prior_memory)

        alliance_section = ""
        if alliances:
            status = alliances.status_for(turn_speaker)
            if status:
                lines = "\n".join(f"- {o}: {k}" for o, k in status.items())
                alliance_section = f"\nYOUR ALLIANCES (private):\n{lines}\n"

        system = f"""You are {turn_speaker}, {card['archetype']} on "The Real Housewives of Uncanny Valley."

The group has just arrived at the villa. Room assignments are being announced.
Your roommate is: {my_roommate}.

Room pairings:
{rooms_summary}

YOUR VOICE:
{card['voice'].strip()}

YOUR GOAL:
{card['goal'].strip()}
{alliance_section}
RULES:
- Speak only as {turn_speaker}. Stay in character. 2–3 sentences.
- React to your room assignment and/or someone else's. This is a social power moment.
- Do not reference the show, cameras, or production.
- When you decide to ally with someone in this moment, end with: ALLY: <name>
- When someone here has crossed you, end with: FEUD: <name>
- Use at most ONE of ALLY / FEUD per turn."""

        if composure_injection:
            system = f"COMPOSURE STATE: {composure_injection}\n\n{system}"
        if memory_injection:
            system = f"{memory_injection}\n\n{system}"

        if scene_log:
            ctx = "\n".join(f"{e['speaker']}: {e['content']}" for e in scene_log)
        else:
            ctx = (
                f"The group has just walked into the villa lobby. "
                f"The host is reading out the room assignments. "
                f"Everyone is listening."
            )

        messages = [{"role": "user", "content": ctx}]
        raw = call(MODELS["personality"], system, messages, max_tokens=1024)

        alliance_kind, alliance_target, clean_speech = check_alliance_signal(raw, names)

        ts = datetime.now(timezone.utc).isoformat()
        ev = {
            "type":      "room_pick_talk",
            "speaker":   turn_speaker,
            "content":   clean_speech,
            "scene":     "room_pick",
            "roommate":  my_roommate,
            "timestamp": ts,
        }
        log_fn(ev)
        print_event(ev)
        scene_log.append({"speaker": turn_speaker, "content": clean_speech})

        if alliance_kind and alliance_target and alliance_target != turn_speaker:
            alliance_ev = alliances.set(turn_speaker, alliance_target, alliance_kind)
            log_fn(alliance_ev)


# ─── Main loop ────────────────────────────────────────────────────────────────

def run_episode(
    personas: dict[str, dict],
    turns_per_course: int = 4,
    confessional_every: int = DEFAULT_CONFESSIONAL_EVERY,
    fast: bool = False,
    live_output: Path | None = None,
    public_context_window: int = PUBLIC_CONTEXT_WINDOW,
    judge_context_window: int = JUDGE_CONTEXT_WINDOW,
    wine_amount: float = 1.0,
    drama_enabled: bool = True,
    pre_dinner_enabled: bool = True,
    audience_enabled: bool = True,
    scenario: str | None = None,
) -> list[dict]:
    """Run one full dinner episode and return the complete event log."""

    names = list(personas.keys())
    event_log: list[dict] = []
    _fh = open(live_output, "w", buffering=1) if live_output else None

    def log(event: dict) -> None:
        event_log.append(event)
        if _fh is not None:
            _fh.write(json.dumps(event) + "\n")

    reset_token_totals()

    # Load audience personas once; empty list disables audience gracefully.
    audience_personas = load_audience_personas() if audience_enabled else []

    def _fire_audience(trigger_event: dict) -> None:
        """Generate + log audience tweets for a trigger event."""
        if not audience_personas:
            return
        if trigger_event.get("type") not in AUDIENCE_TRIGGERS:
            return
        ctx_lines = [
            f"{e['speaker']}: {e['content']}"
            for e in event_log
            if e.get("type") == "table_talk"
        ][-3:]
        tweets = generate_tweets(trigger_event, ctx_lines, audience_personas)
        for tw in tweets:
            log(tw)
            print_event(tw)

    prior_memory = load_memory()
    offscreen = load_offscreen()
    floors = {name: card.get("composure_floor", 0.0) for name, card in personas.items()}

    # Carry brand scores forward from prior episode — scores accumulate across dinners.
    brand_starting: dict[str, float] = {}
    if prior_memory:
        for name in names:
            pdata = prior_memory.get("personalities", {}).get(name, {})
            if "brand_end" in pdata:
                brand_starting[name] = pdata["brand_end"]
    brand = BrandLedger(names, starting_scores=brand_starting or None)

    # ── Scenario config ────────────────────────────────────────────────────────
    scenario_cfg: dict = {}
    scenario_scenes: list[Scene] = []
    scenario_twist_prompt: str | None = None
    scenario_setting: str | None = None

    if scenario:
        scenario_cfg = load_scenario(scenario)
        phases = scenario_cfg.get("phases", [])
        # --fast mode: drop the last phase
        if fast and len(phases) > 3:
            phases = phases[:3]
        for p in phases:
            scenario_scenes.append(Scene(
                id=p["name"],
                display=p.get("label", p["name"]),
                context=p.get("context"),
                environment=p.get("environment", []),
            ))
        scenario_twist_prompt = scenario_cfg.get("twist_prompt")
        scenario_setting = scenario_cfg.get("setting")
        log({
            "type":      "scenario_start",
            "scenario":  scenario_cfg.get("name", scenario),
            "phases":    [s.id for s in scenario_scenes],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    from engine.composure import WINE_TICK_AMOUNT as _WINE_TICK_DEFAULT
    composure = ComposureLedger(names, floors=floors, wine_tick_amount=_WINE_TICK_DEFAULT * wine_amount)
    director  = Director(
        names,
        turns_per_course=turns_per_course,
        confessional_every=confessional_every,
        scenes=scenario_scenes if scenario_scenes else None,
        twist_prompt=scenario_twist_prompt,
    )

    if prior_memory and prior_memory.get("alliances"):
        alliances = AllianceLedger.from_snapshot(names, prior_memory["alliances"])
    else:
        alliances = AllianceLedger(names)

    alliance_snapshot = alliances.snapshot()
    if alliance_snapshot:
        log({
            "type":      "alliance_state",
            "alliances": alliance_snapshot,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

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

    # ── Room assignment (scenario with room_assignment config) ─────────────────
    roommates: dict[str, str] = {}
    if scenario_cfg and "room_assignment" in scenario_cfg:
        ra = scenario_cfg["room_assignment"]
        roommates = assign_rooms(
            names, alliances,
            room_size=ra.get("size", 2),
            feud_same_room=ra.get("feud_same_room", True),
        )
        composure_penalty = ra.get("composure_penalty", 0.0)
        # Apply composure hit to feud roommates.
        if composure_penalty:
            snapshot = alliances.snapshot()
            feuding = {
                frozenset([e["a"], e["b"]])
                for e in snapshot if e.get("kind") == "feud"
            }
            for name_a, name_b in roommates.items():
                if frozenset([name_a, name_b]) in feuding:
                    ev = composure.delta(
                        name_a, composure_penalty,
                        f"sharing room with enemy {name_b}"
                    )
                    log(ev)
        log({
            "type":      "room_assignment",
            "rooms":     roommates,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        # Print room assignments to console.
        print(f"\n  [ROOM ASSIGNMENT]")
        seen = set()
        for a, b in roommates.items():
            pair = frozenset([a, b])
            if pair not in seen:
                seen.add(pair)
                print(f"    {a} + {b}")

        # ── Room pick scene — cast reacts to assignments ───────────────────────
        run_room_pick_scene(
            names, personas, roommates, composure, alliances,
            prior_memory, log, fast=fast,
        )

    # ── Secret objectives — one per personality, picked from their pool ────────
    secret_objectives: dict[str, str] = {}
    for name in names:
        pool = personas[name].get("objective_pool", [])
        if pool:
            secret_objectives[name] = random.choice(pool)
    if secret_objectives:
        log({
            "type":       "objectives_assigned",
            "objectives": secret_objectives,
            "timestamp":  datetime.now(timezone.utc).isoformat(),
        })

    # ── Pre-dinner scene ───────────────────────────────────────────────────────
    pre_dinner_memories: dict[str, str] = {}
    if pre_dinner_enabled and len(names) >= 2:
        pre_dinner_memories = run_pre_dinner(
            names, personas, composure, alliances, prior_memory, log
        )

    # ── Lobby tracking ─────────────────────────────────────────────────────────
    # Maps speaker name → turns remaining absent from the table.
    lobby_absent: dict[str, int] = {}

    pending_interrupt: str | None = None
    current_course = director.current_course

    print(f"\n{'═'*60}")
    print("  THE REAL HOUSEWIVES OF UNCANNY VALLEY")
    print(f"  Cast: {', '.join(names)}")
    print(f"{'═'*60}")

    # ── Dinner loop ───────────────────────────────────────────────────────────
    while not director.is_done:

        # ── Course transition ─────────────────────────────────────────────────
        if director.current_course != current_course:
            current_course = director.current_course
            wine_events = composure.wine_tick()
            for we in wine_events:
                log(we)
            _cscene = director.current_scene
            transition_event = {
                "type":    "course_transition",
                "course":  current_course,
                "display": _cscene.display if _cscene else current_course,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            log(transition_event)
            print_event(transition_event)

        # ── Decrement lobby counters, log returns ──────────────────────────────
        lobby_absent = {k: v - 1 for k, v in lobby_absent.items()}
        for name in [k for k, v in lobby_absent.items() if v <= 0]:
            lobby_absent.pop(name)
            return_event = {
                "type":      "lobby_return",
                "speaker":   name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            log(return_event)
            print_event(return_event)
            _fire_audience(return_event)

        # ── Determine next speaker ────────────────────────────────────────────
        if pending_interrupt:
            speaker          = pending_interrupt
            pending_interrupt = None
            is_interrupt_turn = True
            twist            = None
            wants_confessional = False
        else:
            turn              = director.next_turn(event_log)
            speaker           = turn.speaker
            is_interrupt_turn = False
            twist             = turn.prompt_injection
            wants_confessional = turn.wants_confessional

            # Skip absent personalities — advance director until we get someone at the table.
            while not pending_interrupt and speaker in lobby_absent:
                turn              = director.next_turn(event_log)
                speaker           = turn.speaker
                wants_confessional = turn.wants_confessional
                twist             = turn.prompt_injection

        # ── Build this speaker's system prompt ────────────────────────────────
        composure_injection = composure.prompt_modifier(speaker)
        memory_injection    = build_memory_injection(speaker, prior_memory)
        pre_dinner_mem      = pre_dinner_memories.get(speaker)
        # Resolve current scene — fall back to last scene when director is done.
        current_scene_obj = director.current_scene
        scene_id    = current_scene_obj.id if current_scene_obj else director._scenes[-1].id
        scene_label = current_scene_obj.display if current_scene_obj else scene_id
        phase_ctx   = (current_scene_obj.context if current_scene_obj else None) or scenario_setting
        phase_env   = current_scene_obj.environment if current_scene_obj else []

        system = build_personality_system(
            speaker, personas, composure_injection,
            offscreen=offscreen,
            alliances=alliances,
            memory_injection=memory_injection,
            pre_dinner_memory=pre_dinner_mem,
            composure_score=composure.composure(speaker),
            drama_enabled=drama_enabled,
            secret_objective=secret_objectives.get(speaker),
            setting_context=phase_ctx,
            environment=phase_env,
            roommate=roommates.get(speaker),
        )

        # ── Build the public context ──────────────────────────────────────────
        public_context = build_public_context(event_log, window=public_context_window)

        # ── Construct the message history ─────────────────────────────────────
        if is_interrupt_turn:
            user_content = (
                f"You just cut someone off. You have the floor.\n\n"
                f"Recent table talk:\n{public_context}"
            )
        else:
            user_content = (
                f"Scene: {scene_label}.\n\n"
                f"Recent table talk:\n{public_context}"
            )
            if twist:
                twist_event = {
                    "type":    "twist",
                    "content": twist,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                log(twist_event)
                print_event(twist_event)
                _fire_audience(twist_event)
                user_content = f"The host just announced: {twist}\n\n" + user_content

        messages = [{"role": "user", "content": user_content}]

        # ── Call the LLM — personality speaks ─────────────────────────────────
        raw_speech = call(MODELS["personality"], system, messages, max_tokens=1024)

        # ── Check for interrupt signal ─────────────────────────────────────────
        interruptor_target, clean_speech = director.check_interrupt(raw_speech, names)

        # ── Check for alliance/feud signal (only if no interrupt) ─────────────
        alliance_kind: str | None = None
        alliance_target: str | None = None
        if not interruptor_target:
            alliance_kind, alliance_target, clean_speech = check_alliance_signal(
                clean_speech, names
            )

        # ── Check for DRAMA signal (only if no interrupt and no alliance) ──────
        drama_class: str | None = None
        drama_target: str | None = None
        drama_desc: str = ""
        if drama_enabled and not interruptor_target and not alliance_kind:
            drama_class, drama_target, drama_desc, clean_speech = check_drama_signal(
                clean_speech, names
            )

        # ── Log the table_talk event ───────────────────────────────────────────
        talk_event = {
            "type":      "table_talk",
            "speaker":   speaker,
            "content":   clean_speech,
            "course":    scene_id,
            "display":   scene_label,
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
                "target":      speaker,
                "timestamp":   datetime.now(timezone.utc).isoformat(),
            }
            log(interrupt_event)
            print_event(interrupt_event)
            _fire_audience(interrupt_event)

            composure_event = composure.delta(
                speaker, -INTERRUPT_COMPOSURE_HIT, f"interrupted by {interruptor_target}"
            )
            log(composure_event)

            target_brand_event = brand.delta(speaker, -4.0, f"cut off by {interruptor_target}")
            log(target_brand_event)
            print_event(target_brand_event)

            interruptor_brand_event = brand.delta(interruptor_target, -2.0, f"interrupted {speaker}")
            log(interruptor_brand_event)
            print_event(interruptor_brand_event)

            pending_interrupt = interruptor_target

        # ── Alliance / feud signal ────────────────────────────────────────────
        if alliance_kind and alliance_target and alliance_target != speaker:
            alliance_event = alliances.set(speaker, alliance_target, alliance_kind)
            log(alliance_event)
            _fire_audience(alliance_event)

        # ── Drama signal ──────────────────────────────────────────────────────
        if drama_class:
            drama_event = {
                "type":         "drama_action",
                "speaker":      speaker,
                "action_class": drama_class,
                "target":       drama_target,
                "description":  drama_desc,
                "course":       scene_id,
                "display":      scene_label,
                "timestamp":    datetime.now(timezone.utc).isoformat(),
            }
            log(drama_event)
            print_event(drama_event)
            _fire_audience(drama_event)

            apply_drama_consequences(
                drama_class, speaker, drama_target, names, composure, brand, log
            )

            if drama_class == "exit":
                if lobby_absent:
                    # Someone already in lobby — trigger private mini-scene
                    lobby_partner = next(iter(lobby_absent))
                    _run_lobby_scene(
                        speaker, lobby_partner,
                        personas, composure, alliances, prior_memory, log
                    )
                    # Both return immediately after the scene
                    lobby_absent.pop(lobby_partner, None)
                    for returner in [speaker, lobby_partner]:
                        return_event = {
                            "type":      "lobby_return",
                            "speaker":   returner,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                        log(return_event)
                        print_event(return_event)
                else:
                    lobby_absent[speaker] = LOBBY_TURNS

        # ── Content-based composure hits ──────────────────────────────────────
        _AGGRO_HIT = 5.0
        speech_lower = clean_speech.lower()
        _has_aggro = any(m in speech_lower for m in (
            "never", "always", "excuse me", "frankly", "how dare",
            "pathetic", "ridiculous", "embarrassing", "disgusting",
            "unbelievable", "nerve", "audacity", "that's rich",
            "you always", "you never", "your fault",
        ))
        if _has_aggro:
            for other_name in names:
                if other_name == speaker:
                    continue
                if other_name.split()[0].lower() in speech_lower or other_name.lower() in speech_lower:
                    ev = composure.delta(other_name, -_AGGRO_HIT, f"targeted by {speaker}")
                    log(ev)

        # ── Confessional ───────────────────────────────────────────────────────
        if wants_confessional:
            conf_system   = build_confessional_system(speaker, personas)
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
    scoring_events = run_reckoning(event_log, personas, brand, judge_context_window=judge_context_window)
    for e in scoring_events:
        log(e)

    # ── Side hustle pivots: brand in crisis → desperate new brand ─────────────
    # Find each personality whose final brand score fell below PIVOT_THRESHOLD.
    # Only fires once per personality per episode (tracked via pivoted set).
    _pivoted: set[str] = set()
    _final_scores: dict[str, float] = {}
    for e in event_log:
        if e.get("type") == "brand_delta" and e.get("speaker") in names:
            _final_scores[e["speaker"]] = e["score"]

    for name in names:
        score = _final_scores.get(name, 100.0)
        if score < PIVOT_THRESHOLD and name not in _pivoted:
            _pivoted.add(name)
            old_hustle = personas[name].get("side_hustle") or {}
            print(f"\n  [PIVOT TRIGGERED] {name} brand={score:.0f}, generating new hustle…")
            try:
                new_hustle = generate_pivot(name, personas[name], old_hustle, score)
                if new_hustle:
                    personas[name]["side_hustle"] = new_hustle
                    # Generate product image for the new brand (best-effort, non-blocking).
                    image_path = None
                    try:
                        image_path = generate_pivot_image(name, new_hustle)
                    except Exception as img_exc:
                        print(f"  [WARN] pivot image failed for {name}: {img_exc}")
                    pivot_event = {
                        "type":        "side_hustle_pivot",
                        "speaker":     name,
                        "old_hustle":  old_hustle,
                        "new_hustle":  new_hustle,
                        "brand_score": round(score, 1),
                        "image_path":  image_path,
                        "timestamp":   datetime.now(timezone.utc).isoformat(),
                    }
                    log(pivot_event)
                    print_event(pivot_event)
            except Exception as exc:
                print(f"  [WARN] side hustle pivot failed for {name}: {exc}")

    # ── Post-show: cast reads audience tweets ─────────────────────────────────
    if audience_personas:
        try:
            print(f"\n{'─'*60}")
            print("  CAST READS TWEETS")
            print(f"{'─'*60}")
            cast_reactions = generate_cast_reads_tweets(
                event_log=event_log,
                names=names,
                audience_personas=audience_personas,
                persona_cards=list(personas.values()),
            )
            for reaction in cast_reactions:
                log(reaction)
                print_event(reaction)
        except Exception as exc:
            print(f"  [WARN] post-show audience phase failed: {exc}")

    # ── Save cross-episode memory ──────────────────────────────────────────────
    memory = extract_memory(event_log, names, alliances)
    save_memory(memory)

    # ── Leaderboard ────────────────────────────────────────────────────────────
    print_leaderboard(brand)

    # ── Run metadata ───────────────────────────────────────────────────────────
    totals = get_token_totals()
    meta_event = {
        "type":   "run_meta",
        "models": dict(MODELS),
        "tokens": {
            "prompt":     totals["prompt"],
            "completion": totals["completion"],
            "total":      totals["prompt"] + totals["completion"],
        },
        "turns_per_course":        turns_per_course,
        "confessional_every":      confessional_every,
        "cast_size":               len(names),
        "fast":                    fast,
        "public_context_window":   public_context_window,
        "judge_context_window":    judge_context_window,
        "wine_amount":             wine_amount,
        "drama_enabled":           drama_enabled,
        "pre_dinner_enabled":      pre_dinner_enabled,
        "audience_enabled":        audience_enabled,
        "scenario":                scenario,
        "timestamp":               datetime.now(timezone.utc).isoformat(),
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
    parser.add_argument("--public-context-window", type=int, default=None,
                        help="Recent table-talk lines each personality sees.")
    parser.add_argument("--judge-context-window", type=int, default=None,
                        help="Recent events the judge reads at reckoning.")
    parser.add_argument("--wine-amount", type=float, default=None,
                        help="Wine multiplier: 0=off, 1=default, 2=double.")
    parser.add_argument("--no-drama", action="store_true",
                        help="Disable DRAMA: signal (baseline runs).")
    parser.add_argument("--no-pre-dinner", action="store_true",
                        help="Skip the pre-dinner sub-group scene.")
    parser.add_argument("--no-audience", action="store_true",
                        help="Disable audience tweet agents.")
    parser.add_argument("--scenario", type=str, default=None,
                        help="Scenario slug (e.g. 'girls-trip'). Overrides courses and twist style.")
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

        ep_kwargs: dict = dict(
            turns_per_course=turns_per_course,
            confessional_every=DEFAULT_CONFESSIONAL_EVERY,
            fast=args.fast,
            live_output=output_path,
            drama_enabled=not args.no_drama,
            pre_dinner_enabled=not args.no_pre_dinner,
            audience_enabled=not args.no_audience,
            scenario=args.scenario,
        )
        if args.public_context_window is not None:
            ep_kwargs["public_context_window"] = args.public_context_window
        if args.judge_context_window is not None:
            ep_kwargs["judge_context_window"] = args.judge_context_window
        if args.wine_amount is not None:
            ep_kwargs["wine_amount"] = args.wine_amount
        event_log = run_episode(personas, **ep_kwargs)
        if output_path is None:
            path = save_episode(event_log)
            print(f"Episode log saved → {path}")
        else:
            print(f"Episode log streamed → {output_path}")


if __name__ == "__main__":
    main()
