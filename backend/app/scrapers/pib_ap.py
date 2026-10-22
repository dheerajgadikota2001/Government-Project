"""
Press Information Bureau releases that name a place in Andhra Pradesh.

Source: https://www.pib.gov.in, the Government of India's release desk. Two
offices matter here: PIB Vijayawada (region 45), which issues releases about the
state, and PIB Delhi (region 3), which issues the national ones. The month
listing is an ASP.NET page whose month and year are chosen through its own form,
so a listing is a GET for the form's hidden fields and one POST back with the
month chosen. That is exactly what the page does in a browser; nothing else is
called.

WHICH RELEASES ARE READ
- Every Vijayawada release of the month.
- A Delhi release only when its title names Andhra Pradesh or one of the places
  in app/constants/ap_places.py. Delhi issues thousands a month; reading each
  body to find the few that mention an AP town would cost the site and us far
  more than it returns. The known cost: a Delhi release that names an AP place
  only in its text is missed. The gathering in October 2026 accepted the same.

HOW A RELEASE BECOMES DISTRICT ROWS
The release page's text (title and body up to its Release ID, with PIB
Vijayawada's own address line removed so the office is not read as news about
Vijayawada) is matched against the place list. Each district named gets one
row, carrying the place words as printed in meta.places_as_printed. The summary
is the release's first sentence, quoted. Figures are taken only from the title,
and only rupee amounts, as printed.

A release already in the table is not fetched again. Releases do not change
after they are posted, so re-reading them would only load PIB's servers.
"""

from __future__ import annotations

import html as htmllib
import re
from datetime import date, datetime, timedelta, timezone

from app.constants.ap_places import find_places
from app.scrapers.base import BaseScraper
from app.scrapers.sanity import SanityAbort
from app.services.district_happenings import prepare_many
from app.utils.logger import logger

IST = timezone(timedelta(hours=5, minutes=30))
LISTING = "https://www.pib.gov.in/allRel.aspx?reg={reg}&lang=1"
RELEASE = "https://www.pib.gov.in/PressReleasePage.aspx?PRID={prid}"
REGIONS = {45: "PIB Vijayawada", 3: "PIB Delhi"}
FUTURE_GRACE = timedelta(days=2)
_AP_TITLE = re.compile(r"Andhra", re.IGNORECASE)
_OFFICE_LINES = re.compile(r"PIB Vijayawada|Regional Outreach Bureau,? Vijayawada|CBC,? Vijayawada")


def _text(s: str) -> str:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", s or "", flags=re.DOTALL)
    t = re.sub(r"<(br|/p|/tr|/li|/h\d|/div)[^>]*>", "\n", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = htmllib.unescape(t)
    t = re.sub(r"[ \t\xa0]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()


def hidden_fields(page: str) -> dict:
    return {n: htmllib.unescape(v) for n, v in re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', page)}


def parse_listing(page: str) -> list[dict]:
    """Release id, title, ministry and posted date from a month listing."""
    out, ministry = [], None
    for m in re.finditer(
            r"<h3 class='font104'>(.*?)</h3>|<a title='([^']*)' href='/PressReleaseDetail\.aspx\?PRID=(\d+)'[^>]*>.*?</a><span class='publishdatesmall'>Posted On:\s*([^<]+)",
            page, re.DOTALL):
        if m.group(1) is not None:
            ministry = re.sub(r"\s+", " ", htmllib.unescape(m.group(1))).strip()
        else:
            out.append({"prid": m.group(3), "title": htmllib.unescape(m.group(2)).strip(),
                        "ministry": ministry, "posted": m.group(4).strip()})
    return out


def parse_release(page: str) -> dict:
    """Body text up to the Release ID, the posted line, and the first sentence."""
    a = page.find('<div class="innner-page-main-about-us-content-right-part"')
    t = _text(page[a:] if a >= 0 else page)
    j = t.find("(Release ID")
    body = t[: j + 60] if j > 0 else t[:6000]
    posted = re.search(r"Posted On:\s*\n?\s*([0-9]{1,2} [A-Za-z]{3} [0-9]{4}[^\n]*)", body)
    after = re.search(r"Posted On:\s*\n?[^\n]*\n(.*)", body, re.DOTALL)
    lead = re.sub(r"\s+", " ", after.group(1) if after else body).strip()
    first = re.split(r"(?<=[a-z\)])\.\s", lead, maxsplit=1)[0][:500]
    return {"body": body, "posted_full": posted.group(1).strip() if posted else None, "first_sentence": first}


def title_figures(title: str) -> list[dict]:
    figs = []
    for m in re.finditer(r"(?:₹|Rs\.?\s?)\s?([\d,]+(?:\.\d+)?)\s*(crore|lakh)", title, re.IGNORECASE):
        v = m.group(1).replace(",", "")
        figs.append({"label": "Amount stated in the release title", "value": float(v) if "." in v else int(v),
                     "unit": "Rs " + m.group(2).lower(), "as_printed": m.group(0)})
    return figs


def wanted(item: dict, reg: int) -> bool:
    return reg == 45 or bool(_AP_TITLE.search(item["title"]) or find_places(item["title"]))


def release_rows(item: dict, reg: int, rel: dict) -> list[dict]:
    """One raw row per district the release names."""
    posted = datetime.strptime(item["posted"], "%d %b %Y").date()
    hits = find_places(_OFFICE_LINES.sub(" ", rel["body"]))
    return [{
        "district": district, "source_kind": "pib", "category": "press release",
        "title": item["title"], "date": posted, "date_end": None,
        "url": RELEASE.format(prid=item["prid"]), "file_url": None,
        "summary": f"Release text as printed (first sentence): '{rel['first_sentence']}'",
        "figures": title_figures(item["title"]),
        "meta": {"ministry": item.get("ministry"), "places_as_printed": places, "pib_office": REGIONS[reg],
                 "posted_as_printed": rel.get("posted_full"),
                 "places_named_in_release": sum(len(v) for v in hits.values())},
    } for district, places in hits.items()]


def check_month(reg: int, year: int, month: int, listed: list[dict], today: date) -> None:
    ahead = [i for i in listed if datetime.strptime(i["posted"], "%d %b %Y").date() > today + FUTURE_GRACE]
    if ahead:
        raise SanityAbort(f"{REGIONS[reg]} {year}-{month:02d}: a release dated {ahead[0]['posted']}, after today")
    # Vijayawada posts most working days. An empty month that has already started
    # is a page that changed, not a quiet office.
    if reg == 45 and not listed and (year, month) < (today.year, today.month):
        raise SanityAbort(f"{REGIONS[reg]} {year}-{month:02d}: the listing came back empty for a whole past month")


class PibApScraper(BaseScraper):
    PORTAL_NAME = "PIB_AP"
    BASE_URL = "https://www.pib.gov.in"

    def __init__(self, today: date | None = None):
        super().__init__()
        self.today = today or datetime.now(IST).date()

    def months(self) -> list[tuple[int, int]]:
        """This month and the one before, so a release posted late on the last day is not lost."""
        first = self.today.replace(day=1)
        prev = (first - timedelta(days=1)).replace(day=1)
        return [(prev.year, prev.month), (first.year, first.month)]

    async def listing(self, reg: int, year: int, month: int) -> list[dict]:
        url = LISTING.format(reg=reg)
        form = hidden_fields((await self.fetch(url)).text)
        form.update({
            "ctl00$Bar1$ddlregion": str(reg), "ctl00$Bar1$ddlLang": "1", "ctl00$ContentPlaceHolder1$ddlMinistry": "0",
            "ctl00$ContentPlaceHolder1$ddlday": "0", "ctl00$ContentPlaceHolder1$ddlMonth": str(month),
            "ctl00$ContentPlaceHolder1$ddlYear": str(year),
            "__EVENTTARGET": "ctl00$ContentPlaceHolder1$ddlYear", "__EVENTARGUMENT": "",
        })
        try:
            resp = await self.client.post(url, data=form)
            resp.raise_for_status()
        except Exception as exc:
            self.fetch_failures.append((url, f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__))
            raise
        self.fetch_ok += 1
        return parse_listing(resp.text)

    async def _known(self, urls: list[str]) -> set[str]:
        from sqlalchemy import select

        from app.database import get_db_context
        from app.models.district_happening import DistrictHappening as H

        if not urls:
            return set()
        async with get_db_context() as db:
            return set((await db.execute(select(H.url).where(H.source_kind == "pib", H.url.in_(urls)))).scalars().all())

    async def _part(self, reg: int, year: int, month: int) -> tuple[int, str | None]:
        from app.database import get_db_context
        from app.services.district_happenings import upsert

        listed = await self.listing(reg, year, month)
        try:
            check_month(reg, year, month, listed, self.today)
        except SanityAbort as abort:
            logger.warning(f"[{self.PORTAL_NAME}] refused {abort}")
            return 0, str(abort)
        want = [i for i in listed if wanted(i, reg)]
        known = await self._known([RELEASE.format(prid=i["prid"]) for i in want])
        raws: list[dict] = []
        for item in want:
            if RELEASE.format(prid=item["prid"]) in known:
                continue
            rel = parse_release((await self.fetch(RELEASE.format(prid=item["prid"]))).text)
            raws += release_rows(item, reg, rel)
        rows, refused = prepare_many(raws)
        if refused:
            self.note(f"{REGIONS[reg]} {year}-{month:02d}: {len(refused)} row(s) left out: {refused[0]}")
        async with get_db_context() as db:
            new, _ = await upsert(db, rows)
        return new, None

    async def scrape(self) -> int:
        self.log_start()
        saved = 0
        failure: BaseException | None = None
        refused: list[str] = []
        for reg, office in REGIONS.items():
            for year, month in self.months():
                try:
                    n, why = await self._part(reg, year, month)
                    saved += n
                    if why:
                        refused.append(why)
                except Exception as exc:             # noqa: BLE001
                    # Parked for finish(); the other office and month still get their turn.
                    failure = failure or exc
                    logger.error(f"[{self.PORTAL_NAME}] {office} {year}-{month:02d} failed: {exc}")
        await self.close()
        if failure is None and refused:
            self.log_done(saved)
            raise SanityAbort("; ".join(refused) + f" ({saved} other row(s) stored)")
        return self.finish(saved, failure)
