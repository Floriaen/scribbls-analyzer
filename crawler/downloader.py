import os
import random
import re
import time

import requests

import config

SESSION = requests.Session()
SESSION.headers["User-Agent"] = config.USER_AGENT
_last_request = 0.0


class TooManyErrors(Exception):
    pass


def polite_get(url: str) -> requests.Response:
    """GET with the site's crawl delay between every request, backing off on errors.

    Returns 404 responses to the caller; raises on anything else that keeps failing.
    """
    global _last_request
    for attempt in range(config.MAX_RETRIES):
        wait = _last_request + config.REQUEST_DELAY + random.uniform(0, config.REQUEST_JITTER) - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()
        try:
            resp = SESSION.get(url, timeout=config.REQUEST_TIMEOUT)
            if resp.status_code == 404:
                return resp
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            if attempt == config.MAX_RETRIES - 1:
                raise
            backoff = config.REQUEST_DELAY * 2 ** (attempt + 1)
            retry_after = getattr(e.response, "headers", {}).get("Retry-After", "")
            if retry_after.isdigit():
                backoff = max(backoff, int(retry_after))
            print(f"    Retry {attempt + 1} in {backoff:.0f}s: {e}")
            time.sleep(backoff)


class ErrorBudget:
    """Stops the crawl when the site keeps failing, instead of hammering it."""

    def __init__(self):
        self.consecutive = 0

    def ok(self):
        self.consecutive = 0

    def failed(self):
        self.consecutive += 1
        if self.consecutive >= config.MAX_CONSECUTIVE_ERRORS:
            raise TooManyErrors(f"{self.consecutive} consecutive errors, stopping")


def download_all_images(db):
    budget = ErrorBudget()
    pending = db.get_undownloaded_drawings()
    if pending:
        print(f"\nDownloading {len(pending)} drawings...")
    for i, (drawing_id, name, image_url) in enumerate(pending, 1):
        safe_name = _sanitize_filename(name)
        local_path = os.path.join(config.DRAWINGS_DIR, f"{safe_name}.png")
        print(f"  [{i}/{len(pending)}] {name}")
        if _download_file(config.BASE_URL + image_url, local_path):
            db.mark_drawing_downloaded(drawing_id, local_path)
            budget.ok()
        else:
            db.mark_drawing_failed(drawing_id)
            budget.failed()

    pending_avatars = db.get_undownloaded_avatars()
    if pending_avatars:
        print(f"\nDownloading {len(pending_avatars)} avatars...")
    for i, (creator_id, username, number, avatar_url) in enumerate(pending_avatars, 1):
        safe_name = _sanitize_filename(f"{username}-{number}")
        local_path = os.path.join(config.AVATARS_DIR, f"{safe_name}.png")
        print(f"  [{i}/{len(pending_avatars)}] {username} #{number}")
        if _download_file(config.BASE_URL + avatar_url, local_path):
            db.mark_avatar_downloaded(creator_id, local_path)
            budget.ok()
        else:
            budget.failed()


def _download_file(url: str, local_path: str) -> bool:
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return True
    try:
        resp = polite_get(url)
    except requests.RequestException as e:
        print(f"    Failed: {e}")
        return False
    if resp.status_code == 404:
        print("    Failed: 404")
        return False
    with open(local_path, "wb") as f:
        f.write(resp.content)
    return True


def _sanitize_filename(name: str) -> str:
    # Replace characters that are problematic on filesystems
    return re.sub(r'[<>:"/\\|?*]', "_", name)
