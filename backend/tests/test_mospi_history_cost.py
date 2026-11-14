"""
A history reading's cost is the revised cost the report prints, or nothing.

The August 2026 flash report prints the revised cost as a bare 0.00 on most rows: the cost is not stated. The
first run of scripts/import_mospi_history.py (14 Nov 2026) fell back to the ORIGINAL cost and wrote it as the
reading's cost on 111 August readings, the same mistake the 30 September repair removed (Polavaram at
Rs 10,151.04 crore). These tests pin, on a real database:
  - an unstated revised cost is written as no cost, never as the original cost
  - --repair-cost clears exactly the costs that equal the row's original cost for that edition
  - a cost the report does state, or a different figure, is never touched
Rows are written under the MoSPI portal with test codes and removed afterwards.
"""

from datetime import datetime, timezone

import pytest
import sqlalchemy as sa

from app.database import get_db_context
from app.models.progress_observation import ProgressObservation
from app.models.project import Project, ProjectStatus, ProjectType
from app.scrapers.mospi_editions import Edition
from app.scrapers.mospi_layout import month_end
import scripts.import_mospi_history as h

AUG = Edition(2026, 8, "Flash Report - August 2026", "https://example.test/history-cost/aug.pdf")
CODES = ("HCOST1", "HCOST2", "HCOST3")


def row(code, cost, original, progress=50.0):
    return {"code": code, "legacy_code": None, "name": code, "state": "Andhra Pradesh", "cost": cost,
            "cost_original": original, "expenditure": 10.0, "progress": progress}


async def wipe():
    async with get_db_context() as db:
        ids = (await db.execute(sa.select(Project.id).where(Project.external_id.in_(CODES)))).scalars().all()
        if ids:
            await db.execute(sa.delete(ProgressObservation).where(ProgressObservation.project_id.in_(ids)))
            await db.execute(sa.delete(Project).where(Project.id.in_(ids)))
        await db.commit()


async def seed() -> dict:
    async with get_db_context() as db:
        made = {}
        for c in CODES:
            p = Project(external_id=c, title=c, description="history cost test", project_type=ProjectType.IRRIGATION,
                        status=ProjectStatus.UNDER_CONSTRUCTION, source_portal=h.PORTAL, source_url=AUG.url)
            db.add(p)
            await db.flush()
            made[c] = p.id
        await db.commit()
    return made


async def cost_of(pid):
    async with get_db_context() as db:
        return (await db.execute(sa.select(ProgressObservation.estimated_cost_crore).where(
            ProgressObservation.project_id == pid,
            ProgressObservation.observed_date == month_end(AUG.year, AUG.month)))).scalar_one()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_an_unstated_revised_cost_is_written_as_no_cost():
    await wipe()
    try:
        ids = await seed()
        rows = [row("HCOST1", None, 10151.04), row("HCOST2", 55548.87, 10151.04), row("HCOST3", None, None)]
        s = await h.import_one(AUG, rows, apply=True)
        assert s["added"] == 3
        assert await cost_of(ids["HCOST1"]) is None          # not the original cost
        assert await cost_of(ids["HCOST2"]) == 55548.87      # the revised cost, as printed
        assert await cost_of(ids["HCOST3"]) is None
    finally:
        await wipe()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_repair_clears_only_the_original_cost_written_in_place_of_an_unstated_one():
    await wipe()
    try:
        ids = await seed()
        observed = month_end(AUG.year, AUG.month)
        async with get_db_context() as db:
            for code, cost in (("HCOST1", 10151.04), ("HCOST2", 55548.87), ("HCOST3", 999.0)):
                db.add(ProgressObservation(project_id=ids[code], observed_date=observed, completion_percentage=50.0,
                                           cumulative_expenditure_crore=10.0, estimated_cost_crore=cost,
                                           source_portal=h.PORTAL, source_url=AUG.url, source_label="t"))
            await db.commit()
        rows = [row("HCOST1", None, 10151.04),     # the first run's mistake: cleared
                row("HCOST2", 55548.87, 10151.04),  # a stated cost: untouched
                row("HCOST3", None, 10151.04)]      # a different figure: untouched
        dry = await h.repair_cost(AUG, rows, apply=False)
        assert dry["cleared"] == 1 and await cost_of(ids["HCOST1"]) == 10151.04   # a dry run writes nothing
        done = await h.repair_cost(AUG, rows, apply=True)
        assert done["cleared"] == 1 and done["kept_other_figure"] == 1
        assert await cost_of(ids["HCOST1"]) is None
        assert await cost_of(ids["HCOST2"]) == 55548.87
        assert await cost_of(ids["HCOST3"]) == 999.0
        assert (await h.repair_cost(AUG, rows, apply=True)).get("cleared", 0) == 0   # a second run changes nothing
    finally:
        await wipe()
