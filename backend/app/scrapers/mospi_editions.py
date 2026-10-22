"""
Which flash report is the newest, asked of MoSPI rather than guessed.

WHY THIS FILE EXISTS

The importer used to build the PDF address from a pattern,
FR_<MONTH>_<YEAR>.pdf, and that pattern died after June 2025. Every edition
since sits at an address nobody can predict: a timestamp, a UUID and a file
name that itself changes spelling from month to month
("Flash_Report_April_2026.pdf", "FlashReport_July_2026_.pdf"). Some months
were uploaded to a different folder, some to a different host. So the job
had to be pointed at each new report by hand, and for thirteen months it
was not.

mospi.gov.in is a single-page app. Its pages are empty to a plain fetch, but
the list they render comes from a JSON endpoint the page itself calls, and
that endpoint is stable, searchable and reachable from Cloud Run. This asks
it for everything titled "Flash Report", reads the month and year out of
each title, and returns the newest. Pure functions do the reading, so the
title formats MoSPI has actually used are tested without a network.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional

LIST_ENDPOINT = "https://www.mospi.gov.in/api/publications-reports/get-web-publications-report-list"
FILE_HOST = "https://www.mospi.gov.in/"

MONTHS = ("january", "february", "march", "april", "may", "june", "july",
          "august", "september", "october", "november", "december")

_TAG = re.compile(r"<[^>]+>")
_TITLE_MONTH = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)"
    r"[\s,]+(\d{4})\b", re.I)


@dataclass(frozen=True)
class Edition:
    year: int
    month: int
    title: str
    url: str

    @property
    def key(self) -> tuple[int, int]:
        return (self.year, self.month)

    @property
    def label(self) -> str:
        return f"MoSPI flash report, {MONTHS[self.month - 1].title()} {self.year}"


def list_request(page_no: int = 1, page_size: int = 20) -> dict:
    """The body the site's own page sends. Kept in one place for the test."""
    return {
        "lang": "en", "page_no": page_no, "page_size": page_size,
        "search_term": "Flash Report", "sort_field": "id", "sort_order": "desc",
        "category_id": None, "sub_category_id": None, "data_source": "web",
    }


def clean_title(raw: str) -> str:
    return re.sub(r"\s+", " ", _TAG.sub(" ", raw or "").replace("&nbsp;", " ")).strip()


def edition_from_item(item: dict) -> Optional[Edition]:
    """One list entry to an Edition, or None when it is not a monthly flash report."""
    title = clean_title(item.get("title", ""))
    if "flash report" not in title.lower():
        return None
    m = _TITLE_MONTH.search(title)
    if not m:
        return None
    path = None
    for key in ("file_one", "file_two", "file_three"):
        f = item.get(key)
        if isinstance(f, dict) and f.get("path") and str(f.get("filemime", "")).endswith("pdf"):
            path = f["path"]
            break
    if not path:
        return None
    url = path if path.startswith("http") else FILE_HOST + path.lstrip("/")
    return Edition(year=int(m.group(2)), month=MONTHS.index(m.group(1).lower()) + 1, title=title, url=url)


def newest(items: Iterable[dict]) -> Optional[Edition]:
    editions = [e for e in (edition_from_item(i) for i in items) if e]
    return max(editions, key=lambda e: e.key) if editions else None


async def fetch_newest(client) -> Optional[Edition]:
    """Ask the live list. `client` is an httpx.AsyncClient."""
    r = await client.post(LIST_ENDPOINT, json=list_request(), headers={
        "Content-Type": "application/json",
        "Origin": "https://www.mospi.gov.in",
        "Referer": "https://www.mospi.gov.in/publications-reports",
    })
    r.raise_for_status()
    data = r.json().get("data") or []
    return newest(data)
