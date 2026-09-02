"""
NeVA — AP Legislative Assembly notice board scraper.
Source: https://apa.neva.gov.in/ (National eVidhan Application, AP Assembly)

Verified against the live homepage on 2026-08-25. The deep Q&A modules
(/Questions, /Debates) are login-gated for members, but the public notice
board is server-rendered on the homepage:

    <div class="front-notice-board">
      <ul>
        <li><a href="https://cms.neva.gov.in/NeVA/AP/FileStructures//Notices/<uuid>.pdf">
              List of Business (20.08.2026) - (  20/08/2026 )</a></li>
        ...

These are official assembly session papers — Lists of Business and Lists of
Starred Questions — published daily while the Assembly is in session (it is,
as of August 2026). Run this daily during sessions.
"""

import re
from datetime import datetime, timezone
from typing import Optional

from bs4 import BeautifulSoup

from app.scrapers.base import BaseScraper
from app.database import get_db_context
from app.models.document import Document, DocumentType
from app.utils.logger import logger


NEVA_HOME = "https://apa.neva.gov.in/"
PORTAL_NAME = "NeVA — AP Legislative Assembly"


class NevaNoticesScraper(BaseScraper):
    PORTAL_NAME = "NeVA_APAssembly"
    BASE_URL = "https://apa.neva.gov.in"

    async def scrape(self) -> int:
        self.log_start()
        total_saved = 0
        try:
            response = await self.fetch(NEVA_HOME)
            entries = self._parse(response.text)
            total_saved = await self._save(entries)
            logger.info(f"[{self.PORTAL_NAME}] Notice board: {len(entries)} entries, {total_saved} new")
        except Exception as e:
            self.log_error("Scrape failed", e)
        finally:
            await self.close()

        self.log_done(total_saved)
        return total_saved

    def _parse(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")
        board = soup.find("div", class_="front-notice-board")
        if not board:
            return []

        entries = []
        for a in board.find_all("a", href=True):
            href = a["href"].strip()
            if "cms.neva.gov.in" not in href or not href.lower().endswith(".pdf"):
                continue
            raw = a.get_text(" ", strip=True)
            # "List of Business (20.08.2026) - (  20/08/2026 )"
            date = None
            m = re.search(r"\(\s*(\d{2}/\d{2}/\d{4})\s*\)\s*$", raw)
            if m:
                date = self._parse_date(m.group(1))
                title = raw[: m.start()].rstrip(" -")
            else:
                title = raw
            entries.append({"title": title.strip(), "url": href, "date": date})
        return entries

    def _parse_date(self, text: str) -> Optional[datetime]:
        try:
            return datetime.strptime(text, "%d/%m/%Y").replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    async def _save(self, entries: list[dict]) -> int:
        saved = 0
        now = datetime.now(timezone.utc)
        async with get_db_context() as db:
            from sqlalchemy import select
            for e in entries:
                try:
                    existing = await db.execute(
                        select(Document.id).where(Document.source_url == e["url"])
                    )
                    if existing.scalar_one_or_none():
                        continue

                    doc = Document(
                        title=e["title"][:500],
                        document_type=DocumentType.OTHER,
                        year=e["date"].year if e["date"] else None,
                        department="AP Legislative Assembly",
                        description="Assembly session paper published on the NeVA notice board.",
                        source_url=e["url"],
                        source_portal=PORTAL_NAME,
                        source_page_url=NEVA_HOME,
                        source_page_title="AP Assembly — NeVA notice board",
                        retrieved_at=now,
                        published_date=e["date"],
                        last_scraped_at=now,
                        file_type="pdf",
                    )
                    db.add(doc)
                    saved += 1
                except Exception as ex:
                    logger.warning(f"[{self.PORTAL_NAME}] Failed to save '{e['title'][:40]}': {ex}")
        return saved
