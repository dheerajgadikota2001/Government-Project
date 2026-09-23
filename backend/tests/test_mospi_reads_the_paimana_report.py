"""
WHY THIS TEST EXISTS

For thirteen months the site said Polavaram was 76 per cent built, on
figures from the June 2025 flash report. MoSPI had redesigned the report
when PAIMANA launched: the state-wise "Table:-7" the parser looked for no
longer existed, so every monthly run found nothing to parse and reported
nothing wrong. The July 2026 report says 86.15 per cent.

The fixture is five real pages of that report as pdfplumber hands them
over (word, x, top), chosen for the shapes that broke a first draft of the
parser: a plain page, railway rows spanning several states, a name that
wraps past its own serial number, rows whose codes print above the serial
number, and Polavaram itself. The whole-report check that the parser
reproduces the national count the report prints (1,775) is run against the
PDF by scripts/verify_mospi.py; it is too slow for the suite.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from app.scrapers.mospi_layout import (
    TABLE_TITLE, extract, month_end, overview_project_count, parse_page_words, report_month,
)
from app.scrapers.mospi_editions import Edition, clean_title, edition_from_item, list_request, newest

FIX = json.loads((Path(__file__).parent / "fixtures" / "mospi_july2026_pages.json").read_text(encoding="utf-8"))


def words(page):
    return [{"x0": x, "top": t, "text": s} for x, t, s in FIX["pages"][str(page)]["words"]]


def rows(page, **ctx):
    blocks, ministry, sector = parse_page_words(words(page), **ctx)
    return [extract(b) for b in blocks], ministry, sector


def test_every_table_page_in_the_fixture_is_recognised_by_its_title():
    for page in FIX["pages"].values():
        assert page["head"].startswith(TABLE_TITLE)


def test_a_plain_page_yields_consecutive_numbered_rows_with_every_figure():
    out, ministry, sector = rows(54)
    assert [r["sl"] for r in out] == list(range(1, len(out) + 1))
    assert all(r is not None for r in out)
    first = out[0]
    assert first["name"].startswith("Construction of New Domestic Terminal Building")
    assert first["name"].endswith("at Kadapa Airport")
    assert first["agency"] == "Airport Authority of India [AAI]"
    assert first["state"] == "Andhra Pradesh"
    assert first["code"] == "612786" and first["legacy_code"] is None and first["pmgid"] is None
    assert first["ministry"] == "Ministry of Civil Aviation"
    assert first["sector"] == "Aviation & Aviation Infrastructure"
    assert first["approval"] == datetime(2023, 3, 1, tzinfo=timezone.utc)
    assert first["start"] == datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert first["expected_original"] == datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert first["expected"] == datetime(2026, 9, 1, tzinfo=timezone.utc)   # the revised date wins
    assert first["cost_original"] == 265.91 and first["cost"] == 265.91
    assert first["expenditure"] == 176.38 and first["progress"] == 80.0
    # The revised cost is the one the site publishes, when there is one.
    second = out[1]
    assert second["cost_original"] == 611.80 and second["cost"] == 824.28
    assert second["expected"] == datetime(2026, 11, 1, tzinfo=timezone.utc)


def test_polavaram_is_read_exactly_as_the_report_prints_it():
    out, _, _ = rows(150, ministry="Department of Water Resources, River Development & GR", sector=None)
    pol = next(r for r in out if r["name"] == "Polavaram Irrigation Project")
    assert pol["sl"] == 1748
    assert pol["code"] == "701415"
    assert pol["agency"] == "Water Resources-AP"
    assert pol["state"] == "Andhra Pradesh"
    assert pol["sector"] == "Water Resources"
    assert pol["cost_original"] == 10151.04 and pol["cost"] == 55548.87
    assert pol["expenditure"] == 27961.55
    assert pol["progress"] == 86.15
    assert pol["approval"] == datetime(2009, 1, 1, tzinfo=timezone.utc)
    assert pol["expected"] == datetime(2026, 3, 1, tzinfo=timezone.utc)


def test_a_name_that_wraps_past_its_serial_number_stays_one_project():
    out, _, _ = rows(117, ministry="Ministry of Road Transport & Highways", sector="Roads & Highways")
    r = next(r for r in out if r["sl"] == 1206)
    assert r["name"].startswith("Rehabilitation and Up-gradation of i. Deogaon phata")
    assert r["name"].endswith("Total project length 70.9 Km.")
    assert r["code"] == "618150" and r["agency"] == "MoRTH"
    sls = [r["sl"] for r in out]
    assert sls == sorted(sls) and len(sls) == len(set(sls))


def test_multi_state_rows_with_codes_above_the_serial_number_are_not_merged():
    out, _, _ = rows(148, ministry="Department of Telecommunications", sector="Telecommunication")
    by = {r["sl"]: r for r in out}
    assert 1708 in by and 1709 in by and 1710 in by, sorted(by)
    assert by[1708]["code"] == "701598" and by[1708]["state"] == "Meghalaya"
    assert by[1709]["code"] == "617413"
    assert by[1709]["name"].startswith("Mobile connectivity in Left Wing Extremism")
    assert by[1709]["state"].startswith("Multi-States (Andhra Pradesh,")
    assert by[1709]["state"].endswith("West Bengal)")
    assert by[1710]["code"] == "701599"
    # The footer is not a row.
    assert all(r["name"] and not r["name"].startswith("Project Assessment") for r in out)


def test_railway_multi_state_rows_keep_their_own_numbers():
    out, _, _ = rows(84, ministry="Ministry of Railways", sector="Railways")
    sls = [r["sl"] for r in out]
    assert sls == list(range(sls[0], sls[0] + len(sls)))
    assert 633 in sls and 634 in sls and 635 in sls
    r = next(r for r in out if r["sl"] == 634)
    assert r["name"].startswith("Mumbai-Ahmedabad High Speed Rail")
    assert r["cost"] == 108000.00


def test_ministry_and_sector_carry_from_page_to_page():
    _, ministry, sector = rows(54)
    assert ministry and sector
    out, _, _ = rows(84)     # no context handed in: rows before the first heading carry none
    assert out[0]["ministry"] is None
    out, _, _ = rows(84, ministry="Ministry of Railways", sector="Railways")
    assert out[0]["ministry"] == "Ministry of Railways"


def test_the_report_names_its_month_and_its_national_count():
    assert report_month(FIX["cover"]) == (2026, 7)
    assert overview_project_count(FIX["overview"]) == 1775
    assert month_end(2026, 7) == datetime(2026, 7, 31, tzinfo=timezone.utc)
    assert month_end(2026, 2) == datetime(2026, 2, 28, tzinfo=timezone.utc)
    assert month_end(2025, 12) == datetime(2025, 12, 31, tzinfo=timezone.utc)


# ------------------------------------------------------------- the resolver

ITEMS = [
    {"id": "2859", "title": "<p>Monthly Flash Report on Infrastructure Projects worth Rs. 150 crore and above - July 2026</p>",
     "file_one": {"path": "uploads/publications_reports/publications_reports1787656864174_db1695c9_FlashReport_July_2026_.pdf",
                  "filemime": "application/pdf"}},
    {"id": "2853", "title": '<p><span class="x_155774256font">Monthly&nbsp;</span><span>Flash Report on Infrastructure Projects worth Rs. 150 crore and above - June 2026</span></p>',
     "file_one": {"path": "uploads/publications_reports/x_FlashReport_June_2026_.pdf", "filemime": "application/pdf"}},
    {"id": "2765", "title": "<p>Monthly Flash Report for the month of September 2025</p>",
     "file_one": {"path": "uploads/publications_reports/x_FlashReport_September_2025_(1).pdf", "filemime": "application/pdf"}},
    {"id": "9", "title": "<p>Flash Report Methodology Note</p>", "file_one": {"path": "x.pdf", "filemime": "application/pdf"}},
    {"id": "10", "title": "<p>Annual Report 2025-26</p>", "file_one": {"path": "y.pdf", "filemime": "application/pdf"}},
    {"id": "11", "title": "<p>Monthly Flash Report - August 2026</p>", "file_one": None, "file_two": None, "file_three": None},
]


def test_the_newest_edition_is_chosen_by_its_month_not_its_position():
    e = newest(reversed(ITEMS))
    assert e == Edition(2026, 7, "Monthly Flash Report on Infrastructure Projects worth Rs. 150 crore and above - July 2026",
                        "https://www.mospi.gov.in/uploads/publications_reports/publications_reports1787656864174_db1695c9_FlashReport_July_2026_.pdf")
    assert e.label == "MoSPI flash report, July 2026"


def test_every_title_shape_mospi_has_used_is_read():
    assert edition_from_item(ITEMS[1]).key == (2026, 6)        # spans and &nbsp;
    assert edition_from_item(ITEMS[2]).key == (2025, 9)        # "for the month of"
    assert edition_from_item(ITEMS[3]) is None                 # a flash report with no month
    assert edition_from_item(ITEMS[4]) is None                 # not a flash report
    assert edition_from_item(ITEMS[5]) is None                 # announced, no file yet
    assert clean_title(ITEMS[1]["title"]) == "Monthly Flash Report on Infrastructure Projects worth Rs. 150 crore and above - June 2026"


def test_the_list_request_asks_for_flash_reports_newest_first():
    body = list_request()
    assert body["search_term"] == "Flash Report" and body["sort_order"] == "desc" and body["lang"] == "en"
