"""
WHY THIS TEST EXISTS

The August 2026 flash report stopped printing revised costs: all 1,731 of
its rows show a bare "0.00" where July printed Polavaram's "(55548.87)"
under the original "10151.04". Its own summary table on page 3 still gives
Polavaram's revised cost as 55,549.

Read the old way, that zero pushed the original cost into its place (Rs
10,151 crore for Polavaram). With the three-line group totals of the same
report (test_mospi_august_group_totals.py), which leaked a total's "0.00"
into the first project of each group, 66 of the 110 Andhra Pradesh projects
in both reports showed a cost no report states, 5 of them Rs 0 crore. These
tests pin the rule: a zero is "not given", and a report that gives no cost
never replaces the cost already held.
"""
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from app.scrapers.mospi_layout import _costs, extract, parse_page_words
from app.scrapers.mospi_projects import cost_on_record, upsert_observation

FIX = json.loads((Path(__file__).parent / "fixtures" / "mospi_august2026_pages.json").read_text(encoding="utf-8"))


def rows(page):
    words = [{"x0": x, "top": t, "text": s} for x, t, s in FIX["pages"][str(page)]["words"]]
    blocks, _, _ = parse_page_words(words)
    return {r["code"]: r for r in (extract(b) for b in blocks) if r}


def test_a_bracketed_revised_cost_is_still_the_cost():
    assert _costs(["10151.04", "(55548.87)"]) == (10151.04, 55548.87, False)


def test_a_bare_zero_in_the_revised_slot_means_not_given():
    assert _costs(["10,151.04", "0.00"]) == (10151.04, None, True)
    assert _costs(["0.00", "353.05"]) == (353.05, None, True)


def test_a_zero_original_does_not_hide_a_printed_revised_cost():
    assert _costs(["0.00", "(824.28)"]) == (None, 824.28, True)


def test_a_row_with_no_revised_slot_keeps_its_original_cost():
    assert _costs(["265.91"]) == (265.91, None, False)


def test_polavaram_in_august_2026_has_every_figure_except_a_cost():
    pol = rows(150)["701415"]
    assert pol["cost"] is None and pol["cost_not_given"] is True
    assert pol["cost_original"] == 10151.04
    assert pol["expenditure"] == 28159.22
    assert pol["progress"] == 86.2
    # The revised completion date moved from March 2026 (July report) to June 2027.
    assert pol["expected"] == datetime(2027, 6, 1, tzinfo=timezone.utc)
    assert pol["expected_original"] == datetime(2022, 4, 1, tzinfo=timezone.utc)


def test_no_row_on_the_fixture_pages_gets_a_zero_cost():
    for page in (57, 150):
        for r in rows(page).values():
            assert r["cost"] is None or r["cost"] > 0
            assert r["cost_original"] is None or r["cost_original"] > 0


def test_a_report_without_a_cost_keeps_the_cost_already_held():
    august = {"cost": None, "cost_original": 10151.04}
    assert cost_on_record(55548.87, august) == 55548.87


def test_a_printed_cost_replaces_the_one_held():
    assert cost_on_record(55548.87, {"cost": 56000.0, "cost_original": 10151.04}) == 56000.0


def test_a_first_sighting_without_a_revised_cost_takes_the_original():
    assert cost_on_record(None, {"cost": None, "cost_original": 776.17}, first_sighting=True) == 776.17
    # An existing project with no cost yet is not a first sighting; it stays empty.
    assert cost_on_record(None, {"cost": None, "cost_original": 776.17}) is None


class StubDB:
    def __init__(self, row):
        self.row = row

    async def execute(self, _stmt):
        row = self.row
        return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: row))

    def add(self, obj):
        raise AssertionError("an existing reading must be corrected, not duplicated")


def test_the_august_reading_does_not_wipe_a_cost_a_reading_already_holds():
    held = SimpleNamespace(completion_percentage=86.15, cumulative_expenditure_crore=27961.55,
                           estimated_cost_crore=55548.87, source_url="july.pdf", source_label="July 2026")
    outcome = asyncio.run(upsert_observation(
        StubDB(held), 1, datetime(2026, 8, 31, tzinfo=timezone.utc),
        progress=86.2, expenditure=28159.22, cost=None,
        portal="MOSPI_IPMD", url="august.pdf", label="MoSPI flash report, August 2026"))
    assert outcome == 2
    assert held.estimated_cost_crore == 55548.87
    assert held.completion_percentage == 86.2
