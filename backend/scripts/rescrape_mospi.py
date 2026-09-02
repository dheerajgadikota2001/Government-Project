r"""
Re-run ONLY the MoSPI central-sector import against the local flash PDF.

Safe to re-run: existing rows are updated in place (progress, cost, and —
since the 2026-09-01 fix — title, project type and department too, so parser
corrections reach rows already in the database). Uses
backend/fetched/mospi_flash.pdf when present; no network needed in that case.

Usage (from backend\):
    python scripts/rescrape_mospi.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.mospi_projects import MospiProjectsScraper
from app.utils.logger import logger


async def main():
    n = await MospiProjectsScraper().scrape()
    logger.info(f"MoSPI re-import finished: {n} new record(s); existing rows updated in place.")


if __name__ == "__main__":
    asyncio.run(main())
