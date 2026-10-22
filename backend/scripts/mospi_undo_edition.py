r"""
Take one MoSPI edition back out of the register, so it can be imported
again with better matching.

WHY

The first import of the July 2026 report ran before the renumbering map
existed. It matched five rows by title and created 110 new project rows,
95 of them duplicates of June 2025 rows that PAIMANA had renumbered and
reworded. The duplicates have to go before the edition is re-imported
through the map, and they have to go by rule, not by hand: the rows this
edition CREATED are the ones that carry its URL and have no observation
older than its date. Rows it merely refreshed have an older observation
and are kept (their ids are what community threads and indexed pages
point at); the re-import updates them in place.

WHAT IT DOES

    python scripts/mospi_undo_edition.py --url <edition url>            (dry run: lists what would go)
    python scripts/mospi_undo_edition.py --url <edition url> --apply    (deletes)

1. Deletes every project row of this portal whose source_url is the edition
   and whose earliest observation is the edition's own (or that has none).
   Their observations, images, document links and district rows go with
   them (the schema cascades).
2. Deletes the edition's observations on the rows that survive, so the
   re-import records them afresh.
3. Leaves the surviving rows' current figures alone. Their source_url still
   names the edition, so the re-import needs MOSPI_FORCE=1 (the importer
   otherwise sees the URL and reports "already imported").

Then re-import:

    $env:MOSPI_FORCE="1"; python scripts/rescrape_mospi.py
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, func, select  # noqa: E402

from app.config import database_target  # noqa: E402
from app.database import get_db_context  # noqa: E402
from app.models.progress_observation import ProgressObservation  # noqa: E402
from app.models.project import Project  # noqa: E402

PORTAL = "MOSPI_IPMD"


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="the edition's PDF URL as stored in projects.source_url")
    ap.add_argument("--apply", action="store_true", help="actually delete; without it, only report")
    args = ap.parse_args()

    print(f"database: {database_target()}")
    async with get_db_context() as db:
        rows = (await db.execute(
            select(Project).where(Project.source_portal == PORTAL, Project.source_url == args.url)
        )).scalars().all()
        edition_dates = {d for (d,) in (await db.execute(
            select(ProgressObservation.observed_date).where(ProgressObservation.source_url == args.url).distinct()
        )).all()}
        if not rows:
            print(f"no {PORTAL} rows carry {args.url}; nothing to undo")
            return
        edition_date = min(edition_dates) if edition_dates else None
        print(f"{len(rows)} rows carry this edition's URL; its observations are dated "
              f"{', '.join(d.strftime('%d %b %Y') for d in sorted(edition_dates)) or 'never'}")

        created, kept = [], []
        for p in rows:
            earliest = (await db.execute(
                select(func.min(ProgressObservation.observed_date)).where(ProgressObservation.project_id == p.id)
            )).scalar_one()
            if earliest is None or (edition_date is not None and earliest >= edition_date):
                created.append(p)
            else:
                kept.append(p)

        print(f"\n{len(created)} row(s) this edition created (will be deleted):")
        for p in created:
            print(f"  id={p.id} {p.external_id} {p.title[:80]}")
        print(f"\n{len(kept)} row(s) it refreshed (kept; their {len(edition_dates)} edition observation(s) will be re-recorded):")
        for p in kept:
            print(f"  id={p.id} {p.external_id} {p.title[:80]}")

        if not args.apply:
            print("\ndry run: nothing changed. Re-run with --apply to delete.")
            return
        for p in created:
            await db.delete(p)
        if kept and edition_date is not None:
            await db.execute(delete(ProgressObservation).where(
                ProgressObservation.project_id.in_([p.id for p in kept]),
                ProgressObservation.source_url == args.url,
            ))
        await db.commit()
    print(f"\ndeleted {len(created)} project row(s) and the edition's observations on {len(kept)} kept row(s). "
          f'Now re-import: $env:MOSPI_FORCE="1"; python scripts/rescrape_mospi.py')


if __name__ == "__main__":
    asyncio.run(main())
