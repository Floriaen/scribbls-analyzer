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

    created = _parse_created(row.find("p", class_="created"))

    return Outcome(
        outcome_id=outcome_id,
        input_a=input_a,
        input_b=input_b,
        result=result,
        hearts=hearts,
        browse_page=page_number,
        **created,
    )


def _parse_drawing(dbox) -> Drawing:
    img = dbox.find("img", class_="drawing")
    name = img["alt"].strip() if img else ""
    image_url = img["src"] if img else ""
    return Drawing(name=name, image_url=image_url)


DATE = r"(\w+ \d+, \d+ at \d+:\d+[ap]m)"


def _parse_created(created_p) -> dict:
    """p.created comes in three shapes:
      "A created this outcome and drew X on D."
      "A created this outcome on D1 and drew X on D2."
      "A drew X on D1.<br>B created this outcome on D2."
    """
    people = {}
    for cite in created_p.find_all("cite") if created_p else []:
        # The text up to the next <cite> says what this person did
        role = ""
        for sib in cite.next_siblings:
            if getattr(sib, "name", None) == "cite":
                break
            role += sib.get_text() if hasattr(sib, "get_text") else str(sib)
        if "created this outcome" in role:
            people["creator"] = _parse_person(cite)
        if "drew" in role:
            people["artist"] = _parse_person(cite)

    text = created_p.get_text(" ", strip=True) if created_p else ""
    created_text = _search(rf"created this outcome (?:and drew .+? )?on {DATE}", text)
    drawn_text = _search(rf"drew .+? on {DATE}", text)
    return {
        "creator": people.get("creator", Creator("unknown", 0, None)),
        "created_text": created_text,
        "created_at": _iso(created_text),
        "artist": people.get("artist"),
        "drawn_text": drawn_text,
        "drawn_at": _iso(drawn_text),
    }


def _parse_person(cite) -> Creator:
    # <cite><a><img src="avatar">Username #N</a></cite>
    cite_a = cite.find("a")
    avatar_img = cite_a.find("img") if cite_a else None
    avatar_url = avatar_img["src"] if avatar_img else None
    cite_text = cite_a.get_text(strip=True) if cite_a else ""
    match = re.search(r"^(.+?)\s*#(\d+)$", cite_text)
    if match:
        return Creator(match.group(1).strip(), int(match.group(2)), avatar_url)
    return Creator(cite_text or "unknown", 0, avatar_url)


def _search(pattern: str, text: str) -> str:
    match = re.search(pattern, text)
    return match.group(1) if match else ""


def _iso(date_text: str) -> str | None:
    try:
        return datetime.strptime(date_text, "%b %d, %Y at %I:%M%p").isoformat()
    except ValueError:
        return None
