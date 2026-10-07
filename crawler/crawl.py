import argparse
from urllib.parse import quote

import config
from database import Database
from downloader import ErrorBudget, TooManyErrors, download_all_images, polite_get
from scraper import parse_browse_page


def get_page_url(page_num: int) -> str:
    if page_num == 1:
        return config.BROWSE_URL
    return f"{config.BROWSE_URL}page{page_num}"


def fetch(url: str) -> str:
    resp = polite_get(url)
    resp.raise_for_status()  # 404 included
    return resp.text


def crawl_pages(db: Database, max_pages: int):
    db.seed_crawl_state(config.TOTAL_PAGES)
    pending = db.get_pending_pages(limit=max_pages)

    if not pending:
        print("All pages already crawled.")
        return

    print(f"Phase 1: Crawling {len(pending)} browse page(s)...\n")
    budget = ErrorBudget()
    for page_num in pending:
        try:
            outcomes = parse_browse_page(fetch(get_page_url(page_num)), page_number=page_num)
            for outcome in outcomes:
                db.upsert_outcome(outcome)
            db.mark_page_done(page_num)
            print(f"  Page {page_num}: {len(outcomes)} outcomes", flush=True)
            budget.ok()
        except Exception as e:
            db.mark_page_error(page_num, str(e))
            print(f"  Page {page_num}: ERROR - {e}", flush=True)
            budget.failed()


def crawl_recipes(db: Database, limit: int | None):
    """Fetch /outcomes/<name> for drawings with no known recipe.

    Browse only lists outcomes with 9+ hearts; every other recipe lives on its
    drawing's own page. New inputs found there are queued in turn, until none are left.
    """
    attempted = set()
    budget = ErrorBudget()
    print("\nPhase 2: Fetching recipes of drawings missing from browse...\n")
    while limit is None or len(attempted) < limit:
        pending = [n for n in db.get_drawings_without_recipe() if n not in attempted]
        if not pending:
            break
        name = pending[0]
        attempted.add(name)
        url = config.OUTCOME_URL + quote(name.replace(" ", "_"), safe="")
        try:
            resp = polite_get(url)
            if resp.status_code == 404:
                db.mark_recipe_page(name, "missing")
                print(f"  [{len(pending)} left] {name}: 404", flush=True)
                budget.ok()
                continue
            outcomes = parse_browse_page(resp.text)
            for outcome in outcomes:
                db.upsert_outcome(outcome)
            found = next((o for o in outcomes if o.result.name == name), None)
            db.mark_recipe_page(name, "done" if found else "nomatch")
            recipe = f"{found.input_a.name} + {found.input_b.name} ({found.hearts}♥)" if found else "no matching outcome"
            print(f"  [{len(pending)} left] {name} = {recipe}", flush=True)
            budget.ok()
        except Exception as e:
            db.mark_recipe_page(name, "error", str(e))
            print(f"  [{len(pending)} left] {name}: ERROR - {e}", flush=True)
            budget.failed()


def print_summary(db: Database):
    outcomes = db.conn.execute("SELECT COUNT(*) FROM outcomes").fetchone()[0]
    drawings = db.conn.execute("SELECT COUNT(*) FROM drawings").fetchone()[0]
    creators = db.conn.execute("SELECT COUNT(*) FROM creators").fetchone()[0]
    downloaded = db.conn.execute("SELECT COUNT(*) FROM drawings WHERE downloaded = 1").fetchone()[0]
    pages_done = db.conn.execute("SELECT COUNT(*) FROM crawl_state WHERE status = 'done'").fetchone()[0]
    recipe_pages = dict(db.conn.execute("SELECT status, COUNT(*) FROM recipe_pages GROUP BY status").fetchall())
    no_recipe = db.conn.execute(
        "SELECT COUNT(*) FROM drawings d WHERE NOT EXISTS (SELECT 1 FROM outcomes o WHERE o.result_id = d.id)"
    ).fetchone()[0]

    print(f"\n--- Summary ---")
    print(f"  Pages crawled: {pages_done}/{config.TOTAL_PAGES}")
    print(f"  Recipe pages:  {recipe_pages or 'none'}")
    print(f"  No recipe:     {no_recipe} drawings")
    print(f"  Outcomes:      {outcomes}")
    print(f"  Drawings:      {drawings} ({downloaded} downloaded)")
    print(f"  Creators:      {creators}")


def main():
    parser = argparse.ArgumentParser(description="Crawl scribbls.com")
    parser.add_argument("--pages", type=int, default=1, help="Number of pages to crawl (default: 1, use 0 for all)")
    parser.add_argument("--no-images", action="store_true", help="Skip image downloads")
    parser.add_argument("--refresh", action="store_true", help="Re-crawl browse pages already done")
    parser.add_argument("--recipes", type=int, metavar="N",
                        help="Fetch recipe pages of drawings missing from browse (0 for all)")
    args = parser.parse_args()

    max_pages = args.pages if args.pages > 0 else None

    db = Database(config.DB_PATH)
    db.init_schema()
    if args.refresh:
        db.reset_browse_pages()

    try:
        crawl_pages(db, max_pages)

        if args.recipes is not None:
            crawl_recipes(db, args.recipes or None)

        if not args.no_images:
            download_all_images(db)
    except TooManyErrors as e:
        print(f"\nStopped: {e}. Re-run later to resume.")
    finally:
        print_summary(db)
        db.close()


if __name__ == "__main__":
    main()
