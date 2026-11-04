"""
audience.py — Audience agent reactions to dramatic dinner events.

Six viewer archetypes watch the show and react to signal events in tweet
style. Each reaction includes a text post and a scoring rubric. Reactions
are logged as audience_tweet events during the episode, then each cast
member reads their tweets in a post-show phase logged as cast_reads_tweets.

Audience sentiment is also extracted into cross-episode memory so cast
members know what the public thought of them last episode.
"""

from __future__ import annotations

import json
import random
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import yaml

from engine.llm import call, MODELS

AUDIENCE_DIR = Path(__file__).parent / "audience"

# Events that trigger an audience reaction batch.
AUDIENCE_TRIGGERS = {
    "drama_action",
    "twist",
    "alliance_formed",
    "feud_declared",
    "interrupt",
    "lobby_return",
}


# ─── Persona loading ──────────────────────────────────────────────────────────

def load_audience_personas() -> list[dict]:
    """Load all YAML cards from engine/audience/. Returns list of persona dicts."""
    personas = []
    for path in sorted(AUDIENCE_DIR.glob("*.yaml")):
        with open(path) as fh:
            personas.append(yaml.safe_load(fh))
    return personas


# ─── Prompt construction ─────────────────────────────────────────────────────

def _build_system(persona: dict) -> str:
    return (
        f"You are {persona['handle']}, a reality-TV viewer archetype: {persona['archetype']}.\n\n"
        f"Personality:\n{persona['persona'].strip()}\n\n"
        f"Voice:\n{persona['voice_notes'].strip()}\n\n"
        + (f"Your favorite cast member: {persona['favorite']}.\n" if persona.get('favorite') else "")
        + (f"The cast member you dislike most: {persona['nemesis']}.\n" if persona.get('nemesis') else "")
        + "\nYou are watching a reality TV dinner party show. React to what just happened.\n"
        "Respond ONLY with a JSON object — no markdown, no explanation:\n"
        '{"text": "<your post, 1-3 sentences max, in your voice>", '
        '"approval": <integer -2 to 2>, '
        '"drama_satisfaction": <integer 1 to 5>, '
        '"target": "<first name of the cast member you are mainly reacting to — required, do not use null>"}'
    )


def _build_user_prompt(trigger_event: dict, context_lines: list[str]) -> str:
    etype = trigger_event.get("type", "event")
    speaker = trigger_event.get("speaker") or trigger_event.get("interruptor") or "Someone"
    target = trigger_event.get("target", "")
    action = trigger_event.get("action_class") or trigger_event.get("action", "")
    text = trigger_event.get("text", "")

    summary_parts = [f"Event type: {etype}. Speaker: {speaker}."]
    if target:
        summary_parts.append(f"Target: {target}.")
    if action:
        summary_parts.append(f"Action: {action}.")
    if text:
        summary_parts.append(f'What was said: "{text[:300]}"')

    recent = "\n".join(context_lines[-3:]) if context_lines else ""
    if recent:
        summary_parts.append(f"\nRecent table context:\n{recent}")

    return "\n".join(summary_parts)


# ─── LLM call + likes computation ────────────────────────────────────────────

def _call_one(persona: dict, trigger_event: dict, context_lines: list[str]) -> dict | None:
    system = _build_system(persona)
    user_prompt = _build_user_prompt(trigger_event, context_lines)

    raw = call(
        MODELS.get("audience", MODELS["personality"]),
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
        max_tokens=512,
    )

    # Parse JSON from response. Try full parse first, then extract first {...} block.
    data = None
    clean = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        data = json.loads(clean)
    except (json.JSONDecodeError, ValueError):
        m = re.search(r'\{.*\}', clean, re.DOTALL)
        if m:
            try:
                data = json.loads(m.group())
            except (json.JSONDecodeError, ValueError):
                pass
    if data is None:
        # Final fallback: treat entire response as tweet text, neutral scores.
        data = {
            "text": clean[:280],
            "approval": 0,
            "drama_satisfaction": 3,
            "target": None,
        }

    # Resolve target: use LLM-supplied name, fall back to trigger speaker's first name.
    trigger_speaker = trigger_event.get("speaker") or trigger_event.get("interruptor") or ""
    trigger_first = trigger_speaker.split()[0] if trigger_speaker else ""
    target_name = (data.get("target") or "").strip() or trigger_first

    # Compute likes.
    lo, hi = persona.get("likes_range", [50, 500])
    likes = random.randint(lo, hi)
    favorite = persona.get("favorite", "")
    if favorite and target_name and favorite.split()[0].lower() == target_name.lower().split()[0]:
        likes = int(likes * persona.get("likes_boost_multiplier", 1.5))

    return {
        "type": "audience_tweet",
        "handle": persona["handle"],
        "archetype": persona["archetype"],
        "avatar_color": persona["avatar_color"],
        "text": data.get("text", "")[:280],
        "approval": max(-2, min(2, int(data.get("approval", 0)))),
        "drama_satisfaction": max(1, min(5, int(data.get("drama_satisfaction", 3)))),
        "target": target_name or None,
        "likes": likes,
        "trigger_type": trigger_event.get("type"),
        "trigger_speaker": trigger_speaker,
    }


# ─── Public API ──────────────────────────────────────────────────────────────

def generate_tweets(
    trigger_event: dict,
    context_lines: list[str],
    personas: list[dict],
) -> list[dict]:
    """Generate one audience tweet per persona in parallel. Returns list of audience_tweet dicts."""
    results = []
    with ThreadPoolExecutor(max_workers=len(personas)) as executor:
        futures = {
            executor.submit(_call_one, p, trigger_event, context_lines): p
            for p in personas
        }
        for future in as_completed(futures):
            try:
                result = future.result()
                if result:
                    results.append(result)
            except Exception as exc:
                persona = futures[future]
                print(f"  [WARN] audience tweet failed for {persona['handle']}: {exc}")

    # Sort by handle for deterministic log order.
    results.sort(key=lambda x: x["handle"])
    return results


def generate_cast_reads_tweets(
    event_log: list[dict],
    names: list[str],
    audience_personas: list[dict],
    persona_cards: list[dict],
) -> list[dict]:
    """Post-show phase: each cast member reads tweets targeting them and reacts.

    Returns list of cast_reads_tweets dicts, one per cast member who received
    audience tweets. Cast members with no tweets are skipped.
    """
    # Collect tweets per target (match on first name, case-insensitive).
    tweets_by_target: dict[str, list[dict]] = {name: [] for name in names}
    for event in event_log:
        if event.get("type") != "audience_tweet":
            continue
        target = event.get("target") or ""
        for name in names:
            if target.lower().split()[0] == name.lower().split()[0]:
                tweets_by_target[name].append(event)

    # Build a quick lookup: name → persona card voice
    voice_by_name: dict[str, str] = {}
    for card in persona_cards:
        voice_by_name[card["name"]] = card.get("voice", "") or card.get("personality", "")

    results = []
    for name in names:
        tweets = tweets_by_target.get(name, [])
        if not tweets:
            continue

        # Build tweet digest for the prompt.
        tweet_lines = [f'{t["handle"]}: "{t["text"]}"' for t in tweets[:8]]
        tweet_text = "\n".join(tweet_lines)

        approval_avg = sum(t["approval"] for t in tweets) / len(tweets)
        sentiment_word = (
            "very positive" if approval_avg > 1 else
            "positive" if approval_avg > 0.3 else
            "mixed" if approval_avg > -0.3 else
            "negative" if approval_avg > -1 else
            "very negative"
        )

        # Find matching persona card for system prompt.
        card = next((c for c in persona_cards if c["name"] == name), None)
        card_text = ""
        if card:
            card_text = (
                f"Name: {card['name']}\n"
                f"Archetype: {card.get('archetype', '')}\n"
                f"Personality: {card.get('personality', '')}\n"
                f"Voice: {card.get('voice', '')}"
            )

        system = (
            f"You are {name}, a cast member on a reality TV dinner party show.\n"
            f"{card_text}\n\n"
            "You have just finished filming and are now reading online reactions to your performance. "
            "React in your voice — briefly, 2-3 sentences. Be yourself. "
            "Respond ONLY with a JSON object:\n"
            '{"text": "<your reaction to reading these posts, in character, 2-3 sentences>"}'
        )
        user_prompt = (
            f"The overall online reaction to you this episode was {sentiment_word}.\n\n"
            f"Here are some posts about you:\n{tweet_text}"
        )

        try:
            raw = call(
                MODELS.get("audience", MODELS["personality"]),
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
                max_tokens=512,
            )
        except Exception as exc:
            print(f"  [WARN] cast_reads_tweets LLM call failed for {name}: {exc}")
            continue

        try:
            clean = re.sub(r"```(?:json)?|```", "", raw).strip()
            data = json.loads(clean)
            reaction_text = data.get("text", raw.strip())
        except (json.JSONDecodeError, ValueError):
            reaction_text = raw.strip()

        # Two most extreme tweets (highest abs approval).
        notable = sorted(tweets, key=lambda t: abs(t["approval"]), reverse=True)[:2]
        notable_strs = [f'{t["handle"]}: "{t["text"][:120]}"' for t in notable]

        results.append({
            "type": "cast_reads_tweets",
            "speaker": name,
            "text": reaction_text[:400],
            "audience_approval_avg": round(approval_avg, 2),
            "notable_tweets": notable_strs,
        })

    return results
