"""
One-time cleanup: remove electoral-roll / voter-list documents from the DB.

The district collectorate sites mix election-office uploads (polling-station
voter lists carrying citizens' names and EPIC numbers) into the same
Documents section as real development documents. This platform deliberately
does not index personal data, so this script deletes every already-scraped
document whose title matches the electoral-roll patterns. The scraper itself
now skips them on every future run (see app/scrapers/district_documents.py).

Usage:
    python scripts/remove_electoral_documents.py            # delete them
    python scripts/remove_electoral_documents.py --dry-run  # just list them
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, delete

from app.database import get_db_context
from app.models.document import Document
from app.models.document_link import DocumentLink
from app.scrapers.district_documents import is_electoral_document
from app.utils.logger import logger


async def main(dry_run: bool) -> None:
    async with get_db_context() as db:
        rows = (await db.execute(select(Document.id, Document.title))).all()
        matches = [(doc_id, title) for doc_id, title in rows if is_electoral_document(title)]

        if not matches:
            logger.info(f"Scanned {len(rows)} documents — no electoral-roll documents found.")
            return

        logger.info(f"Scanned {len(rows)} documents — {len(matches)} electoral-roll documents matched:")
        for _, title in matches[:10]:
            logger.info(f"  - {title[:90]}")
        if len(matches) > 10:
            logger.info(f"  ... and {len(matches) - 10} more")

        if dry_run:
            logger.info("Dry run — nothing deleted.")
            return

        ids = [doc_id for doc_id, _ in matches]
        # Remove any cross-links first (none are expected for these rows,
        # but never leave dangling references).
        await db.execute(delete(DocumentLink).where(DocumentLink.document_id.in_(ids)))
        await db.execute(delete(Document).where(Document.id.in_(ids)))
        await db.commit()
        logger.info(f"Deleted {len(ids)} electoral-roll documents. They will not be re-scraped.")


if __name__ == "__main__":
    asyncio.run(main(dry_run="--dry-run" in sys.argv))
