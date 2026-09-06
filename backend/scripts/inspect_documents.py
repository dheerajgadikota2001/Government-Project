"""
Print what a scraper actually saved, so a row count can be checked by eye.

A run that reports "31 new" has proved nothing about whether those 31 rows are
documents a reader would want. This prints title, year, and URL for the most
recent rows from a given portal — enough to spot a navigation link saved as a
publication, or a title that is really a button label.

    python scripts/inspect_documents.py                       # all new portals
    python scripts/inspect_documents.py --portal PPA_Reports
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import get_db_context
from app.models.document import Document

PORTALS = [
    "AP Legislature — Bills",
    "AP Economics & Statistics — publications",
    "AP School Education — statistics",
    "Polavaram Project Authority — reports",
]


async def main(portals: list[str], limit: int) -> int:
    async with get_db_context() as db:
        for portal in portals:
            rows = (await db.execute(
                select(Document)
                .where(Document.source_portal == portal)
                .order_by(Document.id.desc())
                .limit(limit)
            )).scalars().all()

            print("\n" + "=" * 78)
            print(f"{portal}  —  {len(rows)} row(s) shown")
            print("=" * 78)
            for d in rows:
                print(f"  [{d.year or '----'}] {d.title[:88]}")
                print(f"          {(d.source_url or '(no file url)')[:96]}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--portal", action="append", help="portal name (repeatable)")
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.portal or PORTALS, args.limit)))
