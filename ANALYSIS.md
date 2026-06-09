# Scribbls Graph Analysis

## Dataset

Full crawl of the "Most Hearted" archive, spanning **Jan 2006 – Jan 2015**.

- **Pages crawled**: 132/132
- **Outcomes**: 1,320
- **Unique drawings**: 2,655
- **Creators**: 155
- **Graph nodes**: 2,655
- **Graph edges**: 2,606

> **Survivorship note.** This is scraped from the *Most Hearted* browse only, so the
> minimum heart count in the entire set is 6 — there are no low-scored outcomes at all.
> This dataset is the community's **canon**, not its full output. Every finding below
> describes *what succeeded*, not *what was made*.

## Connected Components

- **Total**: 216
- **Largest**: 1,850 nodes (70% of the graph)
- **2nd largest**: 14 nodes
- **Isolated clusters (< 5 nodes)**: 166

One giant component absorbs most of the graph; the rest is a long tail of tiny
one-off clusters — the signature of a hub-driven network.

## Top Hubs (most combinations)

| Drawing | Total | As input | As result |
|---------|-------|----------|-----------|
| Orange | 20 | 19 | 1 |
| TRUTH | 18 | 17 | 1 |
| bacon | 15 | 14 | 1 |
| marx | 15 | 15 | 0 |
| Bear | 14 | 14 | 0 |
| Pirate | 13 | 13 | 0 |
| not far from there | 13 | 13 | 0 |
| Cat | 12 | 12 | 0 |
| Squid | 12 | 12 | 0 |
| Dynamite | 11 | 11 | 0 |
| Pumpkin | 11 | 11 | 0 |
| Robot | 11 | 10 | 1 |

## Node Roles

- **Pure ingredients** (only ever used as inputs): 1,335
- **Dead ends** (results never reused): 1,026
- **Bridges** (both input and result): 294
- **Isolated**: 0 — every drawing is wired into at least one combination

Most creative output is **terminal**: 1,026 of 2,655 drawings were made and never built
upon. The 294 bridge nodes are the connective tissue that holds the giant component
together.

## Cycles (4 found)

Drawings that eventually lead back to themselves — rare cases of bidirectional or
self-referential relationships.

- escalator → stairway → escalator
- imaginary fiend → imaginary friend → imaginary fiend
- dead bird → dart → dead bird
- Infinite Thief (self-loop — steals itself)

## Longest Chains

Longest build chain found: **5 steps**.

- Woman → man → Ninja → Ginger Ninja → Gingerer Ninja → Desert Ninja

But chains this deep are the exception. Most combinations bottom out in 1–2 steps,
because the community rewards the *joke*, not the lineage (see Heart Economics below).

## Most Hearted Outcomes

| Input A | Input B | Result | Hearts | Creator |
|---------|---------|--------|--------|---------|
| God | vodka | platypus | 240 | Alex |
| Unicorns | rubber band | Unicorn Slingshot | 160 | Paul |
| Wizard | World War 2 | East and West Merlin | 152 | Zach |
| vampire | Fly | Mosquito | 141 | Paul |
| a bag of shit | The Internet | aol | 125 | ding |
| Domo Kun | Homosexuals | Domosexuals | 122 | Veronica |
| Potato Head | Pot | Baked Potato Head | 111 | bob |
| Dynamite | Hand | Stump | 105 | Esk |
| Flying Ninja Turd | Flying Pirate Turd | Epic Turd Battle | 100 | Paul |
| Godzilla | Pirate | Yarrzilla | 89 | zaratustra |
| Kool aid | Brick Wall | Oh Yeah | 85 | Paul |
| Link | Link | chain | 78 | mattishere |
| Squid | Space | Admiral Ackbar | 73 | Zach |
| tiny penis | ego | Hummer | 73 | derek |
| Godzilla | Atheist | zilla | 72 | mattishere |

## The Production Economy

A steep power law sits over 155 creators, and **volume and quality are different people**.

**Most prolific (by outcomes):**

| Creator | Outcomes | Total hearts | Avg hearts | Best |
|---------|----------|--------------|------------|------|
| Zach | 172 | 2,684 | 15.6 | 152 |
| Floriaen | 123 | 1,612 | 13.1 | 42 |
| jmullan | 109 | 1,491 | 13.7 | 56 |
| Paul | 95 | 1,920 | 20.2 | 160 |
| Alex | 88 | 1,561 | 17.7 | 240 |

**Highest quality (avg hearts, min 3 outcomes):**

| Creator | Outcomes | Avg hearts |
|---------|----------|------------|
| Veronica | 5 | 39.2 |
| derek | 4 | 33.0 |
| smoothio | 4 | 26.3 |
| jesse | 4 | 24.5 |
| zaratustra | 6 | 23.3 |

The two leaderboards barely overlap. Paul is the rare creator who is both prolific
(95) and excellent (20.2 avg) — he owns two of the all-time top hits.

## Collaboration Network

Attributing each drawing to the creator of the outcome that first produced it, then
inspecting what every combination was built *on* (2,640 input-uses):

- **2,102 (80%)** use a base primitive
- **402 (15%)** build on **someone else's** result
- **136 (5%)** build on the creator's **own** result

When people remixed existing work, they chose **strangers' results over their own
roughly 3:1** — this is genuine co-creation, not solo chaining.

**Most influential (results most reused by others):**

| Creator | Times their results were reused |
|---------|---------------------------------|
| Paul | 56 |
| jmullan | 47 |
| Alex | 32 |
| jmay | 31 |
| Zach | 29 |

These "seed-makers" — whose outputs others build on — form yet a third population,
distinct from the volume and quality leaders.

## Community Lifecycle

Activity over the 9-year span is not smooth; it has two distinct heartbeats:

- **June 2008**: 261 outcomes — the first and largest surge
- **October 2009**: 199 outcomes — the second surge

Between and after these peaks, output declines steadily through 2012 and sputters out
by 2015. The early months also carried the highest average hearts (Mar 2008 ≈ 58,
May 2008 ≈ 35) — the all-time greats were made early.

## The Naming Engine

The core creative mechanic is **wordplay**, not visual blending.

- **485 of 1,320 results (37%)** are literal linguistic blends of their inputs:
  `squash + big foot = sasquash`, `Pen + Island = Penis Land`,
  `German + Sock = Socktoberfest`, `Green + red = Gred`.
- **34 self-combinations** form a recognized "doubling" idiom:
  `Link + Link = chain`, `bacon + bacon = Awesome`, `Pew + Pew = Pew Pew`.

The game is fundamentally a pun rendered as a drawing.

## Generative Primitives

Ranking ingredients by the total hearts of everything they produced reveals "golden
inputs" — concepts that almost always yield a hit:

| Ingredient | Used in | Offspring hearts | Avg |
|------------|---------|------------------|-----|
| God | 7 | 319 | 45.6 |
| vodka | 4 | 276 | 69.0 |
| bacon | 14 | 263 | 18.8 |
| Wizard | 4 | 220 | 55.0 |
| Unicorns | 3 | 184 | 61.3 |

`vodka`, `Wizard`, and `Unicorns` are used rarely but convert nearly every time —
high-leverage concepts, distinct from high-volume hubs like Orange and Bear.

## Heart Economics

- **Mean hearts**: 15.4 · **Max**: 240 · **Floor**: 6 (browse filter)
- Distribution: 1,173 outcomes at 6–20 hearts, 113 at 21–50, **34 above 50**
- Building on a prior result (avg 15.2) earns **no more** than building on a primitive
  (avg 15.4). The community rewards the punchline, not the depth of lineage — which is
  exactly why build chains stay shallow.

## Insights

### A crowd-sourced ontology of association

Combinations encode how people *understand* concepts through associative reasoning
rather than definition. `vampire + Fly = Mosquito` decomposes a mosquito into its
core traits — blood-sucking and flying. This is concept blending at scale, produced
collaboratively by 155 people over nearly a decade.

### Three distinct creator populations

Grinders (Zach), snipers (Veronica, derek), and seed-makers (Paul, jmullan) are largely
different people. The community's output depends on all three roles, and only Paul spans
more than one.

### Creativity is mostly terminal, collaboration is mostly social

1,026 drawings are dead ends, yet of the work that *was* reused, 3 in 4 reuses were of
*someone else's* output. People rarely built on the community's results — but when they
did, they reached for strangers' ideas, not their own.

### Potential applications

- **Scored humor / analogy dataset**: 1,320 labeled `A + B = C` triples with a human
  funniness signal (hearts) — clean training data for analogical reasoning or
  computational humor.
- **Portmanteau corpus**: the 485 blends map input words to a blended output word.
- **Influence graph**: a creator-attribution network (seed-makers → remixers) that the
  drawing graph alone does not surface.
- **Creativity metrics**: chain length and branching factor measure how *generative* a
  concept is — whether it sparks further creation or ends the thread.
