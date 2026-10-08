// Runs each force layout once and writes the positions into public/data.json, so the browser
// starts from a settled graph instead of simulating on every load. The layout picker in the
// sidebar switches between them; node x/y hold the default one.
// Run after crawler/export.py: npm run layout
import fs from "fs";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";
import { createSimulation, nodeSize } from "./src/forces.js";

const path = new URL("public/data.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path));
const maxHearts = data.stats.maxHearts || 1;

// Every layout starts from the same spiral (d3-force's default initial placement), so runs are reproducible.
// Same node sizes and edge filtering as buildGraph() in src/main.js
const start = data.nodes.map((n, i) => {
    const radius = 10 * Math.sqrt(0.5 + i), angle = i * Math.PI * (3 - Math.sqrt(5));
    return { id: n.key, x: radius * Math.cos(angle), y: radius * Math.sin(angle), hearts: 0 };
});
const byId = new Map(start.map((n) => [n.id, n]));
const kept = data.edges.filter((e) => e.source !== e.target && byId.has(e.source) && byId.has(e.target));
for (const e of kept) {
    for (const n of [byId.get(e.source), byId.get(e.target)]) {
        if (e.hearts > n.hearts) n.hearts = e.hearts;
    }
}
for (const n of start) n.size = nodeSize(n.hearts, maxHearts);

function d3Force(nodes) {
    createSimulation(nodes, kept.map((e) => ({ source: e.source, target: e.target }))).stop().tick(300);
}

function forceAtlas(linLogMode) {
    return (nodes) => {
        const graph = new Graph();
        for (const n of nodes) graph.addNode(n.id, { x: n.x, y: n.y, size: n.size / 2 });
        for (const e of kept) graph.mergeEdge(e.source, e.target);
        forceAtlas2.assign(graph, { iterations: 1000, settings: { ...forceAtlas2.inferSettings(graph), linLogMode } });

        // FA2's scale is arbitrary: match the d3 layout's spread (median distance to the center ~650),
        // so node sizes keep the same proportions, then push overlapping nodes apart
        const pos = nodes.map((n) => graph.getNodeAttributes(n.id));
        const cx = pos.reduce((s, p) => s + p.x, 0) / pos.length;
        const cy = pos.reduce((s, p) => s + p.y, 0) / pos.length;
        const radii = pos.map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((a, b) => a - b);
        const scale = 650 / radii[Math.floor(radii.length / 2)];
        graph.updateEachNodeAttributes((id, a) => ({ ...a, x: (a.x - cx) * scale, y: (a.y - cy) * scale }));
        noverlap.assign(graph, { maxIterations: 200, settings: { margin: 2 } });

        for (const n of nodes) Object.assign(n, { x: graph.getNodeAttribute(n.id, "x"), y: graph.getNodeAttribute(n.id, "y") });
    };
}

// The first one is the default
const LAYOUTS = {
    "ForceAtlas2": forceAtlas(false),
    "ForceAtlas2 (LinLog)": forceAtlas(true),
    "d3 force": d3Force,
};

// Positions stored flat, [x0, y0, x1, y1, ...] in data.nodes order
data.layouts = {};
for (const [name, run] of Object.entries(LAYOUTS)) {
    const nodes = start.map((n) => ({ ...n }));
    console.time(name);
    run(nodes);
    console.timeEnd(name);
    data.layouts[name] = nodes.flatMap((n) => [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10]);
}

const defaults = Object.values(data.layouts)[0];
data.nodes.forEach((n, i) => {
    n.x = defaults[2 * i];
    n.y = defaults[2 * i + 1];
});
fs.writeFileSync(path, JSON.stringify(data));
console.log(`Wrote ${Object.keys(data.layouts).length} layouts of ${start.length} nodes to public/data.json`);
