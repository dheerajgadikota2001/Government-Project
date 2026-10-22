"""
AP facts by topic, and the daily APWRIMS water reading.

The seed must keep every promise the platform makes: each point names a listed
source, each source has a URL and a fingerprint, labels exist in English and
Telugu, nothing personal, and our own words carry no em dashes (quoted source
titles keep theirs). The water reader must shape a real APWRIMS response, keep
values as served, and refuse a response that does not look like the dashboard.
"""

import copy
import json
import pathlib
import re

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.scrapers import apwrims_water as w
from app.scrapers.sanity import SanityAbort

ROOT = pathlib.Path(__file__).parents[1]
SEED = ROOT / "seed" / "ap_facts"
FIX = pathlib.Path(__file__).parent / "fixtures" / "apwrims"
INDEX = json.loads((SEED / "index.json").read_text(encoding="utf-8"))
TOPICS = [t["topic"] for t in INDEX["topics"]]
c = TestClient(app)


def load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def test_all_ten_topics_are_in_the_seed():
    assert set(TOPICS) == {"water", "power", "ports", "homes_taps", "births_deaths", "money_flows", "rural_work_food", "district_economy", "district_sites", "more_platforms"}


@pytest.mark.parametrize("topic", TOPICS)
def test_every_point_cites_a_listed_source_with_url_and_fingerprint(topic):
    d = json.loads((SEED / f"{topic}.json").read_text(encoding="utf-8"))
    ids = {s["id"] for s in d["sources"]}
    for s in d["sources"]:
        assert s["url"] and s["by"] and s["title"], s["id"]
        assert "local_file" not in s
    for se in d["series"]:
        assert se["en"] and se["te"] and "unit_en" in se, se["id"]
        for p in se["points"]:
            assert p["source"] in ids, (se["id"], p.get("period"))


@pytest.mark.parametrize("topic", TOPICS)
def test_our_words_carry_no_em_dash(topic):
    # A source's own title keeps its punctuation, so a dash inside 'quotes' or after
    # "as printed:" is the government's text. Anywhere else it is ours, and not allowed.
    text = (SEED / f"{topic}.json").read_text(encoding="utf-8")
    for m in re.finditer("—", text):
        # The JSON string this dash sits in, from its opening double quote.
        start = text.rfind('"', 0, m.start())
        before = text[start + 1:m.start()]
        quoted = before.count("'") % 2 == 1 or "as printed:" in before.lower()
        assert quoted, f"{topic}: em dash in our own words near: {text[m.start() - 60:m.start() + 20]!r}"


def test_api_index_topic_and_series():
    assert c.get("/api/v1/facts").json()["topics"]
    body = c.get("/api/v1/facts/ports").json()
    assert body["topic"] == "ports"
    sid = body["series"][0]["id"]
    one = c.get(f"/api/v1/facts/ports/series/{sid}").json()
    assert one["series"]["id"] == sid and one["sources"]
    assert c.get("/api/v1/facts/nope").status_code == 404
    assert c.get("/api/v1/facts/ports/series/nope").status_code == 404


# ------------------------------------------------------------- APWRIMS reader

def test_reservoirs_shape_keeps_values_as_served():
    raw = load("reservoirs_20261021.json")
    p = w.shape_reservoirs(raw, "20261021")
    w.check_reservoirs(p)
    assert len(p["reservoirs"]) == 125
    cotton = next(r for r in p["reservoirs"] if r["name"] == "SIR AURTHUR COTTON BARRAGE")
    assert cotton["capacity_tmc"] == 2.93 and cotton["district"] == "Konaseema"
    # APWRIMS's own group total, not a sum of ours.
    assert p["group_totals"]["major"]["capacity_tmc"] == 1069.371
    assert p["group_totals"]["major"]["storage_tmc"] == 476.3793


def test_an_old_reading_is_marked_stale_not_dropped():
    raw = load("reservoirs_20261021.json")
    p = w.shape_reservoirs(raw, "20261021")
    stale = [r for r in p["reservoirs"] if r["stale"]]
    assert stale, "the 21 Oct 2026 response serves at least one reading weeks old"
    assert all(r["read_at"] for r in stale)


def test_a_broken_reservoir_response_is_refused():
    raw = load("reservoirs_20261021.json")
    short = copy.deepcopy(raw)
    short["medium"] = []
    short["outside_ap"] = []
    with pytest.raises(SanityAbort):
        w.check_reservoirs(w.shape_reservoirs(short, "20261021"))
    no_total = copy.deepcopy(raw)
    no_total["Total"] = {}
    with pytest.raises(SanityAbort):
        w.check_reservoirs(w.shape_reservoirs(no_total, "20261021"))


def test_rainfall_tanks_and_groundwater_shape_and_check():
    rf = w.shape_rainfall(load("rainfall_imd_20260601_20261021.json"), "20260601", "20261021")
    w.check_rainfall(rf)
    assert rf["window"] == {"from": "2026-06-01", "to": "2026-10-21"}
    assert "IMD" in rf["source"]["data_source"]
    tanks = w.shape_tanks(load("tanks_20261021.json"))
    w.check_tanks(tanks)
    gw = w.shape_groundwater(load("groundwater_20260930.json"), "20260930")
    w.check_groundwater(gw)
    with pytest.raises(SanityAbort):
        w.check_rainfall({"districts": rf["districts"][:5]})


def test_same_payload_has_the_same_fingerprint():
    p = w.shape_tanks(load("tanks_20261021.json"))
    assert w.fingerprint(p) == w.fingerprint(json.loads(json.dumps(p)))


def test_water_today_falls_back_to_the_seed_when_the_database_is_down(monkeypatch):
    import app.database as database

    def broken():
        raise ConnectionRefusedError("database down")

    monkeypatch.setattr(database, "get_db_context", broken)
    body = c.get("/api/v1/facts/water/today").json()
    assert body["served_from"] == "seed" and body["note"] and body["series"]


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_scraper_stores_once_per_distinct_payload(monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import delete
    from app.database import get_db_context
    from app.models.live_reading import LiveReading

    raws = {
        "wateraudit/data/component": load("reservoirs_20261021.json"),
        "rf/rfTable": load("rainfall_imd_20260601_20261021.json"),
        "v2/wcs/table": load("tanks_20261021.json"),
        "v2/gwlevels/table": load("groundwater_20260930.json"),
    }

    async def fake_post(self, path, body):
        self.fetch_ok += 1
        return copy.deepcopy(raws[path])

    async def fake_json(self, url, params=None):
        self.fetch_ok += 1
        return {"LastUpdatedIn": "202609"}

    monkeypatch.setattr(w.ApwrimsWaterScraper, "_post", fake_post)
    monkeypatch.setattr(w.ApwrimsWaterScraper, "fetch_json", fake_json)

    async with get_db_context() as db:
        await db.execute(delete(LiveReading).where(LiveReading.source_key.like("apwrims.%")))

    assert await w.ApwrimsWaterScraper().scrape() == 4
    assert await w.ApwrimsWaterScraper().scrape() == 0, "an unchanged dashboard must add nothing"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        body = (await client.get("/api/v1/facts/water/today")).json()
    assert body["served_from"] == "live_readings"
    assert set(body["readings"]) == {"apwrims.reservoirs", "apwrims.rainfall", "apwrims.tanks", "apwrims.groundwater"}
    assert body["readings"]["apwrims.groundwater"]["as_on"] == "2026-09-30"
