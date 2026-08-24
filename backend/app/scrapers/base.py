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

    def log_start(self):
        logger.info(f"[{self.PORTAL_NAME}] Starting scrape run at {self.scraped_at}")

    def log_done(self, count: int):
        duration = (datetime.now(timezone.utc) - self.scraped_at).total_seconds()
        logger.info(f"[{self.PORTAL_NAME}] Scrape complete: {count} records in {duration:.1f}s")

    def log_error(self, msg: str, exc: Optional[Exception] = None):
        logger.error(f"[{self.PORTAL_NAME}] Error: {msg}", exc_info=exc)
