"""
Andhra Pradesh facts by topic: water, power, ports, homes and taps, births and
deaths, money flows, rural work and food, and the economy by district.

Each topic is a pure read of seed/ap_facts/<topic>.json, gathered from official
sources (every point names its paper, table or page, every source its URL and
SHA-256). Nothing is computed here.

Water is also live: the daily refresh reads APWRIMS into live_readings, and
/facts/water/today answers with the newest stored reading. When the database has
none yet (a fresh deploy, or the refresh has not run), it falls back to the
reading stored in the seed, and says which one it is serving.
"""

import json
import os
from functools import lru_cache

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.utils.logger import logger

router = APIRouter(prefix="/facts", tags=["AP facts"])

_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "seed", "ap_facts")
LIVE_KEYS = ("apwrims.reservoirs", "apwrims.rainfall", "apwrims.tanks", "apwrims.groundwater")


@lru_cache(maxsize=1)
def _index() -> dict:
    with open(os.path.join(_DIR, "index.json"), encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=16)
def _topic(topic: str) -> dict:
    names = {t["topic"] for t in _index()["topics"]}
    if topic not in names:
        raise KeyError(topic)
    with open(os.path.join(_DIR, f"{topic}.json"), encoding="utf-8") as fh:
        return json.load(fh)


@router.get("")
@router.get("/")
def facts_index():
    return _index()


@router.get("/water/today")
async def water_today():
    """The newest APWRIMS reading of each kind, from the daily refresh."""
    out: dict = {"served_from": "live_readings", "readings": {}}
    try:
        from app.database import get_db_context
        from app.models.live_reading import LiveReading

        async with get_db_context() as db:
            for key in LIVE_KEYS:
                row = (await db.execute(
                    select(LiveReading).where(LiveReading.source_key == key)
                    .order_by(LiveReading.read_at.desc()).limit(1)
                )).scalar_one_or_none()
                if row:
                    out["readings"][key] = {"read_at": row.read_at.isoformat(), "as_on": row.as_on, "payload": row.payload}
    except Exception as exc:                         # noqa: BLE001
        # The database being down must not take the water page with it.
        logger.warning(f"water/today: live readings unavailable ({type(exc).__name__}); serving the seed reading")
    if out["readings"]:
        return out
    seed = _topic("water")
    today = [s for s in seed["series"] if s["id"] in ("reservoir_storage_today", "reservoir_group_totals_today")]
    return {"served_from": "seed", "note": "No live reading stored yet; this is the reading taken when the seed was built.",
            "series": today, "sources": seed["sources"]}


@router.get("/{topic}")
def facts_topic(topic: str):
    try:
        return _topic(topic)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such topic")


@router.get("/{topic}/series/{series_id}")
def facts_series(topic: str, series_id: str):
    try:
        d = _topic(topic)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such topic")
    for s in d["series"]:
        if s["id"] == series_id:
            used = {p["source"] for p in s["points"]}
            return {"topic": topic, "series": s, "sources": [x for x in d["sources"] if x["id"] in used]}
    raise HTTPException(status_code=404, detail="No such series")
