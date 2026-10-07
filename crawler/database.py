import os
import sqlite3
from datetime import datetime, timezone

from models import Creator, Drawing, Outcome

SCHEMA = """
CREATE TABLE IF NOT EXISTS drawings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    image_url   TEXT NOT NULL,
    local_path  TEXT,
    downloaded  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS creators (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL,
    number      INTEGER NOT NULL,
    avatar_url  TEXT,
    local_avatar TEXT,
    UNIQUE(username, number)
);

CREATE TABLE IF NOT EXISTS outcomes (
    id              INTEGER PRIMARY KEY,
    input_a_id      INTEGER NOT NULL REFERENCES drawings(id),
    input_b_id      INTEGER NOT NULL REFERENCES drawings(id),
    result_id       INTEGER NOT NULL REFERENCES drawings(id),
    creator_id      INTEGER NOT NULL REFERENCES creators(id),
    hearts          INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT,
    raw_created_text TEXT,
    browse_page     INTEGER,
    artist_id       INTEGER REFERENCES creators(id),
    drawn_at        TEXT,
    raw_drawn_text  TEXT
);

CREATE TABLE IF NOT EXISTS crawl_state (
    page_number     INTEGER PRIMARY KEY,
    status          TEXT NOT NULL DEFAULT 'pending',
    crawled_at      TEXT,
    error_message   TEXT
);

-- /outcomes/<name> pages fetched to find the recipe of drawings missing from browse
CREATE TABLE IF NOT EXISTS recipe_pages (
    name            TEXT PRIMARY KEY,
    status          TEXT NOT NULL,  -- done | missing (404) | error
    crawled_at      TEXT,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_outcomes_result ON outcomes(result_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_input_a ON outcomes(input_a_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_input_b ON outcomes(input_b_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_hearts ON outcomes(hearts DESC);
CREATE INDEX IF NOT EXISTS idx_drawings_downloaded ON drawings(downloaded);
"""


class Database:
    def __init__(self, db_path):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")

    def init_schema(self):
        self.conn.executescript(SCHEMA)
        # Databases created before artist/drawn date were tracked
        columns = {r[1] for r in self.conn.execute("PRAGMA table_info(outcomes)")}
        for col, decl in [("artist_id", "INTEGER REFERENCES creators(id)"),
                          ("drawn_at", "TEXT"), ("raw_drawn_text", "TEXT")]:
            if col not in columns:
                self.conn.execute(f"ALTER TABLE outcomes ADD COLUMN {col} {decl}")
        self.conn.commit()

    def reset_browse_pages(self):
        self.conn.execute("UPDATE crawl_state SET status = 'pending'")
        self.conn.commit()

    def get_drawings_without_recipe(self):
        """Drawings no known outcome produces, whose page hasn't been fetched yet."""
        return [r[0] for r in self.conn.execute("""
            SELECT d.name FROM drawings d
            WHERE NOT EXISTS (SELECT 1 FROM outcomes o WHERE o.result_id = d.id)
              AND NOT EXISTS (SELECT 1 FROM recipe_pages p WHERE p.name = d.name AND p.status != 'error')
            ORDER BY d.id
        """)]

    def mark_recipe_page(self, name, status, error_message=None):
        self.conn.execute(
            "INSERT OR REPLACE INTO recipe_pages (name, status, crawled_at, error_message) VALUES (?, ?, ?, ?)",
            (name, status, datetime.now(timezone.utc).isoformat(), error_message),
        )
        self.conn.commit()

    def seed_crawl_state(self, total_pages):
        for page in range(1, total_pages + 1):
            self.conn.execute(
                "INSERT OR IGNORE INTO crawl_state (page_number, status) VALUES (?, 'pending')",
                (page,),
            )
        self.conn.commit()

    def get_pending_pages(self, limit=None):
        query = "SELECT page_number FROM crawl_state WHERE status IN ('pending', 'error') ORDER BY page_number"
        if limit:
            query += f" LIMIT {limit}"
        rows = self.conn.execute(query).fetchall()
        return [r[0] for r in rows]

    def mark_page_done(self, page_number):
        self.conn.execute(
            "UPDATE crawl_state SET status = 'done', crawled_at = ? WHERE page_number = ?",
            (datetime.now(timezone.utc).isoformat(), page_number),
        )
        self.conn.commit()

    def mark_page_error(self, page_number, error_message):
        self.conn.execute(
            "UPDATE crawl_state SET status = 'error', error_message = ? WHERE page_number = ?",
            (error_message, page_number),
        )
        self.conn.commit()

    def get_or_create_drawing(self, drawing: Drawing) -> int:
        row = self.conn.execute(
            "SELECT id FROM drawings WHERE name = ?", (drawing.name,)
        ).fetchone()
        if row:
            return row[0]
        cursor = self.conn.execute(
            "INSERT INTO drawings (name, image_url) VALUES (?, ?)",
            (drawing.name, drawing.image_url),
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_or_create_creator(self, creator: Creator) -> int:
        row = self.conn.execute(
            "SELECT id FROM creators WHERE username = ? AND number = ?",
            (creator.username, creator.number),
        ).fetchone()
        if row:
            return row[0]
        cursor = self.conn.execute(
            "INSERT INTO creators (username, number, avatar_url) VALUES (?, ?, ?)",
            (creator.username, creator.number, creator.avatar_url),
        )
        self.conn.commit()
        return cursor.lastrowid

    def upsert_outcome(self, outcome: Outcome):
        a_id = self.get_or_create_drawing(outcome.input_a)
        b_id = self.get_or_create_drawing(outcome.input_b)
        r_id = self.get_or_create_drawing(outcome.result)
        c_id = self.get_or_create_creator(outcome.creator)
        artist_id = self.get_or_create_creator(outcome.artist) if outcome.artist else None
        self.conn.execute(
            """INSERT INTO outcomes (id, input_a_id, input_b_id, result_id,
                                    creator_id, hearts, created_at, raw_created_text, browse_page,
                                    artist_id, drawn_at, raw_drawn_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                hearts = excluded.hearts,
                creator_id = excluded.creator_id,
                created_at = excluded.created_at,
                raw_created_text = excluded.raw_created_text,
                artist_id = excluded.artist_id,
                drawn_at = excluded.drawn_at,
                raw_drawn_text = excluded.raw_drawn_text,
                browse_page = COALESCE(excluded.browse_page, outcomes.browse_page)""",
            (
                outcome.outcome_id, a_id, b_id, r_id, c_id,
                outcome.hearts, outcome.created_at, outcome.created_text,
                outcome.browse_page, artist_id, outcome.drawn_at, outcome.drawn_text,
            ),
        )
        self.conn.commit()

    def get_undownloaded_drawings(self):
        return self.conn.execute(
            "SELECT id, name, image_url FROM drawings WHERE downloaded = 0"
        ).fetchall()

    def get_undownloaded_avatars(self):
        return self.conn.execute(
            "SELECT id, username, number, avatar_url FROM creators WHERE avatar_url IS NOT NULL AND local_avatar IS NULL"
        ).fetchall()

    def mark_drawing_downloaded(self, drawing_id, local_path):
        self.conn.execute(
            "UPDATE drawings SET downloaded = 1, local_path = ? WHERE id = ?",
            (local_path, drawing_id),
        )
        self.conn.commit()

    def mark_drawing_failed(self, drawing_id):
        self.conn.execute(
            "UPDATE drawings SET downloaded = -1 WHERE id = ?", (drawing_id,)
        )
        self.conn.commit()

    def mark_avatar_downloaded(self, creator_id, local_path):
        self.conn.execute(
            "UPDATE creators SET local_avatar = ? WHERE id = ?",
            (local_path, creator_id),
        )
        self.conn.commit()

    def close(self):
        self.conn.close()
