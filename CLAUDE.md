# RHOUV — Claude session context

## What this project is

Multi-agent reality show simulation. Six AI personalities, one dinner, event log as source of truth.
See README.md for full architecture and cast.

## Python environment

- Python 3.15 is the system default — **do not use it**. LiteLLM deps (`pydantic-core`, `tiktoken`) have no 3.15 wheels.
- Venv at `.venv/` uses Python 3.12.
- Run everything with `.venv/bin/python3.12`.

```bash
# install deps
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt

# fast test run (4 personalities, 2 turns/course)
.venv/bin/python3.12 -m engine.run --fast --personalities 4

# full run (all 6, 4 turns/course)
.venv/bin/python3.12 -m engine.run
```

## API provider

Magica AI (OpenAI-compatible proxy). Keys in `.env` (gitignored):

```
OPENAI_API_KEY=gx_...
OPENAI_API_BASE=https://inference.magica.com/v1
GEMINI_API_KEY=...  # direct Gemini, not via Magica
```

Model strings for Magica use `openai/` prefix: `openai/~anthropic/claude-haiku-latest`, `openai/deepseek/deepseek-v4.1-flash`, etc.

## Model config

Set via `.env` — no code changes needed to swap models:

```
MODEL_PERSONALITY=openai/~anthropic/claude-haiku-latest
MODEL_DIRECTOR=openai/~anthropic/claude-haiku-latest
MODEL_JUDGE=openai/~anthropic/claude-haiku-latest
```

Defaults (in `engine/llm.py`) are all three → `openai/~anthropic/claude-haiku-latest`.

**Known gotcha:** Models with `"reasoning":true` in Magica's catalog (DeepSeek flash, and all Claude models) use internal thinking tokens against the `max_tokens` budget. At 200 tokens they return empty content with `finish_reason='length'`. Current fix: personality/confessional calls use `max_tokens=1024`, director/judge use `max_tokens=512`. Do not lower these.

## M1 status: complete and working

All files exist and the dinner loop runs end to end:
- `engine/llm.py` — LiteLLM wrapper, model strings from env
- `engine/composure.py` — composure ledger + wine escalation
- `engine/brand.py` — brand value ledger
- `engine/director.py` — turn order, twists (1 per course), interrupt protocol
- `engine/run.py` — full dinner loop: table talk → confessionals → reckoning → leaderboard
- `engine/personalities/*.yaml` — 6 persona cards (each has `title_card_position: 1-6`, L→R)
- `engine/offscreen/*.yaml` — 8 off-screen characters
- `engine/__init__.py` — needed for `python -m engine.run`

Episode logs saved to `runs/` as JSONL.

## Next milestone: M2

Memory, alliances, receipts, gossip, composure floor per personality, off-screen characters in dialogue.

## Next milestone: M3 (UI)

Plan doc: https://claude.ai/artifact/DRYXswVS5kvQRbXKZszfSo

Stack: React + Vite, FastAPI SSE, D3 for alliance graph.
Build order: API replay endpoint → Vite scaffold → EpisodeFeed → BrandLeaderboard → ComposureMeter → ReplayControls → OpeningCredits → AllianceGraph → live SSE.

## Cast — title card positions (L→R)

| Position | Name | Archetype |
|---|---|---|
| 1 | Vivienne Davenport | The Queen Bee |
| 2 | Cassandra Cole | The Frenemy |
| 3 | Bianca Noel | The Former It-Girl |
| 4 | Diane Wentworth | The Lying Peacemaker |
| 5 | Petra Voss | The Chaos Agent |
| 6 | Madison Fleur | The Newcomer |

Secret web: Vivienne → Diane → Bianca → Petra → Vivienne (cycle). Cassandra ↔ Madison (mutual deterrence).
