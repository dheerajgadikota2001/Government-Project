"""
Re-import the 505 AMRUT 2.0 projects from the local MoHUA status PDF.

Runs only this one scraper, and only against backend/fetched/amrut_ap.pdf,
so it needs no network. Use it after changing the PDF parsing: rows are
upserted by the official Project Id, so existing projects are corrected in
place rather than duplicated.

Usage (from backend/):
    python scripts/reimport_amrut.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.amrut_projects import AmrutProjectsScraper
from app.utils.logger import logger


async def main():
    n = await AmrutProjectsScraper().scrape()
    logger.info(f"AMRUT re-import finished: {n} new record(s); existing rows updated in place.")


if __name__ == "__main__":
    asyncio.run(main())
