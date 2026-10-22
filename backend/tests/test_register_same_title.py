"""
Two government line items can have the same title and still be two projects.

The AMRUT status paper lists "APTIDCO- Providing Water Supply Facilities at Kondlapudi and
Venkateshwarapuram in Nellore District" twice: ids AP-NELLORE-12092 (Rs 18.03 crore) and
AP-NELLORE-12060 (Rs 13.86 crore). The register used to keep the first and hide the second, so
/projects/355 had no page and a real line item was missing. The register now treats a repeat of
the same portal id as the same project, and a different id as a different project. A scraped row
that repeats a hand-built record is still dropped, as before.
"""

import pytest
from sqlalchemy import delete

from app.models.project import Project, ProjectStatus, ProjectType

TITLE = "Providing Water Supply Facilities at Kondlapudi and Venkateshwarapuram in Nellore District"
PORTAL = "TEST_SAME_TITLE"


def _row(i, ext, cost):
    return Project(
        id=i, external_id=ext, title=TITLE, estimated_cost_crore=cost, source_portal=PORTAL,
        source_url="https://amrut.mohua.gov.in/x.pdf", project_type=ProjectType.OTHER,
        status=ProjectStatus.UNDER_CONSTRUCTION, is_translated=False,
    )


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_same_title_with_different_portal_ids_are_two_projects_and_a_true_repeat_is_one():
    from app.database import get_db_context
    from app.routers import project_register as pr

    async with get_db_context() as db:
        await db.execute(delete(Project).where(Project.source_portal == PORTAL))
        db.add_all([_row(990001, "AP-X-12092", 18.03), _row(990002, "AP-X-12060", 13.86), _row(990003, "AP-X-12060", 13.86)])
        await db.commit()
    try:
        async with get_db_context() as db:
            register = await pr.get_register.__wrapped__(db)
        mine = sorted((p["id"], p["estimated_cost_crore"]) for p in register["projects"] if p["title"] == TITLE)
        assert mine == [(990001, 18.03), (990002, 13.86)], mine
    finally:
        async with get_db_context() as db:
            await db.execute(delete(Project).where(Project.source_portal == PORTAL))
            await db.commit()
