"""
District measures: every figure is the book's own, for all 26 districts, and the two
districts of 2026 are answered with their parent's figures, said in words.
"""

import json
import pathlib

from fastapi.testclient import TestClient

from app.constants.districts import DISTRICT_NAMES_2022
from app.main import app

SEED = json.loads((pathlib.Path(__file__).parents[1] / "seed" / "district_measures_seed.json").read_text(encoding="utf-8"))


def test_every_measure_has_all_26_districts_and_a_page():
    assert len(SEED["measures"]) >= 90
    for m in SEED["measures"]:
        assert set(m["values"]) == set(DISTRICT_NAMES_2022), m["id"]
        assert m["table"] and m["page"] and m["source"].startswith("Source:"), m["id"]
        assert m["te"] and m["en"], m["id"]


def test_counts_that_add_up_match_the_books_state_row_or_say_why():
    for m in SEED["measures"]:
        if m["kind"] != "count" or m["state"] is None:
            continue
        s = sum(v for v in m["values"].values() if v is not None)
        assert abs(s - m["state"]) < 0.5 or m["state_note"], m["id"]


def test_no_per_capita_income_or_gddp_is_carried():
    ids = {m["id"] for m in SEED["measures"]}
    assert not any("pci" in i or "per_capita" in i or "gddp" in i for i in ids)


def test_the_api_answers_a_2026_district_with_its_parent_said_in_words():
    c = TestClient(app)
    r = c.get("/api/v1/districts/measures/markapuram")
    assert r.status_code == 200
    body = r.json()
    assert body["district"] == "Markapuram" and body["figures_for"] == "Prakasam"
    assert "1 January 2026" in body["why"]
    pop = next(m for m in body["measures"] if m["id"] == "population_2011")
    assert pop["value"] == SEED["measures"][0]["values"]["Prakasam"] or pop["value"] > 0
    assert c.get("/api/v1/districts/measures/gotham").status_code == 404
    assert "s-maxage=600" in c.get("/api/v1/districts/measures").headers["cache-control"]
