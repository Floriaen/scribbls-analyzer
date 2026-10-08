// Runs the force layout once and writes the final positions into public/data.json,
// so the browser starts from a settled graph instead of simulating ~15s on every load.
// Run after crawler/export.py: npm run layout
import fs from "fs";
import { createSimulation, nodeSize } from "./src/forces.js";

const path = new URL("public/data.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path));
const maxHearts = data.stats.maxHearts || 1;

// Same node sizes and edge filtering as buildGraph() in src/main.js
const nodes = data.nodes.map((n) => ({ id: n.key, x: n.x, y: n.y, hearts: 0 }));
const byId = new Map(nodes.map((n) => [n.id, n]));
const kept = data.edges.filter((e) => e.source !== e.target && byId.has(e.source) && byId.has(e.target));
const edges = kept.map((e) => ({ source: e.source, target: e.target }));
for (const e of kept) {
    for (const n of [byId.get(e.source), byId.get(e.target)]) {
        if (e.hearts > n.hearts) n.hearts = e.hearts;
    }
}
for (const n of nodes) n.size = nodeSize(n.hearts, maxHearts);

console.time("layout");
createSimulation(nodes, edges).stop().tick(300);
console.timeEnd("layout");

data.nodes.forEach((n, i) => {
    n.x = Math.round(nodes[i].x * 10) / 10;
    n.y = Math.round(nodes[i].y * 10) / 10;
});
fs.writeFileSync(path, JSON.stringify(data));
console.log(`Wrote ${nodes.length} positions to public/data.json`);
