"""
A relisted project is held for a person, never created twice and never merged on a hunch.

WHAT HAPPENED
The September 2026 flash report brought back projects MoSPI had dropped from July and
August, under new codes and new wording. The importer matched them to nothing and created
each as a new project, so four works stood in the register twice (the Visakh-Raipur
pipeline, Kotipalli-Narsapur, Guntakal-Guntur, Vijayawada-Gudur).

WHAT THESE TESTS PIN, on the real rows of June 2025, July 2026 and September 2026, in a
real database, through the importer's own save path:
  - with the reviewed map, the four land on the rows they always were, and nothing is held
  - without those pairs, exactly those four are held: not created, not merged, and the
    owner is asked with the evidence for each
  - the question is asked again on every later run until it is answered
  - once the map answers it, the edition is imported again without anyone forcing it
  - a row the owner lists as 'distinct' is created as a new project

The register rows are written under a test portal name, so a developer's own MoSPI rows
are never touched. No network: the edition and its rows are handed to the importer.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio
import sqlalchemy as sa

from app.database import get_db_context
from app.models.project import Project, ProjectStatus, ProjectType
from app.models.scrape_stat import ScrapeStat
from app.scrapers import mospi_projects as mp
from app.scrapers.mospi_editions import Edition
from app.scrapers.mospi_layout import month_end

FIXTURES = Path(__file__).parent / "fixtures"
REAL_MAP = Path("app/scrapers/mospi_renumbering.json")
PORTAL = "MOSPI_TWIN_TEST"
JUNE_URL = "https://example.test/mospi/FR_JUNE_2025.pdf"
AUG_URL = "https://example.test/mospi/FlashReport_August_2026.pdf"
SEPT = Edition(2026, 9, "Monthly Flash Report - September 2026", "https://example.test/mospi/FlashReport_September_2026.pdf")
FOUR = {"616254": "N16000539", "705436": "220100265", "705633": "N22000368", "705648": "N22000369"}


class TwinTestScraper(mp.MospiProjectsScraper):
    PORTAL_NAME = PORTAL


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))["rows"]


def dt(s):
    return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc) if s else None


def report_row(r: dict) -> dict:
    """A fixture row in the shape the report reader hands to the importer."""
    return {"code": r["code"], "legacy_code": None, "name": r["name"], "agency": None, "state": r["state"],
            "sector": r["sector"], "approval": dt(r["approval"]), "expected": None, "cost": r["cost_revised"],
            "cost_original": r["cost_original"], "cost_not_given": False, "expenditure": None, "progress": r["progress"]}


def tracked(r: dict, url: str) -> Project:
    return Project(external_id=r["code"], title=r["name"], description="seeded for the twin test",
                   project_type=ProjectType(r["ptype"]), status=ProjectStatus.UNDER_CONSTRUCTION,
                   estimated_cost_crore=r["cost_revised"] or r["cost_original"], completion_percentage=r["progress"],
                   announced_date=dt(r["approval"]), department=r["sector"], source_portal=PORTAL, source_url=url)


async def wipe():
    async with get_db_context() as db:
        await db.execute(sa.delete(Project).where(Project.source_portal == PORTAL))
        await db.execute(sa.delete(ScrapeStat).where(ScrapeStat.scraper.in_([PORTAL + mp.HELD_SUFFIX, "TwinTestScraper"])))
        await db.commit()


def use_map(monkeypatch, tmp_path, *, drop_september=False, distinct=()):
    """Point the importer at the real map, or at a copy with the September decisions changed."""
    doc = json.loads(REAL_MAP.read_text(encoding="utf-8"))
    if drop_september:
        doc["pairs"] = [p for p in doc["pairs"] if p.get("edition") != "September 2026"]
    doc["distinct"] = [{"new": c, "why": "test"} for c in distinct]
    path = tmp_path / "map.json"
    path.write_text(json.dumps(doc), encoding="utf-8")
    monkeypatch.setattr(mp, "RENUMBERING_FILE", str(path))
    mp.renumbering.cache_clear()
    mp.distinct_codes.cache_clear()


@pytest_asyncio.fixture
async def register(monkeypatch):
    """The register as it stood before September: every July row, and the 40 June rows July never claimed."""
    await wipe()
    june, july = load("mospi_ap_rows_june2025.json"), load("mospi_ap_rows_july2026.json")
    claimed_by_july = {p["old"] for p in json.loads(REAL_MAP.read_text(encoding="utf-8"))["pairs"] if not p.get("edition")}
    left_behind = [r for r in june if r["code"] not in claimed_by_july]
    async with get_db_context() as db:
        db.add_all([tracked(r, AUG_URL) for r in july] + [tracked(r, JUNE_URL) for r in left_behind])
        await db.commit()
    yield {"seeded": len(july) + len(left_behind)}
    await wipe()
    mp.renumbering.cache_clear()
    mp.distinct_codes.cache_clear()


async def state():
    async with get_db_context() as db:
        rows = (await db.execute(sa.select(Project).where(Project.source_portal == PORTAL))).scalars().all()
    return {"count": len(rows), "codes": {p.external_id for p in rows},
            "by_code": {p.external_id: p for p in rows}}


def september_rows():
    return [report_row(r) for r in load("mospi_ap_rows_sept2026.json")]


async def import_september(scraper=None):
    scraper = scraper or TwinTestScraper()
    saved = await scraper._save(september_rows(), SEPT, month_end(2026, 9))
    return scraper, saved


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_with_the_reviewed_map_the_four_land_on_their_own_rows(register, monkeypatch, tmp_path):
    use_map(monkeypatch, tmp_path)
    scraper, saved = await import_september()
    after = await state()
    assert saved == 15 and scraper.reviews == []                       # 19 new codes, 4 of them old friends
    assert after["count"] == register["seeded"] + 15
    for new, old in FOUR.items():
        assert new in after["codes"] and old not in after["codes"]     # the old row took the new code, no twin
        assert after["by_code"][new].source_url == SEPT.url


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_without_the_pairs_exactly_the_four_are_held_and_the_owner_is_asked(register, monkeypatch, tmp_path):
    use_map(monkeypatch, tmp_path, drop_september=True)
    scraper, saved = await import_september()
    after = await state()
    assert saved == 15                                                 # the 15 real newcomers are not delayed
    assert after["count"] == register["seeded"] + 15
    for new, old in FOUR.items():
        assert new not in after["codes"]                               # not created
        assert old in after["codes"]                                   # not merged: the old row is untouched
        assert after["by_code"][old].source_url == JUNE_URL
    assert len(scraper.reviews) == 1
    text = scraper.reviews[0]
    assert text.startswith("4 row(s) of the")
    for new in FOUR:
        assert new in text
    assert "mospi_renumbering.json" in text and "distinct" in text
    waiting = await scraper._held_waiting(SEPT)
    assert {h["code"] for h in waiting} == set(FOUR)


def offline(monkeypatch, scraper):
    """Let scrape() run without a network: the edition and its rows are handed over."""
    async def edition():
        return SEPT

    async def pdf(_edition):
        return "unused.pdf"
    monkeypatch.setattr(scraper, "_resolve_edition", edition)
    monkeypatch.setattr(scraper, "_get_pdf", pdf)
    monkeypatch.setattr(scraper, "_read_report", lambda _path: (september_rows(), None, None))
    monkeypatch.setattr(mp, "check_groups", lambda *_a, **_k: None)
    scraper.group_totals = {}          # set by the real reader; the group check is switched off here
    monkeypatch.delenv("MOSPI_FORCE", raising=False)
    monkeypatch.delenv("MOSPI_FLASH_URL", raising=False)


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_the_question_is_asked_again_until_answered_then_the_edition_imports_itself(register, monkeypatch, tmp_path):
    use_map(monkeypatch, tmp_path, drop_september=True)
    await import_september()
    held_state = await state()

    # The next morning, nothing decided: nothing is written, and the owner is asked again.
    again = TwinTestScraper()
    offline(monkeypatch, again)
    assert await again.scrape() == 0
    assert len(again.reviews) == 1 and "616254" in again.reviews[0]
    assert (await state())["codes"] == held_state["codes"]

    # The map now answers it. No MOSPI_FORCE: the importer sees the answer and imports the edition again.
    use_map(monkeypatch, tmp_path)
    healed = TwinTestScraper()
    offline(monkeypatch, healed)
    assert await healed.scrape() == 0                                  # four rows re-keyed, none created
    after = await state()
    assert healed.reviews == []
    assert any("now have a decision" in n for n in healed.notes)
    assert after["count"] == held_state["count"]
    for new, old in FOUR.items():
        assert new in after["codes"] and old not in after["codes"]
    assert await healed._held_waiting(SEPT) == []                      # the question is closed

    # And the morning after that is quiet.
    quiet = TwinTestScraper()
    offline(monkeypatch, quiet)
    assert await quiet.scrape() == 0 and quiet.reviews == []
    assert any("already imported" in n for n in quiet.notes)


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_a_row_the_owner_calls_distinct_is_created_as_new(register, monkeypatch, tmp_path):
    use_map(monkeypatch, tmp_path, drop_september=True, distinct=["705436"])
    scraper, saved = await import_september()
    after = await state()
    assert saved == 16                                                 # the 15 and the one called distinct
    assert "705436" in after["codes"] and "220100265" in after["codes"]
    assert len(scraper.reviews) == 1 and scraper.reviews[0].startswith("3 row(s)")
    assert "705436" not in scraper.reviews[0]


def test_the_review_reaches_needs_you_in_the_alert_email():
    from app.services import alerts
    text = mp.held_text("MoSPI flash report, September 2026", [
        {"code": "705633", "name": "Guntakal - Guntur 401.47 km", "twin_id": 532, "twin_title": "GUNTUR-GUNTAKAL", "why": "name 100% shared"}])
    report = {"needs_you": [{"kind": "needs your decision", "title": "Central-sector projects (MoSPI flash report)",
                             "detail": text, "action": "Decide, record it in the file named above, and deploy."}],
              "blocked": [], "changed": [], "quiet": [], "dead": [], "recovered": [], "still_failing": [], "notes": [],
              "heartbeat": False, "groups": ["daily"], "not_run": [], "run_id": "abcdef12", "started_at": None, "duration_s": 1}
    subject, body = alerts.build_body(report)
    assert alerts.should_send(report)
    assert "1 need you" in subject
    assert "705633 Guntakal - Guntur 401.47 km looks like #532 GUNTUR-GUNTAKAL (name 100% shared)" in body
