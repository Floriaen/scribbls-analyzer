import * as d3 from "d3";

// Used by bake-layout.js to compute node positions; nodeSize is also used by main.js for rendering.

export function nodeSize(hearts, maxHearts) {
    return 6 + (hearts / maxHearts) * 28;
}

export function createSimulation(nodes, edges) {
    return d3.forceSimulation(nodes)
        .force("link", d3.forceLink(edges).id((d) => d.id).distance(80).strength(0.3))
        .force("charge", d3.forceManyBody().strength(-200).distanceMax(300))
        .force("center", d3.forceCenter(0, 0).strength(0.05))
        .force("collision", d3.forceCollide().radius((d) => d.size / 2 + 2))
        .velocityDecay(0.4);
}
