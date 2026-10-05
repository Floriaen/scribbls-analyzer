import json
import os
import sqlite3

import networkx as nx

import config


def load_graph(db_path: str) -> nx.DiGraph:
    conn = sqlite3.connect(db_path)
    G = nx.DiGraph()

    for row in conn.execute("SELECT id, name, local_path FROM drawings"):
        drawing_id, name, local_path = row
        G.add_node(name, title=name, image=local_path)

    for row in conn.execute("""
        SELECT d1.name, d2.name, d3.name, o.hearts
        FROM outcomes o
        JOIN drawings d1 ON o.input_a_id = d1.id
        JOIN drawings d2 ON o.input_b_id = d2.id
        JOIN drawings d3 ON o.result_id = d3.id
    """):
        a, b, result, hearts = row
        G.add_edge(a, result, label=f"+ {b}", weight=hearts)
        G.add_edge(b, result, label=f"+ {a}", weight=hearts)

    conn.close()
    return G


def compute_chains(G: nx.DiGraph, top_n=20, max_depth=10):
    sources = [n for n in G.nodes() if G.out_degree(n) > 0]
    targets = [n for n in G.nodes() if G.out_degree(n) == 0 and G.in_degree(n) > 0]

    best_chains = []
    for source in sources:
        for target in targets:
            try:
                for path in nx.all_simple_paths(G, source, target, cutoff=max_depth):
                    if len(path) < 3:
                        continue
                    total_hearts = 0
                    steps = 0
                    for i in range(len(path) - 1):
                        edge_data = G.get_edge_data(path[i], path[i + 1])
                        if edge_data:
                            total_hearts += edge_data.get("weight", 0)
                            steps += 1
                    if steps > 0:
                        avg = total_hearts / steps
                        best_chains.append((avg, steps, path))
            except nx.NetworkXError:
                pass

    best_chains.sort(key=lambda x: (-x[0], -x[1]))
    return best_chains[:top_n]


def export_data(db_path: str, output_path: str):
    conn = sqlite3.connect(db_path)
    G = load_graph(db_path)

    # Pre-compute layout
    print("Computing layout...")
    pos = nx.spring_layout(G, k=0.5, iterations=50, seed=42)

    # Nodes
    nodes = []
    for name, data in G.nodes(data=True):
        degree = G.degree(name)
        in_deg = G.in_degree(name)
        out_deg = G.out_degree(name)
        image = data.get("image")
        # Make image path relative to web/public/
        if image:
            image = "images/drawings/" + os.path.basename(image)
        x, y = pos.get(name, (0, 0))
        nodes.append({
            "key": name,
            "image": image,
            "degree": degree,
            "inDegree": in_deg,
            "outDegree": out_deg,
            "x": round(float(x) * 1000, 2),
            "y": round(float(y) * 1000, 2),
        })

    # Edges
    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "hearts": data.get("weight", 0),
            "label": data.get("label", ""),
        })

    # Outcomes
    outcomes = []
    for row in conn.execute("""
        SELECT o.id, d1.name, d2.name, d3.name, o.hearts,
               c.username || ' #' || c.number, o.created_at
        FROM outcomes o
        JOIN drawings d1 ON o.input_a_id = d1.id
        JOIN drawings d2 ON o.input_b_id = d2.id
        JOIN drawings d3 ON o.result_id = d3.id
        JOIN creators c ON o.creator_id = c.id
        ORDER BY o.hearts DESC
    """):
        outcomes.append({
            "id": row[0], "inputA": row[1], "inputB": row[2],
            "result": row[3], "hearts": row[4],
            "creator": row[5], "date": row[6],
        })

    # Chains
    print("Computing chains...")
    raw_chains = compute_chains(G, top_n=30, max_depth=10)
    chains = [{"avg": round(avg, 1), "steps": steps, "path": list(path)}
              for avg, steps, path in raw_chains]
    print(f"  Found {len(chains)} chains")

    # Stats
    pages_done = conn.execute("SELECT COUNT(*) FROM crawl_state WHERE status = 'done'").fetchone()[0]
    stats = {
        "totalOutcomes": len(outcomes),
        "totalDrawings": len(nodes),
        "totalCreators": conn.execute("SELECT COUNT(*) FROM creators").fetchone()[0],
        "pagesCrawled": pages_done,
        "totalPages": config.TOTAL_PAGES,
        "maxHearts": max((e["hearts"] for e in edges), default=0),
    }

    conn.close()

    data = {
        "nodes": nodes,
        "edges": edges,
        "outcomes": outcomes,
        "chains": chains,
        "stats": stats,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(data, f)

    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"Exported to {output_path} ({size_mb:.1f} MB)")
    print(f"  Nodes: {len(nodes)}, Edges: {len(edges)}, Outcomes: {len(outcomes)}")


if __name__ == "__main__":
    output = os.path.join(config.BASE_DIR, "web", "public", "data.json")
    export_data(config.DB_PATH, output)
