"""
What the database currently holds from MoSPI, in one screen.

    python scripts/mospi_status.py

Says which database it is reading, which report edition each project row
was last refreshed from, how many dated observations exist per report
month, and Polavaram's figures. Run it before and after an import, and
whenever "the site says X" needs to be checked against "the database says".
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select  # noqa: E402

from app.config import database_target  # noqa: E402
from app.database import get_db_context  # noqa: E402
from app.models.progress_observation import ProgressObservation  # noqa: E402
from app.models.project import Project  # noqa: E402

PORTAL = "MOSPI_IPMD"


def short(url):
    if not url:
        return "(none)"
    return url.rsplit("/", 1)[-1][-48:]


async def main() -> None:
    print(f"database: {database_target()}")
    async with get_db_context() as db:
        rows = (await db.execute(
            select(Project.source_url, func.count(Project.id))
            .where(Project.source_portal == PORTAL)
            .group_by(Project.source_url)
        )).all()
        print(f"\n{PORTAL} project rows, by the report file that last wrote them:")
        for url, n in sorted(rows, key=lambda r: -r[1]):
            print(f"  {n:4d}  {short(url)}")

        obs = (await db.execute(
            select(ProgressObservation.observed_date, ProgressObservation.source_label,
                   func.count(ProgressObservation.id),
                   func.count(ProgressObservation.completion_percentage))
            .where(ProgressObservation.source_portal == PORTAL)
            .group_by(ProgressObservation.observed_date, ProgressObservation.source_label)
            .order_by(ProgressObservation.observed_date)
        )).all()
        print(f"\n{PORTAL} dated observations (rows, of which carry a progress %):")
        for date, label, n, with_pct in obs:
            print(f"  {date:%Y-%m-%d}  {n:4d} rows, {with_pct:4d} with progress   {label or '(no label)'}")

        pol = (await db.execute(
            select(Project).where(Project.title.ilike("%polavaram irrigation%"))
        )).scalars().all()
        print("\nPolavaram rows:")
        for p in pol:
            expected = p.expected_completion.strftime("%Y-%m") if p.expected_completion else ""
            print(f"  id={p.id} code={p.external_id} portal={p.source_portal} progress={p.completion_percentage} "
                  f"cost={p.estimated_cost_crore} expected={expected}")
            print(f"     {(p.description or '')[:140]}")


if __name__ == "__main__":
    asyncio.run(main())
