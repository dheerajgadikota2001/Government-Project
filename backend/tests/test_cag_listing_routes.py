"""
The CAG reader has two routes to the same Andhra Pradesh reports, and keeps only Andhra Pradesh's.

From 30 Sep 2026 the Andhra Pradesh audit office's own page answered 500 Internal Server Error every morning,
so the reader saw nothing new for eight weeks while CAG's national list, filtered to the state, kept working.
The national list is now the second route. Its filter is not exact: on 24 Nov 2026 its first card was an Odisha
report (Report No. 7 of 2026). These tests pin, on that saved page:
  - the national list parses with the same reader, and the Odisha report is not taken
  - the office's own page is tried first, and the national list is used only when it fails
  - a report naming Andhra Pradesh is never left out, even when it also names another state
"""

import asyncio
import os
from pathlib import Path
from types import SimpleNamespace

from app.scrapers import cag_documents as cd

PAGE = (Path(__file__).parent / "fixtures" / "cag_national_list_ap_2026-11-24.html").read_text(encoding="utf-8")


def test_the_national_list_reads_and_the_odisha_report_is_left_out():
    s = cd.CAGDocumentsScraper()
    s._listing = cd.LISTINGS[1]

    async def fetch(url, params=None):
        assert url == cd.CAG_NATIONAL_URL
        return SimpleNamespace(text=PAGE)
    s.fetch = fetch
    rows = asyncio.run(s._fetch_page(1))
    titles = [r["title"] for r in rows]
    assert len(rows) == 9
    assert titles[0].startswith("Report 7 of 2025")
    assert any("State Finances Audit Report for the year ended 31 March 2023" in t for t in titles)
    assert not any("Odisha" in t for t in titles)
    assert all(r["pdf_url"].startswith("https://") for r in rows)


def test_the_odisha_rule():
    assert cd.another_states_report("Report No. 7 of 2026, Government of Odisha")
    assert not cd.another_states_report("Report 4 of 2025 on Polavaram, Government of Andhra Pradesh")
    # Both states named: an Andhra Pradesh report about a shared river or border is kept.
    assert not cd.another_states_report("Inter-state water sharing between Andhra Pradesh and Telangana")
    assert not cd.another_states_report("Report No. 3 of 2023, Compliance Audit for the year ended March 2021")


def _scraper(answers):
    s = cd.CAGDocumentsScraper()

    async def fetch(url, params=None):
        a = answers[url]
        if isinstance(a, Exception):
            s.fetch_failures.append((url, str(a)))
            raise a
        s.fetch_ok += 1
        return SimpleNamespace(text=a)
    s.fetch = fetch
    return s


def test_the_office_page_comes_first_and_the_national_list_only_when_it_fails():
    s = _scraper({cd.CAG_LISTING_URL: PAGE, cd.CAG_NATIONAL_URL: PAGE})
    assert asyncio.run(s._choose_listing()) is cd.LISTINGS[0] and not s.notes
    s = _scraper({cd.CAG_LISTING_URL: RuntimeError("500 Internal Server Error"), cd.CAG_NATIONAL_URL: PAGE})
    assert asyncio.run(s._choose_listing()) is cd.LISTINGS[1]
    assert s.notes and "national list" in s.notes[0]
    assert not s.unreachable()          # one route failed, the other answered: the run is not "unreachable"
    s = _scraper({cd.CAG_LISTING_URL: "<html>maintenance</html>", cd.CAG_NATIONAL_URL: PAGE})
    assert asyncio.run(s._choose_listing()) is cd.LISTINGS[1]


def test_later_pages_use_the_chosen_lists_own_page_parameter():
    assert cd.LISTINGS[0][1] + cd.LISTINGS[0][2].format(n=2) == "https://cag.gov.in/ag/andhra-pradesh/en/audit-report?page=2"
    assert cd.LISTINGS[1][1] + cd.LISTINGS[1][2].format(n=2) == "https://cag.gov.in/en/audit-report?gt=49&state%5B0%5D=64&page=2"
