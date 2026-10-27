# Build Log

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
