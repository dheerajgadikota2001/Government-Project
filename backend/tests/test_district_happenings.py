"""
District happenings: collectorate notices, PIB releases and Lok Sabha answers.

What these tests hold the feed to:
- the parsers read the real S3WaaS and PIB pages we saved (no network);
- a personal list keeps its title and a link to the site's own page, nothing else,
  even when the site cut the title before the words "merit list";
- a voter roll never gets in from a collectorate site, while a Parliament answer
  about electoral rolls is not mistaken for one;
- a district that suddenly reads empty, or dates a notice in the future, is refused;
- a site that says no (robots, 403, TLS) is reported, never retried another way;
- the seed keeps its promises, and loading twice adds nothing;
- the API returns personal lists bare and covers all 28 districts in the summary.
"""

import asyncio
import json
import pathlib
from datetime import date

import httpx
import pytest

from app.constants.districts import DISTRICT_NAMES
from app.middleware.cache_headers import _shared_ttl
from app.scrapers import district_notices as dn
from app.scrapers import pib_ap as pib
from app.scrapers.base import ScrapeIncomplete
from app.scrapers.district_documents import is_electoral_document
from app.scrapers.sanity import SanityAbort
from app.services import district_happenings as svc

ROOT = pathlib.Path(__file__).parents[1]
FIX = pathlib.Path(__file__).parent / "fixtures" / "district_notices"
SEED = ROOT / "seed" / "district_happenings_seed.json"
NANDYAL_PAST = "https://nandyal.ap.gov.in/past-notices/recruitment?date_from=2026-07-01&date_to=2026-10-21"
ANANTA_PAST = "https://ananthapuramu.ap.gov.in/past-notices/recruitment?date_from=2026-07-01&date_to=2026-10-21"


def fx(name):
    return (FIX / name).read_text(encoding="utf-8")


def raws(name, district, host, slug, listed_at):
    return [dn.to_raw(district, host, slug, r, listed_at) for r in dn.parse_notice_table(fx(name), host)]


# ------------------------------------------------------------- collectorate pages

def test_the_archive_table_is_read_row_by_row():
    rows = dn.parse_notice_table(fx("nandyal_past_recruitment.html"), "nandyal.ap.gov.in")
    assert len(rows) == 12
    first = rows[0]
    assert first["date"] == date(2026, 10, 13) and first["date_end"] == date(2026, 10, 17)
    assert first["title"].startswith("Combined Recruitment")
    assert first["files"], "the row's files are seen, even though none is downloaded"


def test_a_list_whose_title_was_cut_is_still_caught_by_its_description():
    # The site prints "... Revised Final Merit Lis" and the words are whole only in the description.
    r = raws("nandyal_past_recruitment.html", "Nandyal", "nandyal.ap.gov.in", "recruitment", NANDYAL_PAST)[0]
    assert "Merit Lis" in r["title"] and not svc.is_personal_list(r["title"].replace("Merit Lis", "M"))
    assert r["personal_list"] is True
    row = svc.prepare(r)
    assert row["summary"] is None and row["file_url"] is None and row["figures"] == []
    assert row["url"] == "https://nandyal.ap.gov.in/past-notices/recruitment?date_from=2026-10-13&date_to=2026-10-13"


def test_an_ordinary_notification_keeps_its_file_and_wording():
    rs = raws("ananthapuramu_past_recruitment.html", "Ananthapuramu", "ananthapuramu.ap.gov.in", "recruitment", ANANTA_PAST)
    asha = next(r for r in rs if "ASHA" in r["title"])
    row = svc.prepare(asha)
    assert not row["personal_list"] and row["category"] == "recruitment"
    assert row["file_url"].endswith(".pdf")
    assert row["url"] == "https://ananthapuramu.ap.gov.in/past-notices/recruitment?date_from=2026-09-21&date_to=2026-09-21"


def test_a_tender_filed_under_recruitment_is_moved_and_the_move_recorded():
    rs = raws("ananthapuramu_past_recruitment.html", "Ananthapuramu", "ananthapuramu.ap.gov.in", "recruitment", ANANTA_PAST)
    t = next(r for r in rs if r["title"].startswith("Tender Notification"))
    assert t["category"] == "tender"
    assert t["meta"]["category_basis"] == "keyword in title (site lists it under recruitment)"
    assert t["meta"]["site_category"] == "recruitment"


def test_an_empty_current_list_reads_as_no_rows():
    assert dn.parse_notice_table(fx("nandyal_current_tenders.html"), "nandyal.ap.gov.in") == []


def test_paging_keeps_the_date_filter():
    nxt = dn.next_page(fx("nandyal_past_recruitment.html"), NANDYAL_PAST)
    assert nxt == "https://nandyal.ap.gov.in/past-notices/recruitment/page/2?date_from=2026-07-01&date_to=2026-10-21"


def test_press_release_cards_keep_their_telugu_title_and_own_page():
    posts = dn.parse_press_posts(fx("eluru_press_2026.html"), "eluru.ap.gov.in")
    assert posts and posts[0]["date"] == date(2026, 9, 9)
    assert "సమీక్ష" in posts[0]["title"]          # Telugu, as printed
    raw = dn.to_raw("Eluru", "eluru.ap.gov.in", "press-release", posts[0], "https://eluru.ap.gov.in/category/press-release/?cyear=2026")
    assert raw["category"] == "press release" and raw["url"].startswith("https://eluru.ap.gov.in/")


# ------------------------------------------------------------- the rules in prepare()

def _site(title, **kw):
    return {"district": "Nandyal", "source_kind": "district_site", "category": "announcement", "title": title,
            "date": "2026-10-01", "url": "https://nandyal.ap.gov.in/notice/x/", **kw}


@pytest.mark.parametrize("title", ["13-SALUR-AC 25", "02 Palasa - PS. No. 297 Gunupalli",
                                   "Elections-SIR-2026-EastGodavari District-Printing and supply of Electoral roll items"])
def test_voter_material_never_gets_in_from_a_collectorate(title):
    with pytest.raises(svc.RowRefused, match="electoral"):
        svc.prepare(_site(title))


def test_a_parliament_answer_about_rolls_is_not_a_roll():
    row = svc.prepare({"district": "Guntur", "source_kind": "lok_sabha", "category": "parliament answer",
                       "title": "Unstarred Q.No.1: Special Intensive Revision of Electoral Rolls", "date": "2026-07-21",
                       "url": "https://sansad.in/getFile/x.pdf"})
    assert row["title"].endswith("Electoral Rolls")


def test_a_personal_list_is_stripped_to_title_and_link():
    row = svc.prepare(_site("Final Merit List of Staff Nurse", summary="names...", figures=[{"v": 1}],
                            file_url="https://cdn.s3waas.gov.in/a.pdf"))
    assert row["personal_list"] and row["summary"] is None and row["file_url"] is None and row["figures"] == []


def test_a_personal_list_with_only_its_file_as_a_link_is_refused():
    with pytest.raises(svc.RowRefused, match="only link is its file"):
        svc.prepare(_site("Seniority list", url="https://cdn.s3waas.gov.in/a.pdf"))


@pytest.mark.parametrize("bad, why", [({"district": "Rayalaseema"}, "28"), ({"date": "21/10/2026"}, "not a date"),
                                      ({"category": "gossip"}, "category"), ({"url": ""}, "no url")])
def test_rows_that_break_a_rule_are_refused(bad, why):
    with pytest.raises(svc.RowRefused, match=why):
        svc.prepare(_site("Grama sabha notice") | bad)


# ------------------------------------------------------------- sanity per district

def _ok_row(d):
    return svc.prepare(_site("Grama sabha notice", date=d))


def test_a_notice_dated_in_the_future_refuses_the_district():
    with pytest.raises(SanityAbort, match="dated after"):
        dn.check_district("Nandyal", [_ok_row("2026-10-30")], date(2026, 10, 21), 5)


def test_a_district_that_suddenly_reads_empty_is_refused_not_believed():
    with pytest.raises(SanityAbort, match="already known"):
        dn.check_district("Nandyal", [], date(2026, 10, 21), 12)
    dn.check_district("Markapuram", [], date(2026, 10, 21), 0)       # quiet and always was: fine
    dn.check_district("Nandyal", [_ok_row("2026-10-22")], date(2026, 10, 21), 0)   # within the 2-day grace


# ------------------------------------------------------------- the site says no

def _scraper_with(handler, monkeypatch):
    async def no_sleep(_s):
        return None
    monkeypatch.setattr(dn.asyncio, "sleep", no_sleep)
    s = dn.DistrictNoticesScraper(today=date(2026, 10, 21))
    s._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return s


def test_a_403_stops_the_district_at_once(monkeypatch):
    calls = []

    def h(req):
        calls.append(req.url.path)
        return httpx.Response(404) if req.url.path == "/robots.txt" else httpx.Response(403)
    s = _scraper_with(h, monkeypatch)
    with pytest.raises(dn.SourceBlocked, match="403"):
        asyncio.run(s.get("nandyal.ap.gov.in", "https://nandyal.ap.gov.in/past-notices/tenders"))
    assert calls.count("/past-notices/tenders") == 1, "a refusal is not retried"


def test_robots_disallow_is_obeyed(monkeypatch):
    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /past-notices/\n", headers={"content-type": "text/plain"})
        raise AssertionError("the page must not be fetched")
    s = _scraper_with(h, monkeypatch)
    with pytest.raises(dn.SourceBlocked, match="robots"):
        asyncio.run(s.get("nandyal.ap.gov.in", "https://nandyal.ap.gov.in/past-notices/tenders"))


def test_a_certificate_that_does_not_verify_is_not_worked_around(monkeypatch):
    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        raise httpx.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate has expired")
    s = _scraper_with(h, monkeypatch)
    with pytest.raises(dn.SourceBlocked, match="TLS"):
        asyncio.run(s.get("goir.ap.gov.in", "https://goir.ap.gov.in/x"))


def test_a_dropped_connection_is_retried_a_bounded_number_of_times(monkeypatch):
    tries = []

    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        tries.append(1)
        if len(tries) < 3:
            raise httpx.ReadError("Connection reset by peer")
        return httpx.Response(200, text='<main id="SkipContent"><table></table></main>')
    s = _scraper_with(h, monkeypatch)
    assert "SkipContent" in asyncio.run(s.get("nandyal.ap.gov.in", "https://nandyal.ap.gov.in/x"))
    assert len(tries) == 3

    tries.clear()
    s2 = _scraper_with(lambda req: httpx.Response(404) if req.url.path == "/robots.txt" else (_ for _ in ()).throw(httpx.ReadError("reset")), monkeypatch)
    with pytest.raises(httpx.ConnectError, match="4 tries"):
        asyncio.run(s2.get("nandyal.ap.gov.in", "https://nandyal.ap.gov.in/x"))


def test_a_challenge_page_is_a_block_but_the_template_feedback_form_is_not(monkeypatch):
    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        if req.url.path == "/ok":
            return httpx.Response(200, text='<main id="SkipContent"></main><script>{"captchaRequired":"x"}</script>')
        return httpx.Response(200, text="<html><form><div class='g-recaptcha'></div></form></html>")
    s = _scraper_with(h, monkeypatch)
    assert asyncio.run(s.get("x.ap.gov.in", "https://x.ap.gov.in/ok"))
    with pytest.raises(dn.SourceBlocked, match="captcha"):
        asyncio.run(s.get("x.ap.gov.in", "https://x.ap.gov.in/challenge"))


def test_two_sites_down_is_a_note_and_a_third_of_them_is_a_failure(monkeypatch):
    def run(down):
        async def part(self, district, host):
            if district in down:
                raise httpx.ConnectError("all connection attempts failed")
            self.fetch_ok += 1
            return 0, None
        monkeypatch.setattr(dn.DistrictNoticesScraper, "_part", part)
        s = dn.DistrictNoticesScraper(today=date(2026, 10, 21))
        return s, asyncio.run(s.scrape())

    s, n = run(list(dn.DISTRICT_HOSTS)[:2])
    assert n == 0 and any("2 of 28" in note for note in s.notes)
    with pytest.raises(ScrapeIncomplete, match="10 of 28"):
        run(list(dn.DISTRICT_HOSTS)[:10])


def test_one_refused_district_is_raised_after_the_rest_are_read(monkeypatch):
    seen = []

    async def part(self, district, host):
        seen.append(district)
        self.fetch_ok += 1
        return (0, f"{district}: no notices read") if district == "Eluru" else (1, None)
    monkeypatch.setattr(dn.DistrictNoticesScraper, "_part", part)
    with pytest.raises(SanityAbort, match="Eluru"):
        asyncio.run(dn.DistrictNoticesScraper(today=date(2026, 10, 21)).scrape())
    assert len(seen) == 28


# ------------------------------------------------------------- PIB

def test_pib_listing_and_release_are_read_as_printed():
    listed = pib.parse_listing(fx("pib_list_45_2026_9.html"))
    assert len(listed) == 11 and listed[0]["prid"] == "2312412" and listed[0]["ministry"] == "Prime Minister's Office"
    rel = pib.parse_release(fx("pib_pr_2289321.html"))
    assert rel["posted_full"].startswith("25 JUL 2026")
    assert rel["first_sentence"].startswith("The Catch the Rain Campaign (4th July")
    item = {"prid": "2289321", "title": "Nandyal District Strengthens Water Conservation Infrastructure and Storage Capacity under Catch the Rain Campaign",
            "ministry": "Ministry of Jal Shakti", "posted": "25 Jul 2026"}
    rows = pib.release_rows(item, 3, rel)
    assert [r["district"] for r in rows] == ["Nandyal"]
    assert rows[0]["meta"]["places_as_printed"] == ["Nandyal"] and rows[0]["meta"]["pib_office"] == "PIB Delhi"
    assert svc.prepare(rows[0])["date"] == date(2026, 7, 25)


def test_pib_delhi_is_read_only_when_the_title_names_ap():
    assert pib.wanted({"title": "Cabinet approves MSP for Rabi Crops"}, 3) is False
    assert pib.wanted({"title": "Railway works in Andhra Pradesh"}, 3) is True
    assert pib.wanted({"title": "New terminal at Tirupati"}, 3) is True
    assert pib.wanted({"title": "Cabinet approves MSP for Rabi Crops"}, 45) is True


def test_pib_amounts_come_only_from_the_title_as_printed():
    assert pib.title_figures("Indian Railways Approves ₹142 Crore for Upgradation") == [
        {"label": "Amount stated in the release title", "value": 142, "unit": "Rs crore", "as_printed": "₹142 Crore"}]


def test_pib_month_checks():
    with pytest.raises(SanityAbort, match="after today"):
        pib.check_month(45, 2026, 10, [{"posted": "30 Oct 2026"}], date(2026, 10, 21))
    with pytest.raises(SanityAbort, match="empty"):
        pib.check_month(45, 2026, 9, [], date(2026, 10, 21))
    pib.check_month(3, 2026, 10, [], date(2026, 10, 1))


# ------------------------------------------------------------- the seed

SEED_DOC = json.loads(SEED.read_text(encoding="utf-8"))


def test_seed_rows_keep_every_promise():
    rows = SEED_DOC["rows"]
    assert len(rows) > 2000
    keys = set()
    for r in rows:
        assert r["district"] in DISTRICT_NAMES
        date.fromisoformat(r["date"])
        if r["source_kind"] == "district_site":
            assert not is_electoral_document(r["title"]), r["title"]
        if r["personal_list"]:
            assert r["summary"] is None and r["file_url"] is None and r["figures"] == [] and "more_files" not in r["meta"]
        k = (r["district"], r["source_kind"], r["url"], r["title"])
        assert k not in keys, k
        keys.add(k)
    assert {r["source_kind"] for r in rows} == {"district_site", "pib", "lok_sabha"}


def test_seed_builder_gates():
    import importlib.util
    spec = importlib.util.spec_from_file_location("bseed", ROOT / "scripts" / "build_district_happenings_seed.py")
    b = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(b)
    good = {"district": "Nandyal", "source": "PIB", "category": "press release", "title": "A release", "date": "2026-07-25",
            "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1"}
    rows, problems, excluded = b.build([good, dict(good)])
    assert any("duplicate" in p for p in problems)
    rows, problems, excluded = b.build([good | {"district": "Rayalaseema"}])
    assert any("28" in p for p in problems)
    roll = {"district": "Vizianagaram", "source": "district site", "category": "document", "title": "13-SALUR-AC 25",
            "date": "2026-07-25", "url": "https://vizianagaram.ap.gov.in/documents/"}
    rows, problems, excluded = b.build([good, roll])
    assert problems == [] and len(rows) == 1 and len(excluded) == 1


def test_cache_rules_cover_both_routes_and_nothing_near_them():
    assert _shared_ttl("/api/v1/districts/happenings/summary") == 600
    assert _shared_ttl("/api/v1/districts/nandyal/happenings") == 600
    assert _shared_ttl("/api/v1/districts/nandyal/happenings/extra") is None


# ------------------------------------------------------------- database and API

TEST_TITLE = "TEST district happening"


async def _clean(db):
    from sqlalchemy import delete

    from app.models.district_happening import DistrictHappening as H
    await db.execute(delete(H).where(H.title.like(TEST_TITLE + "%")))


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_upsert_is_idempotent_and_first_seen_wins():
    from sqlalchemy import select

    from app.database import get_db_context
    from app.models.district_happening import DistrictHappening as H

    a = svc.prepare({"district": "Polavaram", "source_kind": "district_site", "category": "announcement",
                     "title": TEST_TITLE + " one", "date": "2026-10-01",
                     "url": "https://polavaram.ap.gov.in/notice/test-one/", "summary": "checked wording"})
    async with get_db_context() as db:
        await _clean(db)
    async with get_db_context() as db:
        assert await svc.upsert(db, [a]) == (1, 0)
    # The same notice read again from the archive: other url, same title and date, new wording.
    again = svc.prepare({**a, "date": "2026-10-01", "url": "https://polavaram.ap.gov.in/past-notices/announcements?date_from=2026-10-01&date_to=2026-10-01",
                         "summary": "a fresh scrape", "file_url": "https://cdn.s3waas.gov.in/x.pdf"})
    async with get_db_context() as db:
        assert await svc.upsert(db, [again]) == (0, 1)
    async with get_db_context() as db:
        rows = (await db.execute(select(H).where(H.title.like(TEST_TITLE + "%")))).scalars().all()
        assert len(rows) == 1
        r = rows[0]
        assert r.summary == "checked wording" and r.file_url == "https://cdn.s3waas.gov.in/x.pdf"
        assert r.last_seen_at >= r.first_seen_at
        await _clean(db)


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_api_serves_personal_lists_bare_and_counts_all_28():
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db_context
    from app.main import app

    rows = [svc.prepare({"district": "Polavaram", "source_kind": "district_site", "category": "recruitment",
                         "title": TEST_TITLE + " notification of posts", "date": "2026-10-02",
                         "url": "https://polavaram.ap.gov.in/notice/test-two/", "file_url": "https://cdn.s3waas.gov.in/y.pdf",
                         "figures": [{"label": "Posts", "value": 3, "unit": "posts"}]}),
            svc.prepare({"district": "Polavaram", "source_kind": "district_site", "category": "recruitment",
                         "title": TEST_TITLE + " final merit list", "date": "2026-10-03",
                         "url": "https://polavaram.ap.gov.in/notice/test-three/"})]
    async with get_db_context() as db:
        await _clean(db)
        await svc.upsert(db, rows)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            r = await client.get("/api/v1/districts/polavaram/happenings?kind=district_site&since=2026-10-02")
            assert r.status_code == 200 and "s-maxage=600" in r.headers["cache-control"]
            items = {i["title"]: i for i in r.json()["items"] if i["title"].startswith(TEST_TITLE)}
            bare = items[TEST_TITLE + " final merit list"]
            assert bare["personal_list"] and set(bare) == {"id", "source_kind", "category", "title", "date", "url", "personal_list"}
            full = items[TEST_TITLE + " notification of posts"]
            assert full["figures"][0]["value"] == 3 and full["file_url"]
            s = (await client.get("/api/v1/districts/happenings/summary?since=2026-10-01")).json()
            assert len(s["districts"]) == 28
            pol = next(d for d in s["districts"] if d["district"] == "Polavaram")
            assert pol["counts"]["district_site"] >= 2 and "thin" in pol
            assert (await client.get("/api/v1/districts/nowhere/happenings")).status_code == 404
            assert (await client.get("/api/v1/districts/polavaram/happenings?kind=gossip")).status_code == 422
    finally:
        async with get_db_context() as db:
            await _clean(db)
