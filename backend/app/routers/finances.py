"""
State Finances API — debt, guarantees, deficits and GSDP for AP since
bifurcation, from three independent official source families (RBI, AP's own
budget documents, CAG audits), plus the two political white papers served
strictly as CLAIM documents.

The data lives in seed/finances_seed.json — a hand-transcribed, per-figure
cited record (research pass 25-26 Aug 2026). This router serves that file
verbatim; nothing is computed or estimated server-side. When a new budget /
RBI study / CAG report lands, the seed file is updated with the new cited
figures and the API reflects it immediately.
"""

import json
import os

from fastapi import APIRouter
from app.services.cache import cache_response

router = APIRouter(prefix="/finances", tags=["State Finances"])

_SEED_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed", "finances_seed.json",
)

# AP governments since bifurcation (2 June 2014) — served with the data so
# the frontend never hardcodes political facts.
TENURES = [
    {"key": "tdp1", "party": "TDP", "cm": "N. Chandrababu Naidu",
     "from": "2014-06-08", "to": "2019-05-29", "fy_end_from": 2015, "fy_end_to": 2019},
    {"key": "ysrcp", "party": "YSRCP", "cm": "Y.S. Jagan Mohan Reddy",
     "from": "2019-05-30", "to": "2024-06-11", "fy_end_from": 2020, "fy_end_to": 2024},
    {"key": "tdp2", "party": "TDP-led NDA", "cm": "N. Chandrababu Naidu",
     "from": "2024-06-12", "to": None, "fy_end_from": 2025, "fy_end_to": None},
]

_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        with open(_SEED_PATH, encoding="utf-8") as f:
            _cache = json.load(f)
    return _cache


@router.get("/")
@cache_response(ttl=600)
async def get_finances():
    """Full cited fiscal record: sources, series, claims, and tenure dates."""
    data = _load()
    return {
        "tenures": TENURES,
        "sources": data["sources"],
        "series": data["series"],
        "composition": data.get("composition", {}),
        "section_sources": data.get("section_sources", {}),
        "glossary": data.get("glossary", {}),
        "claims": data["claims"],
        "committed": data.get("committed", {}),
        "population": data.get("population", {}),
        "promised_vs_spent": data.get("promised_vs_spent", {}),
        "tenure_boundary_note": data.get("tenure_boundary_note"),
        "boundary_note": (
            "Financial years end on 31 March, but governments changed in "
            "May/June. Per-tenure figures therefore use the nearest end-March "
            "numbers and say so — they are close, not exact-to-the-day."
        ),
    }


_DEPT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed", "departments_seed.json",
)
_dept_cache: dict | None = None


def _load_depts() -> dict:
    global _dept_cache
    if _dept_cache is None:
        with open(_DEPT_PATH, encoding="utf-8") as f:
            _dept_cache = json.load(f)
    return _dept_cache


@router.get("/departments")
@cache_response(ttl=600)
async def get_departments():
    """Demand-wise budget figures, and the per-tenure capital totals derived from them.

    The state-wide capital outlay total cannot tell a reader whether money went
    into school buildings or into anything else. The Demands for Grants volumes
    can, because the budget is voted department by department. This endpoint
    serves those figures with the volume and column each came from, and rolls the
    audited actuals up per government tenure. Only Actual rows are rolled up:
    a budget estimate is a plan, and adding plans to outcomes would be dishonest.
    """
    data = _load_depts()

    tenure_keys = ["tdp1", "ysrcp", "tdp2"]

    def _roll(rows, field):
        """Sum a column over rows that actually carry it, and say how many did.

        A department with three of five years filled must never be compared with one
        that has all five, so the count travels with the number rather than being
        left for the reader to guess.
        """
        vals = [r[field] for r in rows if r.get(field) is not None]
        return {
            "total_crore": round(sum(vals), 2) if vals else None,
            "annual_mean_crore": round(sum(vals) / len(vals), 2) if vals else None,
            "years_counted": len(vals),
        }

    summary = []
    for dept in data["departments"]:
        rows = dept["rows"]
        be = [r for r in rows if r["stage"] == "BE"]
        actuals = [r for r in rows if r["stage"] == "Actual"]
        per_tenure = {}
        for k in tenure_keys:
            be_k = [r for r in be if r["tenure"] == k]
            ac_k = [r for r in actuals if r["tenure"] == k]
            years_in_tenure = {r["year"] for r in rows if r["tenure"] == k}
            per_tenure[k] = {
                # every demand has this for every year
                "budgeted": _roll(be_k, "total_crore"),
                # the Revenue/Capital split only exists from 2017-18 onward
                "budgeted_capital": _roll(
                    [r for r in be_k if r.get("split_type") == "revenue_capital"], "capital_crore"
                ),
                "budgeted_revenue": _roll(
                    [r for r in be_k if r.get("split_type") == "revenue_capital"], "revenue_crore"
                ),
                # audited outturn, where it exists at all
                "audited_capital": _roll(ac_k, "capital_crore"),
                "audited_revenue": _roll(ac_k, "revenue_crore"),
                "years_in_tenure": len(years_in_tenure),
                "years_with_actual": len(ac_k),
                "years_missing_actual": sorted(
                    years_in_tenure - {r["year"] for r in ac_k}
                ),
            }
            # Backwards-compatible keys for the existing chart component, which was
            # written when this endpoint served only audited capital outlay for two
            # departments. Keep them until that component reads the new shape, so a
            # seed change can never blank the page that is already live.
            _ac_cap = _roll(ac_k, "capital_crore")
            per_tenure[k].update({
                "capital_crore": _ac_cap["total_crore"] or 0,
                "revenue_crore": _roll(ac_k, "revenue_crore")["total_crore"] or 0,
                "annual_mean_capital_crore": _ac_cap["annual_mean_crore"],
                "years_with_actual": len(ac_k),
                "years_missing": sorted(years_in_tenure - {r["year"] for r in ac_k}),
            })
        entry = {
            "demand_no": dept["demand_no"],
            "demand_number": dept.get("demand_number"),
            "department": dept["department"],
            "has_audited_actuals": bool(actuals),
            "by_tenure": per_tenure,
            "comparability_note": (
                "Governments served different numbers of years, so compare the yearly average "
                "rather than the total. Figures marked budgeted are what the Assembly was asked "
                "to authorise, not what was spent; audited figures are the outturn and exist for "
                "very few departments so far. The two are never added together."
            ),
        }
        if dept.get("goir_activity"):
            entry["goir_activity"] = dept["goir_activity"]
        if dept.get("name_history"):
            entry["name_history"] = dept["name_history"]
        summary.append(entry)

    return {
        "how_to_read": data["how_to_read"],
        "demand_map": data["demand_map"],
        "demand_map_note": data["demand_map_note"],
        "departments": data["departments"],
        "summary": summary,
        "caveats": data["caveats"],
        "sources": data["sources"],
    }
