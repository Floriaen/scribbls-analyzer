import os

BASE_URL = "http://scribbls.com"
BROWSE_URL = f"{BASE_URL}/browse/mosthearted/"
TOTAL_PAGES = 132

REQUEST_DELAY = 1.0
IMAGE_DELAY = 0.2
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0
REQUEST_TIMEOUT = 30

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "scribbls.db")
DRAWINGS_DIR = os.path.join(BASE_DIR, "web", "public", "images", "drawings")
AVATARS_DIR = os.path.join(BASE_DIR, "web", "public", "images", "avatars")

USER_AGENT = "Hello Zach :D"