"""
Every district figure the Statistical Abstract AP 2024 prints for all 26 districts.

A pure read of seed/district_measures_seed.json, built by the site's
scripts/build_district_measures.py from page-by-page readings, each column checked
against the book's state row. Nothing is computed here: no totals, shares or ranks.
District names are the 2022 map's 26, as the book prints them; the two districts of
2026 are answered with the district they were cut from, said in the response.
"""

import json
import os
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from app.constants.districts import NEW_IN_2026, normalise_district

router = APIRouter(prefix="/districts", tags=["District measures"])

_SEED = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                     "seed", "district_measures_seed.json")


@lru_cache(maxsize=1)
def _load() -> dict:
    with open(_SEED, encoding="utf-8") as fh:
        return json.load(fh)


@router.get("/measures")
def all_measures():
    return _load()


@router.get("/measures/{district}")
def measures_for(district: str):
    name = normalise_district(district)
    if not name:
        raise HTTPException(status_code=404, detail="No district has this name")
    doc = _load()
    reads = NEW_IN_2026.get(name, name)
    return {
        "district": name,
        "figures_for": reads,
        "why": None if reads == name else f"{name} was formed on 1 January 2026 from {reads}; the book was written on the 2022 map, so these are {reads}'s figures.",
        "paper": doc["paper"],
        "themes": doc["themes"],
        "measures": [{k: v for k, v in m.items() if k != "values"} | {"value": m["values"].get(reads)} for m in doc["measures"]],
    }
