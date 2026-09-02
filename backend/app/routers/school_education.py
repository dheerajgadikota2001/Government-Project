"""
School education — what the state spent, what it built, and what reached schools.

WHAT THIS ENDPOINT REFUSES TO DO
It does not sum Government Order rupee amounts into a spending total. An earlier
version of this section did exactly that and was wrong: the extraction read
amounts written "Rs.9,37,63,92,000/-" but silently skipped "Rs.944.53 crores",
which dropped Rs 28,019 crore of YSRCP orders against Rs 955 crore of TDP
2014-19 orders and produced a chart favouring the wrong government.

Two lessons are built into the shape of this module:

1. Spending comes from the Demands for Grants series, which is voted by the
   legislature and audited by the CAG. Government Orders are used for what they
   are good for - naming what was sanctioned and when - and never summed as
   spending. The reconciliation block says so out loud, with the ratios.

2. Every figure carries its second source. `/reconciliation` is a first-class
   endpoint, not a footnote, because a reader checking a politician's claim
   deserves to see how the number was checked.

Per-student figures are OUR arithmetic on two published government numbers, and
are named `per_student_rupees_our_calculation` in the payload so the label
cannot be lost on the way to the page.
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.services.cache import cache_response

router = APIRouter(prefix="/school-education", tags=["School Education"])

SEED = Path(__file__).resolve().parent.parent.parent / "seed" / "school_education_seed.json"
GOIR_SEED = Path(__file__).resolve().parent.parent.parent / "seed" / "goir_school_education_seed.json"


def _load(path: Path) -> dict:
    try:
        with path.open(encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="school_education_seed_missing")


@router.get("/")
@cache_response(ttl=600)
async def overview():
    """Spending, schools, per-student and the tenure frame, in one call."""
    d = _load(SEED)
    return {
        "tenures": d["tenures"],
        "spending": d["spending"],
        "schools": d["schools"],
        # Ten years split by who runs the school. This is the series that answers
        # "built or closed"; the UDISE+ block above is a different count and the
        # two are deliberately served side by side rather than merged.
        "management_series": d.get("management_series"),
        "honesty_note": d["_readme"],
    }


@router.get("/components")
@cache_response(ttl=900)
async def components():
    """What physically reached schools: classrooms, toilets, meals, uniforms, tablets.

    Counts are ORDERS mentioning a component, never units delivered. One order can
    cover thousands of schools and several orders can cover the same work, so these
    numbers describe activity in the record, not things on the ground.
    """
    d = _load(SEED)
    return d["components"]


@router.get("/programmes")
@cache_response(ttl=900)
async def programmes():
    """When each named programme first appears, and which governments it spans.

    A first-appearance date is a fact. Whether a programme was innovative is a
    judgement, and this platform does not make those, so none is offered here.
    """
    d = _load(SEED)
    return d["programmes"]


@router.get("/reconciliation")
@cache_response(ttl=900)
async def reconciliation():
    """How each figure was checked, and the defects that were found and fixed.

    Published rather than kept internal: the platform asks readers to trust
    figures over politicians' claims, and that trust has to be inspectable.
    """
    d = _load(SEED)
    return d["reconciliation"]


@router.get("/orders")
@cache_response(ttl=600)
async def orders():
    """The Government Order record itself: counts per government, and the eight
    places the register contradicts itself.

    Order counts are exact. The money readings held in this seed are deliberately
    NOT surfaced - see the module docstring.
    """
    d = _load(GOIR_SEED)
    return {
        "source": d["source"],
        "coverage": d["coverage"],
        "tenures": [
            {k: v for k, v in t.items() if not k.startswith("reading_")}
            for t in d["tenures"]
        ],
        "conflicts": d["conflicts"],
    }
