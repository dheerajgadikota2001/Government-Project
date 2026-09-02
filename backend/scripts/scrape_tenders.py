r"""
Fetch the live AP CRDA Tenders/Auctions board into the tenders table.

Safe to re-run any time: rows upsert on the portal's own notification id,
tenders that left the board are marked closed (never deleted), and a layout
change on the CRDA site aborts loudly instead of saving garbage. The home
page's tenders card switches from "Coming soon" to live counts on its own
once rows exist.

Usage (from backend\):
    python scripts/scrape_tenders.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.crda_tenders import CrdaTendersScraper
from app.utils.logger import logger


async def main():
    n = await CrdaTendersScraper().scrape()
    logger.info(f"CRDA tenders scrape finished: {n} new tender(s); existing rows updated in place.")


if __name__ == "__main__":
    asyncio.run(main())
