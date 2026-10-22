"""
WHY THIS TEST EXISTS

mospi_renumbering.json decides which register row a renumbered report row
updates. A wrong pair rewrites one project's history with another's, so
the file is held to the same standard as the parser: every pair names two
codes that exist in the two editions, in the same sector, once, with the
evidence it was accepted on. The importer must follow the file and only
the file.
"""
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.scrapers.mospi_editions import Edition
from app.scrapers.mospi_projects import (
    MospiProjectsScraper, absent_note, new_code_for, old_code_for, renumbering, with_absent_note,
)
from scripts.mospi_renumbering import check

FIXTURES = Path(__file__).parent / "fixtures"


def rows(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))["rows"]


def test_every_pair_is_consistent_with_both_editions():
    assert check(rows("mospi_ap_rows_june2025.json"), rows("mospi_ap_rows_july2026.json")) == []


def test_the_map_reads_both_ways_and_knows_polavaram():
    assert old_code_for("701415") == "N30000002"
    assert new_code_for("N30000002") == "701415"
    assert old_code_for("000000") is None and new_code_for("nope") is None
    assert len(renumbering()) >= 60


def test_a_code_used_twice_is_refused(tmp_path, monkeypatch):
    bad = tmp_path / "map.json"
    bad.write_text(json.dumps({"pairs": [
        {"new": "1", "old": "A", "how": "reviewed", "evidence": "x"},
        {"new": "2", "old": "A", "how": "reviewed", "evidence": "x"},
    ]}), encoding="utf-8")
    monkeypatch.setattr("app.scrapers.mospi_projects.RENUMBERING_FILE", str(bad))
    renumbering.cache_clear()
    try:
        with pytest.raises(ValueError):
            renumbering()
    finally:
        renumbering.cache_clear()


# The importer follows the map

class StubDB:
    """Answers the two queries _find_existing and _note_absent make, by
    reading the literal values in the compiled statement."""

    def __init__(self, projects):
        self.projects = projects

    async def execute(self, stmt):
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "source_url !=" in sql:
            absent = [p for p in self.projects if f"'{p.source_url}'" not in sql]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: absent))
        hit = next((p for p in self.projects if f"'{p.external_id}'" in sql), None)
        return SimpleNamespace(scalar_one_or_none=lambda: hit)


def project(**over):
    base = dict(id=1, external_id="N30000002", title="POLAVARAM IRRIGATION PROJECT", source_url="june.pdf",
                source_portal="MOSPI_IPMD", description="Central-sector project tracked in the June 2025 report.")
    base.update(over)
    return SimpleNamespace(**base)


def find(row, projects):
    return asyncio.run(MospiProjectsScraper()._find_existing(StubDB(projects), row, {}))


def test_a_renumbered_row_lands_on_the_row_the_map_names():
    old = project()
    hit, how = find({"code": "701415", "legacy_code": None, "name": "Polavaram Irrigation Project"}, [old])
    assert hit is old and how == "renumbering map"


def test_the_current_code_wins_over_the_map():
    rekeyed = project(id=1, external_id="701415")
    stale = project(id=2, external_id="N30000002")
    hit, how = find({"code": "701415", "legacy_code": None, "name": "Polavaram Irrigation Project"}, [rekeyed, stale])
    assert hit is rekeyed and how == "code"


def test_a_code_outside_the_map_is_new_unless_the_title_says_otherwise():
    hit, how = find({"code": "999999", "legacy_code": None, "name": "Something else"}, [project()])
    assert hit is None and how == "new"


def test_rows_the_edition_did_not_list_are_marked_once():
    july = Edition(2026, 7, "MoSPI flash report, July 2026", "july.pdf")
    listed = project(id=1, source_url="july.pdf")
    dropped = project(id=2, external_id="N42000005", source_url="june.pdf",
                      description="Central-sector project tracked in the June 2025 report.")
    already = project(id=3, external_id="N42000007", source_url="june.pdf",
                      description="Tracked. " + absent_note(july.label))
    n = asyncio.run(MospiProjectsScraper()._note_absent(StubDB([listed, dropped, already]), july))
    assert n == 1
    assert dropped.description.endswith(absent_note(july.label))
    assert "July 2026" not in listed.description
    assert already.description.count("Not listed") == 1


def test_a_row_unlisted_for_months_carries_one_sentence_for_the_newest_edition():
    d = with_absent_note("Tracked in June 2025. " + absent_note("MoSPI flash report, July 2026"),
                         "MoSPI flash report, August 2026")
    assert d == "Tracked in June 2025. Not listed among ongoing projects in the MoSPI flash report, August 2026."
