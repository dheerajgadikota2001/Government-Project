"""
Base scraper class. All portal scrapers extend this.

Handles rate limiting, retry logic, session management, polite crawling, and
one rule that matters more than any of them: a scraper that could not read its
source must not return a number.

WHY THAT RULE IS HERE AND NOT IN EACH SCRAPER
Every scraper used to end with `except Exception: log_error(...)` followed by
`return whatever_it_had`. That reads as careful, and it is the opposite. The
runner sees a normal return, records the run as OK with nothing new, and the
alert email counts the source under "quiet, ran clean". Six portals were
unreachable for weeks and the platform reported "All clear" every single time,
because "the site was down" and "the site had nothing new" produced identical
output. Only one of those needs a person, so only one of them may look like
this.

So a scrape ends through finish(), which turns a swallowed failure back into a
ScrapeIncomplete the recorder can write down and the email can name. The
partial count travels with the exception, because rows already saved are
already in the database and reporting zero would be its own lie.
"""

import asyncio
import dataclasses
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.config import settings
from app.utils.logger import logger
from app.scrapers.sanity import SanityAbort, SanityGate, SanitySpec, summarise


class ScrapeIncomplete(Exception):
    """A scrape that did not finish, carrying whatever it managed to save.

    Deliberately distinct from SanityAbort. An abort means the parser looked at
    the page, decided it had changed, and refused to write: the safety net
    working, and the site still serves its last known-good data. This means the
    opposite: we never got a usable read at all, and whatever is on the site is
    as old as the last successful run.
    """

    def __init__(self, detail: str, records_new: int = 0):
        super().__init__(detail)
        self.detail = detail
        self.records_new = records_new


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
        # Reachability, counted rather than inferred. A scraper that walks four
        # index pages and gets a connection error on all four has not "found no
        # documents"; it has not seen the portal. These two fields are what let
        # finish() tell those apart without every subclass reimplementing it.
        self.fetch_ok = 0
        self.fetch_failures: list[tuple[str, str]] = []
        # Things a person should know that are not failures: "this run read a
        # PDF off the local disk instead of downloading it", for instance. The
        # runner collects these and the alert email prints them.
        self.notes: list[str] = []

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
    async def _fetch_with_retries(self, url: str, params: Optional[dict] = None) -> httpx.Response:
        logger.debug(f"[{self.PORTAL_NAME}] Fetching: {url}")
        await asyncio.sleep(settings.scraper_request_delay)   # Be polite
        response = await self.client.get(url, params=params)
        response.raise_for_status()
        return response

    async def fetch(self, url: str, params: Optional[dict] = None) -> httpx.Response:
        """Fetch a URL with automatic retry, and remember how it went.

        Callers still catch their own errors and carry on, which is right: one
        district being down should not cost the other twenty-five. The counting
        happens here so that carrying on never adds up to silence.
        """
        try:
            response = await self._fetch_with_retries(url, params=params)
        except Exception as exc:                     # noqa: BLE001
            # str() of an httpx timeout is empty, and "failed:" followed by
            # nothing has already cost a real evening of guessing.
            why = f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
            self.fetch_failures.append((url, why))
            raise
        self.fetch_ok += 1
        return response

    def unreachable(self) -> bool:
        """True when every request this scraper made failed.

        Not "some failed": a portal that serves three pages and 404s on a fourth
        is alive and has moved a page, which is a different problem with a
        different fix.
        """
        return self.fetch_ok == 0 and bool(self.fetch_failures)

    def note(self, text: str) -> None:
        """Record something the alert email should mention. Not a failure."""
        logger.info(f"[{self.PORTAL_NAME}] {text}")
        self.notes.append(text)

    def finish(self, saved: int, failure: Optional[BaseException] = None) -> int:
        """End a scrape: the count when it worked, an exception when it did not.

        Call this instead of `return saved` at the end of every scrape(). It is
        the one place that decides whether a run counts as a success, so the
        decision cannot drift between eleven scrapers.
        """
        self.log_done(saved)

        if isinstance(failure, ScrapeIncomplete):
            failure.records_new = saved
            raise failure
        if failure is not None:
            detail = (f"{type(failure).__name__}: {failure}"
                      if str(failure) else type(failure).__name__)
            raise ScrapeIncomplete(detail, saved) from failure
        if self.unreachable():
            url, why = self.fetch_failures[0]
            raise ScrapeIncomplete(
                f"could not reach the portal: {len(self.fetch_failures)} request(s) tried, "
                f"none answered. First was {url} ({why})",
                saved,
            )
        return saved

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

    async def gate(self, rows: list[dict], run_id: str = "",
                   compare_rows: bool = True) -> list[dict]:
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

        spec = self.SANITY
        if not compare_rows:
            # A paginated archive tapers. The last page of CAG's listing holds
            # three reports because there are seventy-three in total, and
            # measuring it against a full page of ten called the end of the
            # archive a truncated response. The row floor belongs on the first
            # page, where a short batch really does mean the page changed.
            # Everything else about the gate still applies to every page.
            spec = dataclasses.replace(spec, row_floor_ratio=0.0)

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

        gate = SanityGate(name, spec, baseline)
        try:
            result = gate.run(rows)
        except SanityAbort as abort:
            await self._record_stats(
                name, run_id, rows=0, stats=summarise(rows, spec),
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
