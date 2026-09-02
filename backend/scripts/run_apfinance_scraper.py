"""
Run the AP Finance Department budget-documents scraper once, standalone.

Usage:
    python scripts/run_apfinance_scraper.py

Safe to run more than once — skips any document already saved (deduped by
its exact PDF URL).
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.ap_finance_budget import APFinanceBudgetScraper
from app.utils.logger import logger


async def main():
    scraper = APFinanceBudgetScraper()
    count = await scraper.scrape()
    logger.info(f"Done — {count} new document(s) saved.")


if __name__ == "__main__":
    asyncio.run(main())
