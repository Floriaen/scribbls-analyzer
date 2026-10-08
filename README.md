# Scribbls Crawler

Archive tool for [scribbls.com](http://scribbls.com), a collaborative drawing community where users combined two drawings to create an "outcome" (e.g. God + vodka = platypus). The site is no longer active.

## How it works

The crawler scrapes the "Most Hearted" browse pages at `http://scribbls.com/browse/mosthearted/` (132 pages, 10 outcomes each, ~1,320 total). For each outcome it extracts:

- **The combination**: Drawing A + Drawing B = Result Drawing
- **Images**: PNG files for all three drawings
- **Metadata**: creator username, heart count, creation date

Everything is stored in a SQLite database (`data/scribbls.db`) with foreign keys linking outcomes to deduplicated drawings and creators. Images go to `web/public/images/`. The crawl is resumable — interrupted runs pick up where they left off.

The crawl is a one-time job: the site is read-only, and the full archive (database, images, graph data) is committed to this repo. You only need the crawler to rebuild it from scratch.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r crawler/requirements.txt
```

## Commands

### Crawl

```bash
# Crawl 1 page (default, good for testing)
python3 crawler/crawl.py

# Crawl N pages (resumes from last completed page)
python3 crawler/crawl.py --pages 20

# Crawl all 132 pages
python3 crawler/crawl.py --pages 0

# Crawl pages only, skip image downloads
python3 crawler/crawl.py --pages 20 --no-images

# Re-crawl browse pages already done (e.g. after a parser fix)
python3 crawler/crawl.py --refresh --pages 0

# Fetch the recipe of every drawing missing from browse, following new inputs (0 for all)
python3 crawler/crawl.py --recipes 0
```

Browse only lists outcomes with 9+ hearts. Every other recipe is on the drawing's own
page (`/outcomes/<Name>`), which `--recipes` fetches.

The crawler waits 10s between every request (robots.txt `Crawl-delay`), backs off on
errors and stops after 5 in a row. Progress is stored in the database, so re-running
resumes where it stopped.

### Query the database

```bash
# All outcomes as "A + B = C"
sqlite3 -header -column data/scribbls.db "
  SELECT d1.name AS input_a, d2.name AS input_b, d3.name AS result, o.hearts
  FROM outcomes o
  JOIN drawings d1 ON o.input_a_id = d1.id
  JOIN drawings d2 ON o.input_b_id = d2.id
  JOIN drawings d3 ON o.result_id = d3.id
  ORDER BY o.hearts DESC;
"

# Check crawl progress
sqlite3 data/scribbls.db "SELECT status, COUNT(*) FROM crawl_state GROUP BY status;"
```

## Database schema

| Table | Description |
|-------|-------------|
| `drawings` | Unique drawings (name, image URL, download status) |
| `creators` | Users (username, number, avatar) |
| `outcomes` | Combinations: input_a + input_b = result, with hearts and date |
| `crawl_state` | Tracks which pages have been crawled for resume support |

## Web — Graph Explorer

An interactive graph of the drawing combinations, rendered with [sigma.js](https://www.sigmajs.org/) (WebGL). Nodes are drawings, edges are combinations. Node positions come from a d3-force layout computed ahead of time, so the graph opens already laid out.

### Prerequisites

- Node.js (v18+)

### Setup

```bash
cd web
npm install
```

### Regenerate the graph data

`web/public/data.json` is already committed. To rebuild it from the database, run from the project root:

```bash
python3 crawler/export.py
cd web && npm run layout
```

`export.py` writes `web/public/data.json` with nodes, edges, chains, and outcome metadata.
`npm run layout` then runs the force layout once (~20s) and saves the final node positions
into it, so the page opens on a settled graph.

### Run the dev server

```bash
cd web
npm run dev
```

The browser opens automatically. Use scroll to zoom, drag to pan, and click nodes to explore combinations.

### Build for production

```bash
cd web
npm run build    # outputs to web/dist/
npm run preview  # preview the production build locally
```

### Features

- **Search** — find drawings by name, results sorted by connectivity
- **Filters** — filter by heart count or node type (ingredients, bridges, dead ends)
- **Pathfinding** — click two nodes to find the shortest chain between them
- **Top chains** — longest combination chains ranked by average hearts
- **Top outcomes** — the 50 most-hearted combinations with creator info

## Project structure

```
├── crawler/
│   ├── crawl.py          # Main entry point
│   ├── scraper.py        # HTML parsing with BeautifulSoup
│   ├── database.py       # SQLite schema and helpers
│   ├── downloader.py     # Image download with retries
│   ├── models.py         # Data classes (Outcome, Drawing, Creator)
│   ├── config.py         # Constants (URLs, delays, paths)
│   ├── export.py         # JSON export for web visualization
│   └── requirements.txt
├── data/
│   └── scribbls.db   # SQLite database
└── web/
    ├── index.html    # Entry point
    ├── public/       # Static files, served as-is and copied to dist/
    │   ├── data.json # Graph data (generated by crawler/export.py)
    │   └── images/
    │       ├── drawings/ # Drawing PNGs
    │       └── avatars/  # Creator avatar PNGs
    ├── src/
    │   ├── main.js   # Sigma rendering, highlighting, pathfinding, tooltip
    │   ├── forces.js # Force layout used by bake-layout.js, node sizes
    │   ├── sidebar.js# Search, filters, lists
    │   └── style.css # Dark theme styling
    ├── bake-layout.js # Bakes node positions into data.json (npm run layout)
    └── vite.config.js
```
