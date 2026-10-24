"""
WHY THIS TEST EXISTS

Until October 2026 the departments page had revised estimates and spending for
two of the forty demands, read by hand, and some of those were net figures set
beside gross budget estimates, so plan and spending were measured two ways on
one chart. One was simply wrong: School Education's revised estimate for 2024-25
was Rs 23,152.10 crore where the book prints Rs 28,560.68 crore.

The seed is now written by scripts/read_budget_books.py from the books
themselves. These tests hold the seed to the rules that make it trustworthy:
every demand has every year, every figure carries its paper and page, totals are
the printed gross totals, two printed parts are never added into a total of our
own, and spending says how it compares with CAG's audited accounts.
"""
import json
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import pytest

SEED = json.loads((Path(__file__).resolve().parents[1] / "seed" / "departments_seed.json").read_text(encoding="utf-8"))
DEPTS = SEED["departments"]


def years(first, last):
    return ["%d-%02d" % (y, (y + 1) % 100) for y in range(first, last + 1)]


EXPECT = {"BE": years(2014, 2026), "RE": years(2014, 2025), "Actual": years(2014, 2024)}


def lakh(tok):
    if tok == "..":  # the books print nil as two dots (Religious Endowments recovers its whole gross in some years)
        return Decimal(0)
    neg = tok.startswith("-")
    t = tok.lstrip("-")
    if "," in t:
        a, b = t.split(",", 1)
        v = Decimal(a) * 100 + Decimal(b)
    else:
        v = Decimal(t)
    return -v if neg else v


def crore(printed):
    return float((lakh(printed) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def test_forty_demands():
    assert len(DEPTS) == 40
    assert len({d["demand_no"] for d in DEPTS}) == 40


@pytest.mark.parametrize("dep", DEPTS, ids=lambda d: d["demand_no"])
def test_every_demand_has_every_year_once(dep):
    for stage, ys in EXPECT.items():
        got = [r["year"] for r in dep["rows"] if r["stage"] == stage]
        assert sorted(got) == ys, (dep["demand_no"], stage)


@pytest.mark.parametrize("dep", DEPTS, ids=lambda d: d["demand_no"])
def test_every_revised_and_actual_figure_names_its_paper_and_page(dep):
    for r in dep["rows"]:
        if r["stage"] == "BE":
            continue
        assert r["source_url"].startswith("https://"), r
        assert isinstance(r["pdf_page"], int) and r["pdf_page"] > 0, r
        assert r["page"] and r["book"], r
        assert r["checks"], r


@pytest.mark.parametrize("dep", DEPTS, ids=lambda d: d["demand_no"])
def test_totals_are_the_printed_gross_figures(dep):
    for r in dep["rows"]:
        if r["stage"] == "BE" or r.get("split_type") != "revenue_capital":
            continue
        assert r["total_crore"] == crore(r["printed"]["gross"]), r
        if r["printed"].get("net"):
            assert r["net_crore"] == crore(r["printed"]["net"]), r
        # net = gross + recoveries (printed with a minus sign), allowing for rounding each to two decimals
        assert abs(r["total_crore"] + r["recoveries_crore"] - r["net_crore"]) <= 0.011, r


@pytest.mark.parametrize("dep", DEPTS, ids=lambda d: d["demand_no"])
def test_printed_parts_are_never_added_into_a_total(dep):
    for r in dep["rows"]:
        if r.get("split_type") in ("plan_nonplan", "cag_sections") and r["stage"] != "BE":
            if len(r.get("parts", [])) > 1:
                assert r["total_crore"] is None, r
            assert r.get("note"), r


@pytest.mark.parametrize("dep", DEPTS, ids=lambda d: d["demand_no"])
def test_spending_says_how_it_compares_with_cag(dep):
    for r in dep["rows"]:
        if r["stage"] == "Actual" and r["year"] != "2014-15":
            assert r["cag_check"]["result"] in ("matches", "close", "differs", "not compared", "CAG's file has no readable text"), r
            if r["cag_check"]["result"] in ("close", "differs"):
                assert "difference_crore" in r["cag_check"] and "cag_lakh" in r["cag_check"], r


def test_the_school_education_figure_that_was_wrong_is_now_the_printed_one():
    xii = next(d for d in DEPTS if d["demand_no"] == "XII")
    re_2425 = next(r for r in xii["rows"] if r["year"] == "2024-25" and r["stage"] == "RE")
    assert re_2425["total_crore"] == 28560.68
    assert re_2425["printed"]["gross"] == "28560,67.59"
    assert (re_2425["book"], re_2425["volume"], re_2425["pdf_page"]) == ("2025-26", "III/7", 8)


def test_revised_estimates_printed_after_the_year_ended_say_so():
    for d in DEPTS:
        for r in d["rows"]:
            if r["stage"] == "RE" and r["year"] in ("2018-19", "2023-24"):
                assert "after the year" in r.get("note", ""), (d["demand_no"], r["year"])


def test_2014_15_spending_says_cag_covers_two_periods():
    # CAG's 2014-15 book covers the undivided state from 1 April to 1 June 2014 as well as
    # the new state; a reader must not take it for the new state's ten months alone.
    for d in DEPTS:
        r = next(r for r in d["rows"] if r["year"] == "2014-15" and r["stage"] == "Actual")
        assert r.get("two_periods") is True and "1 April to 1 June 2014" in r["note"], d["demand_no"]


def test_tenure_keys_follow_the_financial_year():
    for d in DEPTS:
        for r in d["rows"]:
            y = int(r["year"][:4])
            assert r["tenure"] == ("tdp1" if y <= 2018 else "ysrcp" if y <= 2023 else "tdp2"), r
