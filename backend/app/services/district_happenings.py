"""
The one door every district happening goes through on its way into the database.

The seed loader, the two daily scrapers and the Lok Sabha session importer all
call prepare() and then upsert(). Keeping the rules here, and only here, is the
point: a personal list must be stripped the same way whether it arrived in the
October seed or in tomorrow's scrape, and a voter list must be refused by every
path, not by three copies of a regex that drift apart.

HOW A ROW IS RECOGNISED AGAIN
The unique key is (district, source_kind, url, title). That alone is not enough
for the collectorate sites: the archive view of a notice (past-notices) has no
link to the notice's own page, so a live run keys it on its file, while the
October seed keyed the same notice on its /notice/ page. Two keys, one notice.
So before inserting, upsert() also looks for an existing row with the same
district, source, date and the same title once spacing and case are ignored. If
it finds one, that row is the notice, and the run only moves its last_seen_at.

WHAT AN UPDATE MAY CHANGE
First seen wins. A later run can fill a field that was empty, and always moves
last_seen_at forward. It never overwrites a summary or a figure that is already
there, because those were checked when they were written and a fresh scrape has
not been checked by anyone. Nothing is ever deleted.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable
from datetime import UTC, date, datetime
from typing import Any

from app.constants.districts import DISTRICT_NAMES
from app.models.district_happening import SOURCE_KINDS
from app.scrapers.district_documents import is_electoral_document

CATEGORIES = ("announcement", "tender", "recruitment", "press release", "event", "document", "parliament answer")

# Lists that name people: who was selected, who ranked where, who was rejected and
# why. They are public notices, but a platform that indexes them becomes a search
# engine for individuals, which is not what this one is for. Title and link only.
PERSONAL_LIST_RE = re.compile(
    r"merit\s*lis|\bmerit\b.*\blist|selection\s*list|selected\s*(list|candidates)|list\s*of\s*selected"
    r"|seniority|senioroty|provisional\s*(merit|list|selection)|rejected\s*list|rejection\s*list|final\s*rejected"
    r"|speaking\s*orders?|disciplinary|eligible\s*(and|&)\s*in-?eligible|list\s*of\s*(candidates|applicants|eligible)"
    r"|counsel+ing\s*list|call\s*letters?",
    re.IGNORECASE,
)

# A notice filed under recruitment that is plainly a purchase. The site's own
# category is kept in meta.category_basis so the move can always be undone.
TENDER_RE = re.compile(r"tender|e-?procurement|quotation|auction|expression\s*of\s*interest|\bEOI\b|empanel|\bbids?\b|\bRFP\b", re.IGNORECASE)

# Meta fields that can point into a personal list's content (its other files, the
# post-by-post reading, the site's own description). Dropped whenever a row is personal.
PERSONAL_META_DROP = ("more_files", "posts", "listing_description", "how_read")

_FIELDS_HASHED = ("district", "source_kind", "category", "title", "date", "date_end", "url", "file_url", "summary", "figures")


class RowRefused(ValueError):
    """A row that must not be stored. The message says which rule refused it."""


def is_personal_list(title: str) -> bool:
    return bool(PERSONAL_LIST_RE.search(title or ""))


def norm_title(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").replace("‌", "")).strip().lower()


def _as_date(v: Any, field: str) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError as exc:
        raise RowRefused(f"{field} {v!r} is not a date") from exc


_FILE_RE = re.compile(r"\.(pdf|jpe?g|png|docx?|xlsx?|zip)(\?|$)", re.IGNORECASE)
_LISTING_RE = re.compile(r"^(https://[^/]+)/(?:past-notices|notice_category)/([^/?#]+)")


def day_listing(url: str, d: date) -> str | None:
    """The collectorate's own archive for one category on one day, or None.

    Works from either listing shape the scraper reads (past-notices or
    notice_category), because both name the host and the category.
    """
    m = _LISTING_RE.match(url or "")
    if not m:
        return None
    day = d.isoformat()
    return f"{m.group(1)}/past-notices/{m.group(2)}?date_from={day}&date_to={day}"


def content_sha(row: dict) -> str:
    body = {k: (row.get(k).isoformat() if isinstance(row.get(k), date) else row.get(k)) for k in _FIELDS_HASHED}
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def prepare(raw: dict) -> dict:
    """One raw item, from any of the four paths, as a row the table accepts.

    Raises RowRefused for anything that must not be stored. The caller decides
    whether one refusal is a dropped row or a refused batch.
    """
    district = raw.get("district")
    if district not in DISTRICT_NAMES:
        raise RowRefused(f"district {district!r} is not one of the 28")
    kind = raw.get("source_kind")
    if kind not in SOURCE_KINDS:
        raise RowRefused(f"source_kind {kind!r} is unknown")
    title = re.sub(r"\s+", " ", (raw.get("title") or "")).strip()
    if not title:
        raise RowRefused("no title")
    if kind == "district_site" and is_electoral_document(title):
        # Voter rolls carry names and EPIC numbers. Only collectorate sites upload them;
        # a Lok Sabha question titled "Electoral rolls" is news about rolls, not a roll,
        # so the title test is not applied to PIB or Parliament.
        raise RowRefused(f"electoral roll material: {title[:60]!r}")
    category = raw.get("category") or ""
    if category not in CATEGORIES:
        raise RowRefused(f"category {category!r} is unknown")
    d = _as_date(raw.get("date"), "date")
    if d is None:
        raise RowRefused("no date")
    url = (raw.get("url") or "").strip()
    if not url.startswith("http"):
        raise RowRefused("no url")
    meta = dict(raw.get("meta") or {})

    personal = bool(raw.get("personal_list")) or (kind == "district_site" and is_personal_list(title))
    row = {
        "district": district, "source_kind": kind, "category": category, "title": title,
        "date": d, "date_end": _as_date(raw.get("date_end"), "date_end"),
        "url": url, "file_url": raw.get("file_url") or None,
        "summary": raw.get("summary") or None, "figures": list(raw.get("figures") or []),
        "meta": meta, "personal_list": personal,
    }
    if personal:
        # Title and link only. The file is never fetched, so there is nothing to summarise.
        row["summary"], row["file_url"], row["figures"] = None, None, []
        row["meta"] = {k: v for k, v in meta.items() if k not in PERSONAL_META_DROP}
        is_file = bool(_FILE_RE.search(url))
        if is_file or _LISTING_RE.match(url):
            # No page of its own: point at the site's archive filtered to that one day,
            # which lists this notice and is an official page, not the file. It also
            # keeps two lists both titled "Seniority list" apart.
            day = day_listing(url, d) or day_listing(meta.get("listed_at") or "", d)
            if day:
                row["url"] = day
            elif is_file:
                raise RowRefused("a personal list whose only link is its file")
    row["content_sha256"] = content_sha(row)
    return row


def prepare_many(raws: Iterable[dict]) -> tuple[list[dict], list[str]]:
    """Rows that pass, and one line per row refused."""
    rows, refused = [], []
    for r in raws:
        try:
            rows.append(prepare(r))
        except RowRefused as why:
            refused.append(f"{r.get('district')}: {why}")
    return rows, refused


async def upsert(db, rows: list[dict], seen_at: datetime | None = None) -> tuple[int, int]:
    """Insert new rows, move last_seen_at on known ones. Returns (inserted, seen_again).

    Never deletes and never overwrites a filled field; see the module docstring.
    """
    from sqlalchemy import select
    from sqlalchemy.dialects.postgresql import insert

    from app.models.district_happening import DistrictHappening as H

    seen_at = seen_at or datetime.now(UTC)
    inserted = again = 0
    groups: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        groups.setdefault((r["district"], r["source_kind"]), []).append(r)

    for (district, kind), batch in groups.items():
        existing = (await db.execute(
            select(H).where(H.district == district, H.source_kind == kind, H.date.in_({r["date"] for r in batch}))
        )).scalars().all()
        by_key = {(e.url, e.title): e for e in existing}
        by_title = {(e.date, norm_title(e.title)): e for e in existing}
        for r in batch:
            hit = by_key.get((r["url"], r["title"])) or by_title.get((r["date"], norm_title(r["title"])))
            if hit is not None:
                hit.last_seen_at = max(hit.last_seen_at, seen_at) if hit.last_seen_at else seen_at
                if not hit.personal_list:
                    for f in ("file_url", "summary", "date_end"):
                        if getattr(hit, f) is None and r.get(f) is not None:
                            setattr(hit, f, r[f])
                    if not hit.figures and r["figures"]:
                        hit.figures = r["figures"]
                merged = {**r["meta"], **(hit.meta or {})}
                if hit.personal_list or r["personal_list"]:
                    merged = {k: v for k, v in merged.items() if k not in PERSONAL_META_DROP}
                hit.meta = merged
                again += 1
                continue
            values = {**r, "first_seen_at": r.get("first_seen_at") or seen_at, "last_seen_at": seen_at}
            res = await db.execute(insert(H).values(**values).on_conflict_do_nothing(constraint="uq_district_happening_key"))
            if res.rowcount:
                inserted += 1
                # Two rows of one batch can share a title and date (one notice listed twice).
                by_title[(r["date"], norm_title(r["title"]))] = H(**values)
                by_key[(r["url"], r["title"])] = by_title[(r["date"], norm_title(r["title"]))]
            else:
                again += 1
        await db.flush()
    return inserted, again
