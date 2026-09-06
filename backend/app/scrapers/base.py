"""
Base scraper class — all portal scrapers extend this.
Handles: rate limiting, retry logic, session management, polite crawling.
"""

import asyncio
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.config import settings
from app.utils.logger import logger
from app.scrapers.sanity import SanityAbort, SanityGate, SanitySpec, summarise


class BaseScraper(ABC):
    """
    Abstract base for all AP government portal scrapers.

    Subclasses implement:
        - scrape() → the main scraping entry point
        - parse_item() → parse a single record from raw HTML/JSON

    The base class provides:
        - Retry logic with exponential backoff
        - Polite rate limiting (configurable delay between requests)
        - User-agent header (identifies us to government servers)
        - Session reuse for efficiency
    """

    # Override in subclass
    PORTAL_NAME: str = "unknown"
    BASE_URL: str = ""

    # What a healthy batch from this scraper looks like. A scraper that declares
    # nothing is not gated — which is a deliberate escape hatch, not a default
    # anyone should be comfortable with. See app/scrapers/sanity.py.
    SANITY: Optional[SanitySpec] = None

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self.scraped_at = datetime.now(timezone.utc)

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={
                    "User-Agent": settings.scraper_user_agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-IN,en;q=0.9,te;q=0.8",
                },
                timeout=httpx.Timeout(settings.scraper_timeout),
                follow_redirects=True,
            )
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        reraise=True,
    )
    async def fetch(self, url: str, params: Optional[dict] = None) -> httpx.Response:
        """Fetch a URL with automatic retry on network errors."""
        logger.debug(f"[{self.PORTAL_NAME}] Fetching: {url}")
        await asyncio.sleep(settings.scraper_request_delay)   # Be polite
        response = await self.client.get(url, params=params)
        response.raise_for_status()
        return response

    async def fetch_json(self, url: str, params: Optional[dict] = None) -> dict:
        """Fetch and parse JSON response."""
        response = await self.fetch(url, params=params)
        return response.json()

    @abstractmethod
    async def scrape(self) -> int:
        """
        Main scraping method. Returns number of records processed.
        Must be implemented by each portal scraper.
        """
        ...

    async def gate(self, rows: list[dict], run_id: str = "") -> list[dict]:
        """Run the sanity layers over a parsed batch, and remember its shape.

        Called at the top of a scraper's save path, before anything reaches the
        database. Returns the rows that may be written; raises SanityAbort to
        refuse the batch outright.

        The refusal is the point. A stale figure carrying an honest date is
        recoverable by the next run; a wrong figure presented as sourced is what
        this whole platform exists to prevent, and once it is published a reader
        has already seen it.

        Every outcome — passed, partly dropped, refused — is written to
        scrape_stats, because the next run's drift check has no other memory:
        the container that ran today is destroyed before tomorrow's starts.
        """
        if self.SANITY is None:
            return list(rows)

        # Imported here rather than at module scope: the scraper package is
        # imported by tooling that has no database configured, and a model
        # import at the top would drag the engine in with it.
        from sqlalchemy import select
        from app.database import get_db_context
        from app.models.scrape_stat import ScrapeStat

        name = type(self).__name__

        baseline: list[dict] = []
        try:
            async with get_db_context() as db:
                previous = (await db.execute(
                    select(ScrapeStat)
                    .where(ScrapeStat.scraper == name, ScrapeStat.aborted.is_(False))
                    .order_by(ScrapeStat.created_at.desc())
                    .limit(5)
                )).scalars().all()
                baseline = [row.stats for row in previous if row.stats]
        except Exception as exc:                     # noqa: BLE001
            # No baseline means layer 3 is skipped for this run. That is a
            # weaker check, not a reason to abandon the scrape.
            logger.warning(f"[{self.PORTAL_NAME}] could not read drift baseline: {exc}")

        gate = SanityGate(name, self.SANITY, baseline)
        try:
            result = gate.run(rows)
        except SanityAbort as abort:
            await self._record_stats(
                name, run_id, rows=0, stats=summarise(rows, self.SANITY),
                rejected=len(rows), reason=None, aborted=True, abort_reason=str(abort),
            )
            raise

        await self._record_stats(
            name, run_id, rows=len(result.rows), stats=result.stats,
            rejected=len(result.rejected), reason=result.rejected_summary or None,
            aborted=False, abort_reason=None,
        )
        return result.rows

    async def _record_stats(self, name, run_id, rows, stats, rejected,
                            reason, aborted, abort_reason) -> None:
        """Persist one batch's shape. Never lets bookkeeping break a scrape."""
        from app.database import get_db_context
        from app.models.scrape_stat import ScrapeStat
        try:
            async with get_db_context() as db:
                db.add(ScrapeStat(
                    run_id=run_id or "adhoc", scraper=name, rows=rows, stats=stats,
                    rejected=rejected, rejected_reason=(reason or None),
                    aborted=aborted,
                    abort_reason=(abort_reason[:1000] if abort_reason else None),
                ))
                await db.commit()
        except Exception as exc:                     # noqa: BLE001
            logger.warning(f"[{self.PORTAL_NAME}] could not record batch stats: {exc}")

    def log_start(self):
        logger.info(f"[{self.PORTAL_NAME}] Starting scrape run at {self.scraped_at}")

    def log_done(self, count: int):
        duration = (datetime.now(timezone.utc) - self.scraped_at).total_seconds()
        logger.info(f"[{self.PORTAL_NAME}] Scrape complete: {count} records in {duration:.1f}s")

    def log_error(self, msg: str, exc: Optional[Exception] = None):
        logger.error(f"[{self.PORTAL_NAME}] Error: {msg}", exc_info=exc)
