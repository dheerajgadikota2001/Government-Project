"""
Jobs and prices for Andhra Pradesh: MoSPI's quarterly labour figures and monthly CPI.

A pure read of seed/jobs_prices_seed.json, which scripts/build_jobs_prices_seed.py
builds from MoSPI's data service after its gates pass, and a person commits after
reading the diff. Nothing is computed here: every figure is MoSPI's, and the newest
CPI month carries "provisional" exactly as the press release prints it.
"""

import json
import os

from fastapi import APIRouter

from app.services.cache import cache_response

router = APIRouter(prefix="/jobs-prices", tags=["Jobs and prices"])

_SEED_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "seed", "jobs_prices_seed.json",
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
async def get_jobs_prices():
    """Every quarter of the redesigned PLFS and every month of CPI base 2024, with their sources."""
    return _load()
