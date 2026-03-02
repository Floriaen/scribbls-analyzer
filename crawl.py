import argparse
import time

import requests

import config
from database import Database
from downloader import download_all_images
from scraper import parse_browse_page


def get_page_url(page_num: int) -> str:
    if page_num == 1:
        return config.BROWSE_URL
    return f"{config.BROWSE_URL}page{page_num}"


def fetch(url: str) -> str:
    session = requests.Session()
    session.headers["User-Agent"] = config.USER_AGENT

    for attempt in range(config.MAX_RETRIES):
        try:
            resp = session.get(url, timeout=config.REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as e:
            if attempt < config.MAX_RETRIES - 1:
                wait = config.RETRY_BACKOFF ** attempt
                print(f"    Retry {attempt + 1} in {wait}s: {e}")
                time.sleep(wait)
            else:
                raise


def crawl_pages(db: Database, max_pages: int):
    db.seed_crawl_state(config.TOTAL_PAGES)
    pending = db.get_pending_pages(limit=max_pages)

    if not pending:
        print("All pages already crawled.")
        return

    print(f"Phase 1: Crawling {len(pending)} page(s)...\n")
    for page_num in pending:
        url = get_page_url(page_num)
        try:
            html = fetch(url)
            outcomes = parse_browse_page(html, page_number=page_num)
            for outcome in outcomes:
                db.upsert_outcome(outcome)
            db.mark_page_done(page_num)
            print(f"  Page {page_num}: {len(outcomes)} outcomes")
        except Exception as e:
            db.mark_page_error(page_num, str(e))
            print(f"  Page {page_num}: ERROR - {e}")

        if page_num != pending[-1]:
            time.sleep(config.REQUEST_DELAY)


def print_summary(db: Database):
    outcomes = db.conn.execute("SELECT COUNT(*) FROM outcomes").fetchone()[0]
    drawings = db.conn.execute("SELECT COUNT(*) FROM drawings").fetchone()[0]
    creators = db.conn.execute("SELECT COUNT(*) FROM creators").fetchone()[0]
    downloaded = db.conn.execute("SELECT COUNT(*) FROM drawings WHERE downloaded = 1").fetchone()[0]
    pages_done = db.conn.execute("SELECT COUNT(*) FROM crawl_state WHERE status = 'done'").fetchone()[0]

    print(f"\n--- Summary ---")
    print(f"  Pages crawled: {pages_done}/{config.TOTAL_PAGES}")
    print(f"  Outcomes:      {outcomes}")
    print(f"  Drawings:      {drawings} ({downloaded} downloaded)")
    print(f"  Creators:      {creators}")


def main():
    parser = argparse.ArgumentParser(description="Crawl scribbls.com")
    parser.add_argument("--pages", type=int, default=1, help="Number of pages to crawl (default: 1, use 0 for all)")
    parser.add_argument("--no-images", action="store_true", help="Skip image downloads")
    args = parser.parse_args()

    max_pages = args.pages if args.pages > 0 else None

    db = Database(config.DB_PATH)
    db.init_schema()

    try:
        crawl_pages(db, max_pages)

        if not args.no_images:
            download_all_images(db)

        print_summary(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
