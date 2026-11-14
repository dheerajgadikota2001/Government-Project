"""
A summit known only from a news report is shown with its label and never added to the state's own totals.

The 31st CII Partnership Summit (12 and 13 Nov 2026) is known so far from a PTI
report: 109 MoUs, Rs 9.02 lakh crore. The state has not published its own total.
These tests pin what the summits record and endpoint must keep true:
  - every summit says what kind of figure it carries, and a press figure names
    its publisher, its date and that it is not the state's statement
  - the per-government totals add only the state's own statements
  - a summit with no exact jobs figure says so instead of printing a number
"""

import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services import cache as cache_service

SEED = json.loads((Path(__file__).parent.parent / "seed" / "summits_seed.json").read_text(encoding="utf-8"))
KINDS = {"government_statement", "press_report"}


def test_every_summit_says_what_kind_of_figure_it_carries():
    for s in SEED["summits"]:
        assert s.get("figure_type") in KINDS, s["key"]
        assert s.get("source_url", "").startswith("https://"), s["key"]
        if s["figure_type"] == "press_report":
            for field in ("source_publisher", "source_date", "stated_by", "date_note"):
                assert s.get(field), (s["key"], field)
            assert "not yet published" in s["date_note"]


def test_a_missing_jobs_figure_is_explained_not_invented():
    for s in SEED["summits"]:
        if s.get("jobs") is None:
            assert s.get("jobs_note"), s["key"]


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_government_totals_leave_out_press_figures():
    cache_service.local_clear()
    await cache_service.cache_delete_pattern("*")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/api/v1/mous/summits")
    assert r.status_code == 200, r.text
    body = r.json()
    for key, t in body["by_tenure"].items():
        mine = [s for s in SEED["summits"] if s["tenure"] == key]
        official = [s for s in mine if s["figure_type"] == "government_statement"]
        a = t["announced"]
        assert a["summits"] == len(official)
        assert a["investment_crore"] == sum(s["investment_crore"] for s in official if s["investment_crore"])
        assert a["left_out_not_yet_stated_by_the_state"] == len(mine) - len(official)
    assert any(s["key"] == "ps2026" and s["figure_type"] == "press_report" for s in body["summits"])
