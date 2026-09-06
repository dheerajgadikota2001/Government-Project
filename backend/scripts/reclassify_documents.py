"""
Re-apply a scraper's current title and classification rules to rows already saved.

WHY THIS EXISTS
Scrapers dedupe on source_url, so a row saved before a classification bug was
found is never revisited: re-running the scraper skips it as "already have
this". The first document run filed twenty state policies as annual reports,
which made the type filter answer a reader's question wrongly — and no amount
of re-scraping would fix it.

The same is true of titles: three rows were saved as "Download the file",
because that is the anchor text the portal uses, and one of them is the Monthly
Economic Report — a document nobody would ever find under that name.

Deleting and re-scraping would also work, but it throws away retrieved_at —
the record of when we actually fetched each file, which is the provenance the
platform's whole claim rests on. So this corrects the type and the title in
place and leaves every other field untouched.

    python scripts/reclassify_documents.py            # show what would change
    python scripts/reclassify_documents.py --apply    # write it

Dry-run by default: it prints each proposed change for a human to read before
anything is written.
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import get_db_context
from app.models.document import Document
from app.scrapers.apsdps_publications import APSDPSPublicationsScraper
from app.scrapers.cse_statistics import CSEStatisticsScraper
from app.scrapers.ppa_reports import PPAReportsScraper
from app.utils.logger import logger

# Portal public name -> the scraper whose rules now govern it.
SCRAPERS = [
    APSDPSPublicationsScraper,
    CSEStatisticsScraper,
    PPAReportsScraper,
]


async def main(apply: bool) -> int:
    changed = 0
    unchanged = 0

    async with get_db_context() as db:
        for cls in SCRAPERS:
            scraper = cls()
            rows = (await db.execute(
                select(Document).where(Document.source_portal == cls.PUBLIC_NAME)
            )).scalars().all()

            if not rows:
                logger.info(f"[{cls.PUBLIC_NAME}] no rows")
                continue

            print(f"\n=== {cls.PUBLIC_NAME} — {len(rows)} row(s) ===")
            for d in rows:
                # Re-derive the title first: a row saved as "Download the file"
                # must be renamed BEFORE it is classified, or the classifier
                # reads a stub and files the document under "other".
                new_title = d.title
                if hasattr(scraper, "_title") and d.source_url:
                    new_title = scraper._title(d.title, d.source_url)

                # The same shape _walk builds, so classify() sees what it saw.
                entry = {"title": new_title, "url": d.source_url or "", "page_title": d.source_page_title}
                new_type = scraper.classify(entry)

                title_changed = new_title != d.title
                type_changed = new_type != d.document_type
                if not title_changed and not type_changed:
                    unchanged += 1
                    continue

                if type_changed:
                    print(f"  {d.document_type.value:14} -> {new_type.value:14}  {new_title[:56]}")
                if title_changed:
                    print(f"  RENAME  {d.title[:34]!r} -> {new_title[:44]!r}")
                changed += 1
                if apply:
                    d.document_type = new_type
                    d.title = new_title[:500]

            await scraper.close()

        if apply:
            # get_db_context commits on exit; this is where the writes land.
            print(f"\nApplied {changed} change(s).")
        else:
            print(f"\n{changed} row(s) would change, {unchanged} already correct.")
            print("Nothing was written. Re-run with --apply to write these changes.")

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.apply)))
