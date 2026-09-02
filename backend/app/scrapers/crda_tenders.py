"""
AP CRDA tenders — the live Tenders/Auctions board of the Capital Region
Development Authority (Amaravati).

Source: https://crda.ap.gov.in/apcrdav2/views/NotificationsView.aspx
A plain server-rendered ASP.NET grid (id="GvReportGrid"): one row per open
tender/auction with department, notification number, initiated/valid-up-to
dates and the description. Each row carries a hidden, stable portal id
(hdnnotificationid, e.g. NOT08101660) — that is our upsert key — and usually
the bidding portal address (most CRDA tenders are actually bid on the AP
e-procurement portal).

Honesty rules, stated once here and enforced below:
  - The listing prints NO rupee value; estimated_value stays NULL and the
    page must say "not published on the listing", never a dash that could
    read as zero.
  - This is ONE portal. A count of these rows is a count of what we track,
    never "tenders in Andhra Pradesh" — the state e-procurement portal
    alone lists thousands at any time. The frontend carries that sentence.
  - Rows are never deleted. A tender that leaves the board or passes its
    closing date is marked CLOSED so the register accumulates history.
  - A layout change on their side must fail loudly, not save garbage: the
    parser refuses to store anything if the grid or its expected headers
    are not found, or if fewer than 3 rows parse.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from bs4 import BeautifulSoup
from sqlalchemy import select

from app.database import get_db_context
from app.models.tender import Tender, TenderStatus, TenderType
from app.scrapers.base import BaseScraper
from app.utils.logger import logger

LISTING_URL = "https://crda.ap.gov.in/apcrdav2/views/NotificationsView.aspx"
PORTAL = "AP CRDA (Amaravati)"

# India Standard Time: "valid up to 05/09/2026" means the end of that day IST.
IST = timezone(timedelta(hours=5, minutes=30))

EXPECTED_HEADERS = ["S.No.", "Department Name", "Notification Number",
                    "Tender/Auction Initiated on", "Tender/Auction Valid up to",
                    "Notification Description"]


def _classify(description: str) -> TenderType:
    """Type from the notification's own wording, checked most-specific first."""
    d = description.lower()
    if "expression of interest" in d or re.search(r"\beoi\b", d):
        return TenderType.EOI
    if "request for proposal" in d or re.search(r"\brfp\b", d):
        return TenderType.RFP
    if "auction" in d:
        return TenderType.AUCTION
    if "consultant" in d or "consultancy" in d or "services" in d or "insurance" in d:
        return TenderType.SERVICES
    if ("infrastructure" in d or "construction" in d or "works" in d
            or "lump sum contract" in d):
        return TenderType.WORKS
    return TenderType.OTHER


def _date_ist_end_of_day(s: str) -> Optional[datetime]:
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s.strip())
    if not m:
        return None
    day, month, year = (int(x) for x in m.groups())
    return datetime(year, month, day, 23, 59, 59, tzinfo=IST)


def _date_ist_start_of_day(s: str) -> Optional[datetime]:
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s.strip())
    if not m:
        return None
    day, month, year = (int(x) for x in m.groups())
    return datetime(year, month, day, tzinfo=IST)


class CrdaTendersScraper(BaseScraper):
    PORTAL_NAME = "CRDA_TENDERS"
    BASE_URL = "https://crda.ap.gov.in"

    async def scrape(self) -> int:
        self.log_start()
        html = await self._get_html()
        rows = self._parse_grid(html)
        # Sanity gate: a redesigned page must abort, not half-save.
        if len(rows) < 3:
            raise RuntimeError(
                f"[{self.PORTAL_NAME}] only {len(rows)} rows parsed — layout "
                "changed or page empty; refusing to save."
            )
        saved = await self._save(rows)
        self.log_done(saved)
        return saved

    async def _get_html(self) -> str:
        resp = await self.client.get(LISTING_URL, timeout=60)
        resp.raise_for_status()
        return resp.text

    def _parse_grid(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        grid = soup.find("table", id="GvReportGrid")
        if grid is None:
            raise RuntimeError(
                f"[{self.PORTAL_NAME}] GvReportGrid table not found — "
                "the page layout has changed; refusing to parse."
            )
        header_cells = [th.get_text(strip=True) for th in grid.find_all("th")]
        for expected in EXPECTED_HEADERS:
            if expected not in header_cells:
                raise RuntimeError(
                    f"[{self.PORTAL_NAME}] expected column {expected!r} missing "
                    f"from grid headers {header_cells!r}; refusing to parse."
                )

        rows: list[dict] = []
        for tr in grid.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 6:
                continue  # header or malformed row
            dept = tds[1].get_text(strip=True)
            nit = tds[2].get_text(strip=True)
            initiated = tds[3].get_text(strip=True)
            valid_up_to = tds[4].get_text(strip=True)
            description = re.sub(r"\s+", " ", tds[5].get_text(strip=True))

            download_td = tds[6] if len(tds) > 6 else None
            portal_id = None
            bid_url = None
            if download_td is not None:
                hid = download_td.find("input", id=re.compile(r"hdnnotificationid"))
                if hid and hid.get("value"):
                    portal_id = hid["value"].strip()
                web = download_td.find("input", id=re.compile(r"hdnWebAddress"))
                if web and web.get("value"):
                    bid_url = web["value"].strip()

            if not (nit and description):
                continue
            rows.append({
                "portal_id": portal_id,
                "nit": nit,
                "department": dept,
                "published": _date_ist_start_of_day(initiated),
                "closes": _date_ist_end_of_day(valid_up_to),
                "description": description,
                "bid_url": bid_url,
            })
        return rows

    async def _save(self, rows: list[dict]) -> int:
        now = datetime.now(timezone.utc)
        created = 0
        seen_ids: set[str] = set()

        async with get_db_context() as db:
            for r in rows:
                # Stable key: the portal's own hidden notification id; the NIT
                # number (whitespace-normalised) is the fallback for rows that
                # lack one.
                nit_compact = re.sub(r"\s+", "", r["nit"])
                tender_key = r["portal_id"] or f"CRDA-{nit_compact}"
                seen_ids.add(tender_key)

                is_open = r["closes"] is not None and r["closes"] >= now
                status = TenderStatus.ACTIVE if is_open else TenderStatus.CLOSED

                existing = (await db.execute(
                    select(Tender).where(Tender.tender_id == tender_key)
                )).scalar_one_or_none()

                if existing:
                    existing.nit_number = r["nit"]
                    existing.title = r["description"][:1000]
                    existing.department = r["department"]
                    existing.tender_type = _classify(r["description"])
                    existing.published_date = r["published"]
                    existing.bid_submission_end = r["closes"]
                    # Never resurrect an awarded/cancelled row to ACTIVE from
                    # a listing that carries no award information.
                    if existing.status in (TenderStatus.ACTIVE, TenderStatus.CLOSED):
                        existing.status = status
                    existing.document_urls = [r["bid_url"]] if r["bid_url"] else existing.document_urls
                    existing.last_scraped_at = self.scraped_at
                else:
                    db.add(Tender(
                        tender_id=tender_key,
                        nit_number=r["nit"],
                        title=r["description"][:1000],
                        description=r["description"],
                        tender_type=_classify(r["description"]),
                        status=status,
                        district=None,  # the listing names villages, not districts — honest null
                        location_description="Amaravati Capital Region (AP CRDA)",
                        estimated_value=None,  # the listing prints no value — never invent one
                        department=r["department"],
                        tender_inviting_authority="Andhra Pradesh Capital Region Development Authority",
                        published_date=r["published"],
                        bid_submission_end=r["closes"],
                        source_portal=PORTAL,
                        source_url=LISTING_URL,
                        document_urls=[r["bid_url"]] if r["bid_url"] else None,
                        last_scraped_at=self.scraped_at,
                    ))
                    created += 1

            # History, not deletion: CRDA rows that left the board close out.
            gone = (await db.execute(
                select(Tender).where(
                    Tender.source_portal == PORTAL,
                    Tender.status == TenderStatus.ACTIVE,
                    Tender.tender_id.notin_(seen_ids),
                )
            )).scalars().all()
            for t in gone:
                t.status = TenderStatus.CLOSED
                t.last_scraped_at = self.scraped_at
            if gone:
                logger.info(
                    f"[{self.PORTAL_NAME}] {len(gone)} tender(s) left the board "
                    "since last run — marked closed, kept in the register."
                )

            await db.commit()
        return created
