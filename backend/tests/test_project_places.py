"""
Project places: an official paper's district is shown as printed, and put on today's map
only when the rules in app/services/project_places.py say it is safe.

The failure these tests guard against is a district that looks sourced and is wrong.
Polavaram's dam was "in West Godavari" in 2018 and is in Eluru today. A forest clearance
of December 2022 still says "Guntur District" for a village that moved to Palnadu in April
2022. Both papers are real and correct for their own map; placing them on today's map by
name alone would mislead.
"""

import copy
import json
import pathlib

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert

from app.services import project_places as pp

ROOT = pathlib.Path(__file__).parents[1]
SEED = json.loads((ROOT / "seed" / "project_place_claims_seed.json").read_text(encoding="utf-8"))


def claim(district, date, meaning="located", url="https://cag.gov.in/x.pdf", quote=None, places=None, ext="T1", date_note=None):
    return {"project": {"source_portal": "TEST", "external_id": ext, "title_starts": "Test"},
            "district_as_printed": district, "meaning": meaning, "places_as_printed": places or [],
            "source": {"url": url, "title": "A paper", "date": date, "date_note": date_note},
            "quote": quote or f"the works are in {district} district", "note": None}


def today(c, others=(), index=None):
    return pp.place_today(c, [c, *others], index)


# ---------------------------------------------------------------- the committed seed

def test_the_committed_seed_passes_its_gates():
    pp.validate(SEED)


def test_no_reading_comes_from_a_newspaper_or_a_politician():
    # Lok Sabha "Rule 377" matters are a member's own statement, not the government's answer.
    for c in SEED["claims"]:
        assert pp._official(c["source"]["url"]), c
        assert "rule 377" not in c["source"]["title"].lower(), c


def test_every_project_in_the_seed_is_keyed_and_checked_by_title():
    keys = {(c["project"]["source_portal"], c["project"]["external_id"]) for c in SEED["claims"]}
    assert len(keys) == 116  # 42 from papers found one by one, 74 roads from Lok Sabha USQ 1819
    assert all(c["project"]["title_starts"] for c in SEED["claims"])


# ---------------------------------------------------------------- the gates

@pytest.mark.parametrize("change,message", [
    (lambda c: c["source"].update(url="https://www.deccanchronicle.com/x"), "not an official host"),
    (lambda c: c.update(quote="the works are in the state"), "does not contain"),
    (lambda c: c["source"].update(date=None, date_note=None), "undated source"),
    (lambda c: c.update(meaning="near"), "meaning must be"),
    (lambda c: c["source"].update(date="12/02/2020"), "not ISO"),
])
def test_a_bad_reading_is_refused(change, message):
    seed = copy.deepcopy(SEED)
    change(seed["claims"][0])
    with pytest.raises(pp.PlaceGateFailure, match=message):
        pp.validate(seed)


def test_the_same_reading_twice_is_refused():
    seed = copy.deepcopy(SEED)
    seed["claims"].append(copy.deepcopy(seed["claims"][0]))
    with pytest.raises(pp.PlaceGateFailure, match="twice"):
        pp.validate(seed)


# ---------------------------------------------------------------- the rules

def test_a_paper_written_under_todays_map_is_placed():
    t = today(claim("Vizianagaram", "2026-03-31"))
    assert (t["district"], t["how"]) == ("Vizianagaram", "paper_after_2026")


def test_a_2022_to_2025_paper_is_placed_when_it_names_a_district_drawn_in_2022():
    tirupati, chittoor = claim("Tirupati", "2025-09-10"), claim("Chittoor", "2025-09-10")
    assert today(chittoor, [tirupati])["district"] == "Chittoor"


def test_a_2022_paper_with_only_old_names_is_not_placed():
    # Varikapudisela: "Veldurthi Mandal, Guntur District", 30 Dec 2022. Veldurthi is in Palnadu.
    t = today(claim("Guntur District", "2022-12-30", places=[{"kind": "mandal", "name": "Veldurthi"}]))
    assert t["district"] is None and "existed before 2022" in t["why"]


def test_a_district_split_in_2026_is_not_placed_from_an_older_paper():
    t = today(claim("Prakasam", "2024-02-08"), [claim("NTR", "2024-02-08")])
    assert t["district"] is None and "split in January 2026" in t["why"]


def test_a_paper_from_before_2022_is_shown_as_printed_with_its_year():
    t = today(claim("West Godavari", "2018"))
    assert t["district"] is None and "2018" in t["why"]


def test_an_undated_page_is_not_placed():
    t = today(claim("Kurnool District", None, date_note="Page undated"))
    assert t["district"] is None and "undated" in t["why"]


def test_the_place_directory_places_a_mandal_and_says_when_the_paper_disagrees():
    index = {"mandals": {"veldurthi": ["PALNADU"]}, "villages": {}}
    t = today(claim("Guntur District", "2022-12-30", places=[{"kind": "mandal", "name": "Veldurthi"}]), index=index)
    assert t["district"] == "Palnadu" and t["how"] == "place_directory"
    assert "The paper itself says Guntur District" in t["why"]


def test_a_place_name_found_in_two_districts_is_never_used():
    index = {"mandals": {}, "villages": {"malkapuram": ["Visakhapatnam", "Krishna"]}}
    t = today(claim("Visakhapatnam", "2019", places=[{"kind": "village", "name": "Malkapuram"}]), index=index)
    assert t["district"] is None


def test_the_seeds_own_readings_land_where_expected():
    r = pp.readings_by_project(SEED, None)

    def today_of(ext):
        return {x["district_as_printed"]: x["today"] for x in r[("MOSPI_IPMD", ext)]}

    # papers written under the 2022 or 2026 map
    assert today_of("617210")["Tirupati"]["district"] == "Tirupati"
    assert today_of("613008")["Vizianagaram"]["district"] == "Vizianagaram"
    # Pamarru-Akiveedu (USQ 1819 row 12): "krishna" alone proves nothing, but the paper's own
    # District column uses the 2022 map, so all three rows are placed
    pamarru = [x for k, rows in r.items() for x in rows if "Sl. 12:" in x["quote"]]
    assert {x["today"]["district"] for x in pamarru} == {"Krishna", "Eluru", "West Godavari"}
    # Rampachodavaram-Koyyuru (row 22) is in ASR as printed in 2024; ASR was split in 2026
    asr = [x for k, rows in r.items() for x in rows if "Sl. 22:" in x["quote"]][0]
    assert asr["today"]["district"] is None and "split in January 2026" in asr["today"]["why"]
    # a misprint is read by the paper's own spelling elsewhere (row 17 prints "Palandu")
    palandu = [x for k, rows in r.items() for x in rows if "Sl. 17:" in x["quote"]][0]
    assert palandu["district_as_printed"] == "Palandu" and palandu["today"]["district"] == "Palnadu"
    # a stretch the paper puts in Tamil Nadu is shown, and never placed in Andhra Pradesh
    tn = [x for k, rows in r.items() for x in rows if x["district_as_printed"] == "Thiruvallur"]
    assert tn and all(x["today"]["district"] is None and "Tamil Nadu" in x["today"]["why"] for x in tn)
    # Polavaram's dam, "West Godavari" in 2018, stays as printed
    polavaram = r[("MOSPI_IPMD", "701415")][0]
    assert polavaram["district_as_printed"] == "West Godavari" and polavaram["today"]["district"] is None


def test_paper_wide_map_evidence_must_name_a_2022_district():
    seed = copy.deepcopy(SEED)
    c = next(c for c in seed["claims"] if c["source"].get("map_2022_evidence"))
    c["source"]["map_2022_evidence"] = "The table lists Krishna and Guntur."
    with pytest.raises(pp.PlaceGateFailure, match="map_2022_evidence"):
        pp.validate(seed)


# ---------------------------------------------------------------- the link writer

def test_links_follow_the_meaning_and_wait_for_districts_the_site_does_not_list():
    import importlib.util
    spec = importlib.util.spec_from_file_location("apply_pp", ROOT / "scripts" / "apply_project_places.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    rows = {("TEST", "T1"): [
        {"district_as_printed": "Tirupati", "meaning": "route", "quote": "q", "source": {"url": "https://pib.gov.in/x", "title": "t", "date": "2025-01-01"},
         "today": {"district": "Tirupati", "how": "x", "why": "y"}},
        {"district_as_printed": "Markapuram", "meaning": "located", "quote": "q", "source": {"url": "https://pib.gov.in/x", "title": "t", "date": "2026-02-01"},
         "today": {"district": "Markapuram", "how": "x", "why": "y"}},
        {"district_as_printed": "Gotham", "meaning": "served", "quote": "q", "source": {"url": "https://pib.gov.in/x", "title": "t", "date": "2026-02-01"},
         "today": {"district": "Gotham", "how": "x", "why": "y"}},
    ], ("TEST", "MISSING"): []}
    links, problems, waiting = mod.plan_links(rows, {("TEST", "T1"): {"id": 7, "title": "Test"}})
    # Markapuram is one of the 28 since the move; a district the site does not list waits
    assert [(l["district"], l["role"]) for l in links] == [("Tirupati", "spans"), ("Markapuram", "primary")]
    assert waiting == ["TEST T1: Gotham"]
    assert any("MISSING: no such project" in p for p in problems)


# ---------------------------------------------------------------- the place index builder

def test_the_place_index_reads_the_directorys_html_and_refuses_what_it_should():
    import importlib.util
    spec = importlib.util.spec_from_file_location("bpi", ROOT / "scripts" / "build_place_index.py")
    bpi = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bpi)
    head = "<tr><th>S.No.</th><th>State Name (In English)</th><th>District Name (In English)</th><th>Sub-District Name (In English)</th><th>Village Name (In English)</th></tr>"
    body = "".join(f"<tr><td>{i}</td><td>ANDHRA PRADESH</td><td>District {i}</td><td>Mandal {i}</td><td>Village {i % 5}</td></tr>" for i in range(28))
    path = ROOT / "tests" / "fixtures" / "_lgd_test.html"
    path.parent.mkdir(exist_ok=True)
    path.write_text(f"<html><table>{head}{body}</table></html>", encoding="utf-8")
    try:
        index = bpi.build(bpi.rows_from(str(path)))
        assert len(index["districts"]) == 28
        assert index["mandals"]["mandal 3"] == ["District 3"]
        # "Village 1" occurs in six districts: it stays in the index, and the resolver never uses it
        assert len(index["villages"]["village 1"]) == 6
        path.write_bytes(b"\xd0\xcf\x11\xe0binary excel")
        with pytest.raises(ValueError, match="binary Excel"):
            bpi.rows_from(str(path))
    finally:
        path.unlink(missing_ok=True)


# ---------------------------------------------------------------- the endpoint

@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_the_register_serves_readings_as_printed_with_todays_district():
    from app.database import get_db_context
    from app.main import app
    from app.models.project import Project
    async with get_db_context() as db:
        await db.execute(delete(Project).where(Project.source_portal == "MOSPI_IPMD", Project.external_id == "617210"))
        pid = (await db.execute(insert(Project).values(
            title="Tirupati-Pakala-Katpadi Doubling 104.39 Km", source_portal="MOSPI_IPMD", external_id="617210").returning(Project.id))).scalar_one()
        await db.commit()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/v1/projects/register/{pid}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["places"] == {"as_printed": ["Tirupati", "Chittoor"], "today": ["Chittoor", "Tirupati"], "readings": 2}
        assert {x["district_as_printed"] for x in body["place_readings"]} == {"Tirupati", "Chittoor"}
        assert all(x["source"]["url"].startswith("https://egazette.gov.in/") for x in body["place_readings"])
    finally:
        async with get_db_context() as db:
            await db.execute(delete(Project).where(Project.id == pid))
            await db.commit()
