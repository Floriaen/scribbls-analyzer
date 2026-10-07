import os

BASE_URL = "https://scribbls.com"
BROWSE_URL = f"{BASE_URL}/browse/mosthearted/"
OUTCOME_URL = f"{BASE_URL}/outcomes/"
TOTAL_PAGES = 132

# robots.txt asks for "Crawl-delay: 10"; applies to every request, images included
REQUEST_DELAY = 10.0
REQUEST_JITTER = 2.0
MAX_RETRIES = 3
REQUEST_TIMEOUT = 30
MAX_CONSECUTIVE_ERRORS = 5

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "scribbls.db")
DRAWINGS_DIR = os.path.join(BASE_DIR, "web", "public", "images", "drawings")
AVATARS_DIR = os.path.join(BASE_DIR, "web", "public", "images", "avatars")

USER_AGENT = "Hello Zach :D"