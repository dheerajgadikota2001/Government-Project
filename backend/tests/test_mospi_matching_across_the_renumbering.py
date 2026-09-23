"""
WHY THIS TEST EXISTS

PAIMANA renumbered every project and reworded most names. Matching by code
and exact title found five rows in a hundred; the other 95 became duplicates
in the register. The matcher in app/scrapers/mospi_match.py proposes the
rest on evidence. These tests pin what counts as evidence, what does not,
and that on the real June 2025 and July 2026 rows the matcher proposes
exactly the pairs the reviewed map records as "matched" and nothing that
contradicts a reviewed pair.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from app.scrapers.mospi_match import (
    Candidate, Lexicon, assign, best_match, close, different_stretch, lexicon_for, score, tokens, unit,
)

FIXTURES = Path(__file__).parent / "fixtures"


def m(y, mo):
    return datetime(y, mo, 1, tzinfo=timezone.utc)


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))["rows"]


def dt(s):
    return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc) if s else None


def candidates(rows):
    return [Candidate(key=r["code"], title=r["name"], approval=dt(r["approval"]),
                      cost=r["cost_revised"] or r["cost_original"], progress=r["progress"], ptype=r["ptype"])
            for r in rows]


def report_rows(rows):
    return ([{"name": r["name"], "approval": dt(r["approval"]), "cost_original": r["cost_original"],
              "cost": r["cost_revised"], "progress": r["progress"]} for r in rows],
            [r["ptype"] for r in rows])


# What the tokeniser sees

def test_tokens_split_glued_numbers_join_chainages_and_read_package_numbers():
    # The PDF glues "Vijayawada19.50 km"; both editions must yield the same place.
    assert "vijayawada" in tokens("Vijayawada19.50 km & Kazipet10.65 km -Byepass line")
    # "228+000", "228.000" and PAIMANA's "228000" are one chainage.
    for spelling in ("CH. 228+000", "Km 228.000", "Ch. 228000", "km 228/000"):
        assert "228000" in tokens(spelling), spelling
    # Package and phase numbers, however written, become one token each.
    assert unit(tokens("(PKG 2)")) == "pkg2"
    assert unit(tokens("Package-08")) == "pkg8"
    assert unit(tokens("176000Package-07")) == "pkg7"
    assert unit(tokens("Pkg-III")) == "pkg3"
    assert "phase2" in tokens("Bangalore Chennai Expressway Phase-II Pkg-I")
    # Filler carries no identity.
    assert not tokens("of the and to in km package phase")


def test_cost_must_agree_to_the_paisa():
    assert close(265.91, 265.91)
    assert close(34012.0, 34012.5)          # a re-rounded figure, 0.0015 per cent
    assert close(1318.57, 1318.59)          # two paise on 1,318 crore
    assert not close(907.76, 909.19)        # two different NH-544D packages
    assert not close(956.14, 956.40)        # two different NH-544G packages
    assert not close(2499.71, 2500.00)      # 0.012 per cent is still a different number
    assert not close(None, 1.0) and not close(0.0, 0.0)


def test_adjacent_stretches_are_different_works():
    a = tokens("Rehabilitation and upgradation from Km 22300 to 58635 of MudireddyPalle to Kadapa/Nellore Border")
    b = tokens("NH 167 B KADAPA NELLORE BORDER TO CSPURAM I.E. FROM KM 58.635 TO KM 99.409")
    assert different_stretch(a, b)
    # Existing and design chainages printed together still agree with the
    # design-only spelling when one end matches.
    c = tokens("4 LANING FROM EXISTING KM 39.380 (DESIGN CH. 37.000) TO KM 74.450 (DESIGN CH. 69.000)")
    d = tokens("4 Laning of NH-544D from Km 37.000 to km 69.000 of Muchukota- Bugga section Pkg-2")
    assert not different_stretch(c, d)
    # One chainage on a side is not a stretch.
    assert not different_stretch(tokens("from km 14.900"), tokens("from Km 22300 to 58635"))


# What counts as a match

NEW_KADAPA = {
    "name": "Construction of New Domestic Terminal Building Building and miscellaneous works "
            "including maintenance, operations and AICMC at Kadapa Airport",
    "approval": m(2023, 3), "cost_original": 265.91, "cost": 265.91, "progress": 80.0,
}
OLD_KADAPA = Candidate(key="old", title="KADAPPA AIRPORT- CONSTRUCTION OF NEW DOMESTIC TERMINAL BUILDING AND "
                                         "MISCELLANEOUS WORKS INCLUDING MAINTENANCE",
                       approval=m(2023, 3), cost=265.91, progress=29.0, ptype="airports")
OLD_RAJAHMUNDRY = Candidate(key="raj", title="RAJAHMUNDRY AIRPORT: CONSTRUCTION OF NEW DOMESTIC TERMINAL BUILDING "
                                              "AND MISCELLANEOUS WORKS",
                            approval=m(2022, 12), cost=347.15, progress=46.0, ptype="airports")


def lex_of(*rows):
    return Lexicon([tokens(r["name"]) if isinstance(r, dict) else r.toks for r in rows])


def test_a_reworded_name_matches_on_cost_month_and_what_is_left_of_the_name():
    lex = lex_of(NEW_KADAPA, OLD_KADAPA, OLD_RAJAHMUNDRY)
    got = best_match(NEW_KADAPA, [OLD_KADAPA, OLD_RAJAHMUNDRY], "airports", lex)
    assert got and got.candidate.key == "old"
    assert "approved 03/2023" in got.why and "original cost 265.91" in got.why


def test_a_name_alone_in_another_month_at_another_cost_is_not_enough():
    new = {**NEW_KADAPA, "approval": m(2021, 1), "cost_original": 999.0, "cost": 999.0}
    lex = lex_of(new, OLD_KADAPA, OLD_RAJAHMUNDRY)
    assert best_match(new, [OLD_KADAPA, OLD_RAJAHMUNDRY], "airports", lex) is None


def test_a_road_never_matches_a_railway():
    lex = lex_of(NEW_KADAPA, OLD_KADAPA)
    assert score(NEW_KADAPA, OLD_KADAPA, "railways", lex).score < 0


def test_progress_cannot_run_backwards():
    old = Candidate(key="x", title="Some bridge at Kovvur", approval=m(2020, 1), cost=100.0, progress=95.0, ptype="roads")
    new = {"name": "Some bridge at Kovvur", "approval": m(2020, 1), "cost_original": 100.0, "cost": 100.0, "progress": 40.0}
    lex = lex_of(new, old)
    assert best_match(new, [old], "roads", lex) is None
    assert "progress would fall" in score(new, old, "roads", lex).why


def test_sibling_packages_are_told_apart_by_their_number():
    pkg2 = Candidate(key=2, title="6L JAKKUVA ? KORLAM SECTION OF NH-130CD ROAD FROM KM 396.800 TO KM 421.100 (PKG 2)",
                     approval=m(2021, 2), cost=768.0, progress=98.84, ptype="roads")
    pkg4 = Candidate(key=4, title="6L KANTAKAPALLE ? SABBAVARAM SECTION OF NH-130CD ROAD FROM KM 445.100 TO KM 464.662 (PKG-4)",
                     approval=m(2021, 2), cost=924.0, progress=76.13, ptype="roads")
    same = {"name": "6L Jakkuva Korlam Section of NH-130CD Road from km 396.800 to km 421.100 Pkg 2",
            "approval": m(2021, 2), "cost_original": 840.51, "cost": 840.51, "progress": 99.83}
    # A package the register has never seen must not land on its neighbours.
    new3 = {"name": "6L Korlam-Kantakapalle Section of NH-130CD Road from Km 421.100 to Km 445.100 Pkg-3",
            "approval": m(2021, 2), "cost_original": 1112.7, "cost": 1127.63, "progress": 99.5}
    out = assign([same, new3], [pkg2, pkg4], ["roads", "roads"])
    assert out[0].candidate.key == 2 and "same package (pkg2)" in out[0].why
    assert 1 not in out


def test_one_register_row_is_claimed_by_the_stronger_report_row_only():
    old = Candidate(key="only", title="4 LANING OF NH 544D FROM EXISTING KM 346.300 OF NH 44 (DESIGN CHAINAGE KM 0.000) "
                                       "TO KM 39.380 (DESIGN CH. 37.000)",
                    approval=m(2022, 10), cost=907.76, progress=84.29, ptype="roads")
    right = {"name": "4 Laning of NH-544D from Km 0.000 to km 37.000 of Anantapur- Muchukota section Pkg-1",
             "approval": m(2022, 10), "cost_original": 907.76, "cost": 905.98, "progress": 92.34}
    lookalike = {"name": "4-laning of Puttaparthi-Koduru Section of NH-342",
                 "approval": m(2022, 10), "cost_original": 1318.59, "cost": 909.19, "progress": 90.19}
    out = assign([lookalike, right], [old], ["roads", "roads"])
    assert list(out) == [1] and out[1].candidate.key == "only"


# The real rows

def test_the_real_rows_reproduce_the_reviewed_map_and_contradict_none_of_it():
    june, july = load("mospi_ap_rows_june2025.json"), load("mospi_ap_rows_july2026.json")
    doc = json.loads((Path("app/scrapers/mospi_renumbering.json")).read_text(encoding="utf-8"))
    reviewed = {p["new"]: p["old"] for p in doc["pairs"]}
    matched = {p["new"]: p["old"] for p in doc["pairs"] if p["how"] == "matched"}

    news, types = report_rows(july)
    out = assign(news, candidates(june), types)
    proposed = {july[i]["code"]: mt.candidate.key for i, mt in out.items()}

    assert proposed == matched, "tuning changed the proposals: re-review the map before changing it"
    for new, old in proposed.items():
        assert reviewed[new] == old
    # A reviewed pair the matcher cannot see is still a pair (it is in the
    # map by hand), and the matcher must not have paired either code elsewhere.
    for new, old in reviewed.items():
        assert proposed.get(new, old) == old
        assert old not in {o for n, o in proposed.items() if n != new}


def test_the_lexicon_weighs_a_place_name_over_boilerplate():
    june, july = load("mospi_ap_rows_june2025.json"), load("mospi_ap_rows_july2026.json")
    news, _ = report_rows(july)
    lex = lexicon_for(news, candidates(june))
    assert lex.weight("kodur") > lex.weight("highway") > lex.weight("nh")
