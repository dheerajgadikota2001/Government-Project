"""
AP eProcurement Portal Scraper
Source: https://tender.apeprocurement.gov.in/
Scrapes all active tenders published by AP government departments.
"""

from datetime import datetime, timezone
from typing import Optional
import re

from bs4 import BeautifulSoup

from app.scrapers.base import BaseScraper
from app.database import get_db_context
from app.models.tender import Tender, TenderStatus, TenderType
from app.utils.logger import logger


# AP eProcurement uses a structured URL/API pattern
AP_TENDERS_BASE = "https://tender.apeprocurement.gov.in"
# Public tenders list endpoint (paginated)
AP_TENDERS_LIST_URL = f"{AP_TENDERS_BASE}/tenders/PublicTenders"


class APTendersScraper(BaseScraper):
    PORTAL_NAME = "AP_eProcurement"
    BASE_URL = AP_TENDERS_BASE

    async def scrape(self) -> int:
        """
        Scrape active tenders from AP eProcurement portal.
        Paginates through all pages until no new tenders are found.
        """
        self.log_start()
        total_saved = 0
        page = 1

        try:
            while True:
                tenders = await self._fetch_tender_list(page)
                if not tenders:
                    break

                saved = await self._save_tenders(tenders)
                total_saved += saved
                logger.info(f"[{self.PORTAL_NAME}] Page {page}: fetched {len(tenders)}, saved {saved} new/updated")

                if len(tenders) < 20:   # Last page
                    break
                page += 1

        except Exception as e:
            self.log_error("Scrape failed", e)
        finally:
            await self.close()

        self.log_done(total_saved)
        return total_saved

    async def _fetch_tender_list(self, page: int) -> list[dict]:
        """
        Fetch one page of tenders.
        AP eProcurement is a Java-based portal — we scrape HTML tables.
        Returns list of raw tender dicts.
        """
        try:
            # The portal is HTML-based — we parse table rows
            response = await self.fetch(
                AP_TENDERS_LIST_URL,
                params={"page": page, "pageSize": 20, "status": "Active"},
            )
            soup = BeautifulSoup(response.text, "lxml")

            tenders = []
            # Each row in the tender table = one tender
            table = soup.find("table", class_="tender-list")  # Adjust selector after inspecting actual HTML
            if not table:
                # Fallback: try any table with tender data
                table = soup.find("table")

            if not table:
                return []

            rows = table.find_all("tr")[1:]  # Skip header row
            for row in rows:
                cells = row.find_all("td")
                if len(cells) < 5:
                    continue

                tender = self._parse_row(cells)
                if tender:
                    tenders.append(tender)

            return tenders

        except Exception as e:
            logger.warning(f"[{self.PORTAL_NAME}] Page {page} fetch failed: {e}")
            return []

    def _parse_row(self, cells) -> Optional[dict]:
        """Parse a table row into a tender dict."""
        try:
            # Column order varies — adjust after inspecting actual portal HTML
            tender_id = cells[0].get_text(strip=True)
            title = cells[1].get_text(strip=True)
            department = cells[2].get_text(strip=True) if len(cells) > 2 else None
            estimated_value_str = cells[3].get_text(strip=True) if len(cells) > 3 else None
            deadline_str = cells[4].get_text(strip=True) if len(cells) > 4 else None

            # Get detail URL from link in title cell
            link = cells[1].find("a")
            detail_url = f"{self.BASE_URL}{link['href']}" if link and link.get("href") else None

            return {
                "tender_id": tender_id,
                "title": title,
                "department": department,
                "estimated_value": self._parse_amount(estimated_value_str),
                "bid_submission_end": self._parse_date(deadline_str),
                "source_url": detail_url,
                "status": TenderStatus.ACTIVE,
                "tender_type": TenderType.WORKS,  # Default; update after fetching detail page
            }
        except Exception:
            return None

    def _parse_amount(self, text: Optional[str]) -> Optional[float]:
        """Parse '₹ 1,23,45,678' or '1.23 Cr' into float."""
        if not text:
            return None
        # Remove currency symbols, commas, spaces
        cleaned = re.sub(r"[₹,\s]", "", text)
        # Handle "Cr" = crore suffix
        if "cr" in cleaned.lower():
            cleaned = re.sub(r"[Cc][Rr]", "", cleaned)
            try:
                return float(cleaned) * 1_00_00_000  # Crore to rupees
            except ValueError:
                return None
        try:
            return float(cleaned)
        except ValueError:
            return None

    def _parse_date(self, text: Optional[str]) -> Optional[datetime]:
        """Parse common Indian date formats: DD-MM-YYYY, DD/MM/YYYY."""
        if not text:
            return None
        formats = ["%d-%m-%Y", "%d/%m/%Y", "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M:%S"]
        for fmt in formats:
            try:
                return datetime.strptime(text.strip(), fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    async def _save_tenders(self, tenders: list[dict]) -> int:
        """Upsert tenders into the database. Returns count of new/updated records."""
        saved = 0
        async with get_db_context() as db:
            from sqlalchemy import select
            for t in tenders:
                try:
                    # Check if already exists
                    existing = None
                    if t.get("tender_id"):
                        result = await db.execute(
                            select(Tender).where(Tender.tender_id == t["tender_id"])
                        )
                        existing = result.scalar_one_or_none()

                    if existing:
                        # Update fields that may have changed
                        existing.status = t.get("status", existing.status)
                        existing.bid_submission_end = t.get("bid_submission_end") or existing.bid_submission_end
                        existing.last_scraped_at = datetime.now(timezone.utc)
                    else:
                        tender = Tender(
                            tender_id=t.get("tender_id"),
                            title=t.get("title", ""),
                            department=t.get("department"),
                            estimated_value=t.get("estimated_value"),
                            bid_submission_end=t.get("bid_submission_end"),
                            status=t.get("status", TenderStatus.ACTIVE),
                            tender_type=t.get("tender_type", TenderType.WORKS),
                            source_portal=self.PORTAL_NAME,
                            source_url=t.get("source_url"),
                            last_scraped_at=datetime.now(timezone.utc),
                        )
                        db.add(tender)
                        saved += 1

                except Exception as e:
                    logger.warning(f"[{self.PORTAL_NAME}] Failed to save tender {t.get('tender_id')}: {e}")

        return saved
