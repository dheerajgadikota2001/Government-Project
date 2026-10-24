"""
WHY THIS TEST EXISTS

In October 2026 CAG moved every report file from cag.gov.in/webroot/uploads/
to d1jmc0u14z2tmp.cloudfront.net/uploads/ and kept the file names. All 73 CAG
reports on our documents pages then had a dead link, and nothing told us: a
listing never says that a link has died. It was found on 24 Oct 2026 only
because every link was opened by hand.

These tests hold three things in place:
  * the address rule itself, including file names with '&' and apostrophes;
  * the scraper reads CAG's current listing into the current address, so a
    refresh moves an old row instead of saving the same report twice
    (the fixture is a real card from CAG's list, saved 24 Oct 2026);
  * no seed or site data file carries an old CAG upload address again.

Migration 0014 was run up, down and up again on a Postgres 16 copy holding
the 73 real old addresses: all 73 moved, detail pages and look-alike
addresses stayed as they were. The scraper's move path was run on the same
copy with CAG's eight live listing pages: 73 rows moved, none added.
"""
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from app.scrapers.cag_address import CURRENT_PREFIX, LEGACY_PREFIX, current, legacy
from app.scrapers.cag_documents import CAGDocumentsScraper

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent


def test_old_upload_address_moves_to_the_file_store():
    old = LEGACY_PREFIX + "download_audit_report/2025/PA-on-Polavaram-Irrigation-Project-069aaece202fa02.61046831.pdf"
    assert current(old) == CURRENT_PREFIX + "download_audit_report/2025/PA-on-Polavaram-Irrigation-Project-069aaece202fa02.61046831.pdf"


def test_the_rule_is_safe_to_run_twice_and_reverses():
    new = current(LEGACY_PREFIX + "download_audit_report/2016/Report No 1 of 2016 Local Bodies Government of Andhra Pradesh.pdf")
    assert current(new) == new
    assert legacy(new) == LEGACY_PREFIX + "download_audit_report/2016/Report No 1 of 2016 Local Bodies Government of Andhra Pradesh.pdf"


def test_html_codes_in_a_file_name_become_the_real_characters():
    raw = LEGACY_PREFIX + "download_audit_report/2021/Report of CAG on &#039;GS&amp;ES and PSUs&#039;_AP_31 March 2019.pdf"
    assert current(raw) == CURRENT_PREFIX + "download_audit_report/2021/Report of CAG on 'GS&ES and PSUs'_AP_31 March 2019.pdf"


@pytest.mark.parametrize("url", [
    "https://cag.gov.in/ag/andhra-pradesh/en/audit-report/details/44834",   # detail pages still work
    "https://apfinance.gov.in/a.pdf",
    "https://cag.gov.in/webrootXuploads/z.pdf",
    None,
    "",
])
def test_other_addresses_are_left_alone(url):
    assert current(url) == url
    assert legacy(url) is None


def test_the_scraper_reads_a_real_listing_card_into_the_current_address():
    card = BeautifulSoup((BACKEND / "tests" / "fixtures" / "cag_listing_card_2018.html").read_text(encoding="utf-8"), "lxml")
    e = CAGDocumentsScraper()._parse_entry(card.find("div", class_="AuditReportlisting"))
    assert e["pdf_url"] == (CURRENT_PREFIX + "download_audit_report/2018/"
                            "Report_No_5_of_2018_-_General_&_Social_Sector_Government_of_Andhra_Pradesh.pdf")
    assert legacy(e["pdf_url"]).startswith(LEGACY_PREFIX)    # the key the scraper uses to find the old row
    assert e["detail_url"] == "https://cag.gov.in/ag/andhra-pradesh/en/audit-report/details/44834"


def _data_files():
    files = sorted((BACKEND / "seed").glob("*.json"))
    web = REPO / "web" / "src" / "data"
    if web.is_dir():
        files += sorted(web.rglob("*.json"))
    return files


def test_no_data_file_links_an_old_cag_upload_address():
    stale = [str(f.relative_to(REPO)) for f in _data_files() if LEGACY_PREFIX in f.read_text(encoding="utf-8")]
    assert stale == [], f"old CAG addresses answer 'not found'; move them with cag_address.current(): {stale}"
