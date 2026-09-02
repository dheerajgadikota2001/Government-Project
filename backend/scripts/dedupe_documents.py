"""
One-time cleanup: collapse duplicate document rows sharing one source_url.

Early district-scrape runs could save the same file twice when a district
page listed it twice (seen as 'Multiple rows were found' warnings during
later runs, e.g. Nellore's 'AGRICULTURE ABSTRACT KHARIF 2024-25'). The
scraper now dedupes within a page and tolerates existing duplicates; this
script removes the duplicates themselves — keeping the oldest row per URL.

Usage:
    python scripts/dedupe_documents.py            # collapse duplicates
    python scripts/dedupe_documents.py --dry-run  # just list them
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, delete, func

from app.database import get_db_context
from app.models.document import Document
from app.models.document_link import DocumentLink
from app.utils.logger import logger


async def main(dry_run: bool) -> None:
    async with get_db_context() as db:
        dup_urls = (await db.execute(
            select(Document.source_url)
            .where(Document.source_url.is_not(None))
            .group_by(Document.source_url)
            .having(func.count(Document.id) > 1)
        )).scalars().all()

        if not dup_urls:
            logger.info("No duplicate source_urls found — nothing to do.")
            return

        to_delete = []
        for url in dup_urls:
            ids = (await db.execute(
                select(Document.id).where(Document.source_url == url).order_by(Document.id)
            )).scalars().all()
            keep, extras = ids[0], ids[1:]
            title = (await db.execute(
                select(Document.title).where(Document.id == keep)
            )).scalar_one()
            logger.info(f"'{title[:70]}' — keeping id {keep}, removing {len(extras)} duplicate(s)")
            to_delete.extend(extras)

        if dry_run:
            logger.info(f"Dry run — would remove {len(to_delete)} duplicate rows across {len(dup_urls)} URLs.")
            return

        await db.execute(delete(DocumentLink).where(DocumentLink.document_id.in_(to_delete)))
        await db.execute(delete(Document).where(Document.id.in_(to_delete)))
        await db.commit()
        logger.info(f"Removed {len(to_delete)} duplicate rows across {len(dup_urls)} URLs.")


if __name__ == "__main__":
    asyncio.run(main(dry_run="--dry-run" in sys.argv))
