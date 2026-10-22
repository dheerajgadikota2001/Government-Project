"""
The rule this file exists to hold: a source that could not be read must never
be reported as a source with nothing new.

On 14 September 2026 a full refresh run printed "All clear: 11 sources, 3 new
records" while six government portals were unreachable and two scrapers had
crashed partway. Nothing was lying on purpose. Every scraper ended with
`except Exception: log_error(...)` and then returned its count, so the runner
saw a normal return, the recorder wrote status OK, and the email counted those
six under "quiet, ran clean, nothing new". Six dead sources and six healthy
quiet ones produced byte-identical output.

These tests are the shape of that bug, so it cannot come back quietly. They use
no database and no network: every one of them drives the real code path with
the fetch replaced.
"""

import ast
import asyncio
import pathlib

import httpx
import pytest

from app.scrapers.base import BaseScraper, ScrapeIncomplete
from app.scrapers.district_documents import DISTRICT_SITES, DistrictDocumentsScraper
from app.scrapers.pdf_index import PdfIndexScraper
from app.scrapers.cag_documents import CAGDocumentsScraper
import dataclasses

from app.scrapers.sanity import SanityAbort, SanityGate, summarise
from app.models.data_update import RunStatus, RunTrigger
from app.services import run_recorder
from app.services.alerts import build_body
from app.services.run_recorder import crossed_an_escalation

SCRAPER_DIR = pathlib.Path(__file__).parent.parent / "app" / "scrapers"


def page(html: str) -> httpx.Response:
    return httpx.Response(200, text=html, request=httpx.Request("GET", "https://example.gov.in/"))


class Register(PdfIndexScraper):
    """A stand-in for CSE, APSDPS and PPA, which share this whole code path."""

    PORTAL_NAME = "Test_Register"
    BASE_URL = "https://example.gov.in"
    PUBLIC_NAME = "Test register"
    DEPARTMENT = "Test department"
    INDEX_PAGES = ("https://example.gov.in/", "https://example.gov.in/reports.html")

    def __init__(self, answer):
        super().__init__()
        self._answer = answer

    async def _fetch_with_retries(self, url, params=None):
        return self._answer(url)

    async def _save(self, entries):        # the database is not what is under test
        return len(list(entries))


# ---------------------------------------------------------------- unreachable

def test_a_portal_that_never_answers_is_a_failure_not_a_quiet_run():
    """This is the exact shape of apsdps, cse and ppa on 14 September."""

    def refuse(url):
        raise httpx.ConnectError("All connection attempts failed")

    with pytest.raises(ScrapeIncomplete) as caught:
        asyncio.run(Register(refuse).scrape())

    assert "could not reach the portal" in caught.value.detail
    assert "ConnectError" in caught.value.detail
    assert caught.value.records_new == 0


def test_the_failure_names_the_first_url_so_it_can_be_pasted_into_a_browser():
    def refuse(url):
        raise httpx.ConnectTimeout("")

    with pytest.raises(ScrapeIncomplete) as caught:
        asyncio.run(Register(refuse).scrape())

    assert "https://example.gov.in/" in caught.value.detail
    # str() of an httpx timeout is empty; the type name has to carry it.
    assert "ConnectTimeout" in caught.value.detail


def test_one_page_down_out_of_two_is_not_a_failure():
    """A portal that answers at all is alive. Half a register beats none."""

    def half(url):
        if url.endswith("reports.html"):
            raise httpx.ConnectError("nope")
        return page('<a href="/a.pdf">Educational Statistics 2022-23</a>')

    assert asyncio.run(Register(half).scrape()) == 1


# ---------------------------------------------------------------- silent drift

def test_a_page_that_loads_but_matches_nothing_is_a_failure():
    """The quiet way a source goes stale: the portal is up, the page moved.

    Answering 200 with no document link is not "no new documents". These
    registers are never empty.
    """
    with pytest.raises(ScrapeIncomplete) as caught:
        asyncio.run(Register(lambda url: page("<html><body>Welcome</body></html>")).scrape())

    assert "no document link matched" in caught.value.detail
    assert "drifted" in caught.value.detail


def test_a_page_that_matches_is_just_a_count():
    def serve(url):
        name = "reports" if url.endswith("reports.html") else "home"
        return page(f'<a href="/{name}.pdf">Educational Statistics 2022-23</a>'
                    '<a href="/shared.pdf">Statistical Abstract 2024</a>')

    # Three, not four: the two index pages both link shared.pdf and a register
    # must not count one file twice because it is listed in two places.
    assert asyncio.run(Register(serve).scrape()) == 3


# ---------------------------------------------------------------- partial work

class HalfWay(BaseScraper):
    """Saves two rows, then the portal dies. Both facts have to survive."""

    PORTAL_NAME = "Test_HalfWay"
    BASE_URL = "https://example.gov.in"

    async def scrape(self) -> int:
        saved = 0
        failure = None
        try:
            saved = 2
            raise httpx.ReadTimeout("")
        except Exception as exc:                    # noqa: BLE001
            failure = exc
        return self.finish(saved, failure)


def test_a_partial_run_reports_both_the_failure_and_what_it_saved():
    with pytest.raises(ScrapeIncomplete) as caught:
        asyncio.run(HalfWay().scrape())
    assert caught.value.records_new == 2
    assert "ReadTimeout" in caught.value.detail


# ---------------------------------------------------------------- refusals

class Refuser(BaseScraper):
    PORTAL_NAME = "Test_Refuser"
    BASE_URL = "https://example.gov.in"

    async def scrape(self) -> int:
        raise SanityAbort("row floor: 1 row, expected at least 40")


def test_a_deliberate_refusal_is_not_turned_into_a_crash():
    """BLOCKED and FAILED mean opposite things and must not collapse together.

    A refusal is the safety net working: nothing was written and the site still
    serves its last known-good data. A crash means the source was never read.
    """
    with pytest.raises(SanityAbort):
        asyncio.run(Refuser().scrape())


# ---------------------------------------------------------------- districts

class Districts(DistrictDocumentsScraper):
    def __init__(self, dead_hosts):
        super().__init__()
        self._dead = dead_hosts

    async def _fetch_with_retries(self, url, params=None):
        if any(host in url for host in self._dead):
            raise httpx.ConnectError("All connection attempts failed")
        return page("<html><body>no table here</body></html>")


def test_most_district_sites_down_is_a_failure():
    dead = list(DISTRICT_SITES.values())[:12]       # 12 of the listed sites
    with pytest.raises(ScrapeIncomplete) as caught:
        asyncio.run(Districts(dead).scrape())
    assert f"12 of {len(DISTRICT_SITES)}" in caught.value.detail


def test_a_couple_of_district_sites_down_is_a_note_not_a_failure():
    """One collectorate being down is weather, and the rest still count."""
    scraper = Districts(list(DISTRICT_SITES.values())[:2])
    assert asyncio.run(scraper.scrape()) == 0
    assert any(f"2 of {len(DISTRICT_SITES)}" in note for note in scraper.notes)


# ---------------------------------------------------------------- the runner

def test_every_scraper_hands_its_failure_back():
    """A structural guard, because this bug was eleven copies of one habit.

    Any `except Exception` inside a scrape() has to either re-raise or park the
    error in `failure` for finish() to raise. A handler that does neither is the
    original bug, whoever writes it next.
    """
    offenders = []
    for path in sorted(SCRAPER_DIR.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.AsyncFunctionDef) or node.name != "scrape":
                continue
            for handler in (n for n in ast.walk(node) if isinstance(n, ast.ExceptHandler)):
                body = ast.dump(ast.Module(body=handler.body, type_ignores=[]))
                if "Raise(" in body or "id='failure'" in body:
                    continue
                offenders.append(f"{path.name}:{handler.lineno}")
    assert offenders == [], (
        "these handlers swallow a scrape failure and let the run look clean: "
        + ", ".join(offenders)
    )


# ---------------------------------------------------------------- the email

CLEAN = {"run_id": "abc123", "started_at": None, "duration_s": 5, "quiet": ["NeVA"]}


def test_the_subject_never_says_all_clear_while_a_source_is_failing():
    """The sentence that let six dead portals go unnoticed for two weeks."""
    subject, _ = build_body({**CLEAN, "still_failing": [
        {"title": "CAG audit reports", "detail": "failing 12 days"},
        {"title": "AP School Education statistics", "detail": "failing 12 days"},
    ]})
    assert "All clear" not in subject
    assert "2 source(s) still failing" in subject


def test_the_body_never_claims_every_scraper_is_working_while_one_is_not():
    _, body = build_body({**CLEAN, "still_failing": [{"title": "CAG", "detail": ""}]})
    assert "Every source is current" not in body
    assert "1 source(s) reported earlier are still broken" in body


def test_a_run_that_read_a_local_copy_says_so():
    _, body = build_body({**CLEAN, "notes": [
        {"source": "Central-sector projects (MoSPI flash report)",
         "note": "read the local copy at fetched/mospi_flash.pdf instead of downloading"},
    ]})
    assert "WORTH KNOWING (1)" in body
    assert "read the local copy" in body


def test_a_long_failure_is_re_reported_as_it_lengthens_and_then_left_alone():
    """One email when it breaks is not enough if that email is missed."""
    assert crossed_an_escalation(days_now=3.2, days_at_last_run=2.9) is True
    assert crossed_an_escalation(days_now=2.9, days_at_last_run=2.1) is False
    assert crossed_an_escalation(days_now=4.0, days_at_last_run=3.5) is False
    assert crossed_an_escalation(days_now=7.1, days_at_last_run=6.9) is True
    assert crossed_an_escalation(days_now=120.0, days_at_last_run=119.0) is False


def test_the_new_wording_keeps_the_house_style():
    subject, body = build_body({**CLEAN, "still_failing": [{"title": "CAG", "detail": "failing 9 days"}],
                                "notes": [{"source": "MoSPI", "note": "read the local copy"}]})
    assert "\u2014" not in subject + body
    assert "\u2013" not in subject + body


# ---------------------------------------------------------- recorder to email

def _track(monkeypatch, scrape_call):
    """Drive one scraper through track() with the audit write intercepted."""
    written = {}

    async def fake_record(**kw):
        written.update(kw)

    monkeypatch.setattr(run_recorder, "record", fake_record)

    async def go():
        async with run_recorder.track("run-1", "Test source", HalfWay, RunTrigger.MANUAL) as slot:
            slot["records_new"] = await scrape_call()
        return slot

    return asyncio.run(go()), written


def test_a_failure_reaches_the_runner_with_its_error_attached(monkeypatch):
    """The audit row always had the error; the email never did.

    run_all_scrapers builds each alert item from slot["error"], and track() set
    only slot["failed"], so every failing source arrived at the email with an
    empty detail and the fallback advice "read the error above" pointing at an
    error the email did not contain.
    """
    slot, written = _track(monkeypatch, HalfWay().scrape)

    assert slot["failed"] is True
    assert "ReadTimeout" in slot["error"]
    assert slot["records_new"] == 2

    assert written["status"] is RunStatus.FAILED
    assert written["records_new"] == 2          # partial work is still work
    assert "ReadTimeout" in written["error"]


def test_a_refusal_is_recorded_as_skipped_not_failed(monkeypatch):
    slot, written = _track(monkeypatch, Refuser().scrape)
    assert slot.get("failed") is None
    assert "row floor" in slot["blocked"]
    assert written["status"] is RunStatus.SKIPPED


# ------------------------------------------------- one odd page, one district
#
# Making failures visible immediately showed two refusals that had been hidden
# under the old swallowing handlers. Both were the gate firing on data that was
# fine, which is the other way a safety net goes wrong: refuse often enough on
# good data and someone turns it off.


class RefusingDistricts(DistrictDocumentsScraper):
    """Every district serves a page; the named ones refuse at the gate."""

    PAGE = ('<table><tr><td>District tender notice for roads</td><td>17/08/2026</td>'
            '<td><a href="https://cdn.s3waas.gov.in/a/b/notice.pdf">View</a></td></tr></table>')

    def __init__(self, refusing):
        super().__init__()
        self._refusing = set(refusing)
        self.districts_read = []

    async def _fetch_with_retries(self, url, params=None):
        return page(self.PAGE)

    async def _save(self, district, base, entries):
        if district in self._refusing:
            raise SanityAbort(f"{district}: parsed 1 rows against a recent best of 8")
        if district in self.districts_read:
            return 0        # nothing new on page two, so this district is done
        self.districts_read.append(district)
        return 1


def test_one_district_refusing_does_not_stop_the_other_twenty_five():
    """The run used to end at the first refusal, skipping 21 collectorates.

    A refusal belongs to the page that caused it. Bapatla publishing one
    document is not a reason to stop reading Guntur.
    """
    scraper = RefusingDistricts(["Bapatla"])
    saved = asyncio.run(scraper.scrape())

    assert len(scraper.districts_read) == len(DISTRICT_SITES) - 1
    assert "Bapatla" not in scraper.districts_read
    assert saved == len(DISTRICT_SITES) - 1
    assert any("Bapatla" in note for note in scraper.notes)


def test_most_districts_refusing_blocks_the_whole_source():
    """Past a point it is not one odd page, and BLOCKED is the honest answer."""
    scraper = RefusingDistricts(list(DISTRICT_SITES)[:12])
    with pytest.raises(SanityAbort) as caught:
        asyncio.run(scraper.scrape())
    assert f"12 of {len(DISTRICT_SITES)}" in str(caught.value)


def test_a_thin_district_page_is_not_measured_against_the_busiest_district():
    """The row floor compared one collectorate against the best of twenty-six.

    The baseline for this scraper is a single shared history, so it holds
    whichever district last had a full page. One district with one document read
    as "1 row against a recent best of 8" and refused the batch.
    """
    spec = DistrictDocumentsScraper.SANITY
    baseline = [{"rows": 8, "null_rates": {}, "distinct_ratio": 1.0} for _ in range(3)]
    gate = SanityGate("DistrictDocumentsScraper", spec, baseline)

    result = gate.run([{"title": "District tender notice", "url": "https://x.gov.in/a.pdf",
                        "date": None}])
    assert len(result.rows) == 1


def test_cags_undated_archive_page_is_not_read_as_a_moved_column():
    """CAG prints no publication date on its oldest entries.

    Pages one to six carry dates, page seven is all "Report of 2011" with none.
    The drift layer saw 0% null become 100% null and refused the batch, which
    ended the run and left the oldest reports uncollected. An empty date on a
    2009 report is the portal being accurate.
    """
    spec = CAGDocumentsScraper.SANITY
    dated = [{"title": f"Report {i} of 2024 - Compliance Audit", "pdf_url": f"https://cag.gov.in/{i}.pdf",
              "published_date": "22 November 2024"} for i in range(10)]
    baseline = [summarise(dated, spec) for _ in range(3)]
    assert "published_date" not in baseline[0]["null_rates"]

    undated = [{"title": f"Report of 201{i} - Financial Audit on State Finance",
                "pdf_url": f"https://cag.gov.in/old{i}.pdf", "published_date": None}
               for i in range(10)]
    result = SanityGate("CAGDocumentsScraper", spec, baseline).run(undated)
    assert len(result.rows) == 10


def test_an_undated_cag_report_still_gets_the_year_its_title_states():
    year = CAGDocumentsScraper()._year_from_title
    assert year("Report of 2011 - Financial Audit on State Finance") == 2011
    # The number-year, not the period covered, which comes later in the string.
    assert year("Report No. 1 of 2014 - Report for the year ended March 2013") == 2014
    assert year("Audit Report") is None


# ------------------------------------------------- the rest of the refusals
#
# Fixing the first two made the run reach code it had never reached, and three
# more false refusals came out. All three are the same mistake in different
# clothes: a rule written for a full page, applied to a small one.


def test_drift_fields_of_none_means_none():
    """`()` was read as "watch everything", the opposite of what it says.

    `spec.drift_fields or tuple(spec.fields.keys())` treats an empty tuple as
    falsy, so a scraper that switched drift off got every field watched. The
    district scraper carried `drift_fields=()` and a comment explaining why
    since the gate was written, and drift was on the whole time. It refused
    Krishna for a date missing on one row of three.
    """
    spec = DistrictDocumentsScraper.SANITY
    row = {"title": "District tender notice", "url": "https://x.gov.in/a.pdf", "date": None}
    assert summarise([row], spec)["null_rates"] == {}


def test_a_ratio_is_not_applied_to_a_batch_too_small_to_have_one():
    """One odd title on a two-row page is 50% rejected and perfectly healthy."""
    spec = DistrictDocumentsScraper.SANITY
    gate = SanityGate("DistrictDocumentsScraper", spec, [])

    result = gate.run([
        {"title": "Notice", "url": "https://x.gov.in/a.pdf", "date": None},       # 6 chars
        {"title": "District tender notice", "url": "https://x.gov.in/b.pdf", "date": None},
    ])
    assert len(result.rows) == 1        # dropped, not refused


def test_three_bad_rows_still_refuse_the_batch():
    """The guard is about sample size, not about letting a broken parser through."""
    spec = DistrictDocumentsScraper.SANITY
    gate = SanityGate("DistrictDocumentsScraper", spec, [])
    with pytest.raises(SanityAbort):
        gate.run([{"title": "No", "url": f"https://x.gov.in/{i}.pdf", "date": None}
                  for i in range(3)])


CAG_BASELINE = [{"rows": 10, "null_rates": {"title": 0.0, "pdf_url": 0.0},
                 "distinct_ratio": 1.0}] * 3
CAG_LAST_PAGE = [{"title": "Report of 2009 - Compliance Audit on Revenue",
                  "pdf_url": f"https://cag.gov.in/{i}.pdf", "published_date": None}
                 for i in range(3)]


def test_the_last_page_of_an_archive_is_allowed_to_be_short():
    """CAG has 73 reports, so page eight holds three.

    Measured against a full page of ten that reads as a truncated response, and
    the batch was refused. A paginated archive tapers; the row floor belongs on
    page one.
    """
    relaxed = dataclasses.replace(CAGDocumentsScraper.SANITY, row_floor_ratio=0.0)
    result = SanityGate("CAGDocumentsScraper", relaxed, CAG_BASELINE).run(CAG_LAST_PAGE)
    assert len(result.rows) == 3


def test_page_one_is_still_measured_against_previous_runs():
    """Where a short batch does mean something changed, it still refuses."""
    with pytest.raises(SanityAbort) as caught:
        SanityGate("CAGDocumentsScraper", CAGDocumentsScraper.SANITY,
                   CAG_BASELINE).run(CAG_LAST_PAGE)
    assert "recent best of 10" in str(caught.value)
