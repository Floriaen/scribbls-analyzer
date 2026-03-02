# Scribbls Graph Analysis

## Dataset

- **Pages crawled**: 66/132
- **Outcomes**: 660
- **Unique drawings**: 1505
- **Creators**: 108
- **Graph nodes**: 1505
- **Graph edges**: 1301

## Connected Components

- **Total**: 216
- **Largest**: 477 nodes
- **2nd largest**: 55 nodes
- **Isolated clusters (< 5 nodes)**: 155

## Top Hubs (most combinations)

| Drawing | Total | As input | As result |
|---------|-------|----------|-----------|
| Bear | 9 | 9 | 0 |
| Beer | 7 | 7 | 0 |
| Dynamite | 7 | 7 | 0 |
| Pirate | 7 | 7 | 0 |
| TRUTH | 7 | 7 | 0 |
| Orange | 7 | 7 | 0 |
| not far from there | 7 | 7 | 0 |
| Ninja | 6 | 4 | 2 |
| Robot | 6 | 4 | 2 |
| Jesus | 6 | 6 | 0 |
| Death | 6 | 6 | 0 |
| duck | 6 | 4 | 2 |
| Bee | 6 | 6 | 0 |
| La Gioconda | 6 | 6 | 0 |
| man | 5 | 5 | 0 |

## Pure Ingredients (845 total)

Drawings that were never created from a combination — only used as inputs.

- **Bear**: used in 9 combinations
- **Beer**: used in 7 combinations
- **Dynamite**: used in 7 combinations
- **Pirate**: used in 7 combinations
- **TRUTH**: used in 7 combinations
- **Orange**: used in 7 combinations
- **not far from there**: used in 7 combinations
- **Jesus**: used in 6 combinations
- **Death**: used in 6 combinations
- **Bee**: used in 6 combinations

## Dead Ends (552 total)

Results that were never reused as inputs in another combination.

## Cycles (2 found)

Drawings that eventually lead back to themselves.

- dart -> dead bird -> dart
- stairway -> escalator -> stairway

## Longest Chains

Longest path found: **2 steps**

- Bear -> BearBeer
- Beer -> BearBeer
- Dynamite -> Napolean Dynamite
- Dynamite -> TNTini
- Dynamite -> Stump

## Bridge Nodes (1473 total)

Nodes whose removal would disconnect parts of the graph.

- **Bear**: 9 connections
- **Beer**: 7 connections
- **not far from there**: 7 connections
- **Pirate**: 7 connections
- **Dynamite**: 7 connections
- **TRUTH**: 7 connections
- **Orange**: 7 connections
- **Ninja**: 6 connections
- **duck**: 6 connections
- **Jesus**: 6 connections

## Most Hearted Outcomes

| Input A | Input B | Result | Hearts |
|---------|---------|--------|--------|
| God | vodka | platypus | 240 |
| Unicorns | rubber band | Unicorn Slingshot | 160 |
| Wizard | World War 2 | East and West Merlin | 152 |
| vampire | Fly | Mosquito | 141 |
| a bag of shit | The Internet | aol | 125 |
| Domo Kun | Homosexuals | Domosexuals | 122 |
| Potato Head | Pot | Baked Potato Head | 111 |
| Dynamite | Hand | Stump | 105 |
| Flying Ninja Turd | Flying Pirate Turd | Epic Turd Battle | 100 |
| Godzilla | Pirate | Yarrzilla | 89 |
| Kool aid | Brick Wall | Oh Yeah | 85 |
| Link | Link | chain | 78 |
| Squid | Space | Admiral Ackbar | 73 |
| tiny penis | ego | Hummer | 73 |
| Godzilla | Atheist | zilla | 72 |
| slinky | escalator | endless fun | 72 |
| semen | Whale | Sperm Whale | 69 |
| squash | big foot | sasquash | 65 |
| bacon | bacon | Awesome | 64 |
| Cocaine | Puppies | Scrappy Doo | 64 |

## Insights

### The graph is a crowd-sourced ontology

The combinations encode how people *understand* concepts — not through dictionary definitions but through associative reasoning. "vampire + Fly = Mosquito" reveals that people intuitively decompose a mosquito into its core traits: blood-sucking and flying. This is concept blending at scale, produced collaboratively by hundreds of users.

### Hub nodes are cultural primitives

Bear, Pirate, Beer, Jesus, Ninja, Orange — these are the "atoms" of internet humor circa 2007-2008. They combine with everything because they carry strong, universally recognized traits. They function as cultural building blocks that the community reached for instinctively. Notably, every top hub is a pure ingredient (never a result), suggesting these concepts are considered fundamental — not decomposable into simpler parts.

### Most creativity is terminal

552 out of 1505 drawings are dead ends — results that nobody ever picked up and combined further. Most creative output was consumed but not built upon. The few drawings that *are* reused (Ninja, Robot, duck) act as bridges between creative threads, connecting otherwise isolated clusters.

### Cycles reveal semantic symmetry

The two cycles found (dart/dead bird, stairway/escalator) are pairs where each concept can produce the other. These are rare and interesting — they suggest the community found concepts that are mirror images of each other, where the relationship is bidirectional rather than hierarchical.

### The giant component vs isolated clusters

One massive cluster of 477 nodes dominates, while 155 clusters have fewer than 5 nodes. This mirrors real social networks: a few highly-connected hubs pull most of the graph together, while the long tail consists of one-off combinations that never connected to the main creative thread.

### Potential applications

- **Training data for analogy models**: each outcome is a labeled example of concept blending (A + B = C), useful for teaching AI systems analogical reasoning
- **Computational humor research**: the heart count provides a ground truth for what combinations people find funny vs flat — a scored dataset of humor
- **Visual thesaurus**: the graph maps concepts by human association rather than linguistic similarity, offering a different lens on how ideas relate
- **Creativity metrics**: chain length and branching factor could measure how "generative" a concept is — does it spark further creation or end the thread?
