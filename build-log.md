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

**Open eval questions — interrupts (now that live brand hits exist):**
- Does the -4/-2 penalty accurately reflect the audience's read, or does the judge consistently override it upward (rewarding the interruptor for drama)?
- Does the live brand hit change how personalities behave in subsequent turns — i.e. does losing brand mid-episode cause them to play differently?

---
