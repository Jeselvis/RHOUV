# RHOUV UI Plan

Oct 25, 2026 · @Tim

React + Vite viewer that streams a live episode or replays a saved JSONL log.

## Overview

The viewer has two modes that share the same component tree.

**Replay mode** reads a saved `.jsonl` file from `runs/` and replays events at a configurable speed. No API calls, no cost — this is the primary way to demo and develop the UI without burning tokens.

**Live mode** connects to an SSE endpoint that streams events as the engine runs a new episode in real time.

Both modes emit the same event shape, so the components don't need to know which mode is active. Replay mode is built first — it unblocks all UI work before the API layer exists.

A third surface, the **Eval page**, is where the project earns its portfolio value: it runs batches of episodes under different switch settings and charts what changed. It reads the same `runs/` logs as replay mode (see Eval page below).

## Architecture

&#91;embedded content: data flow · engine → API → React\]

The `useEpisode()` hook owns all event state. Components subscribe to slices of it — the feed gets talk/confessional events, the leaderboard gets brand deltas, the graph tracks alliance signals inferred from the event stream.

## API layer

FastAPI, one file: `api/server.py`. Two endpoints.

**`GET /replay?file=<name>`** — reads a `.jsonl` from `runs/`, streams events as SSE with a configurable delay between them (default 300ms). This is the primary development endpoint.

**`GET /stream`** — runs `engine.run_episode()` in a background thread and streams events as they happen. Live episodes only.

Both endpoints emit the same `text/event-stream` format:

```
data: {"type": "table_talk", "speaker": "Vivienne", ...}

data: {"type": "brand_delta", "speaker": "Madison", ...}
```

**`GET /runs`** — lists available `.jsonl` files in `runs/` so the UI can show a replay picker.

The React app connects with the browser's native `EventSource`. No WebSocket library needed — SSE is one-directional (server → client) which is all this needs.

## Components

| Component | Event types consumed | Notes |
| --- | --- | --- |
| `useEpisode()` | all | Central hook. Dispatches incoming SSE events into state slices. Every component reads from this. |
| `EpisodeFeed` | `table_talk`, `confessional`, `twist`, `interrupt`, `course_transition` | Scrolling transcript. Table talk is public; confessionals are styled differently (camera icon, indented). Twists get a banner. |
| `BrandLeaderboard` | `brand_delta` | Ranked list with score and tier badge. Animates on delta — flash green/red when a score changes. |
| `ComposureMeter` | `composure_delta` | Per-personality bar. Updates live as insults land and wine ticks. Colour shifts at thresholds (normal → irritated → slipping → gone). |
| `AllianceGraph` | `table_talk`, `interrupt`, `confessional` | D3 force graph. Nodes = personalities. Edges inferred from who addresses whom and interrupt events. Built last — most complex. |
| `OpeningCredits` | none (static) | Pre-episode sequence. Reads persona cards (fetched from `/personas`). One card per personality: name, archetype, tagline. |
| `ReplayControls` | internal | Play/pause, speed slider, scrub bar. Only shown in replay mode. |

## Eval page

A dedicated `/eval` route with the switches on the left and the charts on the right: flip a switch, run a batch, and see which metrics moved. Treat the control names below as proposals and rename them to match the engine's real flags.

&#91;embedded content: Eval page layout · controls left, 8 charts right\]

Controls sit in a fixed left column and the charts fill the right. Only the Run batch button creates new logs.

### How a run becomes comparable

Every `.jsonl` log starts with a `run_config` event that records the switch values and the random seed. Without it, two logs can't be compared. A/B tests reuse the same seeds and change one switch, so a difference in the charts comes from the switch and not from luck.

### Controls (the switches)

| Control | What it changes | Values |
| --- | --- | --- |
| Cast | Which personalities are in the episode | on/off per personality |
| Twists | Whether `twist` events fire | off / rare / frequent |
| Interrupts | Whether `interrupt` events fire | on / off |
| Wine | Whether wine ticks lower composure | on / off |
| Insult weight | How much an insult lowers composure | slider |
| Composure thresholds | Cut-offs for normal / irritated / slipping / gone | 3 numbers |
| Model per personality | Which model plays each role | dropdown |
| Seed range and N | Which seeds and how many episodes per setting | numbers |

Changing a switch only filters or groups saved runs. The **Run batch** button is the only thing that spends tokens: it shows episodes × estimated cost and asks for confirmation first.

### Charts (the analysis)

| Chart | Built from | Question it answers |
| --- | --- | --- |
| Brand score over time, one line per personality | `brand_delta` | Who wins, and when does the lead change? |
| Final brand score, grouped bars by switch setting | `brand_delta` | Does a switch change who wins? |
| Composure trajectory with threshold bands | `composure_delta` | When does each personality reach "gone"? |
| Time to first breakdown, distribution across seeds | `composure_delta` | Is a result stable or one lucky run? |
| Event mix per episode (table talk, confessional, twist, interrupt) | all event types | Does a switch change what the episode is made of? |
| Twist impact: brand and composure change before vs after | `twist` + deltas | Do twists actually move the story? |
| Alliance edge weights across episodes | `table_talk`, `interrupt` | Do the same alliances show up each time? |
| In-character score from an LLM critic (optional) | `table_talk`, `confessional` | Does a persona stay in voice when composure drops? |

### API additions

- `GET /eval/summary?runs=<names>` returns per-run metrics aggregated from the logs, so the browser doesn't parse every `.jsonl`.
- `POST /eval/batch` runs N episodes with a given config and writes one log per episode to `runs/`. Same SSE shape as `/stream` for progress.

Analysis stays in a pure function in `eval/metrics.py`, so the same numbers can be produced from a notebook or a CI check.

## Build order

Replay mode first — it lets all UI work happen without running the engine or burning API credits.

1. **`api/server.py`** — `GET /replay` and `GET /runs` only. No live streaming yet. Add FastAPI to `requirements.txt`.
2. **Vite scaffold** — `npm create vite@latest web -- --template react`. Add `EventSource` hook (`useEpisode`), point it at `/replay`. Verify events arrive in the console.
3. **`EpisodeFeed`** — first visible component. Renders `table_talk` and `confessional` events. No styling needed yet — just confirm the loop works end to end.
4. **`BrandLeaderboard`** — add alongside the feed. Tests that `brand_delta` events are parsed and state updates correctly. Add the score animation.
5. **`ComposureMeter`** — per-personality bars. Tests `composure_delta` events and the threshold colour logic from `composure.py`.
6. **`ReplayControls`** — play/pause and speed. Now replay feels like watching the show.
7. **`OpeningCredits`** — add `GET /personas` to the API, build the pre-episode card sequence.
8. **`AllianceGraph`** — D3 force graph last. It needs a few episodes of real data to tune the edge inference logic before it looks right.
9. **`GET /stream` (live mode)** — wire up the live endpoint once the UI is stable on replay. Swap `EventSource` URL, test with a fast run.
10. **`run_config` header** — add the config and seed as the first event of every log. Do this before the Eval page, and before generating the logs you'll want to compare.
11. **Eval page, charts first** — build `eval/metrics.py` and `GET /eval/summary`, then the brand and composure charts over saved runs, with the controls filtering them. No token spend.
12. **Eval page, batch runs** — add `POST /eval/batch` with the cost confirmation, then the stability and A/B charts.
