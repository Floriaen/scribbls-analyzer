# Scribbls Graph Analysis

## Dataset

Every outcome reachable on scribbls.com. Recipes span **Jan 2006 – Dec 2017**.

- **Outcomes**: 4,102
- **Unique drawings**: 4,550
- **People**: 559 (495 made recipes, 479 drew results)
- **Graph nodes**: 4,550
- **Graph edges**: 8,078

> **Two people, two dates.** The site separates *drawing* a result from *creating the
> outcome* (the `A + B = C` recipe). 26% of outcomes were set up by someone other than
> the artist, and in 36% the recipe came after the drawing, a median of 61 days later
> (337 more than a year later). Below, "creator" means the
> recipe's author and "artist" the person who drew the result.

## Connected Components

- **Total**: 7
- **Largest**: 4,533 nodes (99.6% of the graph)
- **2nd largest**: 3 nodes

Scribbls is one connected web of ideas.

## Top Hubs (most combinations)

| Drawing | Total | As input | As result |
|---------|-------|----------|-----------|
| man | 78 | 77 | 1 |
| bacon | 38 | 37 | 1 |
| Ax | 37 | 36 | 1 |
| Beer | 33 | 32 | 1 |
| Bear | 33 | 32 | 1 |
| time | 31 | 30 | 1 |
| water | 27 | 26 | 1 |
| Orange | 26 | 25 | 1 |
| not far from there | 26 | 25 | 1 |
| TRUTH | 25 | 24 | 1 |
| Cat | 25 | 24 | 1 |
| Fish | 25 | 24 | 1 |

`man` is the universal ingredient: used twice as often as anything else.

## Node Roles

- **Pure ingredients** (never the result of an outcome): 448
- **Dead ends** (results never reused): 917
- **Bridges** (both input and result): 3,185
- **Isolated**: 0

The site had no way to make a drawing outside a combination, so the 448 pure ingredients
are drawings whose recipe page no longer exists (the site answers "New drawings by request
only. RIP Scribbls"). Examples: `Book`, `caramel`, `cold`, `spelling`, `15 years`.

**70% of drawings are bridges**, both built from and built upon.

## Cycles

**147 cycles** of length ≤ 8, plus **18 self-loops**. Short examples:

- Chicken → Egg → Chicken
- more → less → more
- fat guy → fit guy → fat guy
- Alive crayfish → Dead crayfish → Alive crayfish
- Legs → Wax → Legs
- Infinite Thief + Infinite Thief = Infinite Thief (also `nothing`, `Duplicate`, `rabbit`…)

Cycles are possible because recipes were often attached to drawings that already existed:
`Egg` can be made from `Chicken` even though `Chicken` is later made from `Egg`.

## Longest Chains

Counting only causally consistent steps (an input counts only if its own recipe predates
the recipe that uses it), the longest build chain is **24 steps**:

- melons → girl → her → Hammer → Marmalade → dangerous breakfast → Mysteries of India →
  Mysteries of Pakistan → … → Mysteries of Russia → Mysteries of Alaska

The tail is one long relay of 19 "Mysteries of …" drawings. Chains are deep in general:
the median result sits 3 steps from the start of its chain, and 1,151 results sit 6 or
more steps deep.

The time filter drops 2,213 of the 8,078 edges: more than a quarter of combinations used
an input whose recipe was only added afterwards.

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
| Squid | Space | Admiral Ackbar | 73 | jmullan (drawn by Zach) |
| tiny penis | ego | Hummer | 73 | derek |
| Godzilla | Atheist | zilla | 72 | mattishere |

## The Production Economy

A steep power law over 495 recipe creators: the top 10 made **58%** of all outcomes, while
281 people made exactly one.

**Most prolific (by outcomes created):**

| Creator | Outcomes | Total hearts | Avg hearts | Best |
|---------|----------|--------------|------------|------|
| Zach | 498 | 4,160 | 8.4 | 152 |
| jmullan | 386 | 2,724 | 7.1 | 73 |
| Paul | 318 | 2,946 | 9.3 | 160 |
| mattishere | 302 | 1,820 | 6.0 | 78 |
| Floriaen | 213 | 2,175 | 10.2 | 42 |
| Alex | 209 | 2,280 | 10.9 | 240 |

**Highest quality (artist avg hearts, min 5 drawings):**

| Artist | Drawings | Avg hearts |
|--------|----------|------------|
| smoothio | 6 | 19.3 |
| ding | 9 | 17.9 |
| Veronica | 13 | 17.5 |
| Meowfish | 12 | 14.3 |
| SadXuHuang | 52 | 13.7 |

Volume and quality are different people. Among the big producers, Alex (10.9) and
Floriaen (10.2) have the highest averages.

**Curators.** Some people mostly wired up *other people's* drawings: mattishere created
196 outcomes for drawings by someone else, Fraggle 146, Zach 77. They were part of the
site's maintenance, connecting existing art into recipes, sometimes years later.

## Collaboration Network

Attributing each drawing to its artist, then looking at what every combination was built
*on* (8,204 input-uses):

- **554 (7%)** use a pure ingredient
- **5,623 (69%)** build on **someone else's** drawing
- **2,027 (25%)** build on the creator's **own** drawing

People chose **strangers' work over their own roughly 3:1**.

**Most influential (drawings most reused by others):**

| Artist | Times their drawings were reused |
|--------|----------------------------------|
| jmullan | 999 |
| Paul | 888 |
| Zach | 799 |
| Alex | 289 |
| Fraggle | 209 |

## Community Lifecycle

Recipes per year: 2006: 59 · 2007: 201 · **2008: 2,134** · 2009: 1,112 · 2010: 271 ·
2011: 208 · 2012: 49 · 2013: 40 · 2014: 7 · 2015: 8 · 2017: 13.

Activity has two heartbeats:

- **June 2008**: 910 outcomes in one month, 22% of everything ever made
- **October 2009**: 340 outcomes, the second surge

The best-rated months are spread out: Oct 2010 (13.1 avg hearts), Jan 2009 (11.2).

## The Naming Engine

The core creative mechanic is **wordplay**.

- **785 of 4,102 results (19%)** share at least 3 letters in a row with *both* inputs:
  `Domo Kun + Homosexuals = Domosexuals`, `Pen + Island = Penis Land`,
  `Zombie + Tay Zonday = Tay Zombay`.
- **126 self-combinations** form a "doubling" idiom:
  `Link + Link = chain`, `bacon + bacon = Awesome`, `Beep + Beep = Road Runner`.

## Generative Primitives

Ranking inputs by the total hearts of everything they produced:

| Ingredient | Used in | Offspring hearts | Avg |
|------------|---------|------------------|-----|
| God | 20 | 380 | 19.0 |
| bacon | 37 | 353 | 9.5 |
| man | 77 | 342 | 4.4 |
| Bear | 32 | 316 | 9.9 |
| Pirate | 22 | 300 | 13.6 |
| vodka | 8 | 293 | 36.6 |

`man` is used most but its offspring average only 4.4 hearts. `vodka` and `God` are the
high-leverage concepts.

## Heart Economics

- **Mean hearts**: 7.8 · **Median**: 6 · **Max**: 240 · **Min**: 0
- Distribution: 1,829 outcomes at 0–5 hearts, 2,126 at 6–20, 113 at 21–50, **34 above 50**
- Deeper lineage earns slightly *more*: results 0–1 steps from the start of their chain
  average 6.8 hearts, results 6+ steps deep average 8–9.

## Insights

### A crowd-sourced ontology of association

Combinations encode how people *understand* concepts through associative reasoning rather
than definition. `vampire + Fly = Mosquito` decomposes a mosquito into its core traits.
This is concept blending at scale, produced by 559 people over a decade.

### Four creator populations

Grinders (Zach, jmullan), snipers (smoothio, ding, Veronica), seed-makers whose drawings
others build on (jmullan, Paul, Zach), and curators who turned existing drawings into
recipes (mattishere, Fraggle).

### Creativity is mostly connective

Scribbls is one component where 70% of
drawings are both built from and built upon, chains run to 24 steps, and 69% of all
combinations reuse someone else's drawing.

### Potential applications

- **Scored humor / analogy dataset**: 4,102 labeled `A + B = C` triples with a funniness
  signal (hearts), low-scored ones included.
- **Portmanteau corpus**: the 785 blends map input words to a blended output word.
- **Influence graph**: an artist-attribution network (seed-makers → remixers → curators).
- **Creativity metrics**: chain depth and branching factor measure how *generative* a
  concept is.
