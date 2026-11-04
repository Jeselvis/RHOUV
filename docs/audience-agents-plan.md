# Audience Agents — Implementation Plan

## What it is

Six viewer archetypes react to dramatic events during dinner. Each reaction
displayed in UI as a tweet-style card (no actual platform). Think parasocial
live studio audience.

---

## Trigger events

Audience reacts only to signal events — not every turn:

| Event type | Triggers audience? |
|---|---|
| `drama_action` | Yes |
| `twist` | Yes |
| `alliance_formed` | Yes |
| `feud_declared` | Yes |
| `interrupt` | Yes |
| `lobby_return` | Yes (if drama-adjacent) |
| `table_talk` / `confessional` | No — too noisy |

After each trigger, all six audience members generate one reaction (parallel
LLM calls, ~100 token budget each). Runs in all modes including `--fast`.

---

## JSONL event type

New type: `audience_tweet`

```json
{
  "type": "audience_tweet",
  "handle": "@blessed_mom_of_4",
  "archetype": "Weird Conservative Christian",
  "avatar_color": "#7c3aed",
  "text": "Lord have mercy, Petra just INSULTED that woman at the dinner table. Praying for them all. 🙏",
  "likes": 847,
  "scores": {
    "approval": -2,
    "drama_satisfaction": 4,
    "target": "Petra Voss"
  },
  "trigger_type": "drama_action",
  "trigger_speaker": "Petra Voss",
  "ts": "..."
}
```

---

## Scoring rubric

Each audience member returns scores alongside their tweet text. LLM returns
structured JSON — `text` + `scores` + `likes` in one call.

| Field | Range | Meaning |
|---|---|---|
| `approval` | -2 to +2 | How much agent approves of target's action |
| `drama_satisfaction` | 1–5 | How entertained they are (high for stan, boomer = confused) |
| `target` | string | Who they're reacting to (can differ from trigger_speaker) |

These scores are retained in the JSONL and feed the eval chart.

`likes` is either returned by LLM or generated post-hoc from YAML
`likes_range` — boosted when audience member's `favorite` is `target`.

---

## Audience YAML format

Lives in `engine/audience/*.yaml`, same pattern as `engine/offscreen/`.

```yaml
name: "BlessedMomOf4"
handle: "@blessed_mom_of_4"
archetype: "Weird Conservative Christian"
avatar_color: "#7c3aed"
persona: >
  Soccer mom from Oklahoma. Watches reality TV while asking God for guidance.
  Constantly appalled but cannot look away. Calls it "research into sin."
voice_notes: >
  Uses "Lord have mercy", misquotes scripture confidently, accidentally endorses
  drama thinking it aligns with biblical justice. Occasionally comes around on
  a villain she decides "has a good heart deep down."
favorite: "Diane Wentworth"
nemesis: "Petra Voss"
likes_range: [200, 1200]
likes_boost_multiplier: 2.5
```

LLM prompt asks for JSON:
```json
{ "text": "...", "approval": -1, "drama_satisfaction": 3, "target": "Petra Voss" }
```

`likes` computed after from `likes_range` + optional boost.

---

## The six archetypes

| Handle | Archetype | Favorite | Nemesis |
|---|---|---|---|
| `@blessed_mom_of_4` | Weird Conservative Christian | Diane | Petra |
| `@girlbossvibes` | It Girl / Influencer | Madison | Diane |
| `@vivienne_nation` | Rabid Stan (Vivienne) | Vivienne | anyone who crosses her |
| `@profdrngozi` | Feminist Academic | Bianca | Cassandra |
| `@dramaericxo` | Gay Drama Enthusiast | Petra | Diane |
| `@garymcallister55` | Boomer Who Stumbled Onto This Show | Cassandra | Petra |

---

## Engine changes

### New file: `engine/audience.py`

Responsibilities:
- Load all YAMLs from `engine/audience/`
- `generate_tweets(trigger_event, context_lines, personas)` — parallel LLM
  calls, one per audience member; each returns `{text, approval, drama_satisfaction, target}`
- Compute `likes` from YAML range + boost if target == persona's favorite
- Return list of `audience_tweet` dicts ready to log

### Changes to `engine/run.py`

After each trigger event is logged and consequences applied:

```python
if not args.no_audience and event_type in AUDIENCE_TRIGGERS:
    tweets = generate_tweets(event, recent_lines, audience_personas)
    for tw in tweets:
        log(tw)
```

New CLI flag: `--no-audience` (audience on by default, like drama).

### Brand impact (off by default)

Flag `--audience-brand`: `approval == +2` from non-nemesis → `+1` brand on
target. `approval == -2` from nemesis persona → `-1` brand. Keep off until
tested.

---

## UI changes

### Live animation (EpisodeFeed — live mode only)

When `audience_tweet` events arrive via SSE, cards don't drop into the feed
immediately. Instead:

1. Card **pops in** floating above the current event card — CSS `transform: translateY` + `opacity` fade-in, ~150ms
2. Card **unrolls** text character by character (typewriter, ~25ms/char) or line by line (~80ms/line) — whichever feels snappier in testing
3. After full text visible: pause ~2.5s
4. Card **fades out + slides up** — `opacity 0` + slight `translateY(-8px)`, ~400ms
5. After all 6 are done cycling, collapsed `AudienceTweetGroup` snaps into feed below trigger event

Floating card is `position: fixed` or `position: absolute` anchored near top
of feed viewport. One card visible at a time — queue them with ~300ms stagger.

Static/replay mode: skip animation entirely, render collapsed group only.

### Static card layout

```
┌─────────────────────────────────────────────────────┐
│ ● @blessed_mom_of_4  ·  Weird Conservative Christian │
│                                                      │
│  Lord have mercy, Petra just INSULTED that woman.   │
│  Praying for them all. 🙏                           │
│                                                      │
│  ♡ 847   approval: ██░░░ -1   drama: ████░ 4/5      │
└─────────────────────────────────────────────────────┘
```

- Left border color = `avatar_color`
- Handle bold, archetype muted
- Mini score bars bottom (optional — hide if too busy)
- Fake like count

### Collapsed group in feed

After animation cycle, trigger event gets a "Social Reactions" pill:

```
[Social Reactions ▾ 6]
```

Clicking expands inline stack of all 6 cards (no animation in expanded state).

### New event type in `useEpisode.jsx`

Collect `audience_tweet` events into groups keyed on their preceding trigger
event's index. Pass group to `AudienceTweetGroup` which owns the animation
queue in live mode.

---

## Eval chart (new — EvalPage)

**"Audience Approval by Personality"** — stacked/grouped bar chart.

X-axis: cast members
Y-axis: average approval score (-2 to +2)
Series: one bar segment per audience archetype (color = avatar_color)

Shows which personalities the audience collectively loved vs. despised, and
whether archetypes diverge (e.g. Petra: loved by `@dramaericxo`, hated by
`@blessed_mom_of_4`).

Secondary view (toggle): **Drama Satisfaction over time** — line chart, X =
episode index, Y = mean `drama_satisfaction` per audience member. Did the
season get more entertaining?

Data source: `audience_tweets` filtered from JSONL in `compute_summary()`.
New key on summary object: `audience_scores` → `{ [personality]: { [handle]: {approval_avg, drama_avg, tweet_count} } }`.

---

## Post-show feedback loop

After reckoning (still same episode run), each cast member reads tweets
targeting them and generates a brief reaction. Runs before memory save.

### New event type: `cast_reads_tweets`

```json
{
  "type": "cast_reads_tweets",
  "speaker": "Petra Voss",
  "text": "Obviously @dramaericxo is obsessed with me. And @blessed_mom_of_4 can pray all she wants — she's watched every episode.",
  "audience_approval_avg": 1.2,
  "notable_tweets": [
    "@dramaericxo: chaos queen era 👑",
    "@blessed_mom_of_4: Lord have mercy, that woman has NO filter 🙏"
  ]
}
```

### Memory persistence

`extract_memory()` scans `audience_tweet` events per target personality:
- Compute `approval_avg` across all audience tweets targeting them
- Pick 2 most extreme tweets (highest `abs(approval)`)
- Store as `audience_sentiment` in `personalities[name]`

```json
"Petra Voss": {
  "brand_end": 108.5,
  "audience_sentiment": {
    "approval_avg": 1.2,
    "notable_tweets": ["@dramaericxo: chaos queen era 👑", "@blessed_mom_of_4: Lord have mercy 🙏"]
  }
}
```

### Injection into next episode prompt

`build_memory_injection()` adds:

```
- Online reaction last episode: positive (+1.2 avg). Notable: "@dramaericxo: chaos queen era 👑"
```

Cast members know what the public thought. They can lean in, course-correct,
or be wounded by it — per their personality.

---

## Files changed / created

```
engine/audience/                    ← new dir
  blessed_mom_of_4.yaml
  girlboss_vibes.yaml
  vivienne_nation.yaml
  prof_dr_ngozi.yaml
  drama_eric_xo.yaml
  gary_mcallister_55.yaml

engine/audience.py                  ← new module

engine/run.py                       ← audience trigger calls + --no-audience flag

api/analytics.py                    ← audience_scores aggregation in compute_summary()

web/src/components/
  AudienceTweetCard.jsx             ← card + score bars
  AudienceTweetGroup.jsx            ← collapsed group + animation queue (live mode)

web/src/hooks/useEpisode.jsx        ← handle audience_tweet, feed into groups

web/src/pages/EvalPage.jsx          ← new "Audience Approval" chart section
```
