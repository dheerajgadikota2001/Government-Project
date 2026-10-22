"""
Jobs and prices: the seed says what MoSPI printed, and the build refuses what it should.

Three kinds of test, none needing a database or the network:

1. The committed seed against the printed releases. Values read by hand from the
   PLFS Quarterly Bulletin April-June 2026 (released 10 Aug 2026, Detailed Tables 2
   and 3) and the CPI press release for September 2026 (released 12 Oct 2026,
   Annexure III). If MoSPI's service and its own documents ever disagree, this fails.
2. The gates, fed rows that are wrong in the ways real data goes wrong.
3. The client, against a fake server: it retries a reset, and it never turns an
   error the server states into an empty answer.
"""

import copy
import json
import pathlib
from datetime import date

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.jobs_prices import GateFailure, build_seed, validate
from app.services.mospi_data import MospiClient, MospiError

SEED = json.loads((pathlib.Path(__file__).parents[1] / "seed" / "jobs_prices_seed.json").read_text(encoding="utf-8"))


def job(measure, sex, area, year=2026, quarter="Apr-Jun", place="andhra_pradesh"):
    return next(p["value"] for p in SEED["jobs"]["points"]
                if (p["measure"], p["sex"], p["area"], p["year"], p["quarter"], p["place"]) == (measure, sex, area, year, quarter, place))


def price(area, year=2026, month=9, measure="general", place="andhra_pradesh"):
    return next(p for p in SEED["prices"]["points"]
                if (p["measure"], p["area"], p["year"], p["month"], p["place"]) == (measure, area, year, month, place))


# Andhra Pradesh, April-June 2026, age 15+, current weekly status, as printed.
PRINTED_PLFS = {
    ("lfpr", "male"): (78.6, 76.2, 77.7), ("lfpr", "female"): (44.6, 30.5, 39.6), ("lfpr", "person"): (60.6, 51.6, 57.4),
    ("wpr", "male"): (73.4, 71.5, 72.8), ("wpr", "female"): (40.8, 27.1, 35.9), ("wpr", "person"): (56.1, 47.6, 53.1),
}


@pytest.mark.parametrize("measure,sex", sorted(PRINTED_PLFS))
def test_jobs_match_the_printed_bulletin(measure, sex):
    rural, urban, total = PRINTED_PLFS[(measure, sex)]
    assert (job(measure, sex, "rural"), job(measure, sex, "urban"), job(measure, sex, "total")) == (rural, urban, total)


def test_prices_match_the_printed_release():
    # "2. Andhra Pradesh 108.82 108.65 108.75 6.63 5.74 6.29", Annexure III, provisional
    assert [(price(a)["index"], price(a)["inflation"]) for a in ("rural", "urban", "total")] == [
        (108.82, 6.63), (108.65, 5.74), (108.75, 6.29)]


def test_newest_month_is_provisional_and_only_that_month():
    newest = max((p["year"], p["month"]) for p in SEED["prices"]["points"])
    for p in SEED["prices"]["points"]:
        assert p["stage"] == ("provisional" if (p["year"], p["month"]) == newest else "final"), p


def test_every_value_names_its_source_and_the_source_exists():
    for p in SEED["jobs"]["points"] + SEED["prices"]["points"]:
        assert p["source"] in SEED["sources"], p
    for s in SEED["sources"].values():
        assert s.get("url") or s.get("endpoint")


def test_the_committed_seed_passes_its_own_gates():
    assert validate(SEED, SEED) == []


# ---------------------------------------------------------------- the gates

def rows_from_seed():
    """The seed turned back into MoSPI-shaped rows, so the gates can be fed realistic input."""
    ind = {"lfpr": "LFPR (Labour Force Participation Rate, in per cent)", "wpr": "WPR (Worker Population Ratio, in per cent)",
           "ur": "UR (Unemployment Rate, in per cent)"}
    area_j = {"rural": "rural", "urban": "urban", "total": "rural + urban"}
    area_p = {"rural": "Rural", "urban": "Urban", "total": "Combined"}
    place = {"andhra_pradesh": "Andhra Pradesh", "all_india": "All India"}
    months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    plfs = [{"indicator": ind[p["measure"]], "state": place[p["place"]], "year": str(p["year"]), "quarter": p["quarter"],
             "gender": p["sex"], "sector": area_j[p["area"]], "value": str(p["value"])} for p in SEED["jobs"]["points"]]
    cpi = [{"division": {"general": "CPI (General)", "food": "Food and beverages"}[p["measure"]], "state": place[p["place"]],
            "year": str(p["year"]), "month": months[p["month"] - 1], "sector": area_p[p["area"]],
            "index": str(p["index"]), "inflation": "" if p["inflation"] is None else str(p["inflation"])} for p in SEED["prices"]["points"]]
    return plfs, cpi


def test_rebuilding_from_the_same_rows_gives_the_same_seed():
    plfs, cpi = rows_from_seed()
    again = build_seed(plfs, cpi, read_on=date.fromisoformat(SEED["read_on"]))
    assert again["jobs"]["points"] == SEED["jobs"]["points"] and again["prices"]["points"] == SEED["prices"]["points"]


def test_a_value_that_is_not_a_number_is_refused():
    # Found in MoSPI's service on 19 Oct 2026: All India, female, urban LFPR, July-September 2020, served as "20J".
    plfs, cpi = rows_from_seed()
    plfs[0]["value"] = "20J"
    with pytest.raises(GateFailure, match="not a number"):
        build_seed(plfs, cpi, read_on=date(2026, 10, 19))


def test_a_rate_outside_0_to_100_is_refused():
    seed = copy.deepcopy(SEED)
    seed["jobs"]["points"][0]["value"] = 101.0
    with pytest.raises(GateFailure, match="percentage"):
        validate(seed)


def test_a_missing_cell_in_the_newest_quarter_is_refused():
    seed = copy.deepcopy(SEED)
    seed["jobs"]["points"] = [p for p in seed["jobs"]["points"] if not (
        p["place"] == "andhra_pradesh" and (p["year"], p["quarter"]) == (2026, "Apr-Jun") and p["sex"] == "female" and p["area"] == "urban")]
    with pytest.raises(GateFailure, match="newest quarter"):
        validate(seed)


def test_unemployment_that_disagrees_with_the_other_two_rates_is_refused():
    # A row from the wrong table looks like this: plausible on its own, impossible beside LFPR and WPR.
    seed = copy.deepcopy(SEED)
    for p in seed["jobs"]["points"]:
        if (p["measure"], p["place"], p["year"], p["quarter"], p["sex"], p["area"]) == ("ur", "andhra_pradesh", 2026, "Apr-Jun", "person", "total"):
            p["value"] = 9.4
    with pytest.raises(GateFailure, match="does not agree"):
        validate(seed)


def test_a_published_value_may_not_disappear():
    shorter = copy.deepcopy(SEED)
    shorter["prices"]["points"] = shorter["prices"]["points"][1:]
    with pytest.raises(GateFailure, match="disappear"):
        validate(shorter, SEED)


def test_a_revised_value_is_named_not_hidden():
    revised = copy.deepcopy(SEED)
    revised["jobs"]["points"][0]["value"] = round(revised["jobs"]["points"][0]["value"] + 0.1, 1)
    notes = validate(revised, SEED)
    assert any("changed from" in n for n in notes)


def test_two_provisional_months_are_refused():
    seed = copy.deepcopy(SEED)
    for p in seed["prices"]["points"]:
        if (p["year"], p["month"]) == (2026, 8):
            p["stage"] = "provisional"
    with pytest.raises(GateFailure, match="provisional"):
        validate(seed)


# ---------------------------------------------------------------- the client

def fake_server(script):
    """A stand-in for mcp.mospi.gov.in. `script` decides each tools/call answer in turn."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body.get("method") == "initialize":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {}}, headers={"mcp-session-id": "s1"})
        if body.get("method") == "notifications/initialized":
            return httpx.Response(202)
        calls["n"] += 1
        return script(calls["n"], request)
    return httpx.MockTransport(handler)


def sse(payload: dict) -> httpx.Response:
    return httpx.Response(200, text="event: message\ndata: " + json.dumps({"jsonrpc": "2.0", "id": 2, "result": payload}) + "\n\n",
                          headers={"content-type": "text/event-stream"})


def test_client_repeats_a_reset_and_then_reads_the_data():
    def script(n, request):
        if n == 1:
            raise httpx.ConnectError("Connection reset by peer", request=request)
        return sse({"structuredContent": {"data": [{"value": "7.4"}], "meta_data": {"totalPages": 1}}})
    client = MospiClient(transport=fake_server(script), sleep=lambda s: None)
    assert client.rows("PLFS", {"indicator_code": 3}) == [{"value": "7.4"}]
    assert client.retries == 1


def test_client_never_turns_a_stated_error_into_no_data():
    # How MoSPI's server reports an upstream 400: a normal 200 response with isError set.
    def script(n, request):
        return sse({"isError": True, "structuredContent": {"error": "400 Client Error: Bad Request"}})
    client = MospiClient(transport=fake_server(script), sleep=lambda s: None)
    with pytest.raises(MospiError, match="400"):
        client.rows("PLFS", {"indicator_code": 3})
    assert client.retries == 0, "a stated error is not retried: asking again gets the same answer"


def test_client_follows_every_page():
    def script(n, request):
        page = json.loads(request.content)["params"]["arguments"]["filters"]["page"]
        return sse({"structuredContent": {"data": [{"page": page}], "meta_data": {"totalPages": 3}}})
    client = MospiClient(transport=fake_server(script), sleep=lambda s: None)
    assert [r["page"] for r in client.rows("CPI", {})] == ["1", "2", "3"]


# ---------------------------------------------------------------- the endpoint

@pytest.mark.asyncio
async def test_endpoint_serves_the_seed_as_it_is():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/v1/jobs-prices/")
    assert r.status_code == 200
    body = r.json()
    assert body["counts"] == SEED["counts"]
    assert body["prices"]["points"][-1] == SEED["prices"]["points"][-1]
