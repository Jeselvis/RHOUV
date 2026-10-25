# Handoff: RHOUV Viewer (Opening Credits, Episode Viewer, Eval)

## Overview
Visual design for the React + Vite viewer described in `RHOUV UI Plan.md` (included). Three screens:
1. **Opening Credits** (`OpeningCredits`): the cast intro shown before an episode.
2. **Episode Viewer**: `EpisodeFeed`, `BrandLeaderboard`, `ComposureMeter`, `AllianceGraph` and `ReplayControls`, with a Replay/Live mode switch.
3. **Eval** (`/eval` route): switches in a left column, 8 charts on the right.

Follow the build order in the UI Plan (replay mode first). This handoff covers only the visual layer.

## About the Design Files
`RHOUV Viewer.dc.html` is a **design reference built in HTML**. It shows the intended look and behavior and is not production code. Rebuild it in the project's `web/` Vite + React app with plain React components that read from `useEpisode()`. The HTML uses inline styles and hard-coded sample data. Replace that data with real SSE events and `/personas` and `/eval/summary` responses.

Open it locally by serving the folder (`npx serve .`) and loading `RHOUV Viewer.dc.html`. `support.js` is the runtime the prototype needs and is not part of the app. All three screens sit side by side on one canvas, each 1440px wide.

## Fidelity
**High-fidelity.** Match the colors, type, spacing and component treatments. Chart data, dialogue, persona types and quotes are placeholders.

## Data sources (important)
- **Persona cards (Opening Credits):** `name`, `persona type` and `quote` are **read from each personality's config file**, served by `GET /personas`. Don't hard-code them. Cast order left to right on the title card: Vivienne, Cassandra, Bianca, Diane, Petra, Madison.
- **Feed:** `table_talk`, `confessional`, `twist`, `interrupt`, `course_transition`.
- **Leaderboard:** `brand_delta`. **Composure:** `composure_delta`. **Alliances:** inferred from `table_talk`, `interrupt` and `confessional`.
- **Eval charts:** `GET /eval/summary?runs=…`. **Run batch:** `POST /eval/batch`.

## Design Tokens
Colors
- Backdrop gradient: `#dfeaf2` → `#c8dbe8` (180deg). Outer page: `#b9cddb`.
- Panel: `rgba(255,255,255,.62)`, border `1px solid rgba(160,124,52,.28)`, radius 6px.
- Ink `#1b2330` · secondary `#3d4a5a` · muted `#556173` · timestamps `#6b7686`.
- Gold accent text `#7a5c1c` / `#8a6a22`. Gold fill `#b48a35`, `#c79a3e`, `#c9a24e`. Gold border `#8d6623`.
- Gold gradient (headline text via `background-clip:text`): `#e9cf86 0%` → `#b48a35 55%` → `#7d5a1c 100%`.
- Gold button gradient: `#f1dc9b` → `#c79a3e`, text `#2a1f08`, border `#8d6623`.
- Sapphire (confessionals, "normal", Twists-frequent series): `#2a43a6`. Confessional card background `rgba(42,67,166,.07)`, border `rgba(42,67,166,.22)`, text `#1e2b58`.
- Positive `#2f7d4f` (flash background `rgba(47,125,79,.12)`). Negative / feud / interrupt `#b2393f` / `#a3262b` (flash background `rgba(178,57,63,.1)`). Live dot `#c8323a`.
- Dark bar (replay controls): `rgba(27,35,48,.94)`, text `#e8edf2`, secondary `#a9b4c2`.
- Persona series colors: `oklch(0.58 0.13 H)`, with H = 75, 20, 150, 200, 265, 330 in cast order.

Composure states (thresholds are configurable; defaults below)
- normal ≥70 `#2a43a6` · irritated ≥45 `#9a7428` · slipping ≥20 `#c0612a` · gone <20 `#b2393f`.

Tier badges (text 10px, 700 weight, .14em tracking, uppercase, radius 2px)
- Diamond ≥800: bg `#1b2330`, text `#dfe8f5`.
- Gold ≥700: bg `#f3e2ac`, text `#4a360c`.
- Silver ≥600: bg `#e2e6ea`, text `#3d4a5a`.
- Bronze: bg `#ecd3bd`, text `#5c3312`.

Typography
- Display: **Cinzel** (Google Fonts, weights 500/600/700). Used for headings, panel titles (14px, 600, .18em tracking), nav (14px, .16em) and buttons (15px, 600, .14em).
- Body: Helvetica Neue / Helvetica / Arial. Feed text 15px / 1.45. Labels 11px, 700, .14em tracking, uppercase.
- Mono: `ui-monospace, Menlo` for file names, scores and timestamps.

Spacing and shape: page padding 32px, panel gap 24px, panel header padding 16×20 with a bottom border `rgba(160,124,52,.22)`. Radii: 3px for controls, 4px for cards, 6px for panels, 50% for avatars. Artboard shadow `0 30px 80px -30px rgba(30,50,80,.45)`.

## Screens

### 1. Opening Credits (1440×1000)
- Hero, 520px tall: the title card image (`background-size:cover; position:center top`) with a 200px fade at the bottom into `#d3e3ee`. Top-left chip "Season 1 · Episode 14"; top-right chip with the `/personas` status.
- Content overlaps the hero by -40px, with 60px side padding. Kicker "Tonight at the table" (Cinzel 13px, .3em tracking), title "The Dinner Party" (Cinzel 40px, gold gradient). On the right: the replay file name and a **Begin episode** gold button (no wrapping).
- A 6-column grid with 18px gaps. Each card has a 230px portrait, then name (Cinzel 19px/600), persona type (11px uppercase, `#7a5c1c`) and quote (13px italic `#3d4a5a`).

### 2. Episode Viewer
- **Header:** two-line gold wordmark, Episode/Eval nav (the active item has a 2px `#b48a35` underline), the run picker (replay only) and a Replay/Live segmented toggle (active Replay: `#1b2330` bg with `#f1dc9b` text; active Live: `#a3262b` with white text).
- **Course strip:** "Course 2 of 4 · Entrée", a 4-segment gold progress bar (3px) and the list of course names.
- **Main grid:** `minmax(0,1fr) 440px`, gap 24.
  - **EpisodeFeed:** each `table_talk` row has a 40px avatar (gold ring), name, a "to X" target, text and a timestamp. A `confessional` is indented 52px and drawn as a sapphire-tinted card with a "● REC" badge and italic text. An `interrupt` is an indented red line of text with a small dash. A `twist` is a full-width gold-gradient banner with a Cinzel "TWIST" label. A `course_transition` is a centered Cinzel label between gold rules.
  - **BrandLeaderboard:** grid columns `22px 32px 1fr auto 60px 48px` (rank, avatar, name, tier, score, delta). Animation: on a `brand_delta`, flash the row background green or red for about 1.2s, then fade to transparent.
  - **ComposureMeter:** name, a 10px track with ticks at 20/45/70%, a fill colored by state, and the state label. Animate the width at about 400ms ease-out.
  - **AllianceGraph:** a D3 force graph with 44px avatar nodes. Ally edges are solid `#b48a35`; feuds are dashed `#b2393f` (5 5). Stroke width follows edge weight.
- **ReplayControls** (replay only, a dark bar at the bottom): a 44px gold play/pause button; a scrub bar (6px track, gold progress, gold tick marks for twists); speed options 0.5×/1×/2×/4× mapped to delays of 600/300/150/75ms; a delay readout.
- **Live mode:** hides the run picker and ReplayControls. Shows a pulsing "LIVE · /stream" badge and a dark status bar with a count of received events.

### 3. Eval
- Grid `320px 1fr`. The left column has a translucent background and a right border.
- **Controls:** Cast pill toggles with avatars (off = transparent background at 60% opacity); a Twists segmented control (off/rare/frequent); Interrupts and Wine switches (40×22, gold when on); an Insult weight slider; three Composure threshold inputs; a model dropdown per personality; Seeds and N inputs. At the bottom, "Switches filter saved runs. Only Run batch spends tokens." and a **Run batch** button. Clicking it swaps in a dark confirmation card ("N episodes × ~$cost = ~$total", with Cancel and Confirm & run).
- **Charts:** a 2-column grid with 18px gaps and a legend row on top (persona colors; Twists off `#c9a24e` vs frequent `#2a43a6`). Each card shows a Cinzel 14px title and a 12px question line:
  1. Brand score over time: one line per persona.
  2. Final brand score by setting: grouped bars.
  3. Composure trajectory: lines over shaded threshold bands.
  4. Time to first breakdown: histogram.
  5. Event mix per episode: stacked bars for talk `#9fb3c8`, confessional `#2a43a6`, twist `#c9a24e` and interrupt `#b2393f`.
  6. Twist impact: dumbbells, with an open circle for before and a filled circle for after.
  7. Alliance edge weights: a 6×6 heatmap, gold with opacity set by weight.
  8. In-character score (optional, LLM critic): a scatter plot. Its card has a dashed border and an "Optional" tag.
- Changing a switch only filters saved runs. Only Run batch calls the API.

## State
- `useEpisode()` holds `mode`, `events[]`, `brand{}`, `composure{}`, `edges[]`, `course` and `cursor`.
- Replay state: `playing`, `speed`, `cursor`, `total`, `file`.
- Eval state: cast on/off, twists, interrupts, wine, insultWeight, thresholds[3], models{}, seedRange, N, and confirmOpen.

## Assets
- `uploads/RHOUV title card.webp` (1424×800) is the hero image. The prototype crops avatars and portraits out of this one image using background-position. In production, use a real headshot or portrait per persona, ideally referenced from the persona config.
- Font: Cinzel from Google Fonts.

## Files
- `RHOUV Viewer.dc.html`: the design prototype (sections 1a, 1b, 1c).
- `RHOUV UI Plan.md`: the architecture, API and build order.
- `uploads/RHOUV title card.webp`: the hero and cast image.
- `support.js`: the prototype runtime (reference only).
