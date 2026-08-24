"""
Celery scraper tasks — each task wraps a scraper class and runs it in the background.
Triggered on schedule by Celery Beat, or manually via the API.
"""

import asyncio
from app.tasks.celery_app import celery_app
from app.utils.logger import logger


def run_async(coro):
    """Helper to run async scraper code from synchronous Celery task."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.tasks.scraper_tasks.run_ap_tenders_scraper", bind=True, max_retries=3)
def run_ap_tenders_scraper(self):
    """Scrape AP eProcurement portal for new/updated tenders."""
    try:
        from app.scrapers.ap_tenders import APTendersScraper
        scraper = APTendersScraper()
        count = run_async(scraper.scrape())
        logger.info(f"AP Tenders scraper completed: {count} records")
        return {"status": "success", "records": count}
    except Exception as exc:
        logger.error(f"AP Tenders scraper failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@celery_app.task(name="app.tasks.scraper_tasks.run_sakshi_news", bind=True, max_retries=3)
def run_sakshi_news(self):
    """Scrape Sakshi news articles."""
    try:
        from app.scrapers.news.sakshi import SakshiScraper
        scraper = SakshiScraper()
        count = run_async(scraper.scrape())
        return {"status": "success", "records": count}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.scraper_tasks.run_eenadu_news", bind=True, max_retries=3)
def run_eenadu_news(self):
    """Scrape Eenadu news articles."""
    try:
        from app.scrapers.news.eenadu import EenaduScraper
        scraper = EenaduScraper()
        count = run_async(scraper.scrape())
        return {"status": "success", "records": count}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.scraper_tasks.run_apiic_scraper", bind=True, max_retries=2)
def run_apiic_scraper(self):
    """Scrape APIIC portal for industrial projects and MoUs."""
    try:
        # APIIC scraper to be built in Sprint 2
        logger.info("APIIC scraper: placeholder — will be implemented in Sprint 2")
        return {"status": "pending", "records": 0}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(name="app.tasks.scraper_tasks.run_all_scrapers")
def run_all_scrapers():
    """Manually trigger all scrapers at once (used for initial data load)."""
    tasks = [
        run_ap_tenders_scraper.delay(),
        run_sakshi_news.delay(),
        run_eenadu_news.delay(),
    ]
    return {"triggered": len(tasks), "task_ids": [t.id for t in tasks]}
