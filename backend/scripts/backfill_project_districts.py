"""
Fill project_districts from the district each project already names.

WHY THIS IS A SCRIPT AND NOT JUST THE MIGRATION
Migration 0007 does this in its own upgrade step. On this deployment that step
never ran: `alembic upgrade head` died at 0005 with

    psycopg2.errors.DuplicateObject: type "run_status" already exists

because app/database.py calls metadata.create_all at startup, so the enum (and
every table) already existed before alembic tried to create it. The schema was
therefore correct and the migration history was not — and the backfill, which
lives inside a migration, was skipped along with everything after it.

    # tell alembic the schema it would have built is already there
    alembic stamp head
    # then put the data in
    python scripts/backfill_project_districts.py            # dry run
    python scripts/backfill_project_districts.py --apply

Idempotent: it inserts only pairs that are not already recorded, so running it
twice is a no-op and running it after a partial run finishes the job.

NOTE ON WHY THE SITE DID NOT NEED THIS TO RECOVER
/projects/insights now reads districts from project_districts UNION the older
projects.district column, so the map is correct whether or not this has run.
This makes the link table complete, which is what multi-district projects need.
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select                                   # noqa: E402

from app.database import get_db_context                               # noqa: E402
from app.models.project import Project                                # noqa: E402
from app.models.project_district import DistrictRole, ProjectDistrict  # noqa: E402
from app.utils.logger import logger                                   # noqa: E402


async def main(apply: bool) -> int:
    async with get_db_context() as db:
        existing = {
            (pid, name)
            for pid, name in (await db.execute(
                select(ProjectDistrict.project_id, ProjectDistrict.district)
                .where(ProjectDistrict.role == DistrictRole.PRIMARY)
            )).all()
        }

        rows = (await db.execute(
            select(Project.id, Project.district, Project.title, Project.source_url)
            .where(Project.district.is_not(None), func.btrim(Project.district) != "")
        )).all()

        todo = [r for r in rows if (r[0], r[1]) not in existing]
        print(f"{len(rows)} project(s) name a district; "
              f"{len(existing)} primary link(s) already recorded; "
              f"{len(todo)} to insert.")

        if not apply:
            for pid, district, title, _ in todo[:15]:
                print(f"  + {district:28} {str(title)[:60]}")
            if len(todo) > 15:
                print(f"  … and {len(todo) - 15} more")
            print("\nDry run — nothing written. Re-run with --apply.")
            return 0

        for pid, district, title, source_url in todo:
            db.add(ProjectDistrict(
                project_id=pid,
                district=district[:100],
                role=DistrictRole.PRIMARY,
                source_url=source_url,
                # The project's own title is the closest thing to a citation we
                # have for a district it already carried; the real per-district
                # citations arrive with the sourcing probe.
                source_title=(str(title)[:500] if title else None),
                note="Backfilled from the project record's own district field.",
            ))
        await db.commit()
        logger.info(f"[backfill] inserted {len(todo)} primary district link(s)")
        print(f"Inserted {len(todo)} link(s).")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write (default is a dry run)")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.apply)))
