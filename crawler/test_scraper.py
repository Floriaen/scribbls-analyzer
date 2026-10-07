from bs4 import BeautifulSoup

from scraper import _parse_created


def cite(name):
    return f'<cite><a href="#"><img src="/images/avatars/x/{name}.png" alt="" />{name}</a></cite>'


def parse(inner):
    return _parse_created(BeautifulSoup(f'<p class="created">{inner}</p>', "lxml").p)


def test_same_person_one_date():
    r = parse(f"{cite('Alex #32')} created this outcome and drew platypus on Mar 13, 2008 at 7:09pm.")
    assert (r["creator"].username, r["artist"].username) == ("Alex", "Alex")
    assert r["created_at"] == r["drawn_at"] == "2008-03-13T19:09:00"


def test_same_person_two_dates():
    r = parse(f"{cite('jmullan #10')} created this outcome on Jan 23, 2008 at 5:31pm "
              "and drew man on Jan 19, 2006 at 7:56pm.")
    assert (r["creator"].number, r["artist"].number) == (10, 10)
    assert r["created_at"] == "2008-01-23T17:31:00"
    assert r["drawn_at"] == "2006-01-19T19:56:00"


def test_two_people():
    r = parse(f"{cite('BradJones #133')} drew dragon on May 11, 2008 at 6:58pm.<br />"
              f"{cite('Fraggle #28')} created this outcome on May 12, 2008 at 6:54pm."
              '<span class="flag"></span>')
    assert r["artist"].username == "BradJones"
    assert r["creator"].username == "Fraggle"
    assert r["drawn_at"] == "2008-05-11T18:58:00"
    assert r["created_at"] == "2008-05-12T18:54:00"


def test_name_containing_on():
    r = parse(f"{cite('Zach #1')} drew Man on the Moon on Jan 28, 2008 at 6:10pm.<br />"
              f"{cite('Lawrence #528')} created this outcome on Jun 15, 2008 at 12:35pm.")
    assert r["drawn_at"] == "2008-01-28T18:10:00"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
