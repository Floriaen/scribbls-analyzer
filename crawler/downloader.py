import os
import re
import time

import requests

import config


def download_all_images(db):
    pending = db.get_undownloaded_drawings()
    if pending:
        print(f"\nPhase 2: Downloading {len(pending)} drawings...")
    for i, (drawing_id, name, image_url) in enumerate(pending, 1):
        safe_name = _sanitize_filename(name)
        local_path = os.path.join(config.DRAWINGS_DIR, f"{safe_name}.png")
        full_url = config.BASE_URL + image_url
        print(f"  [{i}/{len(pending)}] {name}")
        if _download_file(full_url, local_path):
            db.mark_drawing_downloaded(drawing_id, local_path)
        else:
            db.mark_drawing_failed(drawing_id)
        time.sleep(config.IMAGE_DELAY)

    pending_avatars = db.get_undownloaded_avatars()
    if pending_avatars:
        print(f"\nPhase 3: Downloading {len(pending_avatars)} avatars...")
    for i, (creator_id, username, number, avatar_url) in enumerate(pending_avatars, 1):
        safe_name = _sanitize_filename(f"{username}-{number}")
        local_path = os.path.join(config.AVATARS_DIR, f"{safe_name}.png")
        full_url = config.BASE_URL + avatar_url
        print(f"  [{i}/{len(pending_avatars)}] {username} #{number}")
        if _download_file(full_url, local_path):
            db.mark_avatar_downloaded(creator_id, local_path)
        time.sleep(config.IMAGE_DELAY)


def _download_file(url: str, local_path: str) -> bool:
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return True

    session = requests.Session()
    session.headers["User-Agent"] = config.USER_AGENT

    for attempt in range(config.MAX_RETRIES):
        try:
            resp = session.get(url, timeout=config.REQUEST_TIMEOUT)
            resp.raise_for_status()
            with open(local_path, "wb") as f:
                f.write(resp.content)
            return True
        except requests.RequestException as e:
            if attempt < config.MAX_RETRIES - 1:
                wait = config.RETRY_BACKOFF ** attempt
                print(f"    Retry {attempt + 1} in {wait}s: {e}")
                time.sleep(wait)
            else:
                print(f"    Failed: {e}")
    return False


def _sanitize_filename(name: str) -> str:
    # Replace characters that are problematic on filesystems
    return re.sub(r'[<>:"/\\|?*]', "_", name)
