"""
Writes the audit trail for a refresh run.

A scraper returns a count and nothing else, and rewriting six scrapers to hand
back the items they saved would be a lot of churn for one page. So the recorder
brackets each scraper with a timestamp and afterwards asks the table that
scraper writes into for the rows created since it started. That is how samples
("3 new CAG reports: <titles>") appear without any scraper knowing this file
exists.

The recorder never lets a bookkeeping problem take down a refresh: if the row
cannot be written, the scraper's work still stands and the failure is logged.
Losing an audit row is a nuisance; losing a night's scrape because the audit
table was locked would be self-defeating.
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional, Type

from sqlalchemy import select

from app.database import get_db_context
from app.models.data_update import DataUpdate, RunStatus, RunTrigger
from app.models.document import Document
from app.models.news import NewsArticle
from app.models.project import Project
from app.models.tender import Tender
from app.utils.logger import logger

# Which table each scraper fills, so the recorder knows where to look for the
# rows it just created. `None` means "this scraper writes somewhere we don't
# sample from" — the count is still recorded, just without example items.
SAMPLE_TABLES: dict[str, tuple[Type, str, str]] = {
    # scraper class name -> (model, title column, url column)
    "CAGDocumentsScraper": (Document, "title", "source_url"),
    "APFinanceBudgetScraper": (Document, "title", "source_url"),
    "NevaNoticesScraper": (Document, "title", "source_url"),
    "DistrictDocumentsScraper": (Document, "title", "source_url"),
    "AmrutProjectsScraper": (Project, "title", "source_url"),
    "MospiProjectsScraper": (Project, "title", "source_url"),
    "APTendersScraper": (Tender, "title", "source_url"),
    "CrdaTendersScraper": (Tender, "title", "source_url"),
    "SakshiScraper": (NewsArticle, "title", "source_url"),
    "EenaduScraper": (NewsArticle, "title", "source_url"),
}

MAX_SAMPLES = 5


def new_run_id() -> str:
    return str(uuid.uuid4())


async def _collect_samples(
    scraper_name: str, since: datetime, limit: int = MAX_SAMPLES
) -> Optional[list[dict[str, Any]]]:
    """The rows this scraper's table gained since `since`, at most five.

    Capped at the number the scraper reported, so a run that saved two items
    cannot show five: the window is a time range, and anything else writing to
    the same table during the run would otherwise be attributed to this source.
    """
    mapping = SAMPLE_TABLES.get(scraper_name)
    if not mapping:
        return None
    model, title_col, url_col = mapping
    try:
        async with get_db_context() as db:
            rows = (
                await db.execute(
                    select(model)
                    .where(model.created_at >= since)
                    .order_by(model.created_at.desc())
                    .limit(max(0, min(MAX_SAMPLES, limit)))
                )
            ).scalars().all()
        return [
            {
                "title": (getattr(row, title_col, None) or "")[:300],
                "url": getattr(row, url_col, None),
            }
            for row in rows
        ] or None
    except Exception as exc:  # pragma: no cover - sampling is best-effort
        logger.warning(f"run recorder: could not collect samples for {scraper_name}: {exc}")
        return None


async def record(
    *,
    run_id: str,
    source: str,
    scraper: str,
    started_at: datetime,
    status: RunStatus,
    trigger: RunTrigger,
    records_new: int = 0,
    records_updated: int = 0,
    error: Optional[str] = None,
) -> None:
    """Write one audit row. Never raises."""
    finished_at = datetime.now(timezone.utc)
    samples = (
        await _collect_samples(scraper, started_at, records_new)
        if status is RunStatus.OK and records_new
        else None
    )
    try:
        async with get_db_context() as db:
            db.add(
                DataUpdate(
                    run_id=run_id,
                    source=source,
                    scraper=scraper,
                    started_at=started_at,
                    finished_at=finished_at,
                    duration_seconds=round((finished_at - started_at).total_seconds(), 2),
                    status=status,
                    trigger=trigger,
                    records_new=records_new,
                    records_updated=records_updated,
                    samples=samples,
                    # Only the first line: this feeds a public page, and a full
                    # traceback leaks file paths and library versions.
                    error=(str(error).strip().splitlines() or [""])[0][:500] if error else None,
                )
            )
    except Exception as exc:  # pragma: no cover
        logger.error(f"run recorder: could not save the audit row for {source}: {exc}")


@asynccontextmanager
async def track(run_id: str, source: str, scraper_cls: type, trigger: RunTrigger):
    """
    Bracket one scraper with an audit row.

        async with track(run_id, "CAG audit reports", CAGDocumentsScraper, trigger) as slot:
            slot["records_new"] = await CAGDocumentsScraper().scrape()

    The caller puts its count in `slot`; exceptions are recorded as failures and
    re-raised is deliberately NOT done — one dead portal must not stop the other
    five scrapers, which is the same contract run_all_scrapers.py already had.
    """
    started_at = datetime.now(timezone.utc)
    slot: dict[str, Any] = {"records_new": 0, "records_updated": 0}
    try:
        yield slot
    except Exception as exc:
        logger.error(f"{source}: FAILED — {exc}")
        await record(
            run_id=run_id, source=source, scraper=scraper_cls.__name__, started_at=started_at,
            status=RunStatus.FAILED, trigger=trigger, error=str(exc),
        )
        slot["failed"] = True
        return
    await record(
        run_id=run_id, source=source, scraper=scraper_cls.__name__, started_at=started_at,
        status=RunStatus.OK, trigger=trigger,
        records_new=int(slot.get("records_new") or 0),
        records_updated=int(slot.get("records_updated") or 0),
    )
