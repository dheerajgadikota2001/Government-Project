"""
District figures year by year, from the Statistical Abstract AP editions 2014 to 2023.

A pure read of seed/district_history_seed.json, built by the site's
scripts/build_district_history.py from page-by-page readings of each edition, each column
checked against the book's state row. Nothing is computed here: no totals, conversions,
differences or ranks.

Two maps, never mixed:
- "13": the 13 districts before 4 April 2022. Books up to 2022 print these.
- "26": the 26 districts of April 2022. The 2023 book prints these in most tables.
A figure for old Krishna is not a figure for today's Krishna, so a district's answer
carries its own 26-map rows and, separately, the rows of one old district the caller names
(or the first old district an official district page names, if there is one).
"""

import json
import os
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.constants.districts import NEW_IN_2026, normalise_district

router = APIRouter(prefix="/districts", tags=["District history"])

_SEED = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                     "seed", "district_history_seed.json")


@lru_cache(maxsize=1)
def _load() -> dict:
    with open(_SEED, encoding="utf-8") as fh:
        return json.load(fh)


def _old(raw: Optional[str]) -> Optional[str]:
    """An old-district name from any spelling the 28-name normaliser knows, or None."""
    if not raw:
        return None
    doc = _load()
    name = normalise_district(raw)
    return name if name in doc["old13"] else None


def _point(p: dict, key: str) -> dict:
    keep = {k: v for k, v in p.items() if k not in ("values", "flags", "units", "also")}
    return keep | {"value": p["values"].get(key), "flag": (p.get("flags") or {}).get(key),
                   "police_units": (p.get("units") or {}).get(key)}


def _about() -> dict:
    doc = _load()
    return {k: doc[k] for k in ("paper", "def_text", "old13", "parents2022", "unsourced2022")}


@router.get("/history")
def history_index():
    """What the history holds: the books, the maps, which old districts each new one came from, and the measures."""
    doc = _load()
    return _about() | {
        "measures": [{k: m[k] for k in ("id", "id2024", "theme", "en", "te", "note")} | {"points": len(m["points"])} for m in doc["measures"]],
        "missing": doc.get("missing", {}),
    }


@router.get("/history/measure/{measure_id}")
def history_measure(measure_id: str):
    """One measure in full: every point, every edition's reading, including the state series each book prints."""
    for m in _load()["measures"]:
        if m["id"] == measure_id:
            return m
    raise HTTPException(status_code=404, detail="No measure has this id")


@router.get("/history/old/{old_district}")
def history_old(old_district: str):
    """One of the 13 old districts, every measure, every year the books print it."""
    name = _old(old_district)
    if not name:
        raise HTTPException(status_code=404, detail="Not one of the 13 districts before April 2022")
    doc = _load()
    return _about() | {"old_district": name, "map": "13", "measures": [
        {k: m[k] for k in ("id", "id2024", "theme", "en", "te", "note")}
        | {"points": [_point(p, name) for p in m["points"] if p["map"] == "13"]}
        for m in doc["measures"]]}


@router.get("/history/{district}")
def history_for(district: str, old: Optional[str] = Query(None, description="An old district to show for the years before April 2022")):
    name = normalise_district(district)
    if not name:
        raise HTTPException(status_code=404, detail="No district has this name")
    doc = _load()
    reads = NEW_IN_2026.get(name, name)
    parents = doc["parents2022"].get(reads)
    old_name = _old(old) if old else (parents["from"][0] if parents else None)
    if old and not old_name:
        raise HTTPException(status_code=404, detail="Not one of the 13 districts before April 2022")
    return {
        "district": name,
        "figures_for": reads,
        "why": None if reads == name else f"{name} was formed on 1 January 2026 from {reads}; the books were written on the 2022 map, so these are {reads}'s figures.",
        "came_from": parents,
        "came_from_note": None if parents else "No official page we hold says which old district this district came from; pass ?old= with the old district.",
        "old_district": old_name,
        "paper": doc["paper"],
        "def_text": doc["def_text"],
        "measures": [
            {k: m[k] for k in ("id", "id2024", "theme", "en", "te", "note")} | {
                "new_map": [_point(p, reads) for p in m["points"] if p["map"] == "26"],
                "old_map": [_point(p, old_name) for p in m["points"] if p["map"] == "13"] if old_name else [],
            }
            for m in doc["measures"]
        ],
    }
