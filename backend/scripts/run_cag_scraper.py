"""
Run the CAG Andhra Pradesh audit-reports scraper once, standalone.

Usage:
    python scripts/run_cag_scraper.py

Needs your .env / DATABASE_URL configured and Postgres running (same setup
you already have from `alembic upgrade head`). Safe to run more than once —
it skips any document it's already saved (deduped by the PDF's exact URL).
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.cag_documents import CAGDocumentsScraper
from app.utils.logger import logger


async def main():
    scraper = CAGDocumentsScraper()
    count = await scraper.scrape()
    logger.info(f"Done — {count} new document(s) saved.")


if __name__ == "__main__":
    asyncio.run(main())
