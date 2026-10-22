"""
District history: Statistical Abstract editions 2014 to 2023. Old (13) and new (26) district
maps never mix, every figure names its book and page, and nothing is converted.
"""

import json
import pathlib

from fastapi.testclient import TestClient

from app.constants.districts import DISTRICT_NAMES_2022
from app.main import app

SEED = json.loads((pathlib.Path(__file__).parents[1] / "seed" / "district_history_seed.json").read_text(encoding="utf-8"))
OLD13 = set(SEED["old13"])
c = TestClient(app)


def test_ten_editions_and_the_13_old_districts():
    assert SEED["paper"]["editions"] == list(range(2014, 2024))
    assert len(OLD13) == 13 and OLD13 <= set(DISTRICT_NAMES_2022)


def test_every_point_keeps_its_map_and_names_book_and_page():
    for m in SEED["measures"]:
        assert m["en"] and m["te"], m["id"]
        for p in m["points"]:
            keys = set(p["values"])
            if p["map"] == "13":
                assert keys == OLD13, (m["id"], p["edition"])
            else:
                assert p["map"] == "26" and keys == set(DISTRICT_NAMES_2022), (m["id"], p["edition"])
            assert p["page"] and p["table"], (m["id"], p["edition"])


def test_one_point_per_map_year_and_definition():
    for m in SEED["measures"]:
        seen = set()
        for p in m["points"]:
            k = (p["map"], p["year_en"], p["def"])
            assert k not in seen, (m["id"], k)
            seen.add(k)


def test_a_unit_change_is_kept_not_converted():
    deposits = next(m for m in SEED["measures"] if m["id"] == "bank_deposits")
    kinds = [(p["edition"], p["kind"]) for p in deposits["points"] if p["map"] == "13"]
    assert ("money_mn" in {k for _, k in kinds}) and ("money_cr" in {k for _, k in kinds})


def test_split_police_districts_carry_two_units_and_no_total():
    crime = next(m for m in SEED["measures"] if m["id"] == "ipc_crimes_total")
    for p in crime["points"]:
        if p["map"] != "13":
            continue
        for d in ("Visakhapatnam", "East Godavari", "Krishna", "Guntur", "Chittoor"):
            assert p["values"][d] is None
            assert len(p["units"][d]) == 2


def test_old_district_endpoint():
    r = c.get("/api/v1/districts/history/old/krishna")
    assert r.status_code == 200
    body = r.json()
    assert body["old_district"] == "Krishna" and body["map"] == "13"
    rain = next(m for m in body["measures"] if m["id"] == "rain_actual")
    assert len(rain["points"]) >= 9 and all("value" in p and "page" in p for p in rain["points"])
    assert c.get("/api/v1/districts/history/old/eluru").status_code == 404


def test_new_district_names_its_official_parents_or_says_none():
    body = c.get("/api/v1/districts/history/eluru").json()
    assert body["came_from"]["from"] == ["West Godavari", "Krishna"] and body["came_from"]["url"].startswith("https://")
    assert body["old_district"] == "West Godavari"
    body = c.get("/api/v1/districts/history/eluru?old=krishna").json()
    assert body["old_district"] == "Krishna"
    for d in SEED["unsourced2022"]:
        b = c.get(f"/api/v1/districts/history/{d}").json()
        assert b["came_from"] is None and b["old_district"] is None and b["came_from_note"]


def test_a_2026_district_reads_its_parent_said_in_words():
    body = c.get("/api/v1/districts/history/markapuram").json()
    assert body["figures_for"] == "Prakasam" and "Prakasam" in body["why"]


def test_measure_endpoint_has_state_series_as_printed():
    body = c.get("/api/v1/districts/history/measure/rain_actual").json()
    assert any(r["state_series"] for r in body["readings"])
    assert c.get("/api/v1/districts/history/measure/nope").status_code == 404
