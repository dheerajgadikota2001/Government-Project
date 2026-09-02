"""Search across this platform's own content — and nothing else.

WHY THIS EXISTS
The previous search called Elasticsearch. No Elasticsearch runs in this
deployment (Cloud Run plus Postgres, nothing else), so every query failed and the
results page fell back to a hardcoded sample of invented projects and figures. On
a platform whose whole promise is that every number is traceable to a government
document, showing invented results is the worst possible bug. This module replaces
that with a search that needs no extra infrastructure and can only ever return
things this platform actually holds.

WHAT IT SEARCHES
Two kinds of content, because the platform stores two kinds:
  * rows in the database — projects, documents, MoUs, news, tenders;
  * whole sections served from seed files — the forty budget demands, school
    education, the summits ledger, the government pages, the finance series.
The second kind has no database row, so a reader searching "Panchayat Raj" or
"capital outlay" would otherwise find nothing even though the platform has a page
about it. Those are indexed in memory from the same seed files the pages read.

SCORING
Deliberately simple and explainable: an exact phrase in the title outranks a title
word, which outranks a match in the department or company, which outranks a match
in the body. No fuzzy matching — on a corpus this size fuzz produces confusing
results more often than helpful ones, and a reader who mistypes gets an empty
state that says so rather than a wrong document presented confidently.
"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.mou import MOU
from app.models.news import NewsArticle
from app.models.project import Project

# app/services/site_search.py -> app/services -> app -> backend, then seed/
SEED_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed",
)

# score weights, highest first
W_TITLE_PHRASE = 100
W_TITLE_WORD = 60
W_FIELD = 30
W_BODY = 10


def _norm(s: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def _score(query: str, title: str, fields: list[str], body: str) -> int:
    q = _norm(query)
    if not q:
        return 0
    t, f, b = _norm(title), _norm(" ".join(x for x in fields if x)), _norm(body)
    score = 0
    if q in t:
        score += W_TITLE_PHRASE
    words = [w for w in re.split(r"\W+", q) if len(w) > 2]
    score += W_TITLE_WORD * sum(1 for w in words if w in t)
    score += W_FIELD * sum(1 for w in words if w in f)
    score += W_BODY * sum(1 for w in words if w in b)
    if q in b or q in f:
        score += W_BODY
    return score


def _snippet(text: Optional[str], query: str, width: int = 190) -> str:
    """A window around the first hit, so the reader sees why this matched."""
    if not text:
        return ""
    flat = re.sub(r"\s+", " ", text).strip()
    i = flat.lower().find(_norm(query))
    if i < 0:
        return flat[:width] + ("…" if len(flat) > width else "")
    start = max(0, i - width // 3)
    end = min(len(flat), start + width)
    return ("…" if start else "") + flat[start:end] + ("…" if end < len(flat) else "")


# --------------------------------------------------------------------------
# sections served from seed files rather than database rows
# --------------------------------------------------------------------------

_sections_cache: list[dict] | None = None
_index_errors: list[str] = []


def _load(name: str) -> dict:
    with open(os.path.join(SEED_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def _build_sections() -> list[dict]:
    """One searchable entry per page or sub-section the platform serves."""
    out: list[dict] = []

    def add(title, route, body, keywords="", subtitle=""):
        out.append(
            {
                "type": "section",
                "title": title,
                "subtitle": subtitle,
                "route": route,
                "body": body,
                "keywords": keywords,
            }
        )

    try:
        dep = _load("departments_seed.json")
        for d in dep.get("departments", []):
            names = " ".join(
                n["name"] for n in d.get("name_history", []) if n.get("name")
            )
            add(
                d["department"],
                f"/finances#demand-{d['demand_no']}",
                "Budget demand %s. What Andhra Pradesh budgeted for this department "
                "each year since 2014-15, and where audited figures exist, what was "
                "actually spent." % d["demand_no"],
                keywords=f"demand {d['demand_no']} {d.get('demand_number','')} {names} budget "
                "grant capital outlay revenue expenditure",
                subtitle="Department budget, 13 years",
            )
    except Exception as exc:  # a bad seed must not take search down, but it must not hide either
        _index_errors.append(f"departments_seed.json: {exc}")

    try:
        se = _load("school_education_seed.json")
        add(
            "School education",
            "/school-education",
            se.get("_readme", ""),
            keywords="schools teachers enrolment students nadu nedu classrooms "
            "midday meal uniforms toilets libraries capital outlay demand XII",
            subtitle="Spending, schools, teachers and what reached the schools",
        )
        for item in se.get("components", {}).get("items", []):
            add(
                item["component"],
                "/school-education#components",
                "Government orders mentioning this in school education, counted by "
                "the government in office on the date of the order.",
                keywords="school education component orders",
                subtitle="School education · what was ordered",
            )
    except Exception as exc:
        _index_errors.append(f"school_education_seed.json: {exc}")

    try:
        su = _load("summits_seed.json")
        for p in su.get("cross_tenure", {}).get("projects", []):
            add(
                p["name"],
                "/investments#cross-tenure",
                p.get("split", {}).get("statement", "") or p.get("source_quality", ""),
                keywords=f"{p.get('full_name','')} cross tenure progress announced opened",
                subtitle="Built across two governments",
            )
        for s in su.get("summits", []) if isinstance(su.get("summits"), list) else []:
            add(
                s.get("name", "Investment summit"),
                "/investments#summits",
                s.get("stated_by", ""),
                keywords="summit investment mou announced crore",
                subtitle="Investment summit",
            )
    except Exception as exc:
        _index_errors.append(f"summits_seed.json: {exc}")

    # ---- indicator-level entries, so a search for "infant mortality" lands
    # ---- on the indicator rather than on the page that contains it.
    try:
        sf = _load("state_facts_seed.json")
        for ind in sf.get("indicators", []):
            add(
                ind["label"],
                "/state-facts",
                (ind.get("what_it_means") or "") + " "
                + "Source: %s%s." % (
                    (sf.get("sources", {}).get(ind.get("source"), {}) or {}).get("title", ""),
                    (", " + ind["table"]) if ind.get("table") else "",
                ),
                keywords="%s %s indicator statistic %s" % (
                    ind.get("group", ""), ind.get("unit_as_printed", ""), ind.get("key", "")),
                subtitle="Indicator, %d years" % len(ind.get("points", [])),
            )
    except Exception as exc:  # a missing seed must not blank the whole index
        _index_errors.append(f"state_facts_seed.json: {exc}")

    # ---- one entry per escalation path. Someone searching "land record" or
    # ---- "FIR refused" needs the ladder, not the page it sits on.
    try:
        ct = _load("contacts_seed.json")
        for e in ct.get("escalations", []):
            offices = " ".join(st.get("office", "") for st in e.get("steps", []))
            add(
                e["problem"],
                "/contacts#problems",
                "Step by step: %s. %s" % (offices, e.get("law_or_go") or ""),
                keywords="grievance complaint escalation office where to go " + offices,
                subtitle="%d steps, in order" % len(e.get("steps", [])),
            )
        for h in ct.get("helplines", []):
            add(
                "%s — %s" % (h["number"], h["name"]),
                "/contacts#helplines",
                h.get("what_for") or "",
                keywords="helpline phone number call %s %s" % (h["number"], h.get("scope", "")),
                subtitle="Helpline",
            )
        for d in ct.get("districts", []):
            add(
                "%s district" % d["name"],
                "/contacts#districts",
                "District collectorate of %s, Andhra Pradesh." % d["name"],
                keywords="district collector collectorate %s" % d["name"],
                subtitle="District",
            )
    except Exception as exc:
        _index_errors.append(f"contacts_seed.json: {exc}")

    for title, route, body, kw in [
        ("State finances", "/finances",
         "Revenue, expenditure, debt, deficit and off-budget borrowing for Andhra "
         "Pradesh, from the RBI, the CAG, the NSO and the state budget books.",
         "debt deficit revenue expenditure borrowing GSDP fiscal budget"),
        ("Governments since 2014", "/governments",
         "What each government since the bifurcation of Andhra Pradesh said it "
         "would do, and what the record shows.",
         "tdp ysrcp naidu jagan tenure manifesto cabinet"),
        ("Projects", "/projects",
         "Large public projects with their cost, status and the government "
         "document behind every figure.",
         "polavaram airport port metro steel amaravati irrigation"),
        ("Document library", "/documents",
         "Every source document this platform cites, with a note on whether the "
         "link still works.",
         "sources documents government orders cag budget reports pdf"),
        ("Investments and MoUs", "/investments",
         "Memoranda of understanding, investment summits, and what was grounded.",
         "mou investment summit company crore jobs employment"),
        ("Andhra Pradesh by the numbers", "/state-facts",
         "Indicators for Andhra Pradesh since bifurcation, each with the government "
         "publication it was printed in and a split by the government in office.",
         "statistics indicators gsdp population health education power roads banks "
         "unemployment inflation irrigation rbi handbook"),
        ("Who to call, and where to go", "/contacts",
         "Emergency numbers, government helplines, every department and district "
         "website, and step-by-step escalation paths for common problems.",
         "helpline emergency police ambulance 112 108 grievance complaint collector "
         "tahsildar ration pension land record fir contact phone number district"),
    ]:
        add(title, route, body, keywords=kw, subtitle="Section")

    return out


def sections() -> list[dict]:
    global _sections_cache
    if _sections_cache is None:
        _sections_cache = _build_sections()
    return _sections_cache


# --------------------------------------------------------------------------
# the search itself
# --------------------------------------------------------------------------

async def search_site(
    db: AsyncSession,
    query: str,
    kind: str = "all",
    district: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = (query or "").strip()
    if not q:
        return {"query": query, "total": 0, "counts": {}, "results": []}

    like = f"%{q}%"
    hits: list[dict] = []

    if kind in ("all", "project"):
        stmt = select(Project).where(
            or_(Project.title.ilike(like), Project.description.ilike(like),
                Project.department.ilike(like), Project.district.ilike(like))
        ).limit(200)
        if district:
            stmt = stmt.where(Project.district == district)
        for p in (await db.execute(stmt)).scalars():
            hits.append({
                "type": "project", "title": p.title,
                "subtitle": p.department or "", "route": f"/projects/{p.id}",
                "snippet": _snippet(p.description, q),
                "meta": [x for x in [p.district,
                                     f"Rs {p.estimated_cost_crore:,.0f} crore"
                                     if p.estimated_cost_crore else None,
                                     (p.status.value if p.status else None)] if x],
                "score": _score(q, p.title, [p.department, p.district], p.description or ""),
            })

    if kind in ("all", "document"):
        stmt = select(Document).where(
            or_(Document.title.ilike(like), Document.description.ilike(like),
                Document.department.ilike(like), Document.reference_number.ilike(like))
        ).limit(200)
        for d in (await db.execute(stmt)).scalars():
            hits.append({
                "type": "document", "title": d.title,
                "subtitle": d.department or "", "route": "/documents",
                "snippet": _snippet(d.description, q),
                "meta": [x for x in [str(d.year) if d.year else None,
                                     d.reference_number] if x],
                "source_url": d.source_url,
                "score": _score(q, d.title, [d.department, d.reference_number],
                                d.description or ""),
            })

    if kind in ("all", "mou"):
        stmt = select(MOU).where(
            or_(MOU.title.ilike(like), MOU.company_name.ilike(like),
                MOU.description.ilike(like))
        ).limit(200)
        for m in (await db.execute(stmt)).scalars():
            hits.append({
                "type": "mou", "title": m.title,
                "subtitle": m.company_name, "route": "/investments",
                "snippet": _snippet(m.description, q),
                "meta": [x for x in [m.district,
                                     f"Rs {m.investment_crore:,.0f} crore"
                                     if m.investment_crore else None] if x],
                "score": _score(q, m.title, [m.company_name, m.district],
                                m.description or ""),
            })

    if kind in ("all", "news"):
        stmt = select(NewsArticle).where(
            or_(NewsArticle.headline.ilike(like), NewsArticle.summary.ilike(like))
        ).limit(200)
        for n in (await db.execute(stmt)).scalars():
            hits.append({
                "type": "news", "title": n.headline,
                "subtitle": n.source_name, "route": f"/news/{n.id}",
                "snippet": _snippet(n.summary, q),
                "meta": [n.published_at.date().isoformat()] if n.published_at else [],
                "score": _score(q, n.headline, [n.source_name], n.summary or ""),
            })

    if kind in ("all", "section"):
        for s in sections():
            sc = _score(q, s["title"], [s["keywords"], s["subtitle"]], s["body"])
            if sc:
                hits.append({**{k: s[k] for k in ("type", "title", "subtitle", "route")},
                             "snippet": _snippet(s["body"], q), "meta": [], "score": sc})

    hits = [h for h in hits if h["score"] > 0]
    hits.sort(key=lambda h: (-h["score"], h["title"]))

    counts: dict[str, int] = {}
    for h in hits:
        counts[h["type"]] = counts.get(h["type"], 0) + 1

    start = (page - 1) * page_size
    return {
        "query": q,
        "total": len(hits),
        "counts": counts,
        "page": page,
        "page_size": page_size,
        "results": hits[start:start + page_size],
        "scope_note": (
            "This searches only what this platform holds: its projects, documents, "
            "MoUs, news entries and sections. It does not search the web."
        ),
    }
