"""
CAG's state accounts for Andhra Pradesh: Finance Accounts, Appropriation Accounts,
Accounts at a Glance, and the Monthly Key Indicators.

Source: https://cag.gov.in/ae/andhra-pradesh/en/state-accounts-report
  ?defuat_account_report_type=357  Accounts at a Glance
  ?defuat_account_report_type=358  Appropriation Accounts
  ?defuat_account_report_type=359  Finance Accounts
  ?defuat_account_report_type=360  Monthly Key Indicators
each with an archive (&arch=1). ("defuat" is CAG's own spelling in the address.)

WHY THIS EXISTS
These are the audited accounts: what the state actually received and spent, as
certified by CAG. The site already reads the Appropriation Accounts to check the
budget books' spending figures, but none of these papers was on the documents
pages (coverage check, 24 Oct 2026). On that day the eight pages listed 185
files: Finance Accounts 78 (1960-61 to 2024-25), Appropriation Accounts 25
(2000-01 to 2024-25), Accounts at a Glance 15 and Monthly Key Indicators 67 on
the current page (its archive did not answer).

Only papers from 2014-15 on are saved. Earlier ones are the undivided state's;
they are counted in the run log, not published (coverage plan, question 1).
2014-15 itself is kept: CAG prints its Finance Accounts in two parts, 1 April to
1 June 2014 (undivided) and 2 June 2014 to 31 March 2015, and both are saved
with the dates in their titles.

The year comes from the paper's own title or file name before the heading it
sits under: CAG's page lists the 2023-24 and 2022-23 Finance Accounts under a
"2024 - 25" heading.
"""
from __future__ import annotations

import re
from datetime import UTC, datetime

from bs4 import BeautifulSoup

from app.database import get_db_context
from app.models.document import Document, DocumentType
from app.scrapers.base import BaseScraper, ScrapeIncomplete
from app.scrapers.cag_address import current
from app.scrapers.sanity import FieldRule, SanityAbort, SanitySpec
from app.utils.logger import logger

PAGE = "https://cag.gov.in/ae/andhra-pradesh/en/state-accounts-report"
PORTAL_NAME = "CAG — Andhra Pradesh (state accounts)"
KINDS = {"357": "Accounts at a Glance", "358": "Appropriation Accounts",
         "359": "Finance Accounts", "360": "Monthly Key Indicators"}
FIRST_YEAR = 2014
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july",
                                      "august", "september", "october", "november", "december"], start=1)}
# Files whose title and name carry no year, read from their own covers on 24 Oct 2026.
# CAG's page lists 895 and 896 under a "2020 - 21" heading; their covers say 2018-19.
COVER_YEARS = {
    "account-report-895-05fc9e1fb386694-68811358.pdf": 2018,   # Finance Accounts 2018-19, Volume I
    "account-report-896-05fc9e24e2723c7-80764627.pdf": 2018,   # Finance Accounts 2018-19, Volume II
    "account-report-897-05fc9e2d600d7b6-90510120.pdf": 2018,   # Appropriation Accounts 2018-19
    "account-report-898-05fc9e31d934834-92200806.pdf": 2018,   # Accounts at a Glance 2018-19
    "APPR-ACNTS.pdf": 2017,                                    # Appropriation Accounts 2017-18
    "ACCOUNTS AT A GLANCE.pdf": 2017,                          # Accounts at a Glance 2017-18
}
YEAR_PAIR = re.compile(r"(?<!\d)((?:19|20)\d{2})\s*[-_ ]\s*(\d{2}|(?:19|20)\d{2})(?!\d)")


def _fy(start: int) -> str:
    return "%d-%02d" % (start, (start + 1) % 100)


def fiscal_year(*texts: str | None) -> int | None:
    """The first year pair (2023-24, 2021-2022, 2014_15) found in the texts, in order."""
    for t in texts:
        if not t:
            continue
        for a, b in YEAR_PAIR.findall(t):
            a = int(a)
            b2 = int(b[-2:])
            if b2 == (a + 1) % 100:
                return a
    return None


def month_year(title: str) -> tuple[int, int] | None:
    m = re.match(r"\s*([A-Za-z]+)\s*(?:\(\s*(?:Pre|Sup)\s*\))?\s*,\s*((?:19|20)\d{2})", title or "")
    if not m or m.group(1).lower() not in MONTHS:
        return None
    return MONTHS[m.group(1).lower()], int(m.group(2))


def volume(*texts: str | None) -> str | None:
    for t in texts:
        m = re.search(r"(?<![A-Za-z])vol(?:ume)?\.?\s*[-_ ]?\s*(II|I|2|1)(?![A-Za-z0-9])", t or "", re.I)
        if m:
            return "II" if m.group(1) in ("II", "2") else "I"
    return None


def parse(html: str, kind_code: str) -> list[dict]:
    """Every file on one listing page, with the year it is for."""
    kind = KINDS[kind_code]
    soup = BeautifulSoup(html, "lxml")
    out, seen = [], set()
    for li in soup.find_all("li"):
        links = sorted({a["href"] for a in li.find_all("a", href=True) if "state_accounts_report/" in a["href"]})
        if not links:
            continue
        acc = li.find_parent("div", class_="accordion")
        trig = acc.find("div", class_="accTrigger") if acc else None
        heading = trig.get_text(" ", strip=True) if trig else None
        h5 = li.find("h5")
        printed = h5.get_text(" ", strip=True) if h5 else ""
        for href in links:
            url = current(href)
            if url in seen:
                continue
            seen.add(url)
            name = url.rsplit("/", 1)[-1]
            entry = {"kind": kind, "url": url, "printed_title": printed, "heading": heading}
            if kind == "Monthly Key Indicators":
                my = month_year(printed)
                if not my:
                    continue
                mon, yr = my
                entry["fy_start"] = yr if mon >= 4 else yr - 1
                variant = "provisional" if "(pre" in printed.lower() else ("supplementary" if "(sup" in printed.lower() else "")
                revised = "revised" in name.lower()
                label = printed.split(",")[0].split("(")[0].strip()
                entry["title"] = "Monthly Key Indicators, %s %d%s%s" % (
                    label, yr, " (%s)" % variant if variant else "", ", revised" if revised else "")
            else:
                fy = fiscal_year(printed, name)
                if fy is None:
                    fy = COVER_YEARS.get(name, fiscal_year(heading))
                entry["fy_start"] = fy
                vol = volume(printed, name)
                title = "%s %s" % (kind, _fy(fy)) if fy else kind
                if vol:
                    title += ", Volume %s" % vol
                period = re.search(r"from\s+(\d+\s*(?:st|nd|rd|th)?\s+\w+\s+\d{2,4}\s+to\s+\d+\s*(?:st|nd|rd|th)?\s+\w+\s+\d{2,4})",
                                   printed, re.I) or re.search(r"from_(\d+_\w+_\d+_to_\d+_\w+_\d+)", name)
                if period:
                    title += " (%s)" % period.group(1).replace("_", " ")
                entry["title"] = title
            out.append(entry)
    return out


class CAGStateAccountsScraper(BaseScraper):
    PORTAL_NAME = "CAG_StateAccounts_AP"
    BASE_URL = "https://cag.gov.in"
    SANITY = SanitySpec(
        min_rows=1,
        fields={"title": FieldRule(required=True, min_len=8, max_len=300),
                "url": FieldRule(required=True, min_len=20)},
        key_field="url",
    )

    async def scrape(self) -> int:
        self.log_start()
        saved, failure = 0, None
        try:
            entries, older, pages_failed = [], 0, []
            for code in KINDS:
                for arch in (False, True):
                    url = f"{PAGE}?{'arch=1&' if arch else ''}defuat_account_report_type={code}"
                    html = await self._listing(url)
                    if html is None:
                        pages_failed.append((code, arch))
                        continue
                    for e in parse(html, code):
                        if e["fy_start"] is not None and e["fy_start"] >= FIRST_YEAR:
                            entries.append(e)
                        else:
                            older += 1
            logger.info(f"[{self.PORTAL_NAME}] {len(entries)} papers from 2014-15 on; {older} older or undated, "
                        f"not published; {len(pages_failed)} listing page(s) did not answer")
            saved = await self._save(entries)
            # The current Finance and Appropriation Accounts pages hold the newest audited years:
            # without them the run has missed what matters most, so it counts as incomplete. An
            # archive page or the monthly indicators not answering is noted (CAG's archive of the
            # monthly indicators did not answer on 24 Oct 2026, and is read on a later run).
            core = [p for p in pages_failed if p in (("358", False), ("359", False))]
            if core or len(pages_failed) == 2 * len(KINDS):
                failure = ScrapeIncomplete(f"{len(pages_failed)} of {2 * len(KINDS)} CAG state-accounts listings "
                                           "did not answer, including the current Finance or Appropriation Accounts",
                                           records_new=saved)
            elif pages_failed:
                self.note(f"{len(pages_failed)} of {2 * len(KINDS)} CAG state-accounts listings did not answer: "
                          + ", ".join(f"{KINDS[c]}{' archive' if a else ''}" for c, a in pages_failed))
        except SanityAbort:
            raise
        except Exception as e:
            self.log_error("Scrape failed", e)
            failure = e
        finally:
            await self.close()
        return self.finish(saved, failure)

    async def _listing(self, url: str) -> str | None:
        """One listing page, or None when it does not answer (counted by scrape())."""
        try:
            return (await self.fetch(url)).text
        except Exception as e:  # noqa: BLE001  one listing down must not cost the other seven
            logger.warning(f"[{self.PORTAL_NAME}] {url} failed: {e}")
            return None

    async def _save(self, entries: list[dict]) -> int:
        entries = await self.gate(entries)
        saved, now = 0, datetime.now(UTC)
        from sqlalchemy import select
        async with get_db_context() as db:
            for e in entries:
                have = (await db.execute(select(Document).where(Document.source_url == e["url"]))).scalar_one_or_none()
                if have:
                    continue
                db.add(Document(
                    title=e["title"],
                    document_type=DocumentType.STATE_ACCOUNTS,
                    year=e["fy_start"],
                    department="Comptroller and Auditor General of India",
                    reference_number=_fy(e["fy_start"]),
                    description=f"{e['kind']}, Government of Andhra Pradesh. CAG's listing title: {e['printed_title']}",
                    source_url=e["url"],
                    source_portal=PORTAL_NAME,
                    source_page_url=PAGE,
                    source_page_title=f"CAG Andhra Pradesh, state accounts: {e['kind']}",
                    retrieved_at=now,
                    last_scraped_at=now,
                ))
                saved += 1
        return saved
