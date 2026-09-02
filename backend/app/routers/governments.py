"""
Governments API — the per-tenure record: what each AP government since
bifurcation spent on building (capital outlay, RBI/CAG official series),
what it ran as welfare schemes (its OWN claimed figures, labeled), its
manifesto promises (quoted from party/press records, labeled), and a dated,
cited timeline of its major actions.

Data lives in seed/governments_seed.json — hand-transcribed and per-figure
cited (research pass 26 Aug 2026). Served verbatim; nothing computed here.
"""

import json
import os

from fastapi import APIRouter
from app.services.cache import cache_response

router = APIRouter(prefix="/governments", tags=["Governments"])

_SEED_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed", "governments_seed.json",
)

_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        with open(_SEED_PATH, encoding="utf-8") as f:
            _cache = json.load(f)
    return _cache


@router.get("/")
@cache_response(ttl=600)
async def get_governments():
    """Tenure records, spending series, schemes, manifestos, glossary — all cited."""
    data = _load()
    return {
        "tenures": data["tenures"],
        "spending": data["spending"],
        "sources": data["sources"],
        "glossary": data["glossary"],
        "rankings": data.get("rankings", {}),
        "year_notes": data.get("year_notes", {}),
        "economy": data.get("economy", {}),
        "awards": data.get("awards", {}),
        "state_leaderboards": data.get("state_leaderboards", {}),
        "head_to_head": data.get("head_to_head", {}),
        "tenure_stories": data.get("tenure_stories", {}),
        "boundary_note": (
            "Financial years end on 31 March; governments changed in May/June. "
            "Per-tenure totals use the nearest financial years and say so."
        ),
    }
