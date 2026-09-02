"""
Run every working scraper, one after another. The one command to refresh
the platform's data.

Usage:
    python scripts/run_all_scrapers.py

Each scraper dedupes against the database, so this is always safe to re-run.
Order: cheapest/most-current first. A failure in one scraper never stops
the others.
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.scrapers.cag_documents import CAGDocumentsScraper
from app.scrapers.ap_finance_budget import APFinanceBudgetScraper
from app.scrapers.neva_notices import NevaNoticesScraper
from app.scrapers.district_documents import DistrictDocumentsScraper
from app.scrapers.amrut_projects import AmrutProjectsScraper
from app.scrapers.mospi_projects import MospiProjectsScraper
from app.utils.logger import logger


SCRAPERS = [
    ("NeVA assembly notice board", NevaNoticesScraper),
    ("CAG audit reports", CAGDocumentsScraper),
    ("AP Finance budget volumes", APFinanceBudgetScraper),
    ("District collectorates (26 districts)", DistrictDocumentsScraper),
    ("AMRUT 2.0 urban projects (MoHUA)", AmrutProjectsScraper),
    ("Central-sector projects (MoSPI flash report)", MospiProjectsScraper),
]


async def main():
    results = {}
    for name, cls in SCRAPERS:
        logger.info(f"=== {name} ===")
        try:
            count = await cls().scrape()
            results[name] = count
        except Exception as e:
            logger.error(f"FAILED: {e}")
            results[name] = f"failed: {e}"

    logger.info("=" * 50)
    logger.info("Run summary:")
    for name, result in results.items():
        logger.info(f"  {name}: {result} new record(s)" if isinstance(result, int) else f"  {name}: {result}")


if __name__ == "__main__":
    asyncio.run(main())
