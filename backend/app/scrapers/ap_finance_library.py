"""
AP Finance Department: the FRBM library and the earlier budget speeches.

Sources: https://apfinance.gov.in/frbmreport.html and https://apfinance.gov.in/previous.html

WHY THIS EXISTS
The coverage check of 24 Oct 2026 matched the Finance Department's own pages
against our register. budget.html matched in full (485 of 485), but none of the
48 FRBM files was listed, and none of the 15 earlier budget speeches. The FRBM
statements are the papers the Fiscal Responsibility and Budget Management Act
requires: the fiscal policy statements laid with each budget and the quarterly
reviews of receipts and spending. They are what debt and deficit claims are
checked against.

What is saved:
  * FRBM papers from 2014-15 on, and the Act, its Rules and its amendments,
    which still govern the state's borrowing. Older reports are the undivided
    state's; they are counted in the log, not published.
  * Budget speeches from 2014-15 on, except the February 2014 vote on account,
    which the undivided state presented.

The speeches page is an archive and was checked by hand on 24 Oct 2026: every
file was opened, fingerprinted (no two are the same file) and its year read
from its own first page. One link is labelled wrongly on the page: "2023"
opens the 2024-25 speech. The year is taken from the file, and the page's
label kept in the description. A link that is not in SPEECHES (something the
department adds later) is saved with the year of its label and marked
"year as labelled".
"""
from __future__ import annotations

import re
from datetime import UTC, datetime

from bs4 import BeautifulSoup

from app.database import get_db_context
from app.models.document import Document, DocumentType
from app.scrapers.base import BaseScraper
from app.scrapers.cag_state_accounts import fiscal_year
from app.scrapers.sanity import FieldRule, SanityAbort, SanitySpec
from app.utils.logger import logger

BASE = "https://apfinance.gov.in"
FRBM_PAGE = f"{BASE}/frbmreport.html"
SPEECH_PAGE = f"{BASE}/previous.html"
PORTAL_NAME = "AP Finance Department"
FIRST_YEAR = 2014
LAWS = re.compile(r"\bFRBM\s+(Act|Rules|Amendment)\b", re.I)

# file name -> (financial year it is for, what it is). Checked from each file's first page, 24 Oct 2026.
SPEECHES = {
    "uploads/SpeechEnglish.pdf": (2024, "Budget speech"),                      # labelled "2023" on the page
    "uploads/Previous/SpeechEnglish (3).pdf": (2022, "Budget speech"),
    "uploads/Previous/SpeechEnglish (2).pdf": (2021, "Budget speech"),
    "uploads/Previous/SpeechEnglish (1).pdf": (2020, "Budget speech"),
    "uploads/Previous/SpeechEnglish.pdf": (2019, "Budget speech"),
    "uploads/Previous/speech_english.pdf": (2019, "Vote on account speech"),
    "uploads/Previous/SpeechEnglish (4).pdf": (2018, "Budget speech"),
    "uploads/Previous/SpeechEnglish (5).pdf": (2017, "Budget speech"),
    "uploads/Previous/Budget-Speech-English.pdf": (2016, "Budget speech"),
    "uploads/Previous/speach-english-2015-16.pdf": (2015, "Budget speech"),
    "uploads/Previous/Speech-English.pdf": (2014, "Budget speech"),
    "uploads/Previous/FM English Speech.pdf": (None, "undivided state"),      # Feb 2014 vote on account
    "uploads/Previous/budget-speech-2013-14-eng.pdf": (None, "undivided state"),
    "uploads/Previous/budget-speech-2012-13-eng.pdf": (None, "undivided state"),
    "uploads/Previous/budget-speech-2011-12-eng.pdf": (None, "undivided state"),
}


def _fy(y: int) -> str:
    return "%d-%02d" % (y, (y + 1) % 100)


def _key(url: str) -> str:
    m = re.search(r"(uploads/.+)$", url)
    return m.group(1) if m else url


QUARTER = re.compile(r"\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\b", re.I)
LAID = re.compile(r"\bin\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(20\d\d)\b", re.I)
ORDINAL = {"1st": "first", "2nd": "second", "3rd": "third", "4th": "fourth"}


def frbm_title(printed: str, name: str) -> tuple[str, int | None]:
    """A short title and the financial year, from the statement's own words.

    A statement of fiscal policy is laid with the budget of the year it is for, so
    its year is the year it was laid (March 2026 is for 2026-27, November 2024 for
    2024-25); two file names on the page say otherwise (FRBM_2018-19_July_New.pdf is
    the statement laid in July 2019). A quarterly review names its quarter and year.
    """
    q = QUARTER.search(printed)
    if q:
        fy = fiscal_year(printed, name)
        word = ORDINAL.get(q.group(1).lower(), q.group(1).lower())
        return (f"FRBM quarterly review, {word} quarter of {_fy(fy)}" if fy else f"FRBM quarterly review: {printed}"), fy
    laid = LAID.search(printed)
    if laid and "fiscal policy" in printed.lower():
        y = int(laid.group(2))
        return f"FRBM statement of fiscal policy for {_fy(y)}, laid in {laid.group(1).capitalize()} {y}", y
    fy = fiscal_year(printed, name)
    return f"FRBM: {printed}", fy


def parse_frbm(html: str) -> tuple[list[dict], int]:
    """FRBM papers to publish, and how many older ones were left out."""
    soup = BeautifulSoup(html, "lxml")
    out, seen, older = [], set(), 0
    for a in soup.find_all("a", href=True):
        url = a["href"].strip()
        if not url.lower().endswith(".pdf"):
            continue
        if not url.startswith("http"):
            url = f"{BASE}/{url.lstrip('/')}"
        if url in seen:
            continue      # the page links one file from two rows; the first row's title is kept
        seen.add(url)
        tr = a.find_parent("tr")
        cells = [c.get_text(" ", strip=True) for c in tr.find_all("td")] if tr else []
        printed = re.sub(r"\s+", " ", cells[1] if len(cells) > 1 else a.get_text(" ", strip=True)).strip()
        name = url.rsplit("/", 1)[-1]
        law = LAWS.search(printed)
        title, fy = frbm_title(printed, name)
        if fy is None:
            m = re.search(r"\b(20\d\d)\b", printed + " " + name)
            fy = int(m.group(1)) if m else None
        if not law and (fy is None or fy < FIRST_YEAR):
            older += 1
            continue
        out.append({"url": url, "printed_title": printed, "fy_start": None if law else fy,
                    "kind": "law" if law else "frbm",
                    "title": printed if law else title})
    return out, older


def parse_speeches(html: str) -> tuple[list[dict], int, list[str]]:
    """Speeches to publish, how many were left out, and links not in SPEECHES."""
    soup = BeautifulSoup(html, "lxml")
    out, left, unknown = [], 0, []
    for a in soup.find_all("a", href=True):
        url = a["href"].strip()
        if not url.lower().endswith(".pdf"):
            continue
        label = a.get_text(" ", strip=True)
        known = SPEECHES.get(_key(url))
        if known:
            fy, what = known
            if fy is None:
                left += 1
                continue
            note = f"The Finance Department's page labels this link '{label}'."
        else:
            m = re.match(r"\s*(20\d\d)", label)
            if not m or int(m.group(1)) < FIRST_YEAR:
                left += 1
                continue
            fy, what = int(m.group(1)), "Budget speech" if "vote" not in label.lower() else "Vote on account speech"
            note = f"Year as labelled on the Finance Department's page ('{label}'); not yet checked against the file."
            unknown.append(url)
        out.append({"url": url, "fy_start": fy, "title": f"{what} {_fy(fy)} (English)", "note": note})
    return out, left, unknown


class APFinanceLibraryScraper(BaseScraper):
    PORTAL_NAME = "APFinance_Library"
    BASE_URL = BASE
    SANITY = SanitySpec(
        min_rows=1,
        fields={"title": FieldRule(required=True, min_len=6, max_len=500),
                "url": FieldRule(required=True, min_len=20)},
        key_field="url",
    )

    async def scrape(self) -> int:
        self.log_start()
        saved, failure = 0, None
        try:
            frbm, old_frbm = parse_frbm((await self.fetch(FRBM_PAGE)).text)
            speeches, old_sp, unknown = parse_speeches((await self.fetch(SPEECH_PAGE)).text)
            logger.info(f"[{self.PORTAL_NAME}] FRBM {len(frbm)} (left out {old_frbm} older); speeches "
                        f"{len(speeches)} (left out {old_sp}); new speech links not yet checked: {len(unknown)}")
            saved = await self._save([dict(e, page=FRBM_PAGE) for e in frbm] +
                                     [dict(e, page=SPEECH_PAGE, kind="speech") for e in speeches])
        except SanityAbort:
            raise
        except Exception as e:
            self.log_error("Scrape failed", e)
            failure = e
        finally:
            await self.close()
        return self.finish(saved, failure)

    async def _save(self, entries: list[dict]) -> int:
        entries = await self.gate(entries)
        saved, now = 0, datetime.now(UTC)
        from sqlalchemy import select
        async with get_db_context() as db:
            for e in entries:
                if (await db.execute(select(Document).where(Document.source_url == e["url"]))).scalar_one_or_none():
                    continue
                law = e["kind"] == "law"
                db.add(Document(
                    title=e["title"],
                    document_type=DocumentType.LAW if law else DocumentType.BUDGET,
                    year=e["fy_start"],
                    department=PORTAL_NAME,
                    reference_number=_fy(e["fy_start"]) if e["fy_start"] else None,
                    description=e.get("note") or (
                        "The Andhra Pradesh Fiscal Responsibility and Budget Management law, as the Finance Department publishes it."
                        if law else "A statement required by the FRBM Act. The Finance Department's title: " + e["printed_title"]),
                    source_url=e["url"],
                    source_portal=PORTAL_NAME,
                    source_page_url=e["page"],
                    source_page_title="AP Finance: " + ("FRBM reports" if e["page"] == FRBM_PAGE else "Previous budget speeches"),
                    retrieved_at=now,
                    last_scraped_at=now,
                ))
                saved += 1
        return saved
