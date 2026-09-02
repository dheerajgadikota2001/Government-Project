"""
Andhra Pradesh contacts and grievance directory.

Every entry in seed/contacts_seed.json was read off a government page and
carries that page's URL. Nothing here comes from a directory site, an
aggregator or a news report: a wrong helpline number is worse than a missing
one, because someone dials it in an emergency.

This router serves the file. It computes nothing except the split between the
handful of numbers a person needs in a crisis and the rest, and that split is
itself declared in the seed file rather than guessed here.

Where a number could not be confirmed against a government page, it is absent
from the lists and present in `unavailable`, together with the exact page a
person in Andhra Pradesh should open to confirm it. That block is served to
the frontend and rendered, not hidden.
"""

import json
import os

from fastapi import APIRouter, HTTPException
from app.services.cache import cache_response

router = APIRouter(prefix="/contacts", tags=["Contacts and grievances"])

_SEED_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed", "contacts_seed.json",
)

_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        with open(_SEED_PATH, encoding="utf-8") as f:
            _cache = json.load(f)
    return _cache


@router.get("/")
@cache_response(ttl=3600)
async def get_contacts():
    """The whole directory: helplines, grievance routes, departments, districts, ladders."""
    d = _load()
    order = d.get("emergency_order", [])
    by_number = {}
    for h in d["helplines"]:
        by_number.setdefault(h["number"], h)

    # The crisis set, in the order the seed declares — not sorted, because the
    # order is an editorial judgement about what someone reaches for first.
    emergency = [by_number[n] for n in order if n in by_number]
    emergency_numbers = {h["number"] for h in emergency}
    rest = [h for h in d["helplines"] if h["number"] not in emergency_numbers]

    return {
        "readme": d.get("_readme"),
        "fetched": d.get("_fetched"),
        "warning": d.get("_warning"),
        "emergency": emergency,
        "helplines": rest,
        "grievance_systems": d["grievance_systems"],
        "departments": sorted(d["departments"], key=lambda x: x["name"]),
        "districts": sorted(d["districts"], key=lambda x: x["name"]),
        "escalations": d["escalations"],
        "unavailable": d["unavailable"],
        "counts": {
            "emergency": len(emergency),
            "helplines": len(d["helplines"]),
            "grievance_systems": len(d["grievance_systems"]),
            "departments": len(d["departments"]),
            "districts": len(d["districts"]),
            "escalations": len(d["escalations"]),
            "unverified": len(d["unavailable"]),
        },
    }


@router.get("/escalations/{index}")
@cache_response(ttl=3600)
async def get_escalation(index: int):
    """One escalation ladder, for deep links and for the search index."""
    d = _load()
    try:
        return d["escalations"][index]
    except IndexError:
        raise HTTPException(status_code=404, detail="No such escalation path")
