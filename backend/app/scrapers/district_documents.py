"""
District collectorate documents scraper — all 26 AP districts.

Source: the NIC S3WaaS district network (https://<district>.ap.gov.in/documents/).
All 26 sites share one identical WordPress template, verified against the
live Visakhapatnam site on 2026-08-25:

    <table>
      <tr><th>Title</th><th>Date</th><th>View / Download</th></tr>
      <tr>
        <td>RTI 4(1)(b) – Govt. Hospital ...</td>
        <td>17/08/2026</td>
        <td><a href="https://cdn.s3waas.gov.in/.../uploads/2026/08/xxx.pdf">View (510 KB)</a></td>
      </tr>
    </table>
    pagination: /documents/page/N/

These pages carry district-level tender notices, orders, RTI disclosures,
notifications and reports — hosted on national infrastructure, so reachable
worldwide (unlike the AP state data centre portals).

Volume note: some districts hold 300+ pages of history. By default this
scraper takes only the newest MAX_PAGES_PER_DISTRICT pages per district per
run — run it repeatedly (or raise the constant) to backfill deeper. Dedup is
by exact PDF URL, so re-runs never duplicate.
"""

import asyncio
import re
from datetime import datetime, timezone
from typing import Optional

from bs4 import BeautifulSoup

from app.scrapers.base import BaseScraper, ScrapeIncomplete
from app.scrapers.sanity import FieldRule, SanityAbort, SanitySpec
from app.database import get_db_context
from app.models.document import Document, DocumentType
from app.utils.logger import logger


# District name (canonical, post-2022) -> S3WaaS site.
# Verified against the official directory at andhrapradesh.s3waas.gov.in on 2026-08-25.
DISTRICT_SITES = {
    "Alluri Sitharama Raju": "https://allurisitharamaraju.ap.gov.in",
    "Anakapalli": "https://anakapalli.ap.gov.in",
    "Ananthapuramu": "https://ananthapuramu.ap.gov.in",
    "Annamayya": "https://annamayya.ap.gov.in",
    "Bapatla": "https://bapatla.ap.gov.in",
    "Chittoor": "https://chittoor.ap.gov.in",
    "Dr. B.R. Ambedkar Konaseema": "https://konaseema.ap.gov.in",
    "East Godavari": "https://eastgodavari.ap.gov.in",
    "Eluru": "https://eluru.ap.gov.in",
    "Guntur": "https://guntur.ap.gov.in",
    "Kakinada": "https://kakinada.ap.gov.in",
    "Krishna": "https://krishna.ap.gov.in",
    "Kurnool": "https://kurnool.ap.gov.in",
    "Nandyal": "https://nandyal.ap.gov.in",
    "NTR": "https://ntr.ap.gov.in",
    "Palnadu": "https://palnadu.ap.gov.in",
    "Parvathipuram Manyam": "https://parvathipurammanyam.ap.gov.in",
    "Prakasam": "https://prakasam.ap.gov.in",
    "Sri Potti Sriramulu Nellore": "https://spsnellore.ap.gov.in",
    "Sri Sathya Sai": "https://srisathyasai.ap.gov.in",
    "Srikakulam": "https://srikakulam.ap.gov.in",
    "Tirupati": "https://tirupati.ap.gov.in",
    "Visakhapatnam": "https://visakhapatnam.ap.gov.in",
    "Vizianagaram": "https://vizianagaram.ap.gov.in",
    "West Godavari": "https://westgodavari.ap.gov.in",
    "YSR Kadapa": "https://kadapa.ap.gov.in",
}

MAX_PAGES_PER_DISTRICT = 5  # newest ~50 docs per district per run; raise to backfill


# Electoral-roll / voter-list material: district sites mix election-office
# uploads (polling-station voter lists with names and EPIC numbers) into the
# same Documents section. Those contain citizens' personal data and have
# nothing to do with projects or public spending — this platform deliberately
# refuses to index them.
ELECTORAL_PATTERNS = [
    r"part\s*no[\s.\-\u2013]*\d+",          # "Kottagraharam Part No-130"
    r"polling\s*station",
    r"\belectoral\b|\belectors?\b|\bvoters?\b",
    r"\bepic\b",
    r"booth\s*level|\bblo\b",
    r"(draft|final|mother|supplementary)\s+roll",
    r"special\s+(intensive|summary)\s+revision|\bsir\s*20\d\d",
    r"\bform\s*(9|10|11a?|20)\b",
]
_ELECTORAL_RE = re.compile("|".join(ELECTORAL_PATTERNS), re.IGNORECASE)


def is_electoral_document(title: str) -> bool:
    """True for voter-roll / election-office documents we refuse to index."""
    return bool(_ELECTORAL_RE.search(title))


def classify(title: str) -> DocumentType:
    """Conservative type mapping from the title. Anything unclear stays OTHER."""
    t = title.lower()
    if re.search(r"\bg\.?o\.?\s*(ms|rt)?\b|government order", t):
        return DocumentType.GO
    if "annual report" in t:
        return DocumentType.ANNUAL_REPORT
    if "policy" in t:
        return DocumentType.POLICY
    if "press" in t and "release" in t:
        return DocumentType.PRESS_RELEASE
    if "budget" in t:
        return DocumentType.BUDGET
    return DocumentType.OTHER


class DistrictDocumentsScraper(BaseScraper):
    PORTAL_NAME = "AP_Districts"
    BASE_URL = "https://andhrapradesh.s3waas.gov.in"
    # Twenty-six districts are walked in one run, each saving its own small
    # batch. Drift detection is deliberately off here (drift_fields=()): the
    # baseline would mix twenty-six unrelated collectorates into one history and
    # compare a district that publishes weekly against one that publishes twice
    # a year. Layers 1, 2 and 4 still apply per district.
    SANITY = SanitySpec(
        min_rows=1,
        # Layer 1's baseline comparison is off for the same reason drift is: the
        # baseline is one history shared by twenty-six unrelated collectorates,
        # so it holds the best page any of them ever produced. Bapatla posting
        # one document was read as "1 row against a recent best of 8" and the
        # whole source refused to write. min_rows still applies per district,
        # which is the check that actually means something here.
        row_floor_ratio=0.0,
        fields={
            "title": FieldRule(required=True, min_len=8, max_len=500),
            "url": FieldRule(required=True, min_len=10),
            "date": FieldRule(min_year=2000, max_year_ahead=1),
        },
        drift_fields=(),
        key_field="url",
    )

    async def scrape(self) -> int:
        self.log_start()
        total_saved = 0
        self._skipped_electoral = 0

        self._unreachable_districts: list[str] = []
        self._blocked_districts: list[str] = []
        failure: BaseException | None = None
        try:
            for district, base in DISTRICT_SITES.items():
                saved = await self._scrape_district(district, base)
                total_saved += saved
                logger.info(f"[{self.PORTAL_NAME}] {district}: saved {saved} new")
        except SanityAbort:
            raise
        except Exception as e:
            self.log_error("Scrape failed", e)
            failure = e
        finally:
            await self.close()

        # A refusal belongs to the district that caused it. One collectorate
        # publishing a thin page must not stop the other twenty-five from being
        # read, which is what happened when SanityAbort escaped the district
        # loop: the run ended at Bapatla and twenty-one districts were skipped.
        # Once most of them refuse it is no longer one odd page, and the source
        # as a whole is refused the way a single-portal scraper would be.
        refused = len(self._blocked_districts)
        if failure is None and refused * 3 >= len(DISTRICT_SITES):
            raise SanityAbort(
                f"{refused} of {len(DISTRICT_SITES)} district sites refused their batch "
                f"({', '.join(self._blocked_districts[:5])}"
                f"{' and more' if refused > 5 else ''}). Nothing written for those."
            )
        if refused:
            self.note(
                f"{refused} of {len(DISTRICT_SITES)} district sites refused their batch "
                "and were skipped; the rest were read normally: "
                + ", ".join(self._blocked_districts)
            )

        # One collectorate being down is weather. A third of them being down is
        # a broken source, and the difference has to be visible: this scraper
        # walked four of twenty-six districts and still reported a clean run.
        down = len(self._unreachable_districts)
        if failure is None and down * 3 >= len(DISTRICT_SITES):
            failure = ScrapeIncomplete(
                f"{down} of {len(DISTRICT_SITES)} district sites could not be read "
                f"({', '.join(self._unreachable_districts[:5])}"
                f"{' and more' if down > 5 else ''})"
            )
        elif down:
            self.note(
                f"{down} of {len(DISTRICT_SITES)} district sites could not be read: "
                + ", ".join(self._unreachable_districts)
            )

        if self._skipped_electoral:
            logger.info(
                f"[{self.PORTAL_NAME}] skipped {self._skipped_electoral} electoral-roll/"
                "voter documents (personal data — deliberately not indexed)"
            )
        return self.finish(total_saved, failure)

    async def _scrape_district(self, district: str, base: str) -> int:
        saved = 0
        for page in range(1, MAX_PAGES_PER_DISTRICT + 1):
            url = f"{base}/documents/" if page == 1 else f"{base}/documents/page/{page}/"
            try:
                response = await self.fetch(url)
            except Exception as e:
                logger.warning(f"[{self.PORTAL_NAME}] {district} page {page} unreachable: {e}")
                if page == 1:
                    # Page one is the district's front door. Failing there means
                    # this collectorate contributed nothing to the run, which is
                    # what the threshold above counts. Failing on page four just
                    # means the history is shallower than we asked for.
                    self._unreachable_districts.append(district)
                break

            entries, rows_seen = self._parse_page(response.text)
            if rows_seen == 0:
                break  # genuinely empty page — end of this district's history

            if not entries:
                continue  # page existed but was all filtered (e.g. voter rolls) — keep paging

            try:
                new_count = await self._save(district, base, entries)
            except SanityAbort as abort:
                logger.warning(f"[{self.PORTAL_NAME}] {district} page {page} refused: {abort}")
                self._blocked_districts.append(district)
                break
            saved += new_count

            # Whole page already known -> everything older is known too.
            if new_count == 0:
                break
        return saved

    def _parse_page(self, html: str) -> tuple[list[dict], int]:
        """Returns (usable entries, raw row count seen on the page)."""
        soup = BeautifulSoup(html, "lxml")
        table = soup.find("table")
        if not table:
            return [], 0

        entries = []
        seen_urls = set()
        rows_seen = 0
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 3:
                continue
            rows_seen += 1
            title = cells[0].get_text(" ", strip=True)
            date_text = cells[1].get_text(strip=True)
            link = cells[2].find("a", href=True)
            if not title or not link:
                continue
            href = link["href"].strip()
            if not href.lower().endswith((".pdf", ".doc", ".docx", ".xls", ".xlsx")):
                continue
            if is_electoral_document(title):
                self._skipped_electoral += 1
                continue
            if href in seen_urls:
                continue  # same file listed twice on one page
            seen_urls.add(href)
            entries.append({
                "title": title,
                "date": self._parse_date(date_text),
                "url": href,
            })
        return entries, rows_seen

    def _parse_date(self, text: str) -> Optional[datetime]:
        try:
            return datetime.strptime(text.strip(), "%d/%m/%Y").replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            return None

    async def _save(self, district: str, base: str, entries: list[dict]) -> int:
        entries = await self.gate(entries)
        saved = 0
        now = datetime.now(timezone.utc)
        async with get_db_context() as db:
            from sqlalchemy import select
            for e in entries:
                try:
                    existing = await db.execute(
                        select(Document.id).where(Document.source_url == e["url"]).limit(1)
                    )
                    if existing.scalars().first():
                        continue

                    doc = Document(
                        title=e["title"][:500],
                        document_type=classify(e["title"]),
                        year=e["date"].year if e["date"] else None,
                        department=f"{district} District Collectorate",
                        source_url=e["url"],
                        source_portal=f"{district} District ({base.removeprefix('https://')})",
                        source_page_url=f"{base}/documents/",
                        source_page_title=f"{district} district — Documents",
                        retrieved_at=now,
                        published_date=e["date"],
                        last_scraped_at=now,
                        file_type=e["url"].rsplit(".", 1)[-1].lower(),
                    )
                    db.add(doc)
                    saved += 1
                except Exception as ex:
                    logger.warning(f"[{self.PORTAL_NAME}] {district}: failed to save '{e['title'][:40]}': {ex}")
        return saved
