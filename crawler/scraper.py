import re
from datetime import datetime

from bs4 import BeautifulSoup

from models import Creator, Drawing, Outcome


def parse_browse_page(html: str, page_number: int = None) -> list[Outcome]:
    soup = BeautifulSoup(html, "lxml")
    outcomes = []

    for row in soup.find_all("div", class_="outcomeRow"):
        try:
            outcome = _parse_outcome_row(row, page_number)
            if outcome:
                outcomes.append(outcome)
        except Exception as e:
            print(f"  Warning: failed to parse an outcomeRow: {e}")

    return outcomes


def _parse_outcome_row(row, page_number) -> Outcome | None:
    # Extract the three drawing boxes
    dboxes = row.find_all("div", class_="dBox")
    if len(dboxes) < 3:
        return None

    input_a = _parse_drawing(dboxes[0])
    input_b = _parse_drawing(dboxes[1])
    result = _parse_drawing(dboxes[2])

    # Outcome ID from the result image's id attribute: "showoutcome1449" -> 1449
    result_img = dboxes[2].find("img", class_="drawing")
    img_id = result_img.get("id", "") if result_img else ""
    match = re.search(r"showoutcome(\d+)", img_id)
    if not match:
        # Fallback: try favCount
        fav_li = row.find("li", class_="fav")
        if fav_li and fav_li.get("id"):
            match = re.search(r"favCount(\d+)", fav_li["id"])
    if not match:
        return None
    outcome_id = int(match.group(1))

    # Hearts
    hearts = 0
    fav_strong = row.select_one("li.fav strong")
    if fav_strong:
        hearts = int(fav_strong.get_text(strip=True))

    # Creator and date from p.created
    created_p = row.find("p", class_="created")
    creator, created_text, created_at = _parse_created(created_p)

    return Outcome(
        outcome_id=outcome_id,
        input_a=input_a,
        input_b=input_b,
        result=result,
        creator=creator,
        hearts=hearts,
        created_text=created_text,
        created_at=created_at,
        browse_page=page_number,
    )


def _parse_drawing(dbox) -> Drawing:
    img = dbox.find("img", class_="drawing")
    name = img["alt"].strip() if img else ""
    image_url = img["src"] if img else ""
    return Drawing(name=name, image_url=image_url)


def _parse_created(created_p):
    if not created_p:
        return Creator("unknown", 0, None), "", None

    # Creator: from <cite><a>...Username #N</a></cite>
    cite = created_p.find("cite")
    if not cite:
        return Creator("unknown", 0, None), "", None

    cite_a = cite.find("a")
    avatar_img = cite_a.find("img") if cite_a else None
    avatar_url = avatar_img["src"] if avatar_img else None

    # Get the text after the img tag inside the <a>
    cite_text = cite_a.get_text(strip=True) if cite_a else ""
    # Parse "Alex #32" or "zaratustra #104"
    creator_match = re.search(r"^(.+?)\s*#(\d+)$", cite_text)
    if creator_match:
        username = creator_match.group(1).strip()
        number = int(creator_match.group(2))
    else:
        username = cite_text or "unknown"
        number = 0

    # Date: full text of p.created contains "on Mar 13, 2008 at 7:09pm."
    full_text = created_p.get_text(" ", strip=True)
    created_text = ""
    created_at = None

    date_match = re.search(r"on\s+(\w+ \d+, \d+ at \d+:\d+[ap]m)", full_text)
    if date_match:
        created_text = date_match.group(1)
        try:
            dt = datetime.strptime(created_text, "%b %d, %Y at %I:%M%p")
            created_at = dt.isoformat()
        except ValueError:
            pass

    return Creator(username, number, avatar_url), created_text, created_at
