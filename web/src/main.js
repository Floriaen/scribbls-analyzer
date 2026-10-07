import * as d3 from "d3";
import { buildUI } from "./sidebar.js";
import "./style.css";

// ── State ─────────────────────────────────────────────────────
let nodes = [];
let edges = [];
let nodeById = new Map();
let simulation = null;
let transform = d3.zoomIdentity;
let highlightedNodes = null;
let highlightedEdges = null;
let hoveredNode = null;
let selectedNode = null;
let canvas, ctx, zoomBehavior;
let imageCache = new Map();
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
        initCanvas();
        initSimulation();
        zoomToFit(nodes, { trimOutliers: true });
        buildUI(nodes, edges, nodeById, data, {
            zoomToNode, highlightComponent, highlightPath, resetHighlight,
            getVisibility, requestDraw,
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
        x: n.x * 10,
        y: n.y * 10,
        size: 4 + Math.min(n.degree * 2, 30),
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
    data.edges.forEach((e, i) => {
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

    // Recompute node size based on hearts
    nodes.forEach((n) => {
        const ratio = n.hearts / maxHearts;
        n.size = 6 + ratio * 28;
    });

    // Preload images, plus a pre-clipped round thumbnail so most frames skip the per-node clip()
    nodes.forEach((n) => {
        if (n.image) {
            const img = new Image();
            img.src = n.image;
            img.onload = () => {
                const thumb = document.createElement("canvas");
                thumb.width = thumb.height = THUMB_SIZE;
                const t = thumb.getContext("2d");
                t.beginPath();
                t.arc(THUMB_SIZE / 2, THUMB_SIZE / 2, THUMB_SIZE / 2, 0, Math.PI * 2);
                t.clip();
                t.drawImage(img, 0, 0, THUMB_SIZE, THUMB_SIZE);
                imageCache.set(n.id, { img, thumb });
                draw();
            };
        }
    });
}

// ponytail: fixed 64px thumbnails; past that on-screen size, draw() falls back to clipping the full image
const THUMB_SIZE = 64;

// ── Canvas setup ──────────────────────────────────────────────
function initCanvas() {
    canvas = document.getElementById("graph-canvas");
    ctx = canvas.getContext("2d");
    resizeCanvas();

    const container = document.getElementById("graph-container");
    new ResizeObserver(resizeCanvas).observe(container);

    const labelsToggle = document.getElementById("show-labels");
    showLabels = labelsToggle.checked;
    labelsToggle.addEventListener("change", () => {
        showLabels = labelsToggle.checked;
        draw();
    });

    // Zoom & pan
    zoomBehavior = d3.zoom()
        .scaleExtent([0.05, 10])
        .on("zoom", (event) => {
            transform = event.transform;
            draw();
        });

    d3.select(canvas).call(zoomBehavior);

    // Hover
    canvas.addEventListener("mousemove", (event) => {
        const [mx, my] = transformPoint(event.offsetX, event.offsetY);
        const found = findNode(mx, my);
        if (found !== hoveredNode) {
            hoveredNode = found;
            draw();
            if (found) {
                showTooltip(found, event);
            } else {
                hideTooltip();
            }
        } else if (found) {
            // Update tooltip position on move
            showTooltip(found, event);
        }
    });

    // Click — first click highlights neighbors, second click finds path
    canvas.addEventListener("click", (event) => {
        const [mx, my] = transformPoint(event.offsetX, event.offsetY);
        const found = findNode(mx, my);
        if (found) {
            if (selectedNode && selectedNode !== found.id) {
                findShortestPath(selectedNode, found.id);
            } else if (selectedNode === found.id) {
                resetHighlight();
            } else {
                selectedNode = found.id;
                highlightComponent(found.id);
            }
        } else {
            resetHighlight();
        }
    });

    // Drag with group drag
    let dragNode = null;
    let dragNeighbors = null;
    let dragStartPositions = null;

    const drag = d3.drag()
        .container(canvas)
        .subject((event) => {
            const [mx, my] = transformPoint(event.x, event.y);
            const node = findNode(mx, my);
            if (node) return { x: transform.applyX(node.x), y: transform.applyY(node.y), node };
            return null;
        })
        .on("start", (event) => {
            if (!event.subject) return;
            dragNode = event.subject.node;
            // Record start positions for group drag
            dragStartPositions = new Map();
            dragStartPositions.set(dragNode.id, { x: dragNode.x, y: dragNode.y });
            dragNeighbors = [];
            for (const neighborId of neighbors.get(dragNode.id)) {
                const neighbor = nodeById.get(neighborId);
                if (neighbor && !neighbor.hidden) {
                    dragNeighbors.push(neighbor);
                    dragStartPositions.set(neighbor.id, { x: neighbor.x, y: neighbor.y });
                }
            }
            dragNode.fx = dragNode.x;
            dragNode.fy = dragNode.y;
            if (simulation) simulation.alphaTarget(0.3).restart();
        })
        .on("drag", (event) => {
            if (!dragNode) return;
            const [gx, gy] = transformPoint(event.x, event.y);
            const startPos = dragStartPositions.get(dragNode.id);
            const dx = gx - startPos.x;
            const dy = gy - startPos.y;

            dragNode.fx = gx;
            dragNode.fy = gy;

            // Move neighbors by same delta
            for (const neighbor of dragNeighbors) {
                const nStart = dragStartPositions.get(neighbor.id);
                neighbor.fx = nStart.x + dx;
                neighbor.fy = nStart.y + dy;
            }
            draw();
        })
        .on("end", (event) => {
            if (!dragNode) return;
            dragNode.fx = null;
            dragNode.fy = null;
            for (const neighbor of dragNeighbors) {
                neighbor.fx = null;
                neighbor.fy = null;
            }
            dragNode = null;
            dragNeighbors = null;
            dragStartPositions = null;
            if (simulation) simulation.alphaTarget(0);
        });

    d3.select(canvas).call(drag);
}

function resizeCanvas() {
    const container = document.getElementById("graph-container");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = container.clientWidth + "px";
    canvas.style.height = container.clientHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
}

function transformPoint(sx, sy) {
    return [(sx - transform.x) / transform.k, (sy - transform.y) / transform.k];
}

function findNode(x, y) {
    // Search in reverse order (top-rendered nodes first)
    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.hidden) continue;
        const r = n.size / 2 + 2;
        const dx = n.x - x;
        const dy = n.y - y;
        if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
}

// ── Force simulation ──────────────────────────────────────────
let simulationRunning = true;

function initSimulation() {
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(edges).id((d) => d.id).distance(80).strength(0.3))
        .force("charge", d3.forceManyBody().strength(-200).distanceMax(300))
        .force("center", d3.forceCenter(0, 0).strength(0.05))
        .force("collision", d3.forceCollide().radius((d) => d.size / 2 + 2))
        .velocityDecay(0.4)
        .on("tick", draw)
        .on("end", () => zoomToFit(nodes.filter((n) => !n.hidden), { trimOutliers: true }));

    const btn = document.getElementById("layout-toggle");
    btn.classList.add("active");
    btn.textContent = "Stop";

    btn.addEventListener("click", () => {
        if (simulationRunning) {
            simulation.stop();
            simulationRunning = false;
            btn.classList.remove("active");
            btn.textContent = "Layout";
        } else {
            simulation.alpha(1).restart();
            simulationRunning = true;
            btn.classList.add("active");
            btn.textContent = "Stop";
        }
    });
}

// ── Draw ──────────────────────────────────────────────────────
// Zoom, hover, drag, image loads and simulation ticks all call draw(); render at most once per frame.
let drawPending = false;

function draw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => {
        drawPending = false;
        render();
    });
}

const EDGE_STYLES = {
    dimmed: { stroke: "rgba(30,30,50,0.15)", width: 0.5 },
    normal: { stroke: "rgba(83,52,131,0.5)", width: 1.5 },
    highlighted: { stroke: "#e94560", width: 3 },
};
const LABEL_MARGIN = 200; // labels extend to the right of their node, in graph units
let showLabels = true;

function render() {
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    const zoomLevel = transform.k;
    const dpr = window.devicePixelRatio || 1;

    // Visible area in graph coordinates; anything outside is skipped
    const [x0, y0] = transformPoint(0, 0);
    const [x1, y1] = transformPoint(w, h);
    const pad = 40;

    // Draw edges, batched into one path per style
    const batches = { dimmed: [], normal: [], highlighted: [] };
    for (const edge of edges) {
        if (edge.hidden || edge.source.hidden || edge.target.hidden) continue;
        const s = edge.source, t = edge.target;
        if (Math.max(s.x, t.x) < x0 - pad || Math.min(s.x, t.x) > x1 + pad ||
            Math.max(s.y, t.y) < y0 - pad || Math.min(s.y, t.y) > y1 + pad) continue;

        const isDimmed = highlightedEdges && !highlightedEdges[edge.index];
        const isHighlighted = highlightedEdges && highlightedEdges[edge.index];

        // If hover dimming (no highlight active, but hovered)
        const isHoverDimmed = hoveredNode && !highlightedNodes &&
            s.id !== hoveredNode.id && t.id !== hoveredNode.id;

        batches[isDimmed || isHoverDimmed ? "dimmed" : isHighlighted ? "highlighted" : "normal"].push(edge);
    }

    for (const [style, batch] of Object.entries(batches)) {
        if (!batch.length) continue;
        const { stroke, width } = EDGE_STYLES[style];
        ctx.strokeStyle = ctx.fillStyle = stroke;
        ctx.lineWidth = width;

        ctx.beginPath();
        for (const edge of batch) {
            ctx.moveTo(edge.source.x, edge.source.y);
            ctx.lineTo(edge.target.x, edge.target.y);
        }
        ctx.stroke();

        // Arrows
        if (zoomLevel > 0.3) {
            const arrowSize = 4 + width;
            ctx.beginPath();
            for (const edge of batch) {
                const dx = edge.target.x - edge.source.x;
                const dy = edge.target.y - edge.source.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len === 0) continue;
                const nx = dx / len;
                const ny = dy / len;
                const targetR = edge.target.size / 2;
                const ax = edge.target.x - nx * targetR;
                const ay = edge.target.y - ny * targetR;
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax - nx * arrowSize - ny * arrowSize * 0.4, ay - ny * arrowSize + nx * arrowSize * 0.4);
                ctx.lineTo(ax - nx * arrowSize + ny * arrowSize * 0.4, ay - ny * arrowSize - nx * arrowSize * 0.4);
                ctx.closePath();
            }
            ctx.fill();
        }
    }

    // Draw nodes
    let lastFont = null;
    for (const node of nodes) {
        if (node.hidden) continue;
        if (node.x < x0 - LABEL_MARGIN || node.x > x1 + pad || node.y < y0 - pad || node.y > y1 + pad) continue;

        const isDimmed = highlightedNodes && !highlightedNodes[node.id];
        const isHighlighted = highlightedNodes && highlightedNodes[node.id];
        const isHovered = hoveredNode && hoveredNode.id === node.id;

        // Hover dimming
        const isHoverDimmed = hoveredNode && !highlightedNodes &&
            node.id !== hoveredNode.id && !neighbors.get(hoveredNode.id).has(node.id);

        const r = node.size / 2;

        if (isDimmed || isHoverDimmed) {
            ctx.globalAlpha = 0.25;
        }

        // Node circle / image
        const cached = imageCache.get(node.id);
        if (cached && r * 2 * zoomLevel * dpr <= THUMB_SIZE) {
            ctx.drawImage(cached.thumb, node.x - r, node.y - r, r * 2, r * 2);
        } else if (cached) {
            // Zoomed in past the thumbnail's resolution: few nodes are on screen, clip the full image
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(cached.img, node.x - r, node.y - r, r * 2, r * 2);
            ctx.restore();
        } else {
            ctx.fillStyle = node.color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Highlight / hover border
        if (isHovered) {
            ctx.strokeStyle = "#e94560";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 2, 0, Math.PI * 2);
            ctx.stroke();
        } else if (isHighlighted) {
            ctx.strokeStyle = "#e94560";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 1, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;

        // Labels (only when zoomed in enough)
        if (showLabels && zoomLevel > 0.5 && !isDimmed && !isHoverDimmed) {
            const fontSize = isHovered ? 13 : 11;
            const font = isHovered ? "bold 13px monospace" : "11px monospace";
            if (font !== lastFont) ctx.font = lastFont = font; // setting ctx.font re-parses it; skip when unchanged
            const labelX = node.x + r + 3;
            const labelY = node.y + fontSize / 3;
            ctx.strokeStyle = "#0a0a1a";
            ctx.lineWidth = isHovered ? 3 : 2;
            ctx.lineJoin = "round";
            ctx.strokeText(node.id, labelX, labelY);
            ctx.fillStyle = isHovered ? "#fff" : "#ddd";
            ctx.fillText(node.id, labelX, labelY);
        }
    }

    ctx.restore();
}

// ── Highlight / zoom ──────────────────────────────────────────
function zoomToFit(fitNodes, { trimOutliers = false } = {}) {
    if (fitNodes.length === 0) return;
    const container = document.getElementById("graph-container");
    const padding = 60;

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
        const r = n.size / 2;
        if (n.x - r < minX) minX = n.x - r;
        if (n.y - r < minY) minY = n.y - r;
        if (n.x + r > maxX) maxX = n.x + r;
        if (n.y + r > maxY) maxY = n.y + r;
    }

    const bw = maxX - minX;
    const bh = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const scale = Math.min(
        (container.clientWidth - padding * 2) / (bw || 1),
        (container.clientHeight - padding * 2) / (bh || 1),
        6
    );

    const newTransform = d3.zoomIdentity
        .translate(container.clientWidth / 2, container.clientHeight / 2)
        .scale(scale)
        .translate(-cx, -cy);

    d3.select(canvas)
        .transition()
        .duration(400)
        .call(zoomBehavior.transform, newTransform);
}

export function highlightComponent(startNodeId) {
    if (!nodeById.has(startNodeId)) return;

    highlightedNodes = { [startNodeId]: true };
    highlightedEdges = {};

    for (const neighborId of neighbors.get(startNodeId)) {
        highlightedNodes[neighborId] = true;
    }
    for (const idx of edgesByNode.get(startNodeId)) {
        highlightedEdges[idx] = true;
    }

    selectedNode = startNodeId;
    draw();

    // Zoom to fit the node and its neighbors
    const fitNodes = [nodeById.get(startNodeId)];
    for (const neighborId of neighbors.get(startNodeId)) {
        fitNodes.push(nodeById.get(neighborId));
    }
    zoomToFit(fitNodes);

    setStatus(`${startNodeId} — click another node to find path`);
}

export function highlightPath(path) {
    highlightedNodes = {};
    highlightedEdges = {};
    path.forEach((n) => { highlightedNodes[n] = true; });

    for (let i = 0; i < path.length - 1; i++) {
        const srcId = path[i];
        const tgtId = path[i + 1];
        for (const idx of (edgesByNode.get(srcId) || [])) {
            const edge = edges[idx];
            if ((edge.source.id === srcId && edge.target.id === tgtId) ||
                (edge.source.id === tgtId && edge.target.id === srcId)) {
                highlightedEdges[idx] = true;
            }
        }
    }

    selectedNode = null;
    draw();

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
    draw();
}

export function zoomToNode(nodeKey) {
    const node = nodeById.get(nodeKey);
    if (!node) return;
    const container = document.getElementById("graph-container");
    const targetZoom = 4;
    const newTransform = d3.zoomIdentity
        .translate(container.clientWidth / 2, container.clientHeight / 2)
        .scale(targetZoom)
        .translate(-node.x, -node.y);

    d3.select(canvas)
        .transition()
        .duration(400)
        .call(zoomBehavior.transform, newTransform);
}

export function getVisibility() {
    return { highlightedNodes, highlightedEdges };
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

// Expose for sidebar to trigger redraw
export function requestDraw() { draw(); }
