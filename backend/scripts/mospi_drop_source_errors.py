r"""
Remove register rows that match a reviewed MoSPI source error.

WHY

MoSPI's flash report printed the Zojila tunnel road (NH-01, Sonamarg to
Kargil) under "Andhra Pradesh" from July 2026, and the importer took it in
as #705. The site's builder held it back, but the database and the API
still carried it, and every later feature reading the database (voice,
news, search) would have too. The importer now skips such rows by the list
in app/scrapers/mospi_source_errors.json. This script removes the row it
already wrote, by the same list, so the two can never disagree.

WHAT IT DOES

    python scripts/mospi_drop_source_errors.py            (dry run: lists what would go)
    python scripts/mospi_drop_source_errors.py --apply    (deletes)

Only rows of the MoSPI portal are looked at. A row goes when its code or its
title matches an entry (scripts and importer share source_error_for). Its
observations, images, document links and district rows go with it (the
schema cascades). Running it again finds nothing and changes nothing.
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.config import database_target  # noqa: E402
from app.database import get_db_context  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.scrapers.mospi_projects import source_error_for  # noqa: E402

PORTAL = "MOSPI_IPMD"


async def matching_rows(db, portal: str = PORTAL) -> list[tuple[Project, dict]]:
    """This portal's rows that match a reviewed source error, with the entry each matches."""
    rows = (await db.execute(select(Project).where(Project.source_portal == portal))).scalars().all()
    out = []
    for p in rows:
        e = source_error_for(p.external_id, p.title)
        if e:
            out.append((p, e))
    return out


async def drop(apply: bool, portal: str = PORTAL) -> list[int]:
    """Delete (or with apply=False only list) the matching rows. Returns their ids."""
    async with get_db_context() as db:
        found = await matching_rows(db, portal)
        for p, e in found:
            print(f"  id={p.id} {p.external_id} {p.title[:80]}")
            print(f"      listed as a source error: {e.get('why', '')[:120]}")
        ids = [p.id for p, _ in found]
        if apply:
            for p, _ in found:
                await db.delete(p)
            await db.commit()
    return ids


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually delete; without it, only report")
    args = ap.parse_args()
    print(f"database: {database_target()}")
    ids = await drop(args.apply)
    if not ids:
        print("no rows match a listed source error; nothing to do")
    elif args.apply:
        print(f"deleted {len(ids)} row(s): {ids}")
    else:
        print(f"dry run: {len(ids)} row(s) would be deleted. Re-run with --apply.")


if __name__ == "__main__":
    asyncio.run(main())
