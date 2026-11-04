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

## Engine status: M1 + M2 + physical escalation complete

All files exist and the dinner loop runs end to end:
- `engine/llm.py` — LiteLLM wrapper, model strings from env
- `engine/composure.py` — composure ledger + wine escalation
- `engine/brand.py` — brand value ledger; accepts `starting_scores` dict for cross-episode carry-over
- `engine/director.py` — turn order, twists (1 per course), interrupt protocol
- `engine/drama.py` — DRAMA: signal parsing, classification (`targeted`/`area`/`exit`/`scene`), consequence application
- `engine/run.py` — full dinner loop + pre-dinner scene + lobby mechanic + DRAMA wiring
- `engine/personalities/*.yaml` — 6 persona cards (each has `title_card_position: 1-6`, L→R)
- `engine/offscreen/*.yaml` — 8 off-screen characters
- `engine/__init__.py` — needed for `python -m engine.run`

Episode logs saved to `runs/` as JSONL.

### CLI flags
- `--fast` — 4 personalities, 2 turns/course
- `--personalities N` — limit cast size
- `--no-drama` — disable DRAMA: signal (baseline runs)
- `--no-pre-dinner` — skip pre-dinner sub-group scene

### Key engine mechanics
- **Brand scores carry over** across episodes via `prior_memory["personalities"][name]["brand_end"]` → seeded into `BrandLedger(starting_scores=...)`
- **Pre-dinner scene**: 2 selected personalities (feuding pair priority > allied > random), 4 turns private, result injected as memory line into dinner prompts
- **Lobby mechanic**: personality who fires `exit` DRAMA absent for `LOBBY_TURNS=3` turns; if lobby already occupied, triggers private 2-person scene (`lobby_talk` events)
- **DRAMA: signal**: appended by personality at end of turn, regex-parsed, stripped from public speech, classified by keywords; consequences applied to brand + composure
- **Feud-aware drama prompt**: composure < 40 + active feud → "available"; active feud only → "possible but costly"; no feud → "almost never appropriate"

## UI status: M3 complete

Plan doc: https://claude.ai/artifact/DRYXswVS5kvQRbXKZszfSo

Stack: React + Vite, FastAPI SSE, D3 charts. Running at `web/`.

### Key UI files
- `web/src/pages/EvalPage.jsx` — eval dashboard with all charts + controls
- `web/src/components/EpisodeFeed.jsx` — live event feed with grouped private scenes, drama cards, line-break fix
- `web/src/hooks/useEpisode.jsx` — SSE + run state; handles all event types incl. drama/lobby/pre-dinner
- `web/src/castConfig.js` — `CAST_ORDER`, `personaColor()`, `FIRST_NAME_MAP`, etc.
- `api/analytics.py` — shared analytics; `compute_summary()` produces all chart data
- `api/server.py` — FastAPI; `/api/eval/summary`, `/api/run`, `/api/models`, `/api/config/*`

### Eval charts (in order)
1. Token cost table
2. Brand score across episodes (line)
3. Final brand score by episode (bar)
4. Composure trajectory (dot plot, min per run)
5. Composure arc over dinner (line, X=stmt#, Y=composure, all runs overlaid)
6. Time to first breakdown (dot plot)
7. Event mix per episode (stacked bar)
8. Twist impact (brand lines + gold bands)
9. Alliance edge weights (heatmap)
10. Composure → speech length (grouped bar)
11. Alliance evolution (animated per-episode snapshot, `AllianceEvolutionChart`)
12. Alliance season timeline (animated event-by-event across whole season, `AllianceSeasonGraph`)

### Analytics data shape (from `/api/eval/summary`)
Each run object includes: `brand_over_time`, `final_brand`, `composure_over_time`, `first_breakdown`, `event_counts`, `twists`, `alliance_weights`, `alliance_events`, `alliance_timeline`, `behavior_metrics`, `drama_stats`, `talk_counts`, `composure_timeline`, `run_meta`, `activeNames`.

`alliance_timeline`: `[{idx, stmt, a, b, kind}]` — every alliance/feud/interrupt in order; kind = `"ally"` | `"feud"` | `"interrupt"`.

### EpisodeFeed event types
`table_talk`, `confessional`, `brand_delta`, `composure_delta`, `twist`, `interrupt`, `alliance_formed`, `feud_declared`, `drama_action`, `pre_dinner_talk`, `lobby_talk`, `lobby_return`

Private talk events (`pre_dinner_talk`, `lobby_talk`) are grouped into `PrivateSceneGroup` cards (light blue palette). Drama cards have red/amber left border + action class badge.

### localStorage persistence
Key: `rhouv_eval_prefs`. Stores: `castOn`, `twists`, `interrupts`, `wineAmount`, `insultWeight`, `thresholds`, `modelConfig`. Model choices re-POST to server on mount to survive restarts.

### D3 chart pattern
All static charts use `D3Chart` wrapper: `draw(svgRef, data, W, H)` → called in `useEffect([data])`. `AllianceEvolutionChart` and `AllianceSeasonGraph` manage their own SVG refs with separate node/edge layers.

### Avatar sprite map (title-card.webp, IMG_W=1424, FACE_Y=270)
| Name | fx |
|---|---|
| Vivienne Davenport | 178 |
| Cassandra Cole | 394 |
| Bianca Noel | 608 |
| Diane Wentworth | 822 |
| Petra Voss | 1043 |
| Madison Fleur | 1258 |

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
