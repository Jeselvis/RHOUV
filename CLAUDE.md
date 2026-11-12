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

## Engine status: M1 + M2 + physical escalation + personas + scenarios complete

All files exist and the dinner loop runs end to end:
- `engine/llm.py` — LiteLLM wrapper, model strings from env; `generate_image()` for Magica async node API
- `engine/composure.py` — composure ledger + wine escalation
- `engine/brand.py` — brand value ledger; accepts `starting_scores` dict for cross-episode carry-over
- `engine/director.py` — turn order, twists (1 per course), interrupt protocol; `Scene` dataclass + `DEFAULT_SCENES`; injectable `scenes`/`twist_prompt`
- `engine/drama.py` — DRAMA: signal parsing, classification (`targeted`/`area`/`exit`/`scene`), consequence application
- `engine/run.py` — full dinner loop + pre-dinner scene + lobby mechanic + DRAMA wiring + scenario support + secret objectives
- `engine/side_hustle.py` — brand pivot LLM + image generation (`generate_pivot_image`)
- `engine/personalities/*.yaml` — 6 persona cards; each has `archetype_mandate` (forbidden/required) + `objective_pool` (3 objectives)
- `engine/scenarios/girls_trip.yaml` — Girls Trip scenario config (4 phases, room assignment, per-phase environment props)
- `engine/offscreen/*.yaml` — 8 off-screen characters
- `engine/__init__.py` — needed for `python -m engine.run`

Episode logs saved to `runs/` as JSONL.

### CLI flags
- `--fast` — 4 personalities, 2 turns/course
- `--personalities N` — limit cast size
- `--no-drama` — disable DRAMA: signal (baseline runs)
- `--no-pre-dinner` — skip pre-dinner sub-group scene
- `--scenario SLUG` — load scenario from `engine/scenarios/{slug}.yaml` (e.g. `--scenario girls-trip`)

### Key engine mechanics
- **Brand scores carry over** across episodes via `prior_memory["personalities"][name]["brand_end"]` → seeded into `BrandLedger(starting_scores=...)`
- **Pre-dinner scene**: 2 selected personalities (feuding pair priority > allied > random), 4 turns private, result injected as memory line into dinner prompts
- **Lobby mechanic**: personality who fires `exit` DRAMA absent for `LOBBY_TURNS=3` turns; if lobby already occupied, triggers private 2-person scene (`lobby_talk` events)
- **DRAMA: signal**: appended by personality at end of turn, regex-parsed, stripped from public speech, classified by keywords; consequences applied to brand + composure
- **Feud-aware drama prompt**: composure < 40 + active feud → "available"; active feud only → "possible but costly"; no feud → "almost never appropriate"
- **Archetype mandates**: each persona YAML has `archetype_mandate.forbidden` (hard rules never to break) and `archetype_mandate.required` (must-do behaviors); injected into system prompt under `ARCHETYPE RULES` section
- **Secret objectives**: each persona YAML has `objective_pool` (3 options); `run_episode()` picks one per personality at start; injected into system prompt under `SECRET OBJECTIVE`; logged as `objectives_assigned` event
- **Brand pivot image gen**: `side_hustle_pivot` event triggers `generate_pivot_image()` → Magica async node API → saved to `web/public/brand_images/{slug}_{ts}.jpg`; `image_path` stored on event

### Scenario system
Scenario YAML structure (`engine/scenarios/*.yaml`):
```yaml
name: "Girls Trip"
setting_context: "..."   # injected into every personality system prompt
phases:                  # replaces default COURSES list
  - id: arrival
    display: "Arrival & Check-In"
    turns: 3
    environment:
      - "Marco the pool attendant..."   # list of props/people in scene
  - id: pool_day
    ...
twist_prompt: "..."      # replaces default director twist prompt
rooms:
  size: 2
  feud_same_room: false  # composure penalty if feuding pair roomed together
```

`Director` accepts `scenes: list[Scene]` and `twist_prompt` kwargs — scenario builds `scenario_scenes: list[Scene]` from YAML phases and injects both. Each `Scene` carries `id`, `display`, `context`, `environment` — no parallel dicts needed.
Room assignment is feud-aware; feud roommates get composure penalty logged as `composure_delta` event.

### Brand pivot images (Magica async node API)
`generate_image()` in `engine/llm.py`:
- POST `{base}/nodes/{nodeType}/run` → `{runId}`
- Poll GET `{base}/nodes/runs/{runId}` until `status == "COMPLETED"`
- Returns CDN URL; `generate_pivot_image()` downloads + saves locally

Image model config: `MODEL_IMAGE=nano_banana_2:nano-banana-2-text` (default). Override via `.env`.

**NOT yet implemented** (designed, documented in README/build-log):
- Per-archetype wine sensitivity (`wine_sensitivity` float in YAMLs)
- Voluntary `DRINK:` signal with `drink_tendency` per YAML
- Cross-episode drink reinforcement learning
- Simmering mechanic
- Director temperature tracker / heat mechanic
- Rivalry intensity float

## UI status: M3 complete

Plan doc: https://claude.ai/artifact/DRYXswVS5kvQRbXKZszfSo

Stack: React + Vite, FastAPI SSE, D3 charts. Running at `web/`.

### Key UI files
- `web/src/pages/EvalPage.jsx` — eval dashboard with all charts + controls
- `web/src/components/EpisodeFeed.jsx` — live event feed with grouped private scenes, drama cards, `SideHustlePivotCard` (renders brand image strip when `event.image_path` present)
- `web/src/components/OpeningCredits.jsx` — front page cast grid; `ProductBadge` uses `persona.side_hustle?.image_path` priority over static `/images/products/`; uses `latestPersonas` (pivot-aware before playback)
- `web/src/hooks/useEpisode.jsx` — episode state; `latestPersonas` = full-episode hustle overrides for opening screen; `effectivePersonas` = cursor-limited for playback
- `web/src/castConfig.js` — `CAST_ORDER`, `personaColor()`, `FIRST_NAME_MAP`, etc.
- `api/analytics.py` — shared analytics; `compute_summary()` produces all chart data
- `api/server.py` — FastAPI; `/api/eval/summary`, `/api/run`, `/api/models`, `/api/config/*`

### Brand image display pipeline
`side_hustle_pivot` event → `deriveState()` merges `{ ...e.new_hustle, image_path: e.image_path }` into `hustleOverrides[speaker]` → `latestPersonas` (all events, not cursor-sliced) → `OpeningCredits` `ProductBadge` uses `persona.side_hustle?.image_path || /images/products/${first}.jpg`.

**Key gotcha:** `effectivePersonas` is cursor-limited (0 before playback starts) — always use `latestPersonas` on the opening screen.

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
`table_talk`, `confessional`, `brand_delta`, `composure_delta`, `twist`, `interrupt`, `alliance_formed`, `feud_declared`, `drama_action`, `pre_dinner_talk`, `lobby_talk`, `lobby_return`, `side_hustle_pivot`, `audience_tweet`, `cast_reads_tweets`

`course_transition`, `table_talk`, `drama_action` events carry both `"course"` (machine id, backward-compat) and `"display"` (human label, e.g. `"Day 1 — Arrival"`). Old JSONLs without `display` fall through to `COURSE_LABELS` lookup in `courseLabel(key, display?)`.

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

## Eval design — session notes

### What RHOUV is measuring
Core research question: **Can LLM agents maintain consistent, context-sensitive personas across multi-turn social simulation?**

Sub-questions:
- Do composure tier injections change speech behavior?
- Do agents respond appropriately to feuds/alliances?
- Does cross-episode memory carry over into behavior?
- Does wine (global perturbation) shift composure trajectories?

### Current eval gaps (vs best practices)
- **No ground truth** — no human-annotated rubric for "is this character behaving correctly"
- **LLM-as-judge problem** — judge is same model family as personalities (Claude judging Claude = biased)
- **No matched A/B runs** — `--no-drama` flag exists but no systematic paired comparison
- **No persona fidelity metric** — no direct measure of archetype adherence
- **Shallow text analysis** — aggression proxy is exclamation marks + keywords only

### Judge model recommendation
Use **Gemini** as judge — different family from Claude personalities, avoids circular evaluation.

```
MODEL_JUDGE=gemini/gemini-2.0-flash
```

LiteLLM supports `gemini/` prefix natively with `GEMINI_API_KEY`. No code changes needed.

### Planned judge rubric upgrade (NOT YET IMPLEMENTED)
Replace holistic -20/+20 score with 5 analytic dimensions (-4 to +4 each, sum = -20 to +20):

| Dimension | -4 | 0 | +4 |
|---|---|---|---|
| `drama` | Invisible/boring | Present but forgettable | Show-defining/iconic |
| `brand` | Sabotaged own position | Neutral | Advanced narrative, gained leverage |
| `damage` | Humiliated/exposed, no comeback | Broke even | Drew blood, target reeling |
| `composure` | Spiraled at worst moment | Held together | Used emotion tactically / ice-cold while others broke |
| `fidelity` | Unrecognizable from archetype | Somewhat consistent | Every line felt inevitable |

**Key addition:** `fidelity` requires injecting persona archetype + tagline into judge's user message.

Implementation touches:
1. `engine/run.py` `run_reckoning()` — new system prompt + persona context in user message
2. `engine/run.py` `_parse_judge_response()` — extract 5 fields, return as `(score, verdict, dims)`
3. Store `dims` dict on `brand_delta` event as `judge_dims`
4. `api/analytics.py` `compute_summary()` — aggregate dimensional scores per personality
5. New eval chart: radar/spider per personality showing dimensional averages

### Ridiculous stats (LinkedIn content)
Script: `analysis/ridiculous_stats.py`

Computes 7 cross-episode findings:
1. **chaos_externality** — collateral damage ratio (area drama / directed drama). Thin until area drama appears in runs.
2. **breakdown_brand_paradox** — did personalities who broke down end with more or less brand? (Current data: broke=79.2 avg, held=100.0)
3. **mention_asymmetry** — directional mention counts; who obsesses over whom. (Current: Petra mentioned 115x by others, mentions back ~14x)
4. **first_blood** — does first drama actor win the episode? (Current: 16.7% win rate — first mover disadvantage)
5. **talk_vs_brand** — correlation between statement count and final brand
6. **breakdown_speed** — avg statements until first breakdown per personality
7. **wine_sensitivity** — avg composure drop per wine tick per personality

**Workflow:**
```bash
.venv/bin/python3.12 analysis/ridiculous_stats.py > stats.json
# paste stats.json into Claude with:
# "Generate the UVIHA LinkedIn report from this data."
```

**Output style:** Self-contained HTML. Parody-academic + touch of camp.
- Fake journal header: "Uncanny Valley Institute for Housewife Analytics, Vol. X"
- Serif body, cream background, burgundy accents, hot pink callout boxes
- One finding per section: pompous headline + deadpan copy + Chart.js mini chart
- Absurd disclaimer footer
- Screenshot-ready (~1200px wide)
