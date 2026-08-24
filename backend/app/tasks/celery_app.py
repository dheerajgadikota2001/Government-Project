"""
Celery application — background task queue for scrapers, translation, notifications.
Uses Redis as both broker and result backend.
"""

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "applatform",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks.scraper_tasks",
        "app.tasks.translation_tasks",
    ],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,

    # Performance
    worker_prefetch_multiplier=1,       # Don't prefetch tasks — better for long-running jobs
    task_acks_late=True,                # Acknowledge only after task completes (safer)
    task_reject_on_worker_lost=True,    # Re-queue if worker crashes

    # Result expiry
    result_expires=3600,                # Task results expire after 1 hour

    # Beat schedule — runs scraper jobs automatically
    beat_schedule={
        # Tenders: every 2 hours
        "scrape-ap-tenders": {
            "task": "app.tasks.scraper_tasks.run_ap_tenders_scraper",
            "schedule": crontab(minute=0, hour="*/2"),
        },
        # News: every 30 minutes
        "scrape-sakshi-news": {
            "task": "app.tasks.scraper_tasks.run_sakshi_news",
            "schedule": crontab(minute="*/30"),
        },
        "scrape-eenadu-news": {
            "task": "app.tasks.scraper_tasks.run_eenadu_news",
            "schedule": crontab(minute=15, hour="*/1"),
        },
        # APIIC projects: once daily at 2am IST
        "scrape-apiic": {
            "task": "app.tasks.scraper_tasks.run_apiic_scraper",
            "schedule": crontab(minute=0, hour=2),
        },
        # Translate untranslated items: every hour
        "translate-pending": {
            "task": "app.tasks.translation_tasks.translate_pending_items",
            "schedule": crontab(minute=30, hour="*/1"),
        },
    },
)
