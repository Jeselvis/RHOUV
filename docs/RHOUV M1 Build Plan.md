# RHOUV M1 Build Plan

Oct 24, 2026 · @Tim

## Goal

Milestone 1 delivers a working core loop: 4 personalities run one dinner with confessional cutaways, a judge scores the reckoning, and brand value updates. Output is console only. No persistence, no memory, no gossip — just the engine proving it can run end to end. Plain Python, direct Anthropic API calls.

## Build Order

1. **Persona cards** (`engine/personalities/*.yaml`) — four YAML files, one per cast member. Fields: `name`, `archetype`, `voice`, `secret`, `goal`, `weakness`, `tagline`, `side_hustle`. These become system prompts; quality here drives everything downstream. Start with Queen Bee, Frenemy, Newcomer, Lying Peacemaker.
2. **`llm.py`** — single function `call(model, system, messages, **kwargs) -> str` wrapping the Anthropic SDK. Model is a parameter so director, personalities, and judge can differ. No other abstraction.
3. **Event log schema** — JSONL file per episode in `runs/`. Every utterance, confessional, and score delta is one JSON line with `type`, `speaker`, `content`, `turn`, `timestamp`. Get the shape right before building on it.
4. **`brand.py`** — score ledger. Dict `{name: float}`, methods `delta(name, amount, reason)` and `leaderboard()`. Every change logged as an event.
5. **`director.py`** — dinner flow controller. Hardcoded for M1: 3 courses, round-robin speaker order, one twist per course (toast or prompted secret drop). One LLM call per turn to pick next speaker and inject course transitions.
6. **Dinner loop** (`engine/run.py`) — outer loop over 3 courses, inner loop over turns. Each personality receives her persona card plus her own slice of public events (no other agents' private memory). After each beat the director decides if a confessional fires.

   ```
   for course in [appetizer, main, dessert]:
       for turn in course:
           speaker = director.pick_next(event_log)
           reply = personality.speak(speaker, public_context, private_memory)
           log(event)
           if director.wants_confessional():
               confessional = personality.confess(speaker, private_memory)
               log(confessional_event)
   ```
7. **Judge / reckoning** — after dessert, one judge call per personality. System prompt: impartial reality TV judge. Input: full event log (judge sees everything). Output: score delta + one-line verdict. Each score change logged.
8. **Console output** — pretty-print events as they stream: `[TABLE] Bethenny: ...`, `[CONFESSIONAL - Crystal] ...`, `[JUDGE] +8 brand for Svetlana: "controlled the table"`.

## Defer to M2

- Persistence across episodes
- `memory.py` — grudges, alliances
- `gossip.py`, `composure.py`, `receipts.py`
- Off-screen characters
- LangGraph port (M2 is when you document what it gave and what it cost)
- Social media (`social.py`), producer edit, status tiers, Reunion

## Scope

8 files total: 4 persona YAMLs, `llm.py`, `brand.py`, `director.py`, `run.py`. Target under 600 lines of Python. Entry point: `python -m engine.run --personalities 4 --episodes 1`.
