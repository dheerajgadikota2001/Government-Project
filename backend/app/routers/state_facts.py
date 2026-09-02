"""
Andhra Pradesh, indicator by indicator.

Every figure in seed/state_facts_seed.json is transcribed verbatim from a
government publication and carries the document, the table number and the
agency that originated the number. Nothing is modelled, indexed, deflated or
adjusted, and no missing year is ever filled.

The only arithmetic performed anywhere in this feature is subtraction between
two years the source itself printed, and both endpoint years travel with the
result so a reader can redo it. That happens in the seed build, not here, so
the API is a pure read.

Two things this router deliberately preserves rather than smoothing away:
  * the estimate stage of every figure (accounts / revised / budget /
    provisional), so an estimate is never shown as an outcome; and
  * the 2014 bifurcation, so an undivided-state year is never compared with a
    residuary-state one.
"""

import json
import os

from fastapi import APIRouter, HTTPException
from app.services.cache import cache_response

router = APIRouter(prefix="/state-facts", tags=["State facts"])

_SEED_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed", "state_facts_seed.json",
)

_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        with open(_SEED_PATH, encoding="utf-8") as f:
            _cache = json.load(f)
    return _cache


@router.get("/")
@cache_response(ttl=1800)
async def get_state_facts():
    """Every indicator, with its series, its per-government change and its source."""
    d = _load()
    return {
        "readme": d.get("_readme"),
        "notes": {
            "bifurcation": d.get("_bifurcation_note"),
            "tenure": d.get("_tenure_note"),
            "arithmetic": d.get("_arithmetic_note"),
            "stages": d.get("_stage_note"),
            "dropped": d.get("_dropped_note"),
        },
        "groups": d["groups"],
        "sources": d["sources"],
        "indicators": d["indicators"],
        "undated_facts": d.get("undated_facts", []),
        "unavailable": d.get("unavailable", []),
        "counts": {
            "indicators": len(d["indicators"]),
            "points": sum(len(i["points"]) for i in d["indicators"]),
            "with_estimates": sum(1 for i in d["indicators"] if i.get("has_estimates")),
            "sources": len(d["sources"]),
        },
    }


@router.get("/{key}")
@cache_response(ttl=1800)
async def get_indicator(key: str):
    """One indicator, for deep links and for the site search index."""
    d = _load()
    for i in d["indicators"]:
        if i["key"] == key:
            return {"indicator": i, "source": d["sources"].get(i.get("source")),
                    "notes": {"stages": d.get("_stage_note"),
                              "bifurcation": d.get("_bifurcation_note")}}
    raise HTTPException(status_code=404, detail="No such indicator")
