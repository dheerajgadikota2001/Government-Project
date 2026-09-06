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
from app.scrapers.sanity import SanityAbort
from app.models.document import Document
from app.models.news import NewsArticle
from app.models.project import Project
from app.models.tender import Tender
from app.utils.logger import logger

# Which table each scraper fills, so the recorder knows where to look for the
# rows it just created. `None` means "this scraper writes somewhere we don't
# sample from". The count is still recorded, just without example items.
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


async def previous_status(source: str, before_run_id: str) -> Optional[RunStatus]:
    """The outcome of this source's most recent run before `before_run_id`.

    Alerts are about change, not state. A portal that has been down for a week
    should not produce a fresh "NEEDS YOU" every two hours; it should produce
    one when it breaks, one when it recovers, and a line in the weekly heartbeat
    in between. The previous outcome is what lets the caller tell those apart,
    and it is already in data_updates, so no new table is needed to remember it.

    Returns None when the source has never run before, which the caller treats
    the same as "was fine": a first failure is news.
    """
    async with get_db_context() as db:
        row = (await db.execute(
            select(DataUpdate.status)
            .where(DataUpdate.source == source, DataUpdate.run_id != before_run_id)
            .order_by(DataUpdate.started_at.desc())
            .limit(1)
        )).scalar_one_or_none()
    return row


@asynccontextmanager
async def track(run_id: str, source: str, scraper_cls: type, trigger: RunTrigger):
    """
    Bracket one scraper with an audit row.

        async with track(run_id, "CAG audit reports", CAGDocumentsScraper, trigger) as slot:
            slot["records_new"] = await CAGDocumentsScraper().scrape()

    The caller puts its count in `slot`; exceptions are recorded as failures and
    re-raised is deliberately NOT done. One dead portal must not stop the other
    five scrapers, which is the same contract run_all_scrapers.py already had.
    """
    started_at = datetime.now(timezone.utc)
    slot: dict[str, Any] = {"records_new": 0, "records_updated": 0}
    try:
        yield slot
    except SanityAbort as abort:
        # A refusal is not a crash, and recording it as one would destroy the
        # distinction the sanity layers exist to create. "The parser broke" and
        # "the parser noticed the page moved and declined to write" produce the
        # same exit code and read identically in a log, but one of them is the
        # safety net doing its job, and the person reading the alert needs to
        # know which they are looking at.
        #
        # SKIPPED rather than FAILED: this scraper ran, decided deliberately not
        # to write, and the site is still serving correct data. That is much
        # closer to "skipped" than to "failed", and it avoids an enum migration
        # for a third state whose only consumer is one line of presentation.
        logger.warning(f"{source}: BLOCKED. {abort}")
        await record(
            run_id=run_id, source=source, scraper=scraper_cls.__name__, started_at=started_at,
            status=RunStatus.SKIPPED, trigger=trigger, error=f"sanity refusal: {abort}",
        )
        slot["blocked"] = str(abort)
        return
    except Exception as exc:
        # str() of an httpx timeout is the empty string, and an alert that says
        # "FAILED:" followed by nothing has already cost a real evening of
        # guessing. The type name is always present; the message when it exists.
        detail = f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
        logger.error(f"{source}: FAILED. {detail}")
        await record(
            run_id=run_id, source=source, scraper=scraper_cls.__name__, started_at=started_at,
            status=RunStatus.FAILED, trigger=trigger, error=detail,
        )
        slot["failed"] = True
        return
    await record(
        run_id=run_id, source=source, scraper=scraper_cls.__name__, started_at=started_at,
        status=RunStatus.OK, trigger=trigger,
        records_new=int(slot.get("records_new") or 0),
        records_updated=int(slot.get("records_updated") or 0),
    )
