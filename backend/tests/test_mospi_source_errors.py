"""
A row MoSPI files under Andhra Pradesh by mistake stays out of the register.

The September 2026 report prints the Zojila tunnel road (NH-01, Ladakh) under
"Andhra Pradesh". These tests pin, on the real September rows:
  - exactly that row is skipped, and nothing else
  - it is still skipped if MoSPI renumbers it (the name phrase)
  - the list itself is well formed: every entry says why and who decided
  - the clean-up script finds the row already in a database, deletes it with
    --apply only, and a second run finds nothing
The database rows are written under a test portal name, so a developer's own
MoSPI rows are never touched.
"""

import json
from pathlib import Path

import pytest
import sqlalchemy as sa

from app.database import get_db_context
from app.models.project import Project, ProjectStatus, ProjectType
from app.scrapers import mospi_projects as mp

FIXTURES = Path(__file__).parent / "fixtures"
PORTAL = "MOSPI_SRCERR_TEST"
ZOJILA = "618412"


def september():
    return json.loads((FIXTURES / "mospi_ap_rows_sept2026.json").read_text(encoding="utf-8"))["rows"]


def test_exactly_the_zojila_row_is_skipped_from_the_september_report():
    rows = september()
    keep, dropped = mp.drop_source_errors(rows)
    assert [r["code"] for r, _ in dropped] == [ZOJILA]
    assert len(keep) == len(rows) - 1
    assert all("zojila" not in r["name"].lower() for r in keep)


def test_a_renumbered_or_reworded_copy_is_still_caught_by_its_name():
    assert mp.source_error_for("999999", "Z-Morh to ZOJILA-TUNNEL connecting road") is not None
    assert mp.source_error_for(ZOJILA, "any name at all") is not None
    assert mp.source_error_for("701415", "Polavaram Irrigation Project") is None


def test_every_entry_carries_its_reason_and_its_decision():
    for e in mp.source_errors():
        for field in ("code", "name_phrase", "printed_state", "why", "decided_on", "decided_by"):
            assert e.get(field), (e.get("code"), field)
        assert len(mp._squash(e["name_phrase"])) >= 8, "a short phrase would catch real works"


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_the_cleanup_deletes_the_existing_row_only_when_asked_and_only_once():
    from scripts.mospi_drop_source_errors import drop

    async def wipe():
        async with get_db_context() as db:
            await db.execute(sa.delete(Project).where(Project.source_portal == PORTAL))
            await db.commit()

    await wipe()
    try:
        async with get_db_context() as db:
            zojila = next(r["name"] for r in september() if r["code"] == ZOJILA)
            for code, title in ((ZOJILA, zojila), ("701415", "Polavaram Irrigation Project")):
                db.add(Project(external_id=code, title=title, description="seeded for the source-error test",
                               project_type=ProjectType.ROADS, status=ProjectStatus.UNDER_CONSTRUCTION,
                               source_portal=PORTAL, source_url="https://example.test/flash.pdf"))
            await db.commit()

        assert len(await drop(apply=False, portal=PORTAL)) == 1          # dry run lists it
        async with get_db_context() as db:
            n = (await db.execute(sa.select(sa.func.count()).select_from(Project)
                                  .where(Project.source_portal == PORTAL))).scalar_one()
        assert n == 2                                                     # and changes nothing

        assert len(await drop(apply=True, portal=PORTAL)) == 1
        async with get_db_context() as db:
            left = (await db.execute(sa.select(Project.external_id).where(Project.source_portal == PORTAL))).scalars().all()
        assert left == ["701415"]                                         # Polavaram untouched
        assert await drop(apply=True, portal=PORTAL) == []                # a second run finds nothing
    finally:
        await wipe()
