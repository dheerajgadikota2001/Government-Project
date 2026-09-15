"""
AP Finance Department — Budget Volumes scraper.
Source: https://apfinance.gov.in/budget.html

Structure (verified against a live fetch on 2026-08-25): the whole page is
one document, with one tab-pane <div id="menuXXXX"> per fiscal year, each
containing a table of direct PDF links. No pagination — everything is
already present in a single HTML response.

A quirk worth noting: several PDF links on this real government site use
an unusual URL shape (literal "..." and "@" characters in the path, e.g.
".../...Bud@et26-27/documents/Volume-I-1.pdf"). This was verified live —
the URL actually resolves to a real PDF, it is not a broken/placeholder
link — so it is kept as-is rather than "corrected", since altering a
government-published URL would break the "we show what they published"
guarantee.

Every document is saved with its real title, the fiscal year it belongs
to, the direct PDF link, and the budget.html page it was collected from.
"""

import re
from datetime import datetime, timezone
from typing import Optional

from bs4 import BeautifulSoup

from app.scrapers.base import BaseScraper
from app.scrapers.sanity import FieldRule, SanityAbort, SanitySpec
from app.database import get_db_context
from app.models.document import Document, DocumentType
from app.utils.logger import logger


AP_FINANCE_BASE = "https://apfinance.gov.in"
BUDGET_PAGE_URL = f"{AP_FINANCE_BASE}/budget.html"
PORTAL_NAME = "AP Finance Department"


class APFinanceBudgetScraper(BaseScraper):
    PORTAL_NAME = "APFinance_Budget"
    BASE_URL = AP_FINANCE_BASE
    # Budget volume titles are genuinely terse ("Volume I", "Annexures"), so the
    # length floor is lower here than for document registers.
    SANITY = SanitySpec(
        min_rows=1,
        fields={
            "title": FieldRule(required=True, min_len=4, max_len=500),
            "href": FieldRule(required=True, min_len=10),
        },
        key_field="href",
    )

    async def scrape(self) -> int:
        self.log_start()
        total_saved = 0
        failure: BaseException | None = None

        try:
            response = await self.fetch(BUDGET_PAGE_URL)
            soup = BeautifulSoup(response.text, "lxml")

            # Map each tab id to its fiscal-year label, e.g. "menu2627" -> "2026-27"
            year_labels = {}
            for a in soup.find_all("a", attrs={"data-bs-toggle": "tab"}):
                href = a.get("href", "")
                if href.startswith("#menu"):
                    year_labels[href.lstrip("#")] = a.get_text(strip=True)

            entries = []
            seen_hrefs = set()
            for tab in soup.find_all("div", class_="tab-pane"):
                tab_id = tab.get("id")
                year_label = year_labels.get(tab_id, "")

                # Dedup within this tab first, preferring a link that has real text
                per_tab: dict[str, str] = {}
                for a in tab.find_all("a", href=True):
                    href = a["href"].strip()
                    if not href.lower().endswith(".pdf"):
                        continue
                    text = a.get_text(strip=True)
                    if href not in per_tab or (text and not per_tab[href]):
                        per_tab[href] = text

                for href, title in per_tab.items():
                    if href in seen_hrefs:
                        continue  # already captured under an earlier year tab
                    seen_hrefs.add(href)
                    entries.append({
                        "href": href,
                        "title": title,
                        "year_label": year_label,
                    })

            saved = await self._save_documents(entries)
            total_saved += saved
            logger.info(f"[{self.PORTAL_NAME}] Found {len(entries)} unique documents, saved {saved} new")

        except SanityAbort:
            raise
        except Exception as e:
            self.log_error("Scrape failed", e)
            failure = e
        finally:
            await self.close()

        return self.finish(total_saved, failure)

    def _absolute(self, href: str) -> str:
        if href.startswith("http"):
            return href
        return f"{AP_FINANCE_BASE}/{href.lstrip('/')}"

    def _extract_year(self, label: str) -> Optional[int]:
        m = re.match(r"^(\d{4})", label)
        return int(m.group(1)) if m else None

    async def _save_documents(self, entries: list[dict]) -> int:
        entries = await self.gate(entries)
        saved = 0
        now = datetime.now(timezone.utc)
        async with get_db_context() as db:
            from sqlalchemy import select
            for e in entries:
                pdf_url = self._absolute(e["href"])
                title = e["title"] or pdf_url.rsplit("/", 1)[-1]
                year = self._extract_year(e["year_label"])

                try:
                    existing = await db.execute(
                        select(Document).where(Document.source_url == pdf_url)
                    )
                    if existing.scalar_one_or_none():
                        continue

                    doc = Document(
                        title=title,
                        document_type=DocumentType.BUDGET,
                        year=year,
                        department=PORTAL_NAME,
                        reference_number=e["year_label"] or None,
                        description=f"Budget document for fiscal year {e['year_label']}" if e["year_label"] else None,
                        source_url=pdf_url,
                        source_portal=PORTAL_NAME,
                        source_page_url=BUDGET_PAGE_URL,
                        source_page_title="AP Finance — Budget Volumes",
                        retrieved_at=now,
                        last_scraped_at=now,
                    )
                    db.add(doc)
                    saved += 1

                except Exception as ex:
                    logger.warning(f"[{PORTAL_NAME}] Failed to save document '{title[:50]}': {ex}")

        return saved
