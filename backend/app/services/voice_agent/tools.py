"""
The agent's tools: thin, read-only windows onto this platform's own API.

WHY THEY CALL OUR OWN ENDPOINTS
Every tool asks the same FastAPI routes the website uses, in-process, through an
ASGI transport. So the voice agent can never hold a different figure from the
page a reader would open to check it: same query, same cache, same seed file.
There is no second copy of the data to drift.

WHY THE OUTPUT IS TRIMMED
The finance, government and state-facts endpoints return 100-270 KB of JSON
each. Sending that to the model on every question would be slow on a phone call
and expensive. Each tool returns only the slice the question needs, and every
result is capped at MAX_CHARS with a note telling the model to narrow its query.

Each tool returns a JSON string. Errors come back as {"error": ...} so the model
can say "I could not find that" instead of inventing an answer.
"""

from __future__ import annotations

import json
import re
from typing import Any, Awaitable, Callable, Optional

import httpx

API = "/api/v1"
MAX_CHARS = 9000

TENURE_KEYS = ["tdp1", "ysrcp", "tdp2"]
PROJECT_STATUSES = [
    "announced", "approved", "tendered", "under_construction",
    "completed", "delayed", "cancelled", "suspended",
]
GOVERNMENT_TOPICS = [
    "tenures", "capital_outlay", "social_sector", "education_share",
    "health_share", "committed_pct", "tenure_stories",
]
FINANCE_TOPICS = ["debt_series", "debt_composition", "white_paper_claims", "promised_vs_spent", "glossary"]


# --------------------------------------------------------------------------
# Transport
# --------------------------------------------------------------------------

Fetcher = Callable[[str, Optional[dict]], Awaitable[Any]]


async def _asgi_get(path: str, params: Optional[dict] = None) -> Any:
    """GET one of our own routes in-process. Imported lazily: main imports routers,
    routers import the voice router, and the voice router imports this module."""
    from app.main import app

    clean = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://internal") as client:
        response = await client.get(f"{API}{path}", params=clean)
    if response.status_code >= 400:
        return {"error": f"HTTP {response.status_code} from {path}", "detail": _safe_detail(response)}
    return response.json()


def _safe_detail(response: httpx.Response) -> Any:
    try:
        return response.json().get("detail")
    except Exception:
        return response.text[:200]


# Swappable so tests can drive the tools without a database.
_fetch: Fetcher = _asgi_get


def set_fetcher(fetcher: Fetcher) -> None:
    global _fetch
    _fetch = fetcher


def reset_fetcher() -> None:
    global _fetch
    _fetch = _asgi_get


def _out(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False, default=str)
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + ' ... [TRUNCATED: ask a narrower question or use a more specific tool]'
    return text


def _pick(d: dict, keys: list[str]) -> dict:
    return {k: d.get(k) for k in keys if d.get(k) not in (None, "", [], {})}


STOPWORDS = {"the", "of", "in", "and", "for", "a", "an", "to", "is", "what", "how", "rate", "ap", "andhra", "pradesh"}


def _words(query: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 1 and w not in STOPWORDS]


def _score(text: Any, words: list[str]) -> int:
    """How many query words appear as whole words. Whole words, because a
    substring match sent a ration-card question to the land-records path
    ("ration" inside "registration")."""
    hay = set(re.findall(r"[a-z0-9]+", json.dumps(text, ensure_ascii=False).lower()))
    return sum(1 for w in words if w in hay)


def _best(items: list, words: list[str], key: Callable[[Any], Any], n: int) -> list:
    scored = [(_score(key(i), words), idx, i) for idx, i in enumerate(items)]
    scored = [t for t in scored if t[0] > 0]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [i for _, _, i in scored[:n]]


# --------------------------------------------------------------------------
# Tools
# --------------------------------------------------------------------------

async def search_platform(query: str, kind: str = "all") -> str:
    data = await _fetch("/search/", {"q": query, "kind": kind, "page_size": 8})
    if "error" in data:
        return _out(data)
    results = [
        _pick(r, ["type", "title", "subtitle", "snippet", "meta", "route", "source_url"])
        for r in data.get("results", [])
    ]
    return _out({"total": data.get("total"), "results": results, "scope_note": data.get("scope_note")})


async def project_overview() -> str:
    stats = await _fetch("/projects/stats", None)
    by_tenure = await _fetch("/projects/by-tenure", None)
    return _out({"register_totals": stats, "by_government": by_tenure})


async def find_projects(query: str = "", district: str = "", status: str = "",
                        tenure: str = "", limit: int = 5) -> str:
    data = await _fetch("/projects/", {
        "q": query, "district": district, "status": status, "tenure": tenure,
        "sort": "cost", "order": "desc", "page_size": max(1, min(limit, 10)),
    })
    if "error" in data:
        return _out(data)
    items = [
        _pick(p, ["id", "title", "title_telugu", "project_type", "status", "district",
                  "department", "estimated_cost_crore", "completion_percentage", "expected_completion"])
        for p in data.get("items", [])
    ]
    return _out({"total_matching": data.get("total"), "projects": items})


async def project_detail(project_id: int) -> str:
    data = await _fetch(f"/projects/{project_id}", None)
    if "error" in data:
        return _out(data)
    keep = _pick(data, [
        "id", "title", "title_telugu", "project_type", "status", "district", "mandal",
        "constituency", "department", "implementing_agency", "estimated_cost_crore",
        "actual_cost_crore", "completion_percentage", "announced_date", "start_date",
        "expected_completion", "actual_completion", "description", "source_portal", "source_url",
    ])
    return _out(keep)


async def investments_overview() -> str:
    stats = await _fetch("/mous/stats", None)
    by_tenure = await _fetch("/mous/by-tenure", None)
    return _out({
        "totals": stats,
        "by_government": by_tenure,
        "reminder": "An MoU is a promise on paper, not money spent. Say which source tier each figure is.",
    })


async def find_mous(query: str = "", district: str = "", tenure: str = "", limit: int = 5) -> str:
    data = await _fetch("/mous/", {
        "q": query, "district": district, "tenure": tenure,
        "sort": "investment", "order": "desc", "page_size": max(1, min(limit, 10)),
    })
    if "error" in data:
        return _out(data)
    items = [
        _pick(m, ["id", "company_name", "sector", "status", "district", "investment_crore",
                  "expected_employment", "is_foreign_investment", "signed_date", "summit_name",
                  "source_tier", "source_label", "date_status"])
        for m in data.get("items", [])
    ]
    return _out({"total_matching": data.get("total"), "mous": items})


async def state_indicator(query: str) -> str:
    data = await _fetch("/state-facts/", None)
    if "error" in data:
        return _out(data)
    words = _words(query)
    sources = data.get("sources", {})
    indicators = data.get("indicators", [])
    chosen = _best(indicators, words, lambda i: {k: i.get(k) for k in ("key", "label", "group")}, 3)
    hits = []
    for ind in chosen:
        hits.append({
            "key": ind.get("key"),
            "label": ind.get("label"),
            "what_it_means": ind.get("what_it_means"),
            "display_unit": ind.get("display_unit"),
            "display_divisor": ind.get("display_divisor"),
            "latest": ind.get("latest"),
            "by_government": ind.get("by_tenure"),
            "recent_points": ind.get("points", [])[-4:],
            "source": (sources.get(ind.get("source")) or {}).get("title") or ind.get("source"),
        })
    if not hits:
        return _out({
            "error": "this platform holds no indicator matching that",
            "available_indicators": [i.get("key") for i in indicators],
            "hint": "If one of these fits, ask again with its words. Otherwise tell the caller the record does not have it.",
        })
    return _out({"indicators": hits})


async def government_record(topic: str) -> str:
    data = await _fetch("/governments/", None)
    if "error" in data:
        return _out(data)
    if topic == "tenures":
        tenures = [
            _pick(t, ["key", "party", "cm", "from", "to", "fy_span", "summary",
                      "capital_outlay_total", "capital_outlay_note"])
            for t in data.get("tenures", [])
        ]
        return _out({"tenures": tenures, "boundary_note": data.get("boundary_note")})
    if topic == "tenure_stories":
        return _out(data.get("tenure_stories", {}))
    spending = data.get("spending", {})
    if topic in spending:
        return _out({topic: spending[topic], "boundary_note": data.get("boundary_note")})
    return _out({"error": f"unknown topic {topic}", "topics": GOVERNMENT_TOPICS})


async def state_finances(topic: str) -> str:
    data = await _fetch("/finances/", None)
    if "error" in data:
        return _out(data)
    if topic == "debt_series":
        series = [
            {"indicator": s.get("indicator"), "source_family": s.get("source_family"),
             "unit": s.get("unit"), "recent_points": s.get("points", [])[-6:]}
            for s in data.get("series", [])
        ]
        return _out({"series": series, "boundary_note": data.get("boundary_note"),
                     "stages": "A = audited actual, RE = revised estimate, BE = budget estimate (a plan)"})
    if topic == "debt_composition":
        return _out(data.get("composition", {}))
    if topic == "white_paper_claims":
        return _out({"claims": data.get("claims", []),
                     "reminder": "These are political claims. Say whose claim it is; never present it as fact."})
    if topic == "promised_vs_spent":
        return _out(data.get("promised_vs_spent", {}))
    if topic == "glossary":
        return _out(data.get("glossary", {}))
    return _out({"error": f"unknown topic {topic}", "topics": FINANCE_TOPICS})


async def find_help(query: str) -> str:
    data = await _fetch("/contacts/", None)
    if "error" in data:
        return _out(data)
    words = _words(query)
    emergency = [_pick(h, ["name", "number", "what_for"]) for h in data.get("emergency", [])[:4]]
    helplines = [_pick(h, ["name", "number", "what_for", "hours"])
                 for h in _best(data.get("helplines", []), words, lambda h: (h.get("name"), h.get("what_for")), 4)]
    paths = []
    for e in _best(data.get("escalations", []), words, lambda e: e.get("problem"), 1):
        paths.append({
            "problem": e.get("problem"),
            "steps": [_pick(st, ["rung", "office", "what_to_bring"]) for st in (e.get("steps") or [])[:3]],
        })
    systems = [_pick(g, ["name", "number", "what_for"])
               for g in _best(data.get("grievance_systems", []), words, lambda g: (g.get("name"), g.get("what_for")), 2)]
    return _out({"emergency": emergency, "helplines": helplines,
                 "step_by_step_paths": paths, "grievance_systems": systems,
                 "warning": data.get("warning")})


async def latest_news() -> str:
    data = await _fetch("/news/latest", None)
    if isinstance(data, dict) and "error" in data:
        return _out(data)
    items = [_pick(n, ["headline", "headline_telugu", "summary", "source_name", "published_at"]) for n in (data or [])[:5]]
    if not items:
        return _out({"error": "no news collected yet"})
    return _out({"news": items, "reminder": "News is a newspaper's claim, not the record. Never take a figure from it."})


# --------------------------------------------------------------------------
# Definitions sent to the model
# --------------------------------------------------------------------------

def _schema(properties: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


_STR = {"type": "string"}

TOOL_DEFINITIONS: list[dict] = [
    {
        "name": "search_platform",
        "description": "Search everything this platform holds (projects, MoUs, documents, news, sections) by keyword. "
                       "Use English or transliterated names for best results, e.g. 'Polavaram', 'Guntur hospital'.",
        "input_schema": _schema({
            "query": _STR,
            "kind": {"type": "string", "enum": ["all", "project", "document", "mou", "news", "section"]},
        }, ["query", "kind"]),
    },
    {
        "name": "project_overview",
        "description": "State-wide totals of the project register (how many projects, how many completed or under "
                       "construction, total published estimated cost) and the per-government split.",
        "input_schema": _schema({}, []),
    },
    {
        "name": "find_projects",
        "description": "List government projects, largest published cost first. Filter by free text, district "
                       "(one of the 26 AP districts), status, or government tenure (tdp1 = TDP 2014-19, "
                       "ysrcp = YSRCP 2019-24, tdp2 = TDP-led NDA 2024-). Use empty strings for filters you do not need.",
        "input_schema": _schema({
            "query": _STR,
            "district": _STR,
            "status": {"type": "string", "enum": [""] + PROJECT_STATUSES},
            "tenure": {"type": "string", "enum": [""] + TENURE_KEYS},
            "limit": {"type": "integer"},
        }, ["query", "district", "status", "tenure", "limit"]),
    },
    {
        "name": "project_detail",
        "description": "Full record of one project by its id (from find_projects or search_platform): cost, progress, "
                       "spending, dates, agency and the source it came from.",
        "input_schema": _schema({"project_id": {"type": "integer"}}, ["project_id"]),
    },
    {
        "name": "investments_overview",
        "description": "Investment MoU totals and the per-government split: MoUs signed, rupees promised, jobs promised, "
                       "how many became operational.",
        "input_schema": _schema({}, []),
    },
    {
        "name": "find_mous",
        "description": "List investment MoUs (company promises), largest first, with each one's source tier "
                       "(government, company or press). Filter by text (company or sector), district, or tenure.",
        "input_schema": _schema({
            "query": _STR,
            "district": _STR,
            "tenure": {"type": "string", "enum": [""] + TENURE_KEYS},
            "limit": {"type": "integer"},
        }, ["query", "district", "tenure", "limit"]),
    },
    {
        "name": "state_indicator",
        "description": "Andhra Pradesh statistics from RBI, NSO and ministries: income per person, GSDP, literacy, "
                       "health, electricity, agriculture and more, with the change under each government. "
                       "Query with one or two English keywords.",
        "input_schema": _schema({"query": _STR}, ["query"]),
    },
    {
        "name": "government_record",
        "description": "Audited spending record of the three governments since 2014: tenure dates and summaries, "
                       "capital outlay (money spent on building), social sector spending, share of spending on "
                       "education and health, share already committed to salaries, pensions and interest, "
                       "and plain-language tenure stories.",
        "input_schema": _schema({"topic": {"type": "string", "enum": GOVERNMENT_TOPICS}}, ["topic"]),
    },
    {
        "name": "state_finances",
        "description": "What Andhra Pradesh owes: debt series from RBI, the state budget and CAG audits; what the debt "
                       "is made of; what the political white papers claimed; promised versus spent.",
        "input_schema": _schema({"topic": {"type": "string", "enum": FINANCE_TOPICS}}, ["topic"]),
    },
    {
        "name": "find_help",
        "description": "Official helplines, grievance systems and step-by-step complaint paths for everyday problems: "
                       "pension, ration card, land, police, electricity, water, school, hospital. Query with one or two "
                       "English keywords. Always returns the emergency numbers too.",
        "input_schema": _schema({"query": _STR}, ["query"]),
    },
    {
        "name": "latest_news",
        "description": "The latest news items the platform has collected. News is a claim, never the source of a figure.",
        "input_schema": _schema({}, []),
    },
]

for _tool in TOOL_DEFINITIONS:
    _tool["strict"] = True


HANDLERS: dict[str, Callable[..., Awaitable[str]]] = {
    "search_platform": search_platform,
    "project_overview": project_overview,
    "find_projects": find_projects,
    "project_detail": project_detail,
    "investments_overview": investments_overview,
    "find_mous": find_mous,
    "state_indicator": state_indicator,
    "government_record": government_record,
    "state_finances": state_finances,
    "find_help": find_help,
    "latest_news": latest_news,
}


async def run_tool(name: str, tool_input: dict) -> tuple[str, bool]:
    """Run one tool. Returns (result_text, is_error)."""
    handler = HANDLERS.get(name)
    if handler is None:
        return json.dumps({"error": f"unknown tool {name}"}), True
    try:
        result = await handler(**(tool_input or {}))
    except TypeError as exc:
        return json.dumps({"error": f"bad arguments: {exc}"}), True
    except Exception as exc:  # a tool failing must not end the conversation
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"}), True
    return result, result.startswith('{"error"')
