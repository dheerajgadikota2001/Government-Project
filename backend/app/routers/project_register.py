"""
The project register: every project, with what happened on it and when.

The overview page answers "how are projects going overall". This answers a
different question — "what has actually been done on this one, and under whom" —
and it answers it the only honest way available: as a list of dated government
documents.

WHY THIS EXISTS SEPARATELY FROM /projects/
The projects table holds one row per project: a title, a status, a cost. The
citations that back those fields — each with a date, a publisher and usually a
G.O. number — live in the seed file and were never loaded into the database,
because the table has nowhere to put them. They are the most valuable thing in
the file: read in date order they are a timeline, and a timeline is what lets a
reader see which government did what without anyone having to assert it.

THE ATTRIBUTION RULE
No project is ever credited to a government. Each event carries the date its
document carries, and the government is derived from that date and nothing else.
A reader looking at Machilipatnam Port sees ten dated orders across four periods
and draws their own conclusion. We never write "this was X's project", because
for most large projects that sentence is not true of anyone.

PROJECTS OLDER THAN THE PLATFORM
Polavaram has investment clearance from February 2009. Where a document predates
the state's division on 2 June 2014, the event is marked `pre_window`: shown for
context, drawn differently by the frontend, and never counted into any
government's total. We hold no audited record of that period and say so rather
than implying our coverage starts earlier than it does.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.districts import normalise_district
from app.database import get_db
from app.models.project import Project
from app.models.progress_observation import ProgressObservation
from app.services.cache import cache_response

router = APIRouter(prefix="/projects", tags=["Projects"])

_SEED_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed", "projects_seed.json",
)

# The day each government took office. A document's date decides its band; no
# other rule is applied, and none is needed.
TENURES = [
    ("pre",   None,               dt.date(2014, 6, 7)),
    ("tdp1",  dt.date(2014, 6, 8), dt.date(2019, 5, 29)),
    ("ysrcp", dt.date(2019, 5, 30), dt.date(2024, 6, 11)),
    ("tdp2",  dt.date(2024, 6, 12), None),
]

# ---------------------------------------------------------------------------
# SOURCE TIER — what kind of thing a document actually is.
#
# The register's whole claim is that it is built out of the government's own
# record. A handful of entries are not: a company's own press note, a wire
# report of a listed company's exchange filing, a newspaper. Those are still
# worth showing — they are often the only dated record of an opening or a
# tender — but calling them "government documents" would be a lie, and a
# figure taken from one of them must never be printed as if the government
# had published it.
#
# The tier is derived from the host, not from the publisher string, because
# the host is the part nobody can accidentally mislabel while writing a seed.
# ---------------------------------------------------------------------------

_GOV_SUFFIXES = (".gov.in", ".nic.in", ".gov", ".rbi.org.in")

# Government files that live on a cloud bucket rather than on a government
# host. The Finance Department publishes every Socio-Economic Survey from an S3
# bucket named after its own domain, so a host check alone called the state's
# own survey "press": all 60 survey projects lost their printed cost on the
# register while their own pages, which already knew the bucket, showed it.
# Matched on the full prefix, bucket included, never on the S3 host alone.
_GOV_PREFIXES = ("https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/",)

# First-party, named, and verifiable — but not government. A company's own
# statement about its own project.
_COMPANY_HOSTS = {
    "www.airindia.com", "airindia.com",
    "www.gmrgroup.in", "gmrgroup.in",
    # GMR's investor documents: its presentations and exchange filings are
    # served from this host.
    "investor.gmraero.com", "publish-p168597-e1857439.adobeaemcloud.com",
    "www.bseindia.com", "www.nseindia.com",
    "www.jsw.in", "jsw.in",
    "www.adaniports.com", "adaniports.com",
}


def _host(url: str | None) -> str:
    if not url:
        return ""
    m = re.match(r"https?://([^/]+)", str(url).strip(), re.I)
    return (m.group(1) if m else "").lower()


def source_tier(url: str | None) -> str:
    """government | company | press — never guessed from the publisher name."""
    if str(url or "").strip().startswith(_GOV_PREFIXES):
        return "government"
    h = _host(url)
    if not h:
        return "press"
    if any(h == suf.lstrip(".") or h.endswith(suf) for suf in _GOV_SUFFIXES):
        return "government"
    if h in _COMPANY_HOSTS:
        return "company"
    return "press"


_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        with open(_SEED_PATH, encoding="utf-8") as f:
            _cache = json.load(f)
    return _cache


def _tenure_of(d: dt.date) -> str:
    for key, lo, hi in TENURES:
        if (lo is None or d >= lo) and (hi is None or d <= hi):
            return key
    return "pre"


def _parse(value: Any) -> dt.date | None:
    if not value:
        return None
    s = str(value)[:10]
    try:
        return dt.date.fromisoformat(s)
    except ValueError:
        return None


# "G.O.Ms.No.15 dated 12 May 2016" -> the order number, so the UI can show it
# as the document reference rather than reprinting the whole publisher string.
_GO = re.compile(r"(G\.?O\.?\s?(?:Ms|Rt|P)?\.?\s?No\.?\s?[\d/]+)", re.I)


def _event(citation: dict) -> dict | None:
    d = _parse(citation.get("date"))
    if d is None:
        return None
    publisher = (citation.get("publisher") or "").strip()
    go = _GO.search(publisher)
    return {
        "date": d.isoformat(),
        "year": d.year,
        "tenure": _tenure_of(d),
        "pre_window": d < dt.date(2014, 6, 8),
        "title": citation.get("claim") or "",
        "document": publisher,
        "order_no": go.group(1) if go else None,
        "url": citation.get("url"),
        "tier": citation.get("source_tier") or source_tier(citation.get("url")),
    }


def _register_entry(p: dict) -> dict:
    """
    A citation's date is the date the DOCUMENT was published, which is usually
    but not always the date the thing happened. Polavaram's investment clearance
    is February 2009, but the document that records it was published in 2024 —
    so deriving the timeline from citation dates alone would silently misdate it.

    Where we have gone through a project's documents by hand and pulled out the
    real event dates, the seed carries an explicit `events` array and it wins.
    Everywhere else we fall back to citation dates and the frontend labels the
    spine as documents rather than as milestones, because that is what it is.
    """
    hand = p.get("events")
    if isinstance(hand, list) and hand:
        events = []
        for h in hand:
            d = _parse(h.get("date"))
            if d is None:
                continue
            events.append({
                "date": d.isoformat(), "year": d.year, "tenure": _tenure_of(d),
                "pre_window": d < dt.date(2014, 6, 8),
                "title": h.get("title") or "", "document": h.get("document") or "",
                "order_no": h.get("order_no"), "url": h.get("url"),
                "tier": h.get("tier") or source_tier(h.get("url")),
            })
        events.sort(key=lambda e: e["date"])
        dated_by = "event"
    else:
        events = sorted(
            (e for e in (_event(c) for c in p.get("citations", []) or []) if e),
            key=lambda e: e["date"],
        )
        dated_by = "publication"
    by_tenure: dict[str, int] = {}
    for e in events:
        by_tenure[e["tenure"]] = by_tenure.get(e["tenure"], 0) + 1

    # Which governments this project's record actually touches, in time order.
    # A government with no document on record does not get an empty band: an
    # empty band reads as inactivity rather than as absence of a record.
    spans = [k for k, _lo, _hi in TENURES if k in by_tenure]

    # How many of this project's documents are actually the government's.
    tier_counts: dict[str, int] = {}
    for e in events:
        tier_counts[e["tier"]] = tier_counts.get(e["tier"], 0) + 1

    # THE COST GATE
    # A cost is printed as the project's cost only when the seed names the
    # government document it came from. No named document, or a document that
    # is not a government one, and the figure is not shown as a cost at all —
    # it stays in the timeline as a dated claim carrying its source's tier.
    # The default is deliberately the strict one: a cost with no stated
    # provenance is treated as unverified rather than trusted.
    cost = p.get("estimated_cost_crore")
    cost_url = p.get("cost_source_url")
    cost_tier = source_tier(cost_url) if cost_url else None
    cost_is_government = cost is not None and cost_tier == "government"

    return {
        "title": p.get("title"),
        "project_type": p.get("project_type"),
        "status": p.get("status"),
        "district": p.get("district"),
        "department": p.get("department"),
        "estimated_cost_crore": cost if cost_is_government else None,
        "has_published_cost": cost_is_government,
        "cost_source_url": cost_url if cost_is_government else None,
        "cost_source_tier": cost_tier,
        "unverified_cost_crore": p.get("reported_cost_crore") if not cost_is_government
                                 else None,
        "unverified_cost_source": p.get("reported_cost_source") if not cost_is_government
                                  else None,
        "completion_percentage": p.get("completion_percentage"),
        "expected_completion": p.get("expected_completion"),
        "description": p.get("description"),
        "source_portal": p.get("source_portal"),
        "source_url": p.get("source_url"),
        "events": events,
        "event_count": len(events),
        "dated_by": dated_by,
        "by_tenure": by_tenure,
        "by_tier": tier_counts,
        "government_event_count": tier_counts.get("government", 0),
        "non_government_event_count": len(events) - tier_counts.get("government", 0),
        "spans": spans,
        "spans_multiple_governments": len([s for s in spans if s != "pre"]) > 1,
        "first_document": events[0]["date"] if events else None,
        "last_document": events[-1]["date"] if events else None,
        "starts_before_window": bool(events and events[0]["pre_window"]),
    }


# ---------------------------------------------------------------------------
# THE REGISTER IS THE PROJECT TABLE, NOT THE SEED FILE
#
# This started life reading projects_seed.json — the eight projects whose
# documents were assembled by hand. That was the wrong source and it made the
# platform look like it knew about eight projects. The database already holds
# every project the government's own importers have brought in: the MoSPI flash
# report's central-sector projects, the AMRUT 2.0 approved list, and whatever
# else the scrapers have added. Those rows carry official project codes,
# sanctioned costs and dated progress readings, and none of it was reaching
# this page.
#
# So the register reads the table, and the hand-assembled citation timelines
# become an enrichment on top of it for the few projects that have one. A
# project with a hand-built timeline shows its documents; a project without one
# shows what the government's own record says — approval date, commissioning
# dates, and every dated progress reading, each with the report it came from.
# Neither is dressed up as the other.
#
# WHY THE LIST DOES NOT CARRY TIMELINES
# Six hundred projects with their observations is megabytes, and the timeline
# is only visible when a reader opens one card. The list carries what the card
# shows closed; /register/{id} carries the timeline for the one they opened.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# TWO REPAIRS THE REGISTER MAKES AT READ TIME
#
# 1. DISTRICT NAMES. The AMRUT status PDF is a table, and its cells wrap
#    mid-word, so the importer once stored "Visakhapatna m" and
#    "Machilipatna m". Districts are put back onto their canonical names here.
#
#    Titles and descriptions are served exactly as stored. This file used to
#    rejoin "a fragment of one or two lower-case letters hanging off a longer
#    word" in them as well, on the theory that such a split was unambiguous.
#    It is not. "of", "in", "at", "on" and "to" have exactly that shape, so
#    "Restoration of Komatigunta Pond at 30th ward in Kandukur" reached
#    readers as "Restorationof Komatigunta Pondat 30th wardin Kandukur": 493
#    of the 727 titles in the live register and 715 of its descriptions,
#    while the project pages, which never did this, showed the real words.
#    Nor did the rule mend the splits that are real. On 2026-09-24 no stored
#    text had a one or two letter split for it to join, while longer ones
#    such as "Buchireddypa lem" were left as they were. Those belong in the
#    importer's column handling, where the table's structure is known, not in
#    a guess made at read time over every word of every record.
#
# 2. THE SAME PROJECT TWICE. MoSPI's central-sector list and our own
#    hand-assembled record both contain Polavaram, with different costs
#    (Rs 30,436.95 crore from the Union Cabinet's Phase-1 approval, and
#    Rs 55,548.87 crore from the revised estimate MoSPI tracks). Two cards
#    for one project, disagreeing, reads as the platform contradicting
#    itself. The hand-assembled record wins and the duplicate is dropped,
#    because it is the one that shows the reader where each figure came from.
# ---------------------------------------------------------------------------

def _norm(title: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (title or "").lower())


def _seed_by_title() -> dict[str, dict]:
    """The hand-assembled records, keyed so a database row can find its own."""
    out = {}
    for p in _load().get("projects", []) or []:
        out[_norm(p.get("title"))] = p
    return out


def _iso(value) -> str | None:
    if value is None:
        return None
    try:
        return value.date().isoformat()
    except AttributeError:
        return str(value)[:10]


def _row_event(date_iso: str | None, title: str, document: str, url: str | None,
               kind: str) -> dict | None:
    """One dated line, built from a column rather than from a citation."""
    d = _parse(date_iso)
    if d is None:
        return None
    return {
        "date": d.isoformat(),
        "year": d.year,
        "tenure": _tenure_of(d),
        "pre_window": d < dt.date(2014, 6, 8),
        "title": title,
        "document": document,
        "order_no": None,
        "url": url,
        "tier": source_tier(url),
        "kind": kind,
    }


def _db_events(row: Project, observations: list[ProgressObservation]) -> list[dict]:
    """
    What the government's own record says about this project, in date order.

    Only dates that have already happened become events. An expected completion
    is a plan, not a record, and putting it on the same spine as a sanction
    order would let a projection be read as a fact.
    """
    portal = row.source_portal or "Government record"
    events: list[dict] = []

    events.append(_row_event(
        _iso(row.announced_date), "Approved / announced in the government's record",
        portal, row.source_url, "announced"))
    events.append(_row_event(
        _iso(row.start_date), "Work began", portal, row.source_url, "started"))
    events.append(_row_event(
        _iso(row.actual_completion), "Recorded as completed", portal, row.source_url,
        "completed"))

    for o in observations:
        bits = []
        if o.completion_percentage is not None:
            bits.append(f"{o.completion_percentage:g}% physical progress")
        if o.cumulative_expenditure_crore is not None:
            bits.append(f"Rs {o.cumulative_expenditure_crore:,.2f} crore spent so far")
        if o.estimated_cost_crore is not None:
            bits.append(f"cost then stated as Rs {o.estimated_cost_crore:,.2f} crore")
        if o.status_note:
            bits.append(o.status_note)
        events.append(_row_event(
            _iso(o.observed_date),
            "; ".join(bits) if bits else "Progress reading",
            o.source_label or o.source_portal or portal,
            o.source_url or row.source_url,
            "reading"))

    events = [e for e in events if e]
    events.sort(key=lambda e: e["date"])
    return events


def _summarise(events: list[dict]) -> dict:
    by_tenure: dict[str, int] = {}
    by_tier: dict[str, int] = {}
    for e in events:
        by_tenure[e["tenure"]] = by_tenure.get(e["tenure"], 0) + 1
        by_tier[e["tier"]] = by_tier.get(e["tier"], 0) + 1
    spans = [k for k, _lo, _hi in TENURES if k in by_tenure]
    return {
        "event_count": len(events),
        "by_tenure": by_tenure,
        "by_tier": by_tier,
        "government_event_count": by_tier.get("government", 0),
        "non_government_event_count": len(events) - by_tier.get("government", 0),
        "spans": spans,
        "spans_multiple_governments": len([s for s in spans if s != "pre"]) > 1,
        "first_document": events[0]["date"] if events else None,
        "last_document": events[-1]["date"] if events else None,
        "starts_before_window": bool(events and events[0]["pre_window"]),
    }


def _entry(row: Project, observations: list[ProgressObservation],
           seed: dict | None, with_events: bool) -> dict:
    """
    One project. The hand-assembled record wins where we have one, because a
    chain of G.O.s is a better answer than three columns — but the database row
    still supplies the identity, the district and the official code.
    """
    if seed:
        events = _register_entry(seed)["events"]
        dated_by = "documents"
        description = seed.get("description") or row.description
        cost = seed.get("estimated_cost_crore")
        cost_url = seed.get("cost_source_url")
        reported = seed.get("reported_cost_crore")
        reported_src = seed.get("reported_cost_source")
    else:
        events = _db_events(row, observations)
        dated_by = "record"
        description = row.description
        cost = row.estimated_cost_crore
        # A cost that arrived through a government importer is sourced to the
        # portal it was imported from. Same gate as the hand-built records: no
        # government source, no printed cost.
        cost_url = row.source_url
        reported = None
        reported_src = None

    cost_tier = source_tier(cost_url) if cost_url else None
    cost_is_government = cost is not None and cost_tier == "government"

    entry = {
        "id": row.id,
        "external_id": row.external_id,
        "title": row.title,
        "project_type": row.project_type.value if row.project_type else None,
        "status": row.status.value if row.status else None,
        "district": normalise_district(row.district) or row.district,
        "department": row.department or row.implementing_agency,
        "estimated_cost_crore": cost if cost_is_government else None,
        "has_published_cost": cost_is_government,
        "cost_source_url": cost_url if cost_is_government else None,
        "cost_source_tier": cost_tier,
        "unverified_cost_crore": reported if not cost_is_government else None,
        "unverified_cost_source": reported_src if not cost_is_government else None,
        "completion_percentage": row.completion_percentage,
        "expected_completion": _iso(row.expected_completion),
        "description": description,
        "source_portal": row.source_portal,
        "source_url": row.source_url,
        "dated_by": dated_by,
        "has_documents": bool(seed),
    }
    entry.update(_summarise(events))
    if with_events:
        entry["events"] = events
    return entry


async def _load_rows(db: AsyncSession) -> tuple[list[Project], dict[int, list]]:
    rows = (await db.execute(select(Project))).scalars().all()
    obs_rows = (await db.execute(
        select(ProgressObservation).order_by(ProgressObservation.observed_date)
    )).scalars().all()
    grouped: dict[int, list] = {}
    for o in obs_rows:
        grouped.setdefault(o.project_id, []).append(o)
    return rows, grouped


def _NOTES(total: int, documented: int) -> dict:
    """What a reader has to know to read this page correctly."""
    return {
        "attribution": (
            "No project here is credited to a government. Every line is a dated government "
            "record, and the government shown beside it is simply whoever held office on that "
            "date. Large projects are worked on by more than one government, and saying otherwise "
            "would be false about most of them."
        ),
        "pre_window": (
            "Andhra Pradesh was divided on 2 June 2014. Where a project's record begins before "
            "that, those entries are marked and shown in grey for context only. We hold no "
            "audited record of that period, and they are never counted into any government's total."
        ),
        "coverage": (
            f"This register holds {total:,} projects. {documented:,} of them have had their "
            "documents assembled by hand, end to end. The rest carry what the government's own "
            "published record states — the approval and commissioning dates, and every dated "
            "progress reading, each with the report it came from. Both kinds are labelled, and "
            "the register grows as the hand work continues."
        ),
        "dating": (
            "A project whose documents we have assembled shows those documents. A project we hold "
            "only through the government's own published record shows that record: the dates its "
            "columns carry and the progress readings published against it. The card says which of "
            "the two you are looking at, because they are not the same kind of evidence."
        ),
        "source_tier": (
            "Every entry is labelled by what it is. A government record is one published on a "
            "government domain. A company statement is a firm's own note about its own project. "
            "A press report is a newspaper or wire. All three can carry a date worth showing, but "
            "only the first is the government's own record, and a figure that appears only in the "
            "second or third is never printed here as the project's cost."
        ),
        "blank_cost": (
            "Where no government record states a cost, the field is left blank. A blank means the "
            "government has not published that number, not that nothing is known. Where a figure "
            "has been reported but we could not trace it to a government document, it stays in the "
            "timeline as a dated claim with its source named, and is not shown as the project's cost."
        ),
        "expected_completion": (
            "An expected completion date is a plan, not a record, so it never appears on a "
            "timeline. It is shown beside the project and nowhere else."
        ),
    }

@router.get("/register")
@cache_response(ttl=900)
async def get_register(db: AsyncSession = Depends(get_db)):
    """Every project the platform holds, as the All projects tab reads it."""
    rows, grouped = await _load_rows(db)
    seeds = _seed_by_title()

    # One project, one card. Where a scraped row and a hand-assembled record are
    # the same project, the hand-assembled one is kept — see the note above.
    documented_titles = {_norm(r.title) for r in rows if seeds.get(_norm(r.title))}
    seen: set[str] = set()
    entries = []
    for r in rows:
        key = _norm(r.title)
        seed = seeds.get(key)
        if seed is None and key in documented_titles:
            continue
        if key in seen:
            continue
        seen.add(key)
        entries.append(_entry(r, grouped.get(r.id, []), seed, with_events=False))
    entries.sort(key=lambda e: (e["last_document"] or "", e["title"]), reverse=True)

    def uniq(field):
        return sorted({e[field] for e in entries if e[field]})

    documented = sum(1 for e in entries if e["has_documents"])
    return {
        "state": _load().get("state", "AP"),
        "projects": entries,
        "filters": {
            "project_type": uniq("project_type"),
            "status": uniq("status"),
            "district": uniq("district"),
            "department": uniq("department"),
            "tenure": [k for k, _l, _h in TENURES],
        },
        "counts": {
            "projects": len(entries),
            "events": sum(e["event_count"] for e in entries),
            "documented": documented,
            "from_record_only": len(entries) - documented,
            "without_published_cost": sum(1 for e in entries if not e["has_published_cost"]),
            "spanning_multiple_governments": sum(1 for e in entries if e["spans_multiple_governments"]),
            "starting_before_window": sum(1 for e in entries if e["starts_before_window"]),
            "government_events": sum(e["government_event_count"] for e in entries),
            "non_government_events": sum(e["non_government_event_count"] for e in entries),
            "with_unverified_cost": sum(1 for e in entries if e["unverified_cost_crore"] is not None),
        },
        "notes": _NOTES(len(entries), documented),
    }


@router.get("/register/{project_id}")
@cache_response(ttl=900)
async def get_register_entry(project_id: int, db: AsyncSession = Depends(get_db)):
    """One project's dated record, loaded when a reader opens its card."""
    row = (await db.execute(
        select(Project).where(Project.id == project_id)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="No such project in the register")
    obs = (await db.execute(
        select(ProgressObservation)
        .where(ProgressObservation.project_id == project_id)
        .order_by(ProgressObservation.observed_date)
    )).scalars().all()
    seeds = _seed_by_title()
    return _entry(row, list(obs), seeds.get(_norm(row.title)), with_events=True)
