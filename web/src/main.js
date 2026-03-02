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
    }));

    nodes.forEach((n) => {
        nodeById.set(n.id, n);
        neighbors.set(n.id, new Set());
        edgesByNode.set(n.id, new Set());
    });

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

        // Track max hearts on the result node
        const target = nodeById.get(e.target);
        if (e.hearts > target.hearts) target.hearts = e.hearts;
    });

    // Recompute node size based on hearts
    nodes.forEach((n) => {
        const ratio = n.hearts / maxHearts;
        n.size = 6 + ratio * 28;
    });

    // Preload images
    nodes.forEach((n) => {
        if (n.image) {
            const img = new Image();
            img.src = n.image;
            img.onload = () => { imageCache.set(n.id, img); };
        }
    });
}

// ── Canvas setup ──────────────────────────────────────────────
function initCanvas() {
    canvas = document.getElementById("graph-canvas");
    ctx = canvas.getContext("2d");
    resizeCanvas();

    const container = document.getElementById("graph-container");
    new ResizeObserver(resizeCanvas).observe(container);

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
function draw() {
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    const zoomLevel = transform.k;

    // Draw edges
    for (const edge of edges) {
        if (edge.hidden || edge.source.hidden || edge.target.hidden) continue;

        const isDimmed = highlightedEdges && !highlightedEdges[edge.index];
        const isHighlighted = highlightedEdges && highlightedEdges[edge.index];

        // If hover dimming (no highlight active, but hovered)
        const isHoverDimmed = hoveredNode && !highlightedNodes &&
            edge.source.id !== hoveredNode.id && edge.target.id !== hoveredNode.id;

        if (isDimmed || isHoverDimmed) {
            ctx.strokeStyle = "rgba(30,30,50,0.15)";
            ctx.lineWidth = 0.5;
        } else {
            ctx.strokeStyle = isHighlighted ? "#e94560" : "rgba(83,52,131,0.5)";
            ctx.lineWidth = isHighlighted ? 3 : 1.5;
        }

        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
        ctx.stroke();

        // Arrow
        if (zoomLevel > 0.3) {
            const dx = edge.target.x - edge.source.x;
            const dy = edge.target.y - edge.source.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                const nx = dx / len;
                const ny = dy / len;
                const targetR = edge.target.size / 2;
                const ax = edge.target.x - nx * targetR;
                const ay = edge.target.y - ny * targetR;
                const arrowSize = 4 + ctx.lineWidth;
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax - nx * arrowSize - ny * arrowSize * 0.4, ay - ny * arrowSize + nx * arrowSize * 0.4);
                ctx.lineTo(ax - nx * arrowSize + ny * arrowSize * 0.4, ay - ny * arrowSize - nx * arrowSize * 0.4);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // Draw nodes
    for (const node of nodes) {
        if (node.hidden) continue;

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
        const img = imageCache.get(node.id);
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, node.x - r, node.y - r, r * 2, r * 2);
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
        if (zoomLevel > 0.5 && !isDimmed && !isHoverDimmed) {
            const fontSize = isHovered ? 13 : 11;
            ctx.font = `${isHovered ? "bold " : ""}${fontSize}px monospace`;
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
function showTooltip(node, event) {
    const tooltip = document.getElementById("tooltip");
    const img = document.getElementById("tooltip-img");

    document.getElementById("tooltip-name").textContent = node.id;
    const info = [];
    if (node.nodeType === "ingredient") info.push("Base ingredient");
    if (node.hearts > 0) info.push(`${node.hearts} hearts`);
    document.getElementById("tooltip-info").textContent = info.join(" — ");

    if (node.image) {
        img.src = node.image;
        img.style.display = "block";
    } else {
        img.style.display = "none";
    }

    tooltip.style.display = "block";
    const x = event.clientX + 15;
    const y = event.clientY + 15;
    tooltip.style.left = (x + 210 > window.innerWidth ? x - 230 : x) + "px";
    tooltip.style.top = (y + 120 > window.innerHeight ? y - 130 : y) + "px";
}

function hideTooltip() {
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
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
