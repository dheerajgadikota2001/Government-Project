"""
What each collectorate posted lately: announcements, tenders, recruitment,
events and press releases, from all 28 district sites.

Source: the NIC S3WaaS district network, https://<district>.ap.gov.in. Every
site runs the same WordPress template, so one parser serves all 28. The URL
shapes below are the ones the October 2026 gathering proved on all 28 sites.

WHY NOT THE PLAIN LIST PAGES
/notice_category/<cat>/ is served from WP-Super-Cache. On 21 Oct 2026 those
copies were 6 to 15 days old (Eluru's was dated 7 October). The site's own
controls build a fresh page every time, so those are what we read:

    /past-notices/<cat>?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD    the archive, filtered by date
    /notice_category/<cat>/?sortby=publish_date                    the current list, freshly sorted
    /category/press-release/?cyear=YYYY                            press releases of one year

A section a district does not have answers 404; that is a missing section, not
a broken site, and only the front door (the first listing) counts as reachable.

WHAT IS NEVER READ OR KEPT
- Voter rolls. Election offices upload roll parts into the same lists; the
  electoral rule in app/scrapers/district_documents.py refuses them by title.
- The files of personal lists. A merit, selection, seniority, provisional or
  rejected list, or a speaking order, is stored as its title and a link to the
  site's own page for that day. Its PDF is not downloaded, here or anywhere.
- Nothing is downloaded at all, in fact. Every row is read from the listing.

WHEN WE STOP INSTEAD OF RETRYING
Connection resets are the agent proxy dropping a tunnel and are retried a
bounded number of times. A robots.txt rule against these paths, a 403, a
captcha, a login form or a certificate that does not verify are the site saying
no. Those stop that district at once and are reported by name. TLS is never
relaxed and no other route is tried.

SANITY, PER DISTRICT
A district that returns no notices at all for the window, when the table already
holds notices from that window, has most likely changed its page, not gone
quiet; that district's batch is refused. So is a batch holding a notice dated
more than two days ahead. Refusals are collected and raised together at the end
(SanityAbort), after every other district has been read and saved.
"""

from __future__ import annotations

import asyncio
import html as htmllib
import re
from datetime import date, datetime, timedelta, timezone
from urllib.robotparser import RobotFileParser

import httpx

from app.config import settings
from app.scrapers.base import BaseScraper, ScrapeIncomplete
from app.scrapers.sanity import SanityAbort
from app.services.district_happenings import (
    TENDER_RE,
    day_listing,
    is_personal_list,
    norm_title,
    prepare_many,
)
from app.utils.logger import logger

IST = timezone(timedelta(hours=5, minutes=30))

# Verified host for every district on 21 Oct 2026, including the two of 2026.
DISTRICT_HOSTS: dict[str, str] = {
    "Alluri Sitharama Raju": "allurisitharamaraju.ap.gov.in",
    "Anakapalli": "anakapalli.ap.gov.in",
    "Ananthapuramu": "ananthapuramu.ap.gov.in",
    "Annamayya": "annamayya.ap.gov.in",
    "Bapatla": "bapatla.ap.gov.in",
    "Chittoor": "chittoor.ap.gov.in",
    "Dr. B.R. Ambedkar Konaseema": "konaseema.ap.gov.in",
    "East Godavari": "eastgodavari.ap.gov.in",
    "Eluru": "eluru.ap.gov.in",
    "Guntur": "guntur.ap.gov.in",
    "Kakinada": "kakinada.ap.gov.in",
    "Krishna": "krishna.ap.gov.in",
    "Kurnool": "kurnool.ap.gov.in",
    "Markapuram": "markapuram.ap.gov.in",
    "Nandyal": "nandyal.ap.gov.in",
    "NTR": "ntr.ap.gov.in",
    "Palnadu": "palnadu.ap.gov.in",
    "Parvathipuram Manyam": "parvathipurammanyam.ap.gov.in",
    "Polavaram": "polavaram.ap.gov.in",
    "Prakasam": "prakasam.ap.gov.in",
    "Sri Potti Sriramulu Nellore": "spsnellore.ap.gov.in",
    "Sri Sathya Sai": "srisathyasai.ap.gov.in",
    "Srikakulam": "srikakulam.ap.gov.in",
    "Tirupati": "tirupati.ap.gov.in",
    "Visakhapatnam": "visakhapatnam.ap.gov.in",
    "Vizianagaram": "vizianagaram.ap.gov.in",
    "West Godavari": "westgodavari.ap.gov.in",
    "YSR Kadapa": "kadapa.ap.gov.in",
}

# Site category slug -> our category. "elections" is deliberately absent.
NOTICE_CATEGORIES = {"announcements": "announcement", "tenders": "tender", "recruitment": "recruitment", "events": "event"}
WINDOW_DAYS = 60          # each daily run re-reads two months, so a missed day is caught up
MAX_PAGES = 10            # per listing; the busiest district needed 3 pages for a quarter
FUTURE_GRACE = timedelta(days=2)
RESET_TRIES = 4

_DATE_RE = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
_FILE_RE = re.compile(r"\.(pdf|jpe?g|png|docx?|xlsx?|zip)(\?|$)", re.IGNORECASE)
_BLOCK_MARKERS = re.compile(r"captcha|g-recaptcha|hcaptcha|please log ?in|name=\"(log|pwd|password)\"", re.IGNORECASE)


class SourceBlocked(Exception):
    """The site said no (robots, 403, captcha, login, TLS). Never retried, never routed around."""


# ---------------------------------------------------------------- parsing
# Pure functions on saved HTML, so the tests need no network.

def _clean(x: str) -> str:
    x = re.sub(r"<script.*?</script>|<style.*?</style>", " ", x or "", flags=re.DOTALL)
    x = re.sub(r"<(br|/p|/li)[^>]*>", "\n", x)
    x = re.sub(r"<[^>]+>", " ", x)
    x = htmllib.unescape(x)
    x = re.sub(r"[ \t\xa0]+", " ", x)
    return re.sub(r"\s*\n\s*", "\n", x).strip()


def _date(s: str) -> date | None:
    m = _DATE_RE.search(s or "")
    if not m:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def _links(x: str) -> list[dict]:
    out = []
    for m in re.finditer(r"<a\b([^>]*)>(.*?)</a>", x, re.DOTALL):
        h = re.search(r'href="([^"]+)"', m.group(1))
        if h:
            out.append({"href": htmllib.unescape(h.group(1)), "text": _clean(m.group(2))})
    return out


def parse_notice_table(page: str, host: str) -> list[dict]:
    """Rows of a notice listing: title, description, start and end dates, files.

    Only tables whose header carries a start date are read; that is the notice
    template, and it keeps a stray layout table from being read as notices.
    """
    out = []
    for t in re.findall(r"<table\b.*?</table>", page, re.DOTALL):
        headers = [_clean(h).lower() for h in re.findall(r"<th\b[^>]*>(.*?)</th>", t, re.DOTALL)]
        if not any(h.startswith("start") for h in headers):
            continue
        ti = headers.index("title") if "title" in headers else 0
        si = next(i for i, h in enumerate(headers) if h.startswith("start"))
        ei = next((i for i, h in enumerate(headers) if h.startswith("end")), None)
        di = headers.index("description") if "description" in headers else None
        for tr in re.findall(r"<tr\b.*?</tr>", t, re.DOTALL):
            tds = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.DOTALL)
            if len(tds) <= si:
                continue
            links = _links(tr)
            files = [lk for lk in links if _FILE_RE.search(lk["href"])]
            page_links = [lk["href"] for lk in links if not _FILE_RE.search(lk["href"]) and host in lk["href"] and "/notice/" in lk["href"]]
            out.append({
                "title": _clean(tds[ti]),
                "description": _clean(tds[di]) if di is not None and di < len(tds) else None,
                "date": _date(tds[si]),
                "date_end": _date(tds[ei]) if ei is not None and ei < len(tds) else None,
                "files": files,
                "page": page_links[0] if page_links else None,
            })
    return out


def parse_press_posts(page: str, host: str) -> list[dict]:
    """Press release cards: heading, 'Published on' date, opening text, link."""
    out = []
    for blk in re.split(r'<div class="pressRelese">', page)[1:]:
        h = re.search(r"<h2[^>]*>(.*?)</h2>", blk, re.DOTALL)
        d = re.search(r"Published on:</strong>\s*([^<]+)<", blk)
        p = re.search(r"</span>\s*<p>(.*?)</p>", blk, re.DOTALL)
        links = [lk["href"] for lk in _links(blk) if host in lk["href"] and not _FILE_RE.search(lk["href"])
                 and not re.search(r"facebook|x\.com|twitter|whatsapp", lk["href"])]
        out.append({
            "title": _clean(h.group(1)) if h else "",
            "description": _clean(p.group(1)) if p else None,
            "date": _date(d.group(1)) if d else None,
            "date_end": None, "files": [],
            "page": links[0] if links else None,
        })
    return out


def next_page(page: str, url: str) -> str | None:
    """The next page of the same listing, keeping its query (the date filter)."""
    root = re.sub(r"/page/\d+/?$", "", url.split("?")[0]).rstrip("/")
    for lk in _links(page):
        if lk["text"].startswith("Next") or lk["text"] in ("»", "Next »"):
            h = lk["href"]
            if "/page/" in h and h.split("?")[0].startswith(root):
                return h
    return None


def to_raw(district: str, host: str, site_slug: str, parsed: dict, listed_at: str) -> dict:
    """A parsed listing row as the shape prepare() takes."""
    title = parsed["title"]
    # The site cuts long titles ("... Revised Final Merit Lis"), so the description is
    # read for the same words. A false alarm only costs a summary we would not show.
    personal = is_personal_list(title) or is_personal_list(parsed.get("description") or "")
    category = "press release" if site_slug == "press-release" else NOTICE_CATEGORIES[site_slug]
    basis = "section of the site where it is listed"
    if category == "recruitment" and TENDER_RE.search(title) and not personal:
        # The site filed a purchase under recruitment. Moved, and the move is recorded.
        category, basis = "tender", "keyword in title (site lists it under recruitment)"
    files = parsed["files"]
    meta = {"listed_at": listed_at, "site_category": site_slug, "category_basis": basis}
    if parsed.get("description") and norm_title(parsed["description"])[:80] != norm_title(title)[:80]:
        meta["listing_description"] = parsed["description"][:600]
    if len(files) > 1:
        meta["more_files"] = [{"label": f["text"], "url": f["href"]} for f in files[1:]]
    # A notice with no page of its own is linked to the site's archive for its day,
    # not to its first file: on several sites the first file of every row is the same
    # old cover sheet, which would make a useless link.
    day = day_listing(listed_at, parsed["date"]) if parsed["date"] else None
    return {
        "district": district, "source_kind": "district_site", "category": category, "title": title,
        "date": parsed["date"], "date_end": parsed["date_end"],
        "url": parsed["page"] or day or listed_at,
        "file_url": files[0]["href"] if files else None,
        "summary": None, "figures": [], "meta": meta, "personal_list": personal,
    }


def check_district(district: str, rows: list[dict], today: date, known_in_window: int) -> None:
    ahead = [r for r in rows if r["date"] > today + FUTURE_GRACE]
    if ahead:
        raise SanityAbort(f"{district}: {len(ahead)} notice(s) dated after {today + FUTURE_GRACE}, first {ahead[0]['title'][:50]!r}")
    if not rows and known_in_window:
        raise SanityAbort(f"{district}: no notices read for the window, but {known_in_window} from it are already known")


# ---------------------------------------------------------------- the scraper

class DistrictNoticesScraper(BaseScraper):
    PORTAL_NAME = "AP_District_Notices"
    BASE_URL = "https://andhrapradesh.s3waas.gov.in"

    def __init__(self, today: date | None = None):
        super().__init__()
        self.today = today or datetime.now(IST).date()
        self.window_start = self.today - timedelta(days=WINDOW_DAYS)
        self._robots: dict[str, RobotFileParser | None] = {}
        self.left_out: dict[str, int] = {}

    # ---- fetching

    async def _robots_allows(self, host: str, url: str) -> bool:
        if host not in self._robots:
            rp: RobotFileParser | None = None
            try:
                resp = await self.client.get(f"https://{host}/robots.txt")
                if resp.status_code == 200 and "html" not in resp.headers.get("content-type", ""):
                    rp = RobotFileParser()
                    rp.parse(resp.text.splitlines())
            except httpx.HTTPError:
                rp = None   # no robots file read: the page fetch below meets the same network
            self._robots[host] = rp
        rp = self._robots[host]
        return True if rp is None else rp.can_fetch(settings.scraper_user_agent, url)

    async def get(self, host: str, url: str) -> str | None:
        """The page text, None for a 404, SourceBlocked when the site refuses us."""
        if not await self._robots_allows(host, url):
            raise SourceBlocked(f"robots.txt disallows {url}")
        last: BaseException | None = None
        for attempt in range(RESET_TRIES):
            await asyncio.sleep(settings.scraper_request_delay if attempt == 0 else 4 * attempt)
            try:
                resp = await self.client.get(url)
            except httpx.ConnectError as exc:
                if "CERTIFICATE" in str(exc).upper() or "SSL" in str(exc).upper():
                    self.fetch_failures.append((url, f"TLS: {exc}"))
                    raise SourceBlocked(f"TLS certificate did not verify for {host}") from exc
                last = exc
                continue
            except (httpx.ReadError, httpx.RemoteProtocolError, httpx.TimeoutException, httpx.WriteError) as exc:
                last = exc
                continue
            if resp.status_code == 404:
                self.fetch_ok += 1
                return None
            if resp.status_code in (401, 403):
                self.fetch_failures.append((url, f"HTTP {resp.status_code}"))
                raise SourceBlocked(f"HTTP {resp.status_code} from {host}")
            if resp.status_code >= 500:
                last = httpx.HTTPStatusError(f"HTTP {resp.status_code}", request=resp.request, response=resp)
                continue
            text = resp.text
            # Every real S3WaaS page carries the template's main region, and also the
            # word "captcha" (its feedback form). So the word alone means nothing; a
            # page without the template's main region that asks for a captcha or a
            # login is a challenge page.
            if 'id="SkipContent"' not in text and _BLOCK_MARKERS.search(text[:200000]):
                self.fetch_failures.append((url, "captcha or login page"))
                raise SourceBlocked(f"{host} served a captcha or login page")
            self.fetch_ok += 1
            return text
        why = f"{type(last).__name__}: {last}" if last is not None and str(last) else type(last).__name__
        self.fetch_failures.append((url, why))
        raise httpx.ConnectError(f"{host}: {RESET_TRIES} tries, last {why}")

    async def _walk(self, host: str, url: str, parse) -> tuple[list[tuple[dict, str]], bool]:
        """Every row of one listing, page by page. Returns (rows with the page they came from, found)."""
        out: list[tuple[dict, str]] = []
        u: str | None = url
        found = False
        for _ in range(MAX_PAGES):
            if not u:
                break
            page = await self.get(host, u)
            if page is None:
                break
            found = True
            rows = parse(page, host)
            out += [(r, u) for r in rows]
            dated = [r["date"] for r in rows if r["date"]]
            if not rows or (dated and max(dated) < self.window_start):
                break
            u = next_page(page, u)
        return out, found

    async def read_district(self, district: str, host: str) -> list[dict]:
        """Every notice the district posted in the window, as raw rows. No database."""
        base = f"https://{host}"
        frm, to = self.window_start.isoformat(), self.today.isoformat()
        raws: list[dict] = []
        front_door = False
        for slug in NOTICE_CATEGORIES:
            for url in (f"{base}/past-notices/{slug}?date_from={frm}&date_to={to}",
                        f"{base}/notice_category/{slug}/?sortby=publish_date"):
                rows, found = await self._walk(host, url, parse_notice_table)
                front_door = front_door or found
                raws += [to_raw(district, host, slug, r, at) for r, at in rows]
        for year in sorted({self.window_start.year, self.today.year}):
            rows, _ = await self._walk(host, f"{base}/category/press-release/?cyear={year}", parse_press_posts)
            raws += [to_raw(district, host, "press-release", r, at) for r, at in rows]
        if not front_door:
            raise httpx.ConnectError(f"{host}: none of the notice listings answered")
        # The same notice shows in the archive and in the current list; keep the first.
        seen, out = set(), []
        for r in raws:
            if not r["date"] or not r["title"] or r["date"] < self.window_start:
                continue
            k = (r["date"], norm_title(r["title"]))
            if k in seen:
                continue
            seen.add(k)
            out.append(r)
        return out

    async def _known_in_window(self, district: str) -> int:
        from sqlalchemy import func, select

        from app.database import get_db_context
        from app.models.district_happening import DistrictHappening as H

        async with get_db_context() as db:
            return (await db.execute(select(func.count()).select_from(H).where(
                H.district == district, H.source_kind == "district_site", H.date >= self.window_start))).scalar_one()

    async def _part(self, district: str, host: str) -> tuple[int, str | None]:
        """Read, check and store one district. A refusal comes back as text."""
        from app.database import get_db_context
        from app.services.district_happenings import upsert

        raws = await self.read_district(district, host)
        rows, refused_rows = prepare_many(raws)
        if refused_rows:
            self.left_out[district] = len(refused_rows)
        try:
            check_district(district, rows, self.today, await self._known_in_window(district))
        except SanityAbort as abort:
            logger.warning(f"[{self.PORTAL_NAME}] refused {district}: {abort}")
            return 0, str(abort)
        async with get_db_context() as db:
            new, _again = await upsert(db, rows)
        return new, None

    async def scrape(self) -> int:
        self.log_start()
        saved = 0
        failure: BaseException | None = None
        refused: list[str] = []
        down: list[str] = []
        blocked: list[str] = []
        for district, host in DISTRICT_HOSTS.items():
            try:
                n, why = await self._part(district, host)
                saved += n
                if why:
                    refused.append(why)
            except SourceBlocked as exc:
                # The site said no. Reported by name, never retried another way.
                blocked.append(f"{district} ({exc})")
                failure = failure or exc
            except Exception as exc:                 # noqa: BLE001
                down.append(district)
                failure = failure or exc
                logger.error(f"[{self.PORTAL_NAME}] {district} could not be read: {exc}")
        await self.close()

        if blocked:
            self.note("blocked by the site, not read: " + "; ".join(blocked))
        if self.left_out:
            self.note("left out by rule (voter rolls or unusable rows): "
                      + ", ".join(f"{d} {n}" for d, n in self.left_out.items()))
        # One collectorate down is weather; a third of them is a broken source.
        lost = len(down) + len(blocked)
        if lost * 3 >= len(DISTRICT_HOSTS):
            failure = ScrapeIncomplete(f"{lost} of {len(DISTRICT_HOSTS)} district sites could not be read "
                                       f"({', '.join((down + blocked)[:5])}{' and more' if lost > 5 else ''})")
        else:
            if down:
                self.note(f"{len(down)} of {len(DISTRICT_HOSTS)} district sites could not be read: " + ", ".join(down))
            failure = None
        if failure is None and refused:
            self.log_done(saved)
            raise SanityAbort("; ".join(refused) + f" ({saved} notice(s) from other districts stored)")
        return self.finish(saved, failure)
