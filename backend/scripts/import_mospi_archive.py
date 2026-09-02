"""
Backfill dated progress observations from an ARCHIVED MoSPI flash report.

The monthly flash reports go back years online. Feeding in reports dated
near government transitions (e.g. around May 2019 and June 2024) gives the
platform cited progress percentages for the same projects at those moments —
which is what makes "how much happened under which government" a matter of
record instead of opinion.

Usage:
    python scripts/import_mospi_archive.py --pdf fetched/FR_MAY_2019.pdf \
        --as-of 2019-04-30 --label "MoSPI flash report, April 2019" \
        [--url https://...original.pdf]

Notes:
  - Writes ONLY progress_observations for projects already known by their
    official code (external_id). It never changes a project's current state.
  - Reports before the 2025 PAIMANA redesign use older layouts. The script
    checks the parse looks sane (hundreds of national rows, AP present) and
    refuses loudly instead of importing garbage — if that happens, send the
    PDF over and the parser gets extended for that format.
"""

import argparse
import asyncio
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import get_db_context
from app.models.project import Project
from app.scrapers.mospi_projects import MospiProjectsScraper, upsert_observation
from app.utils.logger import logger


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, help="path to the archived flash report PDF")
    ap.add_argument("--as-of", required=True, help="date the report's figures are true, YYYY-MM-DD")
    ap.add_argument("--label", required=True, help='e.g. "MoSPI flash report, April 2019"')
    ap.add_argument("--url", default=None, help="original URL of the PDF (for the citation)")
    args = ap.parse_args()

    observed = datetime.strptime(args.as_of, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    scraper = MospiProjectsScraper()
    rows = scraper._parse_table7(args.pdf)
    layout = "table7"
    if not rows:
        # Pre-PAIMANA reports (May 2024 and earlier) carry no state-wise
        # Table 7; their national "Details of ... Projects" sections carry
        # the project codes instead, and the database join decides which
        # entries are Andhra Pradesh's.
        from app.scrapers.mospi_projects import parse_status_details
        logger.info("No Table 7 in this report — trying the pre-PAIMANA 'Details of Projects' layout (slower, page by page).")
        rows = parse_status_details(args.pdf)
        layout = "status"

    if layout == "table7":
        ap_rows = [r for r in rows if r["state"] and "ANDHRA PRADESH" in r["state"]]
        logger.info(f"Parsed {len(rows)} national rows, {len(ap_rows)} Andhra Pradesh rows from {args.pdf}")
        ok = len(rows) >= 500 and ap_rows
    else:
        ap_rows = rows  # no state printed; matching by code below decides
        logger.info(f"Parsed {len(rows)} national project entries (codes, costs, cumulative expenditure) from {args.pdf}")
        ok = len(rows) >= 500

    # Sanity gate — refuse to import a misparsed layout.
    if not ok:
        logger.error(
            "Parse looks wrong for this report's layout (older reports use a "
            "different format). NOT importing. Share this PDF so the parser "
            "can be extended for it."
        )
        sys.exit(1)

    added = matched = unmatched = 0
    async with get_db_context() as db:
        for raw in ap_rows:
            r = MospiProjectsScraper._extract(raw) if layout == "table7" else raw
            if r is None:
                continue
            project_id = (await db.execute(
                select(Project.id).where(Project.external_id == r["code"]).limit(1)
            )).scalars().first()
            if project_id is None:
                unmatched += 1
                continue
            matched += 1
            added += await upsert_observation(
                db, project_id, observed,
                progress=r["progress"], expenditure=r["expenditure"], cost=r["cost"],
                portal="MOSPI_IPMD", url=args.url, label=args.label,
            )
        await db.commit()

    logger.info(
        f"Done: {matched} projects matched by code, {added} observations added "
        f"({matched - added} already recorded), {unmatched} rows not in our register "
        f"(projects that finished or were dropped before our current import — tracked for later)."
    )


if __name__ == "__main__":
    asyncio.run(main())
