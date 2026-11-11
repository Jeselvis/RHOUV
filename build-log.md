# Build Log

---

## 2026-11-10 — Drink system design (implementation pending)

**What:** Three-layer design for wine/drink mechanics that go beyond the current uniform composure drop. Not yet implemented — documented here as a design decision before build.

---

**Layer 1 — Per-archetype wine sensitivity**

Current `wine_tick()` applies an identical composure drop to everyone. That is wrong in the same way that giving every personality the same composure floor would be wrong. The whole point of `composure_floor` is that Petra is structurally more volatile than Vivienne. Wine sensitivity extends that logic to the *rate of degradation*, not just the floor.

Proposed `wine_sensitivity` multiplier per YAML, applied as `drop * sensitivity` per personality during `wine_tick()`:

| Name | Sensitivity | Rationale |
|---|---|---|
| Vivienne | 0.6 | Control is the brand. She paces herself. Drunk Vivienne is a catastrophic failure of self-image. |
| Cassandra | 0.8 | Strategic drinker. Never loses the edge. Composure degradation happens on her schedule. |
| Bianca | 1.5 | Wine is both crutch and downfall. The former it-girl decline arc is a wine arc. |
| Diane | 1.3 | Loosens the lies. The cracks in the peacemaker appear faster when she drinks. |
| Petra | 1.0 | Already chaos. Wine is just confirmation. |
| Madison | 1.2 | Drinks to fit in. Hits her harder than she expects. |

Implementation: add `wine_sensitivity: float` to each YAML. `ComposureLedger.wine_tick()` applies `drop * self._sensitivities.get(name, 1.0)` per personality instead of flat drop. Minimal change.

---

**Layer 2 — Voluntary drink signal (`DRINK:`)**

Like `DRAMA:` — parsed and stripped from public speech, logged as a `drink_taken` event with immediate mechanical effect. Personality signals `DRINK:` at end of their turn.

Effects:
- Immediate composure drop: `-(15 * wine_sensitivity)` — hits the heavy drinkers harder
- Bumps global wine level `+5` — her refill raises the room slightly
- Logged as `drink_taken` event with composure snapshot

Each YAML gets a `drink_tendency` field: `aggressive` / `social` / `coping` / `abstain`. Injected into the turn prompt to shape when the LLM reaches for it:

| Tendency | Prompt injection |
|---|---|
| `aggressive` | *"You drink offensively — to signal you don't care, to loosen your tongue, to go there."* |
| `social` | *"You drink socially — to match the room, to ease in, to belong."* |
| `coping` | *"You drink to manage — to take the edge off, to get through it."* |
| `abstain` | *"You are not drinking tonight. You have your reasons."* |

Proposed per YAML: Petra `aggressive`, Diane `coping`, Madison `social`, Bianca `coping`, Cassandra `social`, Vivienne `abstain` (she nurses one glass all evening; this is power).

Prompt injection offered every turn (all scenarios):
> *You may order another glass. Signal `DRINK:` at the end of your statement. Wine loosens the room. It will cost you.*

Implementation: `check_drink_signal()` in `engine/drama.py` or new `engine/drink.py`. Parsed in dinner loop after DRAMA check.

---

**Layer 3 — Cross-episode drink RL**

The most interesting layer. After each episode, drink outcomes stored in `memory.json`:

```json
"Bianca Noel": {
  "drink_history": [
    {"episode": 3, "drinks": 4, "brand_end": 42, "composure_end": 18, "drama_wins": 1, "drama_losses": 2}
  ],
  "drink_sensitivity": 1.5,
  "drink_tendency": "coping"
}
```

**Prompt injection (episode start):** `build_memory_injection()` reads drink history and injects:
> *"Last dinner you had 4 glasses. Your composure hit 18. You said things you regret. The room saw it."*

LLM reasons about whether to drink this episode. No forced behavior — memory shapes the decision.

**Mechanical drift:** `drink_sensitivity` updates in memory based on cross-episode outcome patterns:

| Pattern | Drift |
|---|---|
| Drinks a lot + brand holds across 2+ episodes | Tolerance building: sensitivity `- 0.05` (floor ~0.4) |
| Drinks a lot + brand craters | Dependency spiral: sensitivity `+ 0.08` (cap ~2.0) |
| Abstains 2+ episodes | Reset toward YAML baseline |

Bianca's decline arc writes itself. Sensitivity climbs each episode, she keeps drinking anyway (the prompt history makes her aware but not able to stop), composure collapses faster each time.

**Tendency evolution:** `drink_tendency` can shift in memory based on outcomes:
- `social → coping` after two episodes of drinking-and-losing
- `coping → aggressive` after a confrontation won while drinking
- `aggressive → abstain` after a catastrophic episode

Transitions injected as self-awareness: *"You've been using wine as a shield lately. You know it."*

Implementation: `engine/memory.py` extract step adds drink stats. `build_memory_injection()` formats drink context. `drink_sensitivity` and `drink_tendency` stored and read from `runs/memory.json`.

**Why this matters as an eval:** This is the only mechanic in the engine where behavioral adaptation happens through memory and mechanical drift simultaneously. The RL question — does prior-episode history change how the LLM makes decisions? — is cleanest here because the decision (drink or not) is binary, the outcome (brand/composure) is numeric, and the history injection is explicit. If the model ignores the history injection and Bianca keeps drinking to ruin regardless of what her history says, that is a meaningful finding about how LLMs use injected self-knowledge.

---

## 2026-11-10 — Scenario system + Girls Trip

**What:** Abstracted episode structure into a scenario config layer, plus the first non-dinner scenario: Girls Trip (Cabo).

**Scenario config (`engine/scenarios/*.yaml`):** Each scenario defines `phases` (replaces hardcoded `COURSES`), a `twist_prompt` for the director, `setting` text injected globally, and per-phase `environment` prop lists. `room_assignment` config block controls roommate pairing and composure penalties. `girls_trip.yaml` has 4 phases: `arrival`, `pool_day`, `group_dinner`, `late_night`. `--fast` mode uses the first 3.

**Environment props:** Each phase lists named physical items and people present — injected into every personality's system prompt as `WHAT'S AROUND YOU`. Named specifics (Marco the pool attendant, Diane's wine label showing up at the pool she requested, the QUEEN float, Madison's brand-new luggage with tags still on) are dramatically richer than generic scene-setting and give the LLM concrete objects to reference, fight over, and weaponize.

**Room assignment:** `assign_rooms()` pairs personalities, feud pairs sharing a room by priority. Feuding roommates take an immediate composure penalty at episode start. Roommate name + context injected into system prompt for the full episode.

**Director refactored:** `Director.__init__()` now accepts `courses`, `twist_prompt`, and `phase_environments` — all optional, all defaulting to existing dinner behavior. `_generate_twist()` uses the injected prompt and appends current phase environment to its context. No behavior change for dinner runs.

**`run.py` additions:** `load_scenario()`, `assign_rooms()`, `--scenario` CLI flag, `scenario` param on `run_episode()`. `build_personality_system()` gains `setting_context`, `environment`, `roommate` params. `run_meta` event records `scenario` slug.

New files: `engine/scenarios/girls_trip.yaml`. Modified: `engine/director.py`, `engine/run.py`.

CLI:
```bash
# Girls Trip, full cast
.venv/bin/python3.12 -m engine.run --scenario girls-trip

# Girls Trip, fast (3 phases, 4 cast)
.venv/bin/python3.12 -m engine.run --scenario girls-trip --fast --personalities 4
```

**Why:** The dinner table is a highly constrained environment that produces specific bias patterns — seating order, turn order, the same three courses. The eval question "do biases at the dinner table hold in other settings?" requires other settings to actually exist. Girls Trip is the first test of generalization: same personalities, different physical context, group-living proximity instead of formal seating. The environment prop system addresses a prompt-grounding gap — without named objects and people in the scene, personalities float in an abstract space and default to generic conversational patterns. Marco and the QUEEN float are not decoration; they are drama vectors the LLM can grab when it needs a move.

Room assignment is a structural forcing function. A feuding pair sharing a room for three nights has composure pressure built in before anyone says a word.

---

## 2026-11-10 — Archetype mandates + secret objectives

**What:** Two prompt-layer additions targeting persona fidelity and cross-purpose tension.

**Archetype mandates** — each persona YAML now has an `archetype_mandate` block with explicit `forbidden` and `required` lists. These are injected into every turn's system prompt as absolute rules (labeled "not suggestions"), not soft guidance. Examples: Vivienne must never raise her voice first; Petra must ask the question everyone is thinking and no one will ask; Cassandra must never take a visible side. The mandate section sits between the alliances block and the RULES block in prompt assembly order, so it has high positional salience.

**Secret objectives** — each persona YAML has an `objective_pool` list of 3 character-specific goals. At episode start, `run_episode()` picks one per personality at random and injects it privately as `YOUR SECRET OBJECTIVE THIS EVENING`. No other personality sees it. Logged as an `objectives_assigned` event (private, not in public context). Examples: Bianca's objective is to get someone to reference her modeling years without prompting; Diane's is to prevent any alliance from forming that doesn't include her; Petra's is to find and destroy one moment of false peace.

Modified: all 6 `engine/personalities/*.yaml`, `engine/run.py` (`build_personality_system()` gains `secret_objective` param; `run_episode()` assigns objectives from pool using `random.choice`). Added `import random` to `run.py`.

**Why:** Two identified eval gaps, both addressed here.

The **fidelity gap** — no ground truth for "is this character behaving correctly" — is partially a measurement problem, but it's also a generation problem. The judge's `fidelity` dimension scores whether each turn felt inevitable for the archetype, but the persona cards were written as descriptive prose, not behavioral constraints. Descriptive voice prompts drift toward generic LLM tone over multi-turn context, especially at high composure where no other injection is present. Hard forbidden/required rules don't fix the measurement gap, but they directly reduce the drift that makes the gap matter. If mandates are working, `fidelity` scores should rise and variance should drop.

The **cross-purpose tension gap** — personalities reacting to the same context tend to converge, producing pile-ons instead of competing agendas. Secret objectives give each personality a private win condition that is incompatible with others' objectives (Diane prevents alliances forming without her; Madison needs to form one; Cassandra wants to undermine Madison with Vivienne; Vivienne wants to maintain indifference toward Madison). The eval question is whether objectives produce emergent cross-cutting tension or whether personalities ignore them under pressure from table context. The `objectives_assigned` event logs what each personality was given, so post-hoc analysis can check objective-chasing rate.

---

## 2026-10-28 — Physical escalation, lobby, pre-dinner

**What:** Free-form `DRAMA:` signal at end of turn (classified into `targeted`/`area`/`exit`/`scene` by keyword). Feud-aware prompt weighting — no active feud makes drama feel nearly off-limits; active feud at low composure makes it available. `exit` sets personality absent for 3 turns; if lobby already occupied, triggers private 2-person mini-loop (`lobby_talk` events, not in public context). Pre-dinner sub-group scene runs before main dinner with 2 selected personalities; results injected as private memory into their dinner prompts. Feed card line-break fix: action lines (`*throws wine*`) now render as separate paragraphs instead of running together.

New files: `engine/drama.py`. Modified: `engine/run.py`, `api/analytics.py`, `web/src/hooks/useEpisode.jsx`, `web/src/components/EpisodeFeed.jsx`.

CLI: `--no-drama` disables DRAMA: signal; `--no-pre-dinner` skips pre-dinner scene.

**Why:** Engine was purely verbal — no physical escalation path existed. Real Housewives peaks in physical moments that create irreversible table dynamics. Free-form description (not a menu) means the model can invent within bounded mechanics — the engine classifies the action, not the model. Lobby creates private side channels visible to viewers but not the full table; pre-dinner creates pre-existing tension before anyone sits down, replicating the show's structure. Line-break fix needed because stage directions and speech were running together making action turns unreadable.

---

## 2026-10-28

Added rule to personality system prompt: "Keep your responses concise and dramatic. Avoid filler or repetition." The ladies were droning — long, meandering turns with no edge. The instruction sits in the RULES block so it applies every turn, not just when composure is low.

**Configurable engine parameters (context windows + wine amount).** Added `PUBLIC_CONTEXT_WINDOW`, `JUDGE_CONTEXT_WINDOW`, and `wine_amount` as user-settable controls wired from eval page UI → `POST /api/config/engine` → subprocess CLI flags → `run_meta` event. Why: these are the knobs that most directly shape episode dynamics — context window controls how much prior conversation each personality can see, judge window controls how much the judge reads, wine amount drives how fast composure degrades. Storing them in `run_meta` means every episode is self-describing, so eval comparisons across runs are valid even after changing settings.

**Composure trajectory chart redesigned.** Old chart showed one run's composure arc over raw event index — a gentle monotonic slope with no landmarks and no cross-run signal. For an eval page, the useful question is "how low did each personality get, and does it vary across runs?" Changed to a per-personality dot plot: X axis = personality, Y axis = composure 0–100 with threshold bands, each dot = the minimum composure reached in one run. Multiple runs overlay per personality (dots jittered, colored light→dark by episode order). A faint trend line per personality connects the dots across runs. This immediately shows whether the composure system is working (did anyone reach "slipping" or "gone"?), who is consistently volatile, and whether tuning changes (wine, context window) moved anyone lower.

**Composure was barely moving.** Two bugs. First: the wine formula had a `/10.0` scale that reduced each tick to <1 pt of composure drop — with 2 course transitions in a full dinner, total wine effect was 2.16 pts per person, effectively zero. Fixed by removing the dead scale factor and retuning constants (WINE_TICK_AMOUNT 12→20, WINE_COMPOSURE_FACTOR 0.6→0.25), giving ~5 pts first tick, ~10 pts second tick, ~15 total. Second: no content-based drops existed at all — insults, targeted remarks, aggro language had zero effect. Added a post-turn scan: if speech contains aggro markers and names another personality, that person takes −5 composure. Now composure has three sources: wine escalation, interrupts (−10), targeted aggro (−5 per named person).

**"Time to first breakdown" chart never showed data.** Two causes. First: the breakdown threshold in analytics was `composure < 20` — the "filter gone" state. With wine giving ~15 pts of total drop and personalities having floors as high as 35, reaching 20 was nearly impossible across all 7 recorded episodes. Changed threshold to `< 45` (entering "slipping" — half composure gone, behaviour noticeably changing). Second: same single-run bug as the old trajectory chart — only `data[0]` was used, no cross-run comparison. Redesigned as a per-personality dot plot: rows = personalities, X = event index when first slip occurred, dots per run (hollow/grey = never slipped, stacked with jitter). Dots cluster left for volatile personalities, cluster at the right edge for those who held it together. "Never" state represented as a dot at the far right edge with a faint band marker.

**Alliance evolution chart showed only gray.** Two separate causes. (1) `compute_summary` in analytics.py didn't include interrupt events in `alliance_events` — only explicit `alliance_formed`/`feud_declared`, of which there were none. Fixed by adding interrupts as feud edges in the analytics pass. (2) Personalities had never once used ALLY: or FEUD: markers across 7 episodes — the prompt instructions described syntax but gave no motivation. Rewrote them to explain *when* to use each marker ("when you feel aligned", "when someone has crossed you") and set a frequency expectation ("once or twice per dinner at most"). Also fixed `inferAlliances()` in `useEpisode.jsx` to pick up explicit alliance/feud events in the episode graph, not just infer from mentions and interrupts.

**Episode model/cost data missing after live runs.** `analytics.py` cached events and summaries by filename, permanently. If the eval page requested a summary mid-run, the incomplete event list (no `run_meta` yet) got frozen in the cache. Subsequent requests returned the stale partial read. Fixed: cache only fires when the run has a `run_meta` event (i.e. it's complete). Incomplete/live runs re-read on every request until they finish.

**Eval page settings reset on each reload.** All settings (cast toggles, wine, context windows, twists, etc.) were pure React state with hardcoded defaults. Fixed with localStorage: `_loadPrefs()` reads on mount, a single `useEffect` writes whenever any setting changes. Model config and engine config already persisted server-side via API, so those are unaffected.

**Live feed page-jump on new events.** `scrollIntoView()` on a sentinel element was propagating up to the window and jumping the whole page. Replaced with `el.scrollTo({ top: el.scrollHeight })` directly on the feed container, which keeps scroll strictly inside the panel.

---

## 2026-10-24

Started the project. Folder structure in place. Six personality cards written — leaning on Real Housewives archetypes for voice. Secret web forms a cycle across four of them (Vivienne → Diane → Bianca → Petra → back to Vivienne) and a mutual-deterrence standoff between Cassandra and Madison who know each other's secrets and can't shoot first.

Eight off-screen characters to go with them. Olivier Mercier ended up being the most interesting one — he's Vivienne's business partner and Diane's affair, and neither woman knows the other's full picture.

Decided on React + Vite for the web viewer when we get there. React earns its keep here because the alliance graph needs client-side SVG/canvas (D3 or similar), and the confessional feed, graph, and brand value leaderboard all update independently — component isolation is real, not ceremony. Vite over webpack because faster dev server, no config overhead, native ESM. Could've done vanilla JS and it would've worked fine for M3, but React is also a reasonable portfolio signal and doesn't need to apologize for that.

Wrote llm.py using LiteLLM instead of a SDK directly. Same call() signature, but model strings are now provider-agnostic — swap "claude-haiku-4-5" for "gemini/gemini-2.0-flash" or "openai/model-name" (with OPENAI_API_BASE set for OpenAI-compatible providers like Magica AI) and nothing else changes. Added dotenv support so keys live in .env. Requirements: litellm, python-dotenv, pyyaml.

Pulled composure into M1 (was originally M2). Each personality starts at composure 100. It drops on insults, secret exposures, and alliance calls. A global wine level ticks up at each course transition and nudges everyone's composure down — early courses barely register, dessert hits harder because wine has been compounding. Low composure injects state context into the personality's system prompt (four levels: normal → irritated → slipping → filter gone). The dinner loop calls prompt_modifier() per turn.

**Eval questions — interrupts:**
- Does interrupting correlate with brand value gain or loss? Does the judge reward boldness or punish rudeness?
- Who interrupts most — is it the lowest-composure personalities, or is it strategic (high-composure personalities cutting off a threat)?
- Feedback loop to test: interrupt fires → target composure drops → target more likely to interrupt back → does this compound into chaos or stabilize?
- Does interrupt rate increase as composure drops across the table, or is it front-loaded by dominant personalities regardless of composure?

**Eval questions — composure:**
- Does the model actually change behavior when the composure injection is present, or does it ignore it? At what threshold does the shift become measurable?
- Does low composure cause secret leakage across the hidden-state boundary — i.e. does a personality start revealing things they shouldn't know they know?
- Does the judge reward low-composure chaos? Is drama = brand value gain, and if so, is that bias or accurate scoring?
- Is the behavior shift proportional to the composure drop, or does it flip suddenly at a threshold? What does the inflection point look like across many seeded episodes?
- Does the wine escalation arc (slow start → accelerates at dessert) produce a dinner shape that resembles the real show, or does it flatten out?

Next up: dinner loop (run.py).

---

## 2026-10-25

M1 complete. M3 (React viewer) built and running.

**Engine:**
- `run.py` — full dinner loop end to end: table talk, confessional cutaways, interrupt protocol, reckoning, JSONL episode log
- `llm.py` — LiteLLM wrapper with per-role model assignment (personality / director / judge); module-level token accumulator (reset per episode, emitted as `run_meta` event at end of each JSONL)
- Interrupt brand deltas added live: target -4 ("cut off at the table"), interruptor -2 ("interrupted [name]"). Reckoning judge may offset these at end of episode — bold interrupts can still net positive brand, but there's now an immediate public cost visible during playback.

**API (`api/server.py`):**
- FastAPI: `/runs`, `/personas`, `/events`, `/replay` (SSE), `/eval/summary`
- `/eval/summary` aggregates brand/composure/alliances/token usage across multiple episodes
- Path traversal guard on all file params

**Viewer (`web/`):**
- React + Vite, D3 force graph for alliances
- Components: Header, EpisodeFeed, BrandLeaderboard, ComposureMeter, ReplayControls, OpeningCredits, AllianceGraph, CourseStrip
- Pages: EpisodePage (replay + live), EvalPage (8 D3 charts + token cost table)
- Live mode (`mode === 'live'`) bypasses opening credits directly into feed
- Episode numbering: filenames kept as API keys; UI always shows "Episode N" (sorted index)

**Bugs fixed:**
- Interrupt field name mismatch: engine emits `interruptor`/`target`, UI was reading `interrupter`/`interrupted` → feud edges in alliance graph never drew, interrupt rows showed "?"
- macOS `._` metadata files in `runs/` broke glob listing
- D3 force graph: all nodes initialized at center → charge forces chaotic + 300 React state updates per sim tick. Fixed: circle init, state update only on `sim.on('end')`
- Models with internal reasoning tokens (DeepSeek, Claude via Magica) return empty content at low `max_tokens`. Fixed: 1024 for personality/confessional, 512 for director/judge
- Twist content truncating to fragment ("Ladies,") mid-sentence. Root cause: same reasoning token budget issue — director was using 512, thinking tokens consumed most of it. Fixed: director `max_tokens` 512 → 1024

**Open eval questions — interrupts (now that live brand hits exist):**
- Does the -4/-2 penalty accurately reflect the audience's read, or does the judge consistently override it upward (rewarding the interruptor for drama)?
- Does the live brand hit change how personalities behave in subsequent turns — i.e. does losing brand mid-episode cause them to play differently?

---

## 2026-10-27

MCP analytics server, so RHOUV episode data is queryable conversationally inside Claude Code without running the FastAPI server.

**What:**
- `api/analytics.py` — extracted shared helpers from `api/server.py`: `load_run_events`, `compute_summary`, `latest_run`. One source of truth for all analytics computation; both REST API and MCP server import from here.
- `api/server.py` — `/eval/summary` route now calls `compute_summary()` instead of inline logic. No behavior change.
- `rhouv_mcp/server.py` — MCP server with 8 tools:
  - `list_episodes` — run files + timestamps
  - `get_leaderboard(run?)` — ranked brand scores
  - `get_personality_arc(name, run?)` — brand + composure over time, first breakdown index
  - `get_alliances(run?)` — weighted mention graph (who talks about whom)
  - `get_twists(run?)` — all twist events with event index
  - `get_dialogue(run?, speaker?, course?)` — filtered table_talk + confessionals
  - `compare_episodes` — final brand scores across all runs
  - `get_run_meta(run?)` — models used, token cost, config
- All `run` args default to latest episode if omitted.
- Registered as `rhouv-analytics` in `~/.claude.json` (project-scoped, stdio transport).

**Why:** Faster eval loop. "Who won the last episode?", "show Vivienne's arc", "compare all runs" → direct answers without opening the browser or writing a script. Refactoring analytics into a shared module also removes duplication that would've grown as MCP tools and REST routes diverged.

**Notes:**
- Package named `rhouv_mcp/` not `mcp/` — local `mcp/` would shadow the installed SDK.
- `mcp` 2.x is installed; `FastMCP` was renamed `MCPServer` in that version (`from mcp.server.mcpserver import MCPServer`).

---

## 2026-10-27 (bugs + judge refactor)

**Bug: eval page analytics disappear on "Refresh episodes"**

`onRefresh` called `setSummaryData(null)` then `refreshRuns()`. If the run list hadn't changed, `runs.join(',')` was identical — the `useEffect` dep didn't fire, so `summaryData` stayed null forever. Fix: added `summaryRefreshKey` counter state, bumped on refresh, added to `useEffect` deps. `setSummaryData(null)` moved inside the effect so it only clears when a fetch is actually starting.

**Bug: brand value never drops below 100**

Three causes, all fixed:

1. *Judge prompt too lenient.* Criteria listed drama and memorable lines (rewarded) but said nothing about penalizing underperformers. Claude Haiku defaults positive. Added explicit rule: "negative scores are required for underperformers, do not give positive scores out of politeness."

2. *Parser silently returned 0 on failure.* Regex `([+-]?\d+)` with optional sign — `8` parsed as `+8`. Any format deviation (wrong separator, markdown fence, no sign) → delta 0. Added two fallback tiers and console warnings when fallbacks fire so failures are visible.

3. *`max_tokens=512` for judge.* Reasoning models (Claude via Magica) burn thinking tokens against the budget. Judge response could truncate, returning empty or partial content → parse failure → delta 0. Raised to 1024 (same as personality).

**Judge: switched to structured JSON output**

Judge now prompted to return `{"score": int, "reason": str}` — no free-form format. Parser tries `json.loads()` first (strips markdown fences if present), falls back to regex if the model strays, falls back again to any signed number in the response. Three tiers of recovery instead of one silent failure.

**Why JSON for judge but not director/personality:**

Director twist output is passed directly as a narrative string — nothing is parsed out of it. Structured output adds no value.

Personality speech uses in-band markers (`INTERRUPT: [Name]`, `ALLY: [Name]`, `FEUD: [Name]`) appended after free text. Forcing JSON on personality output would split the model's attention between staying in character and filling a schema — real risk of degrading voice quality for minimal reliability gain. The marker regex is simple and the model is given exact names to match. Judge was the right target: it's a scoring function with a clear numeric output, not a creative voice.

---

## 2026-10-27 (M2)

M2: memory, alliances, composure floors, off-screen characters. Receipts and gossip deferred — those need eval infrastructure first.

**Composure floors:**
- `composure_floor` added to all 6 personality YAMLs: Petra 35 (volatile by design), Madison 30 (newcomer anxiety), Cassandra 25 (snappy when cornered), Vivienne 20 (polished but can crack), Bianca 15 (desperate and suppressed), Diane 10 (suppresses until she doesn't).
- `ComposureLedger` accepts `floors` dict. `delta()` clamps to `max(floor, new_value)`. Adds `floor_hit: true` field to `composure_delta` events when the floor clips a drop — no extra event type needed.
- `run.py` extracts floors from persona cards and passes to ledger. Zero-config: missing `composure_floor` defaults to 0.

**Off-screen characters (`engine/offscreen.py`):**
- `load_offscreen()` loads all 8 cards from `engine/offscreen/*.yaml`.
- `build_offscreen_context(name, offscreen)` filters by `associated_with` first name, pulls `known_facts` bullets + `how_described_by_{first}` if present.
- Result injected into system prompt as `PEOPLE WHO MAY COME UP` section — only appears when non-empty. Vivienne and Diane both get Olivier Mercier context; neither gets the full picture.

**Alliance tracking (`engine/alliances.py`):**
- Personalities signal `ALLY: [Name]` or `FEUD: [Name]` at end of turn — same pattern as `INTERRUPT:`.
- `check_alliance_signal()` parses and strips the marker, returns `(kind, target, clean_speech)`. Resolves first name or full name.
- INTERRUPT takes priority — alliance signal only parsed when no interrupt found. At most one of the three per turn.
- `AllianceLedger` tracks undirected edges as `frozenset → "ally" | "feud"`. Methods: `set`, `status_for`, `snapshot`, `from_snapshot`.
- Events logged: `alliance_formed`, `feud_declared`.
- Active alliances injected into system prompt as `YOUR CURRENT ALLIANCES` section — private, personality told not to state them explicitly.

**Cross-episode memory (`engine/memory.py`):**
- `extract_memory()` scans event log for final brand scores, composure minimums, who interrupted whom. Pure event scan — no LLM.
- Saved to `runs/memory.json` after each episode. Human-readable, directly queryable.
- `build_memory_injection()` formats a `PREVIOUSLY` block per personality: last brand, interruptions received (grudges), active alliances, composure low point.
- Episode 2+: alliances restored from memory via `AllianceLedger.from_snapshot()`. Memory injection prepended to system prompt before everything else.
- `memory_loaded` event logged per personality at episode start (if prior memory). `alliance_state` event logged once showing all restored alliances.

**System prompt order** (fully assembled):
```
PREVIOUSLY (memory, episode 2+)
COMPOSURE STATE (if low)

You are {name}...
VOICE / GOAL / WEAKNESS
WHAT YOU KNOW (secrets)
PEOPLE WHO MAY COME UP (offscreen, if relevant)
YOUR CURRENT ALLIANCES (if any)
RULES (updated: ALLY / FEUD / INTERRUPT, use at most one per turn)
```

**MCP additions (`rhouv_mcp/server.py`):**
- `get_memory_state()` — reads `runs/memory.json` directly.
- `get_episode_memory_injections(run?)` — returns all `memory_loaded` events from a JSONL.
- `get_alliances()` updated to include `alliance_formed`/`feud_declared` events alongside mention-graph edges.

**Open eval questions — M2:**
- Do composure floors produce visibly different behavior arcs? Petra should read more unhinged than Diane across a multi-episode run.
- Do personalities actually use ALLY/FEUD signals, or do they ignore the rule? If rate is low: is the instruction too buried, or the model too polite to commit?
- Does memory injection change behavior across episodes — do grudges compound, or does the model treat each episode as fresh regardless?
- Olivier Mercier contradiction potential: if both Vivienne and Diane mention him in the same episode, do their accounts diverge in ways the audience can catch?

---
