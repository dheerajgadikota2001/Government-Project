"""
WHY THIS TEST EXISTS

The August 2026 flash report prints each group's total on three lines where
July printed one: the original cost total just above, "Total (8)" with the
expenditure, and the revised total just below. The reader took the figure
above as part of the last project's cost, and the one below opened an empty
block that swallowed the next section heading into the next project's name.

On 30 September 2026 that import reached the live site: 103 of 110 tracked
Andhra Pradesh projects changed sector (most to "Real Estate"), their project
types changed with it, and the first project of each group was renamed
("Water Resources Sardar Gouthu Latchanna Thotapalli Barrage Project"). The
row count still matched the report's own, so no existing check refused it.

These tests pin the reading of a three-line total, the check that the groups
add up (check_groups), the refusal when too many tracked projects change
sector at once, and the rule that a pinned run imports only its own month.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.scrapers import mospi_projects
from app.scrapers.mospi_layout import check_groups, extract, parse_page_words
from app.scrapers.mospi_projects import MospiProjectsScraper
from app.scrapers.sanity import SanityAbort

FIX = json.loads((Path(__file__).parent / "fixtures" / "mospi_august2026_pages.json").read_text(encoding="utf-8"))


def read(page, **ctx):
    words = [{"x0": x, "top": t, "text": s} for x, t, s in FIX["pages"][str(page)]["words"]]
    totals: list[int] = []
    blocks, ministry, sector = parse_page_words(words, totals=totals, **ctx)
    rows = {r["code"]: r for r in (extract(b) for b in blocks) if r}
    return rows, totals, ministry, sector


# ---- reading the page -------------------------------------------------------

def test_the_heading_after_a_three_line_total_is_a_heading_not_a_name():
    rows, _, _, sector = read(150)
    thotapalli = rows["400100"]
    assert thotapalli["name"] == "Sardar Gouthu Latchanna Thotapalli Barrage Project"
    assert thotapalli["sector"] == "Water Resources"
    assert rows["701415"]["sector"] == "Water Resources"
    assert sector == "Water Resources"


def test_the_total_figures_stay_out_of_the_projects_around_them():
    rows, _, _, _ = read(150)
    # Last project before "Total (8)": its own cost only, not the group's 4,039.12.
    assert rows["616604"]["cost_original"] == 154.73
    # First project after it: its own cost only, not the group's revised 0.00.
    assert rows["400100"]["cost_original"] == 353.05


def test_every_total_on_the_page_is_counted():
    _, totals, _, _ = read(150)
    assert 8 in totals


def test_no_project_name_on_the_fixture_pages_starts_with_a_heading():
    for page in (57, 150):
        rows, _, _, _ = read(page)
        for r in rows.values():
            assert not r["name"].startswith(("Water Resources ", "Waste & Water ", "Ministry ", "Department ")), r["name"]


# ---- check_groups -----------------------------------------------------------

def row(ministry, sector):
    return {"ministry": ministry, "sector": sector}


def test_groups_that_add_up_pass():
    rows = [row("M1", "A")] * 3 + [row("M1", "B")] * 2 + [row("M2", "C")]
    assert check_groups(rows, [3, 2, 1]) is None


def test_a_swallowed_heading_is_caught_even_when_the_row_count_is_right():
    # The second heading was lost, so groups B and C read as more of A.
    rows = [row("M1", "A")] * 5 + [row("M2", "C")]
    problem = check_groups(rows, [3, 2, 1])
    assert problem and "heading" in problem


def test_totals_that_do_not_add_up_to_the_rows_read_are_caught():
    problem = check_groups([row("M1", "A")] * 4, [3])
    assert problem and "add up to 3" in problem


def test_a_report_with_no_totals_read_is_not_trusted():
    assert check_groups([row("M1", "A")], []) is not None


# ---- refusing a misread edition --------------------------------------------

def scraper():
    s = MospiProjectsScraper.__new__(MospiProjectsScraper)
    s.notes = []
    s.note = s.notes.append
    return s


EDITION = SimpleNamespace(label="MoSPI flash report, August 2026")


def test_most_tracked_projects_changing_sector_at_once_is_refused(monkeypatch):
    monkeypatch.delenv("MOSPI_ALLOW_SECTOR_CHANGES", raising=False)
    moved = [f"{i} Roads & Highways -> Real Estate" for i in range(103)]
    with pytest.raises(SanityAbort, match="103 of 110"):
        scraper()._check_sector_drift(110, moved, EDITION)


def test_a_few_sector_changes_pass(monkeypatch):
    monkeypatch.delenv("MOSPI_ALLOW_SECTOR_CHANGES", raising=False)
    scraper()._check_sector_drift(110, ["1 Railways -> Roads & Highways"] * 5, EDITION)


def test_a_deliberate_correction_can_be_let_through(monkeypatch):
    monkeypatch.setenv("MOSPI_ALLOW_SECTOR_CHANGES", "1")
    s = scraper()
    s._check_sector_drift(110, ["x"] * 103, EDITION)
    assert any("allowed" in n for n in s.notes)


# ---- a pinned run imports only its own month --------------------------------

JULY = datetime(2026, 7, 31, tzinfo=timezone.utc)


def test_a_pin_without_its_date_is_refused(monkeypatch):
    monkeypatch.delenv("MOSPI_FLASH_AS_OF", raising=False)
    with pytest.raises(SanityAbort, match="MOSPI_FLASH_AS_OF"):
        MospiProjectsScraper._check_pinned((2026, 7))


def test_a_july_pin_that_reads_the_august_file_is_refused(monkeypatch):
    monkeypatch.setenv("MOSPI_FLASH_AS_OF", "2026-07-31")
    monkeypatch.setattr(mospi_projects, "REPORT_AS_OF", JULY)
    with pytest.raises(SanityAbort, match="8/2026"):
        MospiProjectsScraper._check_pinned((2026, 8))


def test_a_july_pin_that_reads_the_july_file_passes(monkeypatch):
    monkeypatch.setenv("MOSPI_FLASH_AS_OF", "2026-07-31")
    monkeypatch.setattr(mospi_projects, "REPORT_AS_OF", JULY)
    MospiProjectsScraper._check_pinned((2026, 7))
