"""
CAG (Comptroller and Auditor General) — Andhra Pradesh Audit Reports scraper.
Source: https://cag.gov.in/ag/andhra-pradesh/en/audit-report

Verified against the live page on 2026-08-25 — selectors below match the
actual HTML (class names captured directly from a saved response), not
guessed. Pagination confirmed: ?page=N, ~73 reports across ~8 pages at time
of writing (the scraper re-detects total pages each run, so this adapts if
CAG publishes more).

Every row saved carries source_url (the direct PDF), source_page_url (the
report's own detail page — the specific page this was collected from,
distinct from the listing page), source_portal, and retrieved_at — so every
document in the Documents section can answer "where did this come from,
and when did we get it".
"""

from datetime import datetime, timezone
from typing import Optional
import re

from bs4 import BeautifulSoup

from app.scrapers.base import BaseScraper
from app.database import get_db_context
from app.models.document import Document, DocumentType
from app.utils.logger import logger


CAG_BASE = "https://cag.gov.in"
CAG_LISTING_URL = f"{CAG_BASE}/ag/andhra-pradesh/en/audit-report"
PORTAL_NAME = "CAG — Andhra Pradesh"


class CAGDocumentsScraper(BaseScraper):
    PORTAL_NAME = "CAG_AndhraPradesh"
    BASE_URL = CAG_BASE

    async def scrape(self) -> int:
        self.log_start()
        total_saved = 0
        page = 1
        max_pages = 50  # hard safety cap — real total is currently ~8

        try:
            while page <= max_pages:
                entries = await self._fetch_page(page)
                if not entries:
                    break

                saved = await self._save_documents(entries)
                total_saved += saved
                logger.info(f"[{self.PORTAL_NAME}] Page {page}: fetched {len(entries)}, saved {saved} new")

                page += 1

        except Exception as e:
            self.log_error("Scrape failed", e)
        finally:
            await self.close()

        self.log_done(total_saved)
        return total_saved

    async def _fetch_page(self, page: int) -> list[dict]:
        url = CAG_LISTING_URL if page == 1 else f"{CAG_LISTING_URL}?page={page}"
        try:
            response = await self.fetch(url)
            soup = BeautifulSoup(response.text, "lxml")

            entries = []
            for card in soup.find_all("div", class_="AuditReportlisting"):
                parsed = self._parse_entry(card)
                if parsed:
                    entries.append(parsed)
            return entries

        except Exception as e:
            logger.warning(f"[{self.PORTAL_NAME}] Page {page} fetch failed: {e}")
            return []

    def _parse_entry(self, card) -> Optional[dict]:
        try:
            date_div = card.find("div", class_="dateFirst")
            date_spans = date_div.find_all("span") if date_div else []
            # First span holds the calendar icon (no text), second holds the date text
            date_text = None
            for s in date_spans:
                t = s.get_text(strip=True)
                if t:
                    date_text = t
                    break

            type_div = card.find("div", class_="reportType")
            report_type = type_div.get_text(strip=True) if type_div else None

            detail_div = card.find("div", class_="reportDetail")
            if not detail_div:
                return None
            link = detail_div.find("a")
            if not link or not link.get("href"):
                return None
            title = link.get_text(strip=True)
            detail_url = self._absolute(link["href"])

            desc_p = detail_div.find("p")
            description = desc_p.get_text(strip=True) if desc_p else None

            pdf_block = card.find("div", class_="pdfBottomReport")
            pdf_link = pdf_block.find("a") if pdf_block else None
            pdf_url = self._absolute(pdf_link["href"]) if pdf_link and pdf_link.get("href") else None

            if not title or not pdf_url:
                # Without a real PDF link, this isn't a usable document row —
                # skip rather than save something we can't actually point to.
                return None

            published_date = self._parse_date(date_text)
            reference_number = self._extract_reference(title)

            return {
                "title": title,
                "description": description,
                "report_type": report_type,
                "detail_url": detail_url,
                "pdf_url": pdf_url,
                "published_date": published_date,
                "reference_number": reference_number,
            }
        except Exception as e:
            logger.warning(f"[{PORTAL_NAME}] Failed to parse one entry: {e}")
            return None

    def _absolute(self, href: str) -> str:
        if href.startswith("http"):
            return href
        return f"{CAG_BASE}{href}"

    def _extract_reference(self, title: str) -> Optional[str]:
        # e.g. "Report 7 of 2025 - Compliance Audit ..." -> "Report 7 of 2025"
        m = re.match(r"^(Report\s+\d+\s+of\s+\d{4})", title)
        return m.group(1) if m else None

    def _parse_date(self, text: Optional[str]) -> Optional[datetime]:
        if not text:
            return None
        try:
            return datetime.strptime(text.strip(), "%d %B %Y").replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    async def _save_documents(self, entries: list[dict]) -> int:
        saved = 0
        now = datetime.now(timezone.utc)
        async with get_db_context() as db:
            from sqlalchemy import select
            for e in entries:
                try:
                    existing = await db.execute(
                        select(Document).where(Document.source_url == e["pdf_url"])
                    )
                    if existing.scalar_one_or_none():
                        continue  # Already have this exact PDF

                    doc = Document(
                        title=e["title"],
                        document_type=DocumentType.AUDIT_REPORT,
                        year=e["published_date"].year if e["published_date"] else None,
                        department="Comptroller and Auditor General of India",
                        reference_number=e["reference_number"],
                        description=e["description"],
                        source_url=e["pdf_url"],
                        source_portal=PORTAL_NAME,
                        source_page_url=e["detail_url"],
                        source_page_title=e["title"],
                        retrieved_at=now,
                        published_date=e["published_date"],
                        last_scraped_at=now,
                    )
                    db.add(doc)
                    saved += 1

                except Exception as ex:
                    logger.warning(f"[{PORTAL_NAME}] Failed to save document '{e.get('title', '')[:50]}': {ex}")

        return saved
