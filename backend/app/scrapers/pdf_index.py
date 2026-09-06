"""
Shared machinery for portals that publish documents as plain links.

Several AP portals are ordinary static sites: a page of anchors pointing at
PDFs sitting on the same server. CSE (Educational Statistics) and APSDPS
(Statistical publications) are both this shape, and writing the same
walk-the-links-and-save-the-PDFs loop twice would mean fixing the same bug
twice later.

What a subclass supplies is *where to look* and *what counts*; everything
about fetching, filtering, titling, deduping and provenance lives here.

DESIGN NOTES

Titles come from the anchor text where the anchor has any, and from the file
name otherwise. Government sites are inconsistent about this: some link
"Educational Statistics 2022-23", others link the bare word "Download" inside
a row whose meaning is in the cell beside it. So when the anchor text is
useless (a "Download"/"Click here"/"PDF" stub, or shorter than a few
characters), the file name is cleaned up and used instead. A document titled
"Download" would be worthless in a search result.

Years are read out of the title or the URL — "2022-23" and "2022_23" both
appear, as does a bare "2023". The first year of a financial-year range is
what gets stored, because that is how the rest of the platform indexes
budget-year data.

Nothing is followed off-host. A government page linking out to a third-party
mirror is not a source this platform will cite.
"""

from datetime import datetime, timezone
from typing import Iterable, Optional
from urllib.parse import urljoin, urlparse, unquote
import re

from bs4 import BeautifulSoup
from sqlalchemy import select

from app.scrapers.base import BaseScraper
from app.scrapers.sanity import FieldRule, SanitySpec
from app.database import get_db_context
from app.models.document import Document, DocumentType
from app.utils.logger import logger

DOC_EXTENSIONS = (".pdf", ".xls", ".xlsx", ".doc", ".docx")

# Anchor text that tells a reader nothing. When this is all we have, the file
# name is used for the title instead.
STUB_TEXT = {
    "download", "click here", "click", "here", "pdf", "view", "open",
    "read more", "more", "link", "download pdf", "view pdf", "details",
    # Seen live on APSDPS: three real publications — including the Monthly
    # Economic Report — were saved titled "Download the file".
    "download the file", "download file", "download here", "view details",
    "read the report", "download report", "know more",
}


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


class PdfIndexScraper(BaseScraper):
    """
    Walks one or more index pages and saves every document link it finds.

    Subclass contract:
        PORTAL_NAME     internal id (BaseScraper)
        BASE_URL        the site root — links off this host are ignored
        PUBLIC_NAME     what appears on the /updates page and in provenance
        INDEX_PAGES     the pages to walk
        DEPARTMENT      the publishing department, stored on every row
        DOC_TYPE        the DocumentType for everything this portal serves
        REQUIRE         optional: substrings, one of which must appear in the
                        link text or URL for it to count. Omit to take all.
    """

    PUBLIC_NAME: str = ""
    INDEX_PAGES: tuple[str, ...] = ()
    DEPARTMENT: str = ""
    DOC_TYPE: DocumentType = DocumentType.OTHER
    REQUIRE: tuple[str, ...] = ()
    # Shared by every PDF-register scraper (statistics publications, school
    # education, Polavaram). These registers are small and grow slowly, so the
    # floor is a single row — the value here is in the field rules, which catch
    # a link list that has started pointing somewhere else.
    SANITY = SanitySpec(
        min_rows=1,
        fields={
            "title": FieldRule(required=True, min_len=8, max_len=500),
            "url": FieldRule(required=True, min_len=10),
            "page_url": FieldRule(min_len=10),
        },
        key_field="url",
    )

    async def scrape(self) -> int:
        self.log_start()
        total = 0
        seen: set[str] = set()      # within-run dedupe: index pages overlap
        try:
            for page in self.INDEX_PAGES:
                found = await self._walk(page, seen)
                if not found:
                    logger.warning(f"[{self.PORTAL_NAME}] No documents on {page}")
                    continue
                saved = await self._save(found)
                total += saved
                logger.info(f"[{self.PORTAL_NAME}] {page}: {len(found)} links, {saved} new")
        except Exception as e:
            self.log_error("Scrape failed", e)
        finally:
            await self.close()
        self.log_done(total)
        return total

    async def _walk(self, page_url: str, seen: set[str]) -> list[dict]:
        try:
            r = await self.fetch(page_url)
        except Exception as e:
            logger.warning(f"[{self.PORTAL_NAME}] {page_url} failed: {e}")
            return []

        soup = BeautifulSoup(r.text, "lxml")
        page_title = squash(soup.title.get_text()) if soup.title else self.PUBLIC_NAME
        host = urlparse(self.BASE_URL).netloc

        out = []
        for a in soup.find_all("a", href=True):
            url = urljoin(page_url, a["href"])
            if not self._is_document(url):
                continue
            # Never cite a mirror: only files served by the portal itself.
            if urlparse(url).netloc and urlparse(url).netloc != host:
                continue
            text = squash(a.get_text())
            if self.REQUIRE and not any(
                k.lower() in text.lower() or k.lower() in url.lower() for k in self.REQUIRE
            ):
                continue
            if url in seen:
                continue
            seen.add(url)
            out.append({
                "url": url,
                "title": self._title(text, url),
                "page_url": page_url,
                "page_title": page_title,
                "file_type": self._extension(url),
            })
        return out

    def _is_document(self, url: str) -> bool:
        path = urlparse(url).path.lower()
        return path.endswith(DOC_EXTENSIONS)

    def _extension(self, url: str) -> str:
        return urlparse(url).path.rsplit(".", 1)[-1].lower()

    def _title(self, anchor_text: str, url: str) -> str:
        clean = squash(anchor_text)
        if clean and len(clean) > 3 and clean.lower().strip(" .:-") not in STUB_TEXT:
            return clean[:500]
        # Fall back to the file name: "Educational%20Statistics%202022-23.pdf"
        name = unquote(urlparse(url).path.rsplit("/", 1)[-1])
        name = re.sub(r"\.(pdf|xlsx?|docx?)$", "", name, flags=re.I)
        name = re.sub(r"[_\-]+", " ", name)
        return squash(name)[:500] or "Untitled document"

    def _year(self, title: str, url: str) -> Optional[int]:
        """
        The publication year, or None.

        None is a correct answer here and is preferred to a wrong one. These
        titles carry numbers that look like years but are not: "Swarna Andhra
        @2047" is a vision document's name, "Vision 2030" likewise, and filing
        either under that year would push it past every real document in a
        date-sorted list and answer "what did the state publish in 2047".
        So anything past next year is rejected, and a plausible year is only
        taken from a four-digit number that is not glued to other digits.
        """
        blob = f"{title} {unquote(url)}"
        horizon = datetime.now(timezone.utc).year + 1

        # Financial-year ranges are unambiguous: 2022-23, 2022_23, 2022-2023.
        m = re.search(r"\b(19|20)(\d{2})\s*[-_/]\s*(?:\d{2}|\d{4})\b", blob)
        if m:
            year = int(m.group(1) + m.group(2))
            if 1950 <= year <= horizon:
                return year

        # Otherwise take the latest plausible bare year — documents are titled
        # "... Report 2024" far more often than they are titled by an old year.
        candidates = [
            int(y) for y in re.findall(r"(?<![\d@])((?:19|20)\d{2})(?![\d])", blob)
            if 1950 <= int(y) <= horizon
        ]
        return max(candidates) if candidates else None

    def extra_description(self, entry: dict) -> Optional[str]:
        """Subclasses may add a line of context. Default: the page it came from."""
        return f"Published on {entry['page_title']}" if entry.get("page_title") else None

    def classify(self, entry: dict) -> DocumentType:
        """
        The type for one document. Defaults to the portal's DOC_TYPE.

        A portal rarely publishes one kind of thing. APSDPS serves industrial
        policies, statistical surveys and newsletters from the same index, and
        filing all of them as annual reports made the type filter lie: a reader
        asking for the state's policies would not find twenty of them. So the
        type is decided per document, and a subclass overrides this to say how.
        """
        return self.DOC_TYPE

    async def _save(self, entries: Iterable[dict]) -> int:
        entries = await self.gate(list(entries))
        saved = 0
        now = datetime.now(timezone.utc)
        async with get_db_context() as db:
            for e in entries:
                try:
                    dupe = await db.execute(
                        select(Document).where(Document.source_url == e["url"])
                    )
                    if dupe.scalar_one_or_none():
                        continue
                    year = self._year(e["title"], e["url"])
                    db.add(Document(
                        title=e["title"],
                        document_type=self.classify(e),
                        year=year,
                        department=self.DEPARTMENT,
                        description=self.extra_description(e),
                        source_url=e["url"],
                        source_portal=self.PUBLIC_NAME,
                        source_page_url=e["page_url"],
                        source_page_title=e["page_title"][:500] if e.get("page_title") else None,
                        file_type=e["file_type"],
                        retrieved_at=now,
                        last_scraped_at=now,
                    ))
                    saved += 1
                except Exception as ex:
                    logger.warning(f"[{self.PUBLIC_NAME}] Save failed for '{e.get('title','')[:60]}': {ex}")
        return saved
