"""
Walk every citation in the seed files and notice when the ground moves.

The seed files carry 139 source entries between them, each with a url, a
publisher, a title and the date we transcribed from. That is already a complete,
maintained list of everything this platform depends on and does not control. The
watcher walks it.

IT NEVER WRITES A FIGURE. It answers three questions and stops:

  new_edition  the page now offers a report newer than the one we cited
  changed      the page we transcribed from has been revised since
  dead         the citation 404s — a "[source]" link a reader cannot follow

THE NOISE PROBLEM, AND WHY THE FINGERPRINT IS NARROW
Government pages change something most days: a rotating banner, a hit counter, a
session id sprayed into every link. Hash the page and all 139 flag every
morning; an alert that always fires is an alert nobody reads, which is worse
than no alert because it feels like coverage.

So, in order of preference:
  1. ETag, if the server sends one. It is the server's own answer to "has this
     changed", and it is definitive.
  2. Last-Modified, same reasoning.
  3. Failing both, a hash of the page's DOCUMENT LINKS ONLY — the set of hrefs
     ending in .pdf/.xls(x)/.doc(x) plus their link text. That set is what
     actually moves when a new edition is published, and it is blind to banners.

AND WHY A CHANGE MUST BE SEEN TWICE
One differing fingerprint is as likely to be a load balancer with two slightly
different copies as a real revision. A difference is stored as `pending` on
first sight and only reported once a later run sees the same new fingerprint.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select

from app.config import settings
from app.database import get_db_context
from app.models.source_watch import SourceWatch
from app.utils.logger import logger

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"

# Only these seed files declare citations with URLs. Listed rather than globbed
# so a new seed file cannot silently join the watch list without someone
# deciding it should.
WATCHED_SEEDS = (
    "governments_seed.json",
    "finances_seed.json",
    "state_facts_seed.json",
)

DOC_LINK = re.compile(r"\.(pdf|xlsx?|docx?|csv)(\?|$)", re.I)
# Editions are named by year or financial year in link text: "2026", "2025-26".
EDITION_YEAR = re.compile(r"\b(19|20)\d{2}(?:[-–/]\d{2,4})?\b")

# A citation that fails this many times running is treated as dead rather than
# as a bad afternoon.
DEAD_AFTER_FAILURES = 3

HEADERS = {
    "User-Agent": settings.scraper_user_agent,
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,te;q=0.8",
}


# --------------------------------------------------------------------------
# Reading the citation list out of the seeds
# --------------------------------------------------------------------------

def cited_sources() -> list[dict]:
    """Every source entry that carries a URL, across the watched seed files."""
    out: list[dict] = []
    for name in WATCHED_SEEDS:
        path = SEED_DIR / name
        if not path.exists():
            logger.warning(f"[watch] seed file missing: {name}")
            continue
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        for key, entry in (data.get("sources") or {}).items():
            url = (entry or {}).get("url")
            if not url or not str(url).startswith("http"):
                continue
            out.append({
                "source_key": key,
                "seed_file": name,
                "url": url,
                "publisher": entry.get("publisher"),
                "title": entry.get("title"),
                "cited_date": entry.get("date"),
            })
    return out


# --------------------------------------------------------------------------
# Fingerprinting one page
# --------------------------------------------------------------------------

def _document_links(html: str, base_url: str) -> list[str]:
    """The page's offer of documents: href + link text, for document links only.

    This is the narrow signal. A page can restyle itself completely without
    changing which reports it publishes, and that is exactly the distinction the
    watcher needs to draw.
    """
    soup = BeautifulSoup(html, "html.parser")
    found = []
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        if not DOC_LINK.search(href):
            continue
        # Session ids and cache-busting stamps in query strings change on every
        # request on several AP portals; the path is the stable part.
        path = href.split("?", 1)[0]
        text = re.sub(r"\s+", " ", anchor.get_text(strip=True))[:120]
        found.append(f"{path}|{text}")
    return sorted(set(found))


def _latest_edition(links: Iterable[str]) -> Optional[str]:
    """The newest edition year advertised in the page's own link text."""
    years: list[tuple[int, str]] = []
    for link in links:
        for match in EDITION_YEAR.finditer(link):
            label = match.group(0)
            start = int(label[:4])
            # Guard the same way the PDF indexer does: a "2047" in a scheme name
            # is not a publication year.
            if 1950 <= start <= datetime.now(timezone.utc).year + 1:
                years.append((start, label))
    if not years:
        return None
    return max(years, key=lambda pair: pair[0])[1]


async def fingerprint(client: httpx.AsyncClient, url: str) -> dict:
    """Fetch one citation and reduce it to signals that survive a redesign."""
    try:
        response = await client.get(url, timeout=45, follow_redirects=True)
    except Exception as exc:                      # noqa: BLE001 — any failure is one outcome here
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:300]}

    result = {
        "ok": True,
        "status": response.status_code,
        "etag": (response.headers.get("ETag") or "")[:200] or None,
        "last_modified": (response.headers.get("Last-Modified") or "")[:100] or None,
        "links_hash": None,
        "latest_edition": None,
    }
    content_type = (response.headers.get("Content-Type") or "").lower()
    if response.status_code == 200 and "html" in content_type:
        links = _document_links(response.text, url)
        result["links_hash"] = hashlib.sha256("\n".join(links).encode()).hexdigest()
        result["latest_edition"] = _latest_edition(links)
    elif response.status_code == 200:
        # A PDF cited directly. Its length is the only cheap signal we have, and
        # a regenerated PDF of identical length is a risk we accept rather than
        # download tens of megabytes nightly.
        length = response.headers.get("Content-Length") or str(len(response.content))
        result["links_hash"] = hashlib.sha256(f"len:{length}".encode()).hexdigest()
    return result


def _stable_signal(probe: dict) -> Optional[str]:
    """The one value a change is judged on, in order of trustworthiness."""
    return probe.get("etag") or probe.get("last_modified") or probe.get("links_hash")


# --------------------------------------------------------------------------
# The run
# --------------------------------------------------------------------------

async def run_watch() -> dict:
    """Check every cited source. Returns a summary for the alert email."""
    sources = cited_sources()
    now = datetime.now(timezone.utc)
    findings = {"new_edition": [], "changed": [], "dead": [], "checked": 0, "errors": 0}

    async with httpx.AsyncClient(headers=HEADERS, timeout=45) as client:
        async with get_db_context() as db:
            existing = {
                (row.source_key, row.seed_file): row
                for row in (await db.execute(select(SourceWatch))).scalars().all()
            }

            for source in sources:
                findings["checked"] += 1
                ident = (source["source_key"], source["seed_file"])
                row = existing.get(ident)
                if row is None:
                    row = SourceWatch(**source)
                    db.add(row)
                else:
                    # The seed is the authority on what we cite; refresh the
                    # descriptive fields in case a citation was edited.
                    row.url = source["url"]
                    row.publisher = source["publisher"]
                    row.title = source["title"]
                    row.cited_date = source["cited_date"]

                probe = await fingerprint(client, source["url"])
                row.last_checked_at = now

                if not probe["ok"]:
                    row.consecutive_failures += 1
                    findings["errors"] += 1
                    if row.consecutive_failures >= DEAD_AFTER_FAILURES and not row.muted:
                        row.state = "unreachable"
                        findings["dead"].append(_finding(row, probe.get("error", "unreachable")))
                    continue

                row.http_status = probe["status"]
                if probe["status"] >= 400:
                    row.consecutive_failures += 1
                    if row.consecutive_failures >= DEAD_AFTER_FAILURES and not row.muted:
                        row.state = "dead"
                        findings["dead"].append(_finding(row, f"HTTP {probe['status']}"))
                    continue

                row.consecutive_failures = 0
                signal = _stable_signal(probe)
                previous = _stable_signal({
                    "etag": row.etag,
                    "last_modified": row.last_modified,
                    "links_hash": row.links_hash,
                })

                # A newer edition than the one cited is worth reporting even if
                # the fingerprint is unchanged — the seed may simply be old.
                edition = probe.get("latest_edition")
                if edition and _newer_than_citation(edition, row.cited_date, row.latest_edition):
                    row.latest_edition = edition
                    if not row.muted and row.state != "new_edition":
                        row.state = "new_edition"
                        row.confirmed_at = now
                        findings["new_edition"].append(_finding(row, f"page now offers {edition}"))
                elif edition:
                    row.latest_edition = edition

                if previous is None:
                    # First sight. Record, report nothing — we have no idea yet
                    # whether this is normal for this page.
                    _store(row, probe)
                    continue

                if signal == previous:
                    row.pending_fingerprint = None
                    row.pending_since = None
                    if row.state in ("changed",) and row.acknowledged_at:
                        row.state = "ok"
                    continue

                # Different. Confirm it on a second run before believing it.
                if row.pending_fingerprint == signal:
                    _store(row, probe)
                    row.last_changed_at = now
                    row.pending_fingerprint = None
                    row.pending_since = None
                    if not row.muted:
                        row.state = "changed"
                        row.confirmed_at = now
                        findings["changed"].append(
                            _finding(row, "page revised since we transcribed from it")
                        )
                else:
                    row.pending_fingerprint = signal
                    row.pending_since = now

            await db.commit()

    logger.info(
        f"[watch] {findings['checked']} sources checked — "
        f"{len(findings['new_edition'])} new edition(s), {len(findings['changed'])} changed, "
        f"{len(findings['dead'])} dead, {findings['errors']} fetch error(s)"
    )
    return findings


def _newer_than_citation(found: str, cited_date: Optional[str], seen_before: Optional[str]) -> bool:
    """Is the edition on the page newer than the one the seed cites?

    Compared on the leading year only. Financial-year labels ("2025-26") and
    plain years ("2026") appear interchangeably across publishers, and trying to
    order them precisely produces confident nonsense.
    """
    if seen_before == found:
        return False           # already known, already reported
    try:
        found_year = int(found[:4])
    except (TypeError, ValueError):
        return False
    cited_year = None
    if cited_date:
        try:
            cited_year = int(str(cited_date)[:4])
        except ValueError:
            cited_year = None
    if cited_year is None:
        return False
    return found_year > cited_year


def _store(row: SourceWatch, probe: dict) -> None:
    row.etag = probe.get("etag")
    row.last_modified = probe.get("last_modified")
    row.links_hash = probe.get("links_hash")


def _finding(row: SourceWatch, detail: str) -> dict:
    return {
        "source_key": row.source_key,
        "seed_file": row.seed_file,
        "publisher": row.publisher,
        "title": row.title,
        "url": row.url,
        "cited_date": row.cited_date,
        "detail": detail,
    }
