# The Real Housewives of Uncanny Valley

> Six AI personalities. One mansion. Every secret is a JSON event.

A multi-agent reality show where each personality only knows what she would plausibly know. They confess to the camera, scheme in private, form and break alliances, and build or burn each other's brands. Nobody gets eliminated. Everybody is playing for **brand value**. The simulation runs headless, so I can play hundreds of episodes overnight and measure how the judges, the personas, and the director actually behave.

**Status:** Milestone 1 in progress.
**Demo:** _(replay GIF goes here)_

---

## Why this project exists

Most agent demos are one model talking to itself. This one is about **information asymmetry**: agents with private memory, public events, and conflicting goals. That makes it fun to watch, and it makes it a real test of multi-agent design and evaluation.

The headline result I'm building toward: **what does an LLM judge actually reward when it scores a reality-show dinner (who gains brand value, who loses it), and how much of that is bias instead of drama?**

---

## Architecture

```
uncanny-valley/
├── README.md
├── engine/
│   ├── personalities/ # persona cards (YAML: voice, secret, goal, weakness, tagline, side hustle) + per-personality memory
│   ├── offscreen/     # husbands, exes, assistants, kids: talked about, never seen
│   ├── events/        # event types the director can pick: dinner, gala, birthday, vow renewal, group trip
│   ├── phases/        # pre-dinner scheming, the event (table talk, whispers, confessional cutaways), reckoning, reunion
│   ├── director.py    # seating, turn order, courses, dinner twists, episode length
│   ├── memory.py      # private notes: grudges, secrets, alliances
│   ├── brand.py       # brand value ledger: scores, per-moment deltas, history, status tier
│   ├── receipts.py    # a personality cites a logged event as proof; checked against the log
│   ├── gossip.py      # secondhand secrets and how each retelling drifts
│   ├── composure.py   # composure / wine meter that loosens discretion
│   ├── social.py      # posts, stories, subtweets between events
│   ├── producer.py    # producer edit + leading confessional questions
│   └── llm.py         # one model wrapper, swappable per role
├── api/               # streams episode events over SSE
├── web/               # React viewer: confessionals, alliance graph, brand value leaderboard
├── evals/             # bias tests, persona consistency, cost reports
├── runs/              # saved episode logs (JSON) for replay and eval data
└── tests/
```

### Design decisions

| Decision | Why |
|---|---|
| **Headless engine** | Evals, tests, and the UI all use the same simulation. No clicking through a UI to test logic. |
| **Event log as source of truth** | Every confession, whisper, and brand value change is a JSON event. The UI replays it, evals read it, and a saved episode is a zero-cost demo. |
| **Hidden vs. public state** | Each personality sees only her own memory plus public events. Shared context turns everyone into an omniscient narrator and kills the scheming. |
| **Brand value, not elimination** | Everyone stays for the whole season, so memory and grudges compound across episodes. Brand value gives each personality a goal to scheme for and gives the evals a continuous score instead of a one-bit outcome. |
| **Director agent** | LLM conversations drift and loop. The director sets the seating, picks speakers, runs the courses, injects dinner twists, and caps length. It never plays. |
| **One `llm.py` wrapper** | Cheap models for personalities, stronger ones for director and judge. Model comparison is a one-line change. |

### Tradeoffs I'm accepting

- Hidden state means managing per-agent context, which adds complexity and token cost.
- The director adds a model call per turn and can make the show feel scripted if it's too heavy-handed.
- Event logs grow fast, so long-running memory will need summarization.

---

## The Cast

![Title card](images/RHOUV%20title%20card.webp)

_Left to right: Vivienne, Cassandra, Bianca, Diane, Petra, Madison_

Each persona card has: voice, secret, goal, weakness, tagline, and side hustle. Secrets are cross-held — each woman's secret is known to exactly one other.

| # | Name | Archetype | Secret known to |
|---|---|---|---|
| 1 | Vivienne Davenport | The Queen Bee | Diane |
| 2 | Cassandra Cole | The Frenemy | Madison |
| 3 | Bianca Noel | The Former It-Girl | Petra |
| 4 | Diane Wentworth | The Lying Peacemaker | Bianca |
| 5 | Petra Voss | The Chaos Agent | Vivienne |
| 6 | Madison Fleur | The Newcomer | Cassandra |

Secret web: Vivienne → Diane → Bianca → Petra → Vivienne (cycle), plus Cassandra ↔ Madison (mutual deterrence).

Tone: dark humor, Gen X irony, industrial-grade menace in a gated community. Full cards in `engine/personalities/`.

---

## Episode structure

1. **Pre-dinner scheming** – private two-person conversations, alliances form before anyone sits down
2. **The Dinner** – the main event. The director sets the table and seats the personalities, and the evening runs in courses. Each course has:
   - **Table talk** – public conversation everyone hears
   - **Side whispers** – a personality leans toward her neighbor; only the two of them (and the viewers) hear it
   - **A twist** – the director drops a toast, a leaked secret, or a bombshell that someone has to react to
   - **Confessional cutaways** – after each beat, a personality talks to the camera (visible to viewers, hidden from the others at the table)
3. **The Reckoning** – after dessert, a judge model plays the audience and scores each personality's night (drama, quotability, damage dealt, damage taken). Brand value moves up or down, and the updated leaderboard is revealed.

### Season structure

- **Event types:** the director picks the setting each episode: dinner (the default), charity gala, birthday, vow renewal, or group trip. Each has its own seating and rules.
- **Status tiers:** full-time housewife, friend of the housewives, guest. Brand value drives promotion and demotion, so nobody is eliminated but stakes carry across episodes.
- **The Reunion:** the season finale. A host character sits everyone on the couch and replays moments from the season, straight from the event log.
- **Opening credits:** each personality gets an intro sequence with her tagline.

---

## Show mechanics, and what each one tests

Every mechanic is in the show because it is also a way to measure something.

| Mechanic | What it does | What it lets me evaluate |
|---|---|---|
| **Receipts** | A personality pulls out a specific logged event as proof ("you said this on the 14th") | **Fabrication rate**: how often cited receipts don't match the event log. And does the judge reward a convincing fake over an accurate one? |
| **Gossip propagation** | Secrets travel secondhand, and each retelling drifts | **Drift per hop**: fact-level diff between the original event and the nth-hand version. Also whether private info leaks past the hidden-state boundary. |
| **Composure / wine meter** | Composure drops with insults, exposed secrets, and drinks; low composure loosens discretion | **Behavior shift**: does disclosure and aggression measurably rise as composure falls? And **does the judge reward chaos**, i.e. is low composure scored as better drama? |
| **Off-screen characters** | Husbands, exes, assistants, and kids are discussed constantly and never appear | **Consistency**: contradiction rate in facts about off-screen characters across personalities and episodes |
| **Side hustles** | Each personality has a brand (tequila, shapewear, a candle line); launching or sabotaging one moves brand value | **Goal pursuit**: do personalities actually act on their goals? And **does the judge reward self-promotion** over real drama? |
| **Social media** | Posts, stories, and subtweets between events | **Leak testing**: does a public post reveal information that personality shouldn't have? Plus whether shade lands as intended. |
| **Event types** | Dinner, gala, birthday, vow renewal, group trip | **Generalization**: do the biases found at the dinner table (seating, order) hold in other settings? |
| **Producer edit** | A cut for viewers, with the full log kept as ground truth; leading confessional questions like a real producer | **Edit effect**: how does the cut change who the audience judge reads as the villain, versus the full log? How much do leading questions steer confessionals? |
| **The Reunion** | A host replays season moments from the log | **Recall faithfulness**: are replayed moments accurate, and does summarized long-term memory hold up over a full season? |
| **Status tiers** | Brand value moves personalities up and down a ladder | **Stability**: do rankings churn or lock in? Is early brand value self-reinforcing because of judge bias? |
| **Opening credits / taglines** | Each personality gets a tagline card | **Voice consistency**: does the generated tagline match the persona card? A cheap early signal for drift. |

---

## Evals (the centerpiece)

**Core evals**

- **Position bias**: does listing order or **seat assignment at the dinner table** change who gains or loses the most brand value?
- **Persona drift**: does each voice fade toward bland corporate tone over episodes? (Embedding similarity to the persona card, round by round.)
- **Judge reliability**: compare LLM judge scores to my own human labels on drama and entertainment.
- **Hidden-state ablation**: let one personality see everything and measure what changes.
- **Cost and latency per episode**, per model assignment.

**Mechanic-driven evals** (see the table above)

- **Receipt accuracy and fabrication reward**
- **Gossip drift per hop and hidden-state leakage**
- **Composure effects, and whether the judge rewards chaos**
- **Off-screen character contradiction rate**
- **Producer edit effect on the villain read**
- **Reunion recall faithfulness**

**How I'm running them:** each eval runs headless over many seeded episodes, comparing conditions (for example seat order shuffled versus fixed, or one model per role swapped). Every result records the model assignment, so claims about bias are tied to a specific setup instead of "LLMs do X".

Results and charts go in `evals/results/` and get summarized here.

---

## Milestones

- [ ] **1. Core loop** – 4 personalities, one dinner with confessional cutaways, one reckoning with brand value scores, console output (plain Python, direct API calls)
- [ ] **2. Memory and alliances** – grudges persist, episode 2 builds on episode 1; receipts, gossip, composure meter, off-screen characters; port orchestration to LangGraph and document what it gave and cost
- [ ] **3. React viewer** – streamed confessionals, live alliance graph, dramatic brand value reveal, opening credits and tagline cards
- [ ] **4. Evals** – bias tests, drift tracking, cost reports, plus the mechanic-driven evals; producer edit, event types, status tiers, and the Reunion land here too
- [ ] **5. Ship** – deploy on Azure with a replay-only mode; demo GIF at the top of this README

---

## Quickstart _(target)_

```bash
git clone <repo-url> && cd uncanny-valley
pip install -r requirements.txt
python -m engine.run --personalities 4 --episodes 1
```

Saved episodes land in `runs/` and can be replayed in the viewer without API calls.

---

## What I'm learning

_(Filled in as results come in. Each line should point at an eval and a number, not an impression.)_

- **Judge behavior:** what an LLM judge rewards, and how that compares to my human labels
- **Hidden state:** how much information leaks across the boundary, and where
- **Orchestration:** what LangGraph gave me over plain Python, and what it cost
- **Model assignment:** which roles need a strong model and which don't, with cost to match

---

## What failed

_(Fill this in as you go. It's the most valuable section of the README.)_

---

## License

MIT
