// ── Sidebar UI ────────────────────────────────────────────────

export function buildUI(nodes, edges, nodeById, data, actions) {
    buildStats(data.stats, nodes, edges);
    buildSearch(nodes, actions);
    buildFilters(nodes, edges, data, actions);
    buildChains(data.chains, actions);
    buildOutcomes(data.outcomes, nodeById, actions);
    buildMostUsed(nodes, nodeById, actions);
    initSidebarToggle();
}

// ── Stats ─────────────────────────────────────────────────────
function buildStats(stats, nodes, edges) {
    let ingredients = 0, deadEnds = 0, bridges = 0;
    const heartValues = [];
    for (const n of nodes) {
        if (n.nodeType === "ingredient") ingredients++;
        else if (n.nodeType === "deadend") deadEnds++;
        else if (n.nodeType === "bridge") bridges++;
        if (n.hearts > 0) heartValues.push(n.hearts);
    }
    const totalHearts = heartValues.reduce((s, h) => s + h, 0);
    const avgHearts = heartValues.length > 0 ? (totalHearts / heartValues.length).toFixed(1) : 0;
    const minHearts = heartValues.length > 0 ? Math.min(...heartValues) : 0;
    const maxHearts = heartValues.length > 0 ? Math.max(...heartValues) : 0;

    const sections = [
        {
            title: "Graph",
            items: [
                { label: "Drawings", value: stats.totalDrawings },
                { label: "Combinations", value: stats.totalOutcomes },
                { label: "Edges", value: edges.length },
                { label: "Creators", value: stats.totalCreators },
            ],
        },
        {
            title: "Node types",
            items: [
                { label: "Ingredients", value: ingredients },
                { label: "Bridges", value: bridges },
                { label: "Dead ends", value: deadEnds },
            ],
        },
        {
            title: "Hearts",
            items: [
                { label: "With hearts", value: heartValues.length },
                { label: "Total", value: totalHearts.toLocaleString() },
                { label: "Avg", value: avgHearts },
                { label: "Min / Max", value: `${minHearts} / ${maxHearts}` },
            ],
        },
    ];
    document.getElementById("stats-content").innerHTML = sections
        .map((section) =>
            `<div class="stats-section">
                <div class="stats-section-title">${section.title}</div>
                <div class="stats-grid">${section.items
                    .map((item) =>
                        `<div class="stat-item">
                            <div class="stat-value">${item.value}</div>
                            <div class="stat-label">${item.label}</div>
                        </div>`
                    ).join("")}
                </div>
            </div>`
        )
        .join("");
}

// ── Search ────────────────────────────────────────────────────
function buildSearch(nodes, actions) {
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");
    let debounceTimer = null;

    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = input.value.trim().toLowerCase();
            if (query.length < 2) {
                results.innerHTML = "";
                return;
            }

            const matches = [];
            for (const node of nodes) {
                if (node.id.toLowerCase().includes(query)) {
                    matches.push({ key: node.id, degree: node.degree, image: node.image });
                }
            }

            matches.sort((a, b) => b.degree - a.degree);
            const top = matches.slice(0, 20);

            results.innerHTML = top.length
                ? top.map((m) =>
                    `<div class="search-result" data-node="${esc(m.key)}">
                        ${m.image ? `<img src="${esc(m.image)}" alt="" onerror="this.style.display='none'">` : ""}
                        <span class="sr-name">${escHtml(m.key)}</span>
                        <span class="sr-degree">${m.degree}</span>
                    </div>`
                ).join("")
                : `<div style="padding:6px;color:#666;font-size:12px;">No matches</div>`;
        }, 150);
    });

    results.addEventListener("click", (e) => {
        const item = e.target.closest(".search-result");
        if (!item) return;
        const nodeKey = item.dataset.node;
        actions.highlightComponent(nodeKey);
        input.value = nodeKey;
        results.innerHTML = "";
    });
}

// ── Filters ───────────────────────────────────────────────────
function buildFilters(nodes, edges, data, actions) {
    const heartsSlider = document.getElementById("hearts-filter");
    const heartsValue = document.getElementById("hearts-value");
    heartsSlider.max = data.stats.maxHearts;

    const apply = () => {
        const minHearts = parseInt(heartsSlider.value, 10);
        const showIngredients = document.getElementById("filter-ingredients").checked;
        const showDeadends = document.getElementById("filter-deadends").checked;
        const showBridges = document.getElementById("filter-bridges").checked;

        for (const node of nodes) {
            const t = node.nodeType;
            node.hidden =
                (t === "ingredient" && !showIngredients) ||
                (t === "deadend" && !showDeadends) ||
                (t === "bridge" && !showBridges) ||
                (minHearts > 0 && node.hearts < minHearts);
        }

        for (const edge of edges) {
            edge.hidden = edge.source.hidden || edge.target.hidden;
        }

        actions.requestDraw();

        let visNodes = 0, visEdges = 0;
        for (const n of nodes) { if (!n.hidden) visNodes++; }
        for (const e of edges) { if (!e.hidden) visEdges++; }
        document.getElementById("status-text").textContent =
            `Showing ${visNodes} nodes, ${visEdges} edges`;
    };

    heartsSlider.addEventListener("input", () => {
        heartsValue.textContent = heartsSlider.value;
        apply();
    });
    document.getElementById("filter-ingredients").addEventListener("change", apply);
    document.getElementById("filter-deadends").addEventListener("change", apply);
    document.getElementById("filter-bridges").addEventListener("change", apply);

}

// ── Chains ────────────────────────────────────────────────────
function buildChains(chains, actions) {
    const list = document.getElementById("chains-list");
    document.getElementById("chains-count").textContent = chains.length;

    list.innerHTML = chains
        .map((chain, i) =>
            `<div class="chain-item" data-index="${i}">
                <span class="chain-avg">#${i + 1} avg ${chain.avg}</span>
                <span class="chain-steps">(${chain.steps} steps)</span>
                <div class="chain-path">${chain.path.map(escHtml).join(" &rarr; ")}</div>
            </div>`
        )
        .join("");

    list.addEventListener("click", (e) => {
        const item = e.target.closest(".chain-item");
        if (!item) return;
        const chain = chains[parseInt(item.dataset.index, 10)];

        document.querySelectorAll(".chain-item.active").forEach((el) => el.classList.remove("active"));
        item.classList.add("active");

        actions.highlightPath(chain.path);
    });
}

// ── Outcomes ──────────────────────────────────────────────────
function buildOutcomes(outcomes, nodeById, actions) {
    const list = document.getElementById("outcomes-list");
    const top = outcomes.slice(0, 50);

    list.innerHTML = top
        .map((o) =>
            `<div class="outcome-item" data-result="${esc(o.result)}">
                <div class="outcome-formula">
                    ${escHtml(o.inputA)} <span class="outcome-plus">+</span>
                    ${escHtml(o.inputB)} <span class="outcome-equals">=</span>
                    <strong>${escHtml(o.result)}</strong>
                </div>
                <div class="outcome-hearts">&hearts; ${o.hearts}</div>
                <div class="outcome-meta">${escHtml(o.creator)}</div>
            </div>`
        )
        .join("");

    list.addEventListener("click", (e) => {
        const item = e.target.closest(".outcome-item");
        if (!item) return;
        const result = item.dataset.result;
        if (nodeById.has(result)) {
            actions.highlightComponent(result);
        }
    });
}

// ── Most used in combinations ─────────────────────────────────
function buildMostUsed(nodes, nodeById, actions) {
    const list = document.getElementById("most-used-list");
    const top = nodes.filter((n) => n.usedIn > 0).sort((a, b) => b.usedIn - a.usedIn).slice(0, 50);

    list.innerHTML = top
        .map((n, i) =>
            `<div class="outcome-item used-item" data-name="${esc(n.id)}">
                <span class="used-rank">${i + 1}</span>
                ${n.image ? `<img src="${esc(n.image)}" alt="" onerror="this.style.visibility='hidden'">` : "<span class=\"used-img\"></span>"}
                <strong class="used-name">${escHtml(n.id)}</strong>
                <span class="used-count">${n.usedIn}×</span>
            </div>`
        )
        .join("");

    list.addEventListener("click", (e) => {
        const item = e.target.closest(".used-item");
        if (!item || !nodeById.has(item.dataset.name)) return;
        actions.highlightComponent(item.dataset.name);
    });
}

// ── Sidebar toggle ────────────────────────────────────────────
function initSidebarToggle() {
    const sidebar = document.getElementById("sidebar");
    const container = document.getElementById("graph-container");
    const statusBar = document.getElementById("status-bar");
    const toggleBtn = document.getElementById("sidebar-toggle");
    const openBtn = document.getElementById("sidebar-open");

    toggleBtn.addEventListener("click", () => {
        sidebar.classList.add("collapsed");
        container.classList.add("full-width");
        statusBar.classList.add("full-width");
        openBtn.style.display = "block";
    });

    openBtn.addEventListener("click", () => {
        sidebar.classList.remove("collapsed");
        container.classList.remove("full-width");
        statusBar.classList.remove("full-width");
        openBtn.style.display = "none";
    });

    // Collapsible panels
    for (const toggle of document.querySelectorAll(".panel-toggle")) {
        toggle.addEventListener("click", () => {
            toggle.closest(".panel").classList.toggle("collapsed");
        });
    }
}

// ── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function esc(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
