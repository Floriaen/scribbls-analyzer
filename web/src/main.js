import Graph from "graphology";
import Sigma from "sigma";
import { createNodeImageProgram } from "@sigma/node-image";
import { buildUI } from "./sidebar.js";
import { nodeSize } from "./forces.js";
import "./style.css";

// ── State ─────────────────────────────────────────────────────
let nodes = [];
let edges = [];
let nodeById = new Map();
let graph = null;      // graphology graph rendered by sigma
let renderer = null;   // sigma instance
let highlightedNodes = null; // Set of node ids, from a click, a path or the sidebar
let highlightedEdges = null; // [source, target] pairs drawn in red
let hoveredNode = null;
let selectedNode = null;
let maxHearts = 1;

// Adjacency lookup for fast neighbor access
let neighbors = new Map();   // nodeId -> Set of neighbor nodeIds
let edgesByNode = new Map();  // nodeId -> Set of edge indices

// ── Load and init ─────────────────────────────────────────────
fetch("data.json")
    .then((r) => r.json())
    .then((data) => {
        maxHearts = data.stats.maxHearts || 1;
        buildGraph(data);
        initRenderer();
        initLayoutPicker(data.layouts);
        zoomToFit(nodes, { trimOutliers: true, duration: 0 });
        buildUI(nodes, edges, nodeById, data, {
            highlightComponent, highlightPath, resetHighlight, requestDraw,
        });
        setStatus(`Ready — ${nodes.length} nodes, ${edges.length} edges`);
    })
    .catch((err) => {
        setStatus("Failed to load data: " + err.message);
        console.error(err);
    });

// ── Node helpers ──────────────────────────────────────────────
function getNodeType(n) {
    if (n.inDegree === 0 && n.outDegree > 0) return "ingredient";
    if (n.outDegree === 0 && n.inDegree > 0) return "deadend";
    if (n.inDegree > 0 && n.outDegree > 0) return "bridge";
    return "isolated";
}

// Only visible until a node's drawing has loaded
function getNodeColor(n) {
    if (n.inDegree === 0 && n.outDegree > 0) return "#e94560";
    if (n.outDegree === 0 && n.inDegree > 0) return "#16213e";
    if (n.inDegree > 0 && n.outDegree > 0) return "#0f3460";
    return "#1a1a3a";
}

// ── Build graph ───────────────────────────────────────────────
function buildGraph(data) {
    nodes = data.nodes.map((n) => ({
        id: n.key,
        x: n.x, // baked by bake-layout.js
        y: n.y,
        color: getNodeColor(n),
        image: n.image,
        degree: n.degree,
        inDegree: n.inDegree,
        outDegree: n.outDegree,
        nodeType: getNodeType(n),
        hearts: 0,
        hidden: false,
        recipes: [],   // outcomes that produced this drawing
        usedIn: 0,     // outcomes this drawing was an input of
    }));

    nodes.forEach((n) => {
        nodeById.set(n.id, n);
        neighbors.set(n.id, new Set());
        edgesByNode.set(n.id, new Set());
    });

    data.outcomes.forEach((o) => {
        nodeById.get(o.result)?.recipes.push(o);
        for (const k of new Set([o.inputA, o.inputB])) {
            const n = nodeById.get(k);
            if (n) n.usedIn++;
        }
    });
    nodes.forEach((n) => n.recipes.sort((a, b) => (a.date || "").localeCompare(b.date || "")));

    edges = [];
    data.edges.forEach((e) => {
        if (e.source === e.target) return;
        if (!nodeById.has(e.source) || !nodeById.has(e.target)) return;
        const idx = edges.length;
        edges.push({
            source: nodeById.get(e.source),
            target: nodeById.get(e.target),
            hearts: e.hearts,
            label: e.label,
            hidden: false,
            index: idx,
        });
        neighbors.get(e.source).add(e.target);
        neighbors.get(e.target).add(e.source);
        edgesByNode.get(e.source).add(idx);
        edgesByNode.get(e.target).add(idx);

        // Track max hearts on both ends, so ingredients aren't stuck at min size
        for (const n of [nodeById.get(e.source), nodeById.get(e.target)]) {
            if (e.hearts > n.hearts) n.hearts = e.hearts;
        }
    });

    // Sigma's y axis points up, hence -y; sizes are screen radii, hence / 4 of the diameter in graph units
    graph = new Graph({ type: "directed" });
    for (const n of nodes) {
        graph.addNode(n.id, {
            x: n.x, y: -n.y, label: n.id, image: n.image, color: n.color, size: nodeSize(n.hearts, maxHearts) / 4,
        });
    }
    for (const e of edges) graph.addEdge(e.source.id, e.target.id, { size: 0.6, color: EDGE_COLOR });
}

// ── Renderer ──────────────────────────────────────────────────
const BACKGROUND = "#0a0a1a";
const EDGE_COLOR = "rgba(83,52,131,0.5)";
const RED = "#e94560";
// While something is highlighted, everything else is covered by the background at 75%,
// the look of drawing dimmed nodes at 25% opacity
const DIM_OVERLAY = "rgba(10,10,26,0.75)";
// ponytail: 64px per drawing packs 4,550 images into ~2 GPU textures (~128MB); raise for sharper zoom-in, at ~4x memory per doubling
const IMAGE_SIZE = 64;

function initRenderer() {
    const container = document.getElementById("graph-container");
    renderer = new Sigma(graph, container, {
        defaultEdgeType: "arrow",
        defaultNodeType: "image",
        nodeProgramClasses: { image: createNodeImageProgram({ size: { mode: "force", value: IMAGE_SIZE } }) },
        defaultDrawNodeLabel: drawLabel,
        defaultDrawNodeHover: drawHover,
        minEdgeThickness: 0.5,
        labelSize: 11,
        labelFont: "monospace",
        nodeReducer,
    });

    // Sigma only follows window resizes; the sidebar toggle resizes the container alone
    new ResizeObserver(() => renderer.resize() && renderer.refresh()).observe(container);

    const labelsToggle = document.getElementById("show-labels");
    renderer.setSetting("renderLabels", labelsToggle.checked);
    labelsToggle.addEventListener("change", () => renderer.setSetting("renderLabels", labelsToggle.checked));

    initFocusLayer();

    // Hover
    renderer.on("enterNode", ({ node }) => {
        hoveredNode = node;
        container.style.cursor = "pointer";
        redraw();
    });
    renderer.on("leaveNode", () => {
        hoveredNode = null;
        container.style.cursor = "";
        hideTooltip();
        redraw();
    });
    renderer.getMouseCaptor().on("mousemovebody", (e) => {
        if (hoveredNode) showTooltip(nodeById.get(hoveredNode), e.original);
    });

    // Click — first click highlights neighbors, second click finds path
    renderer.on("clickNode", ({ node }) => {
        if (selectedNode && selectedNode !== node) {
            findShortestPath(selectedNode, node);
        } else if (selectedNode === node) {
            resetHighlight();
        } else {
            highlightComponent(node);
        }
    });
    renderer.on("clickStage", () => resetHighlight());
}

// Nodes kept bright: the highlight, else the hovered node and its neighbors
function focusNodes() {
    if (highlightedNodes) return highlightedNodes;
    if (hoveredNode) return new Set([hoveredNode, ...neighbors.get(hoveredNode)]);
    return null;
}

let focus = null;

// Every highlight or hover change goes through here. Positions don't change, so sigma can skip re-indexing.
function redraw() {
    focus = focusNodes();
    renderer.refresh({ skipIndexation: true });
}

function nodeReducer(node, attrs) {
    if (nodeById.get(node).hidden) return { ...attrs, hidden: true };
    if (!focus) return attrs;
    // Highlighted nodes are drawn by sigma above everything, including the dim layer
    return focus.has(node) ? { ...attrs, highlighted: true, forceLabel: true } : { ...attrs, label: "" };
}

// Labels: monospace with a dark outline, bold and white when hovered
function drawLabel(context, node) {
    if (!node.label) return;
    const isHovered = node.key === hoveredNode;
    const fontSize = isHovered ? 13 : 11;
    context.font = isHovered ? "bold 13px monospace" : "11px monospace";
    const x = node.x + node.size + 3;
    const y = node.y + fontSize / 3;
    context.lineJoin = "round";
    context.lineWidth = isHovered ? 3 : 2;
    context.strokeStyle = BACKGROUND;
    context.strokeText(node.label, x, y);
    context.fillStyle = isHovered ? "#fff" : "#ddd";
    context.fillText(node.label, x, y);
}

// Called by sigma for the hovered and highlighted nodes: red ring on the hovered node (3px)
// and on the highlight (2px)
function drawHover(context, node, settings) {
    const isHovered = node.key === hoveredNode;
    if (isHovered || highlightedNodes?.has(node.key)) {
        context.strokeStyle = RED;
        context.lineWidth = isHovered ? 3 : 2;
        context.beginPath();
        context.arc(node.x, node.y, node.size + (isHovered ? 2 : 1), 0, Math.PI * 2);
        context.stroke();
    }
    if (settings.renderLabels) drawLabel(context, node);
}

// Dim layer above the nodes, plus the highlighted edges in red on top of it. Sigma draws all edges
// under all nodes, so highlighted edges can only stay visible on a layer of our own.
function initFocusLayer() {
    // CSS size set here: sigma only sizes its own layers, and a HiDPI canvas would otherwise show at 2x
    const layer = renderer.createCanvas("focus", { afterLayer: "nodes", style: { width: "100%", height: "100%" } });
    const ctx = layer.getContext("2d");

    renderer.on("afterRender", () => {
        const { width, height } = renderer.getDimensions();
        const ratio = window.devicePixelRatio || 1;
        if (layer.width !== width * ratio || layer.height !== height * ratio) {
            layer.width = width * ratio;
            layer.height = height * ratio;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        if (!highlightedNodes && !hoveredNode) return;

        ctx.fillStyle = DIM_OVERLAY;
        ctx.fillRect(0, 0, width, height);

        const lit = highlightedEdges ??
            [...edgesByNode.get(hoveredNode)].map((i) => [edges[i].source.id, edges[i].target.id]);
        const arrow = 7;
        ctx.strokeStyle = ctx.fillStyle = RED;
        ctx.lineWidth = 2;
        for (const [source, target] of lit) {
            if (nodeById.get(source).hidden || nodeById.get(target).hidden) continue;
            const s = renderer.graphToViewport(graph.getNodeAttributes(source));
            const t = renderer.graphToViewport(graph.getNodeAttributes(target));
            const dx = t.x - s.x, dy = t.y - s.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) continue;
            const nx = dx / len, ny = dy / len;
            const r = renderer.scaleSize(renderer.getNodeDisplayData(target).size);
            const ax = t.x - nx * r, ay = t.y - ny * r; // arrow tip on the target's edge
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - nx * arrow - ny * arrow * 0.4, ay - ny * arrow + nx * arrow * 0.4);
            ctx.lineTo(ax - nx * arrow + ny * arrow * 0.4, ay - ny * arrow - nx * arrow * 0.4);
            ctx.fill();
        }
    });
}

// ── Layout picker ─────────────────────────────────────────────
// data.layouts holds every layout computed by bake-layout.js, flat [x0, y0, x1, y1, ...] in node order
function initLayoutPicker(layouts) {
    if (!layouts) return;
    const select = document.getElementById("layout-select");
    select.innerHTML = Object.keys(layouts).map((name) => `<option>${escHtml(name)}</option>`).join("");
    document.getElementById("layout-row").style.display = "";

    select.addEventListener("change", () => {
        const flat = layouts[select.value];
        nodes.forEach((n, i) => {
            n.x = flat[2 * i];
            n.y = flat[2 * i + 1];
        });
        graph.updateEachNodeAttributes((id, attrs) => {
            const n = nodeById.get(id);
            return { ...attrs, x: n.x, y: -n.y };
        });
        renderer.refresh(); // reframes to the new bounding box, which zoomToFit relies on
        zoomToFit(nodes, { trimOutliers: true, duration: 0 });
    });
}

// ── Highlight / zoom ──────────────────────────────────────────
// Camera positions are in sigma's "framed graph" space (the graph's bounding box mapped to 0..1)
function toFramed(id) {
    return renderer.viewportToFramedGraph(renderer.graphToViewport(graph.getNodeAttributes(id)));
}

const FIT_PADDING = 60;   // px around fitted nodes
const MIN_FIT_RATIO = 0.05; // closest zoom when fitting a few nearby nodes

function zoomToFit(fitNodes, { trimOutliers = false, duration = 400 } = {}) {
    if (fitNodes.length === 0) return;

    let subset = fitNodes;
    if (trimOutliers && fitNodes.length > 20) {
        const sortedX = fitNodes.map((n) => n.x).sort((a, b) => a - b);
        const sortedY = fitNodes.map((n) => n.y).sort((a, b) => a - b);
        const lo = Math.floor(fitNodes.length * 0.15);
        const hi = Math.ceil(fitNodes.length * 0.85) - 1;
        const xMin = sortedX[lo], xMax = sortedX[hi];
        const yMin = sortedY[lo], yMax = sortedY[hi];
        subset = fitNodes.filter((n) => n.x >= xMin && n.x <= xMax && n.y >= yMin && n.y <= yMax);
        if (subset.length === 0) subset = fitNodes;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of subset) {
        const p = toFramed(n.id);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }

    // Size of the padded viewport in framed units at ratio 1; the ratio scales it linearly
    const { width, height } = renderer.getDimensions();
    const base = { cameraState: { x: 0.5, y: 0.5, ratio: 1, angle: 0 } };
    const a = renderer.viewportToFramedGraph({ x: FIT_PADDING, y: FIT_PADDING }, base);
    const b = renderer.viewportToFramedGraph({ x: width - FIT_PADDING, y: height - FIT_PADDING }, base);
    const ratio = Math.max((maxX - minX) / Math.abs(b.x - a.x), (maxY - minY) / Math.abs(b.y - a.y), MIN_FIT_RATIO);

    const state = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, ratio };
    if (duration) renderer.getCamera().animate(state, { duration });
    else renderer.getCamera().setState(state);
}

export function highlightComponent(startNodeId) {
    if (!nodeById.has(startNodeId)) return;

    highlightedNodes = new Set([startNodeId, ...neighbors.get(startNodeId)]);
    highlightedEdges = [...edgesByNode.get(startNodeId)].map((i) => [edges[i].source.id, edges[i].target.id]);
    selectedNode = startNodeId;
    redraw();

    // Zoom to fit the node and its neighbors
    zoomToFit([...highlightedNodes].map((id) => nodeById.get(id)));

    setStatus(`${startNodeId} — click another node to find path`);
}

export function highlightPath(path) {
    highlightedNodes = new Set(path);
    highlightedEdges = [];
    for (let i = 0; i < path.length - 1; i++) {
        const [a, b] = [path[i], path[i + 1]];
        highlightedEdges.push(graph.hasEdge(a, b) ? [a, b] : [b, a]);
    }

    selectedNode = null;
    redraw();

    zoomToFit(path.map((id) => nodeById.get(id)).filter(Boolean));
    showPathBar(path);
}

function findShortestPath(fromId, toId) {
    // BFS on undirected neighbor graph
    const prev = new Map();
    const visited = new Set();
    const queue = [fromId];
    visited.add(fromId);
    prev.set(fromId, null);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === toId) break;
        for (const neighborId of neighbors.get(current)) {
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                prev.set(neighborId, current);
                queue.push(neighborId);
            }
        }
    }

    if (!prev.has(toId)) {
        setStatus(`No path between ${fromId} and ${toId}`);
        resetHighlight();
        return;
    }

    // Reconstruct path
    const path = [];
    let cur = toId;
    while (cur !== null) {
        path.unshift(cur);
        cur = prev.get(cur);
    }

    highlightPath(path);
}

export function resetHighlight() {
    highlightedNodes = null;
    highlightedEdges = null;
    selectedNode = null;
    document.querySelectorAll(".chain-item.active").forEach((el) => el.classList.remove("active"));
    hidePathBar();
    redraw();
}

// ── Tooltip ───────────────────────────────────────────────────
let tooltipNode = null;

function showTooltip(node, event) {
    const tooltip = document.getElementById("tooltip");
    if (tooltipNode !== node) {
        tooltipNode = node;
        tooltip.innerHTML = tooltipHtml(node);
    }

    tooltip.style.display = "block";
    const { offsetWidth: w, offsetHeight: h } = tooltip;
    const x = event.clientX + 15;
    const y = event.clientY + 15;
    tooltip.style.left = (x + w > window.innerWidth ? event.clientX - w - 15 : x) + "px";
    tooltip.style.top = (y + h > window.innerHeight ? Math.max(0, event.clientY - h - 15) : y) + "px";
}

const NODE_TYPE_LABELS = {
    ingredient: "Pure ingredient",
    deadend: "Dead end",
    bridge: "Bridge",
    isolated: "Isolated",
};

function tooltipHtml(node) {
    const img = (name, cls) => {
        const src = nodeById.get(name)?.image;
        return src ? `<img class="${cls}" src="${escHtml(src)}" alt="">` : `<div class="${cls}"></div>`;
    };
    const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

    const badges = [`<span class="badge badge-${node.nodeType}">${NODE_TYPE_LABELS[node.nodeType]}</span>`];
    if (node.hearts > 0) badges.push(`<span class="badge badge-hearts">♥ ${node.hearts}</span>`);

    const first = node.recipes[0];
    let recipe = "";
    const meta = [];
    if (first) {
        recipe = `
            <div class="tt-recipe">
                <div class="tt-ingredient">${img(first.inputA, "tt-thumb")}<span>${escHtml(first.inputA)}</span></div>
                <div class="tt-plus">+</div>
                <div class="tt-ingredient">${img(first.inputB, "tt-thumb")}<span>${escHtml(first.inputB)}</span></div>
            </div>
            ${node.recipes.length > 1 ? `<div class="tt-more">+${plural(node.recipes.length - 1, "other recipe")}</div>` : ""}`;
        const fmt = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        // The drawing and its recipe were often made by different people, sometimes years apart
        const drawnAt = first.drawnAt || first.date;
        const artist = first.artist || first.creator;
        if (drawnAt) meta.push(["Drawn", fmt(drawnAt)]);
        meta.push(["Artist", escHtml(artist)]);
        if (first.creator !== artist || (first.date && first.date !== drawnAt)) {
            meta.push(["Recipe", `${escHtml(first.creator)}${first.date ? `, ${fmt(first.date)}` : ""}`]);
        }
    } else {
        meta.push(["Drawn", `<span class="tt-muted">Unknown</span>`]);
    }
    if (node.usedIn > 0) meta.push(["Used in", plural(node.usedIn, "combination")]);

    return `
        ${img(node.id, "tt-image")}
        <div class="tt-name">${escHtml(node.id)}</div>
        <div class="tt-badges">${badges.join("")}</div>
        ${recipe}
        <dl class="tt-meta">${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
}

function hideTooltip() {
    tooltipNode = null;
    document.getElementById("tooltip").style.display = "none";
}

// ── Path bar ──────────────────────────────────────────────────
function showPathBar(path) {
    const bar = document.getElementById("path-bar");
    const statusText = document.getElementById("status-text");

    let html = "";
    for (let i = 0; i < path.length - 1; i++) {
        const srcId = path[i];
        const tgtId = path[i + 1];
        const src = nodeById.get(srcId);
        const tgt = nodeById.get(tgtId);

        // Find the edge to get the other input name
        let otherInput = null;
        for (const idx of (edgesByNode.get(srcId) || [])) {
            const edge = edges[idx];
            if ((edge.source.id === srcId && edge.target.id === tgtId) ||
                (edge.source.id === tgtId && edge.target.id === srcId)) {
                otherInput = edge.label ? edge.label.replace(/^\+\s*/, "") : null;
                break;
            }
        }

        if (i === 0) {
            html += pathNode(src);
        }

        if (otherInput) {
            const otherNode = nodeById.get(otherInput);
            html += `<span class="path-op">+</span>`;
            html += otherNode ? pathNode(otherNode) : `<span class="path-node-fallback">${escHtml(otherInput)}</span>`;
        }

        html += `<span class="path-op">=</span>`;
        html += pathNode(tgt);
    }

    bar.innerHTML = html;
    bar.style.display = "flex";
    statusText.style.display = "none";
}

function pathNode(node) {
    if (node && node.image) {
        return `<img class="path-img" src="${node.image}" alt="${escHtml(node.id)}" title="${escHtml(node.id)}" onerror="this.style.display='none'">`;
    }
    return `<span class="path-node-fallback">${escHtml(node ? node.id : "?")}</span>`;
}

function escHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hidePathBar() {
    document.getElementById("path-bar").style.display = "none";
    document.getElementById("status-text").style.display = "";
}

// ── Status bar ────────────────────────────────────────────────
export function setStatus(text) {
    hidePathBar();
    document.getElementById("status-text").textContent = text;
}

// Expose for sidebar to trigger redraw. Filters change node.hidden, which needs a full refresh (label grid).
export function requestDraw() {
    // Sigma sends no leaveNode when the hovered node gets hidden: drop the hover ourselves
    if (hoveredNode && nodeById.get(hoveredNode).hidden) {
        hoveredNode = null;
        hideTooltip();
        document.getElementById("graph-container").style.cursor = "";
    }
    focus = focusNodes();
    renderer.refresh();
}
