"""
WHY THIS TEST EXISTS

The coverage check of 24 Oct 2026 matched two publishers' own lists against our
register and found whole families missing: CAG's audited state accounts for
Andhra Pradesh (none listed) and the Finance Department's FRBM library and
earlier budget speeches (none of 63 files listed). Both are read now
(app/scrapers/cag_state_accounts.py, app/scrapers/ap_finance_library.py).

The fixture holds the listing blocks of those pages as saved that day. The
traps these tests pin down are the publishers' own:
  * CAG files the 2023-24 and 2022-23 Finance Accounts under a "2024 - 25"
    heading, and files 895 and 896 (Finance Accounts 2018-19, by their covers)
    under "2020 - 21";
  * CAG prints the 2014-15 Finance Accounts in two parts, the undivided state's
    1 April to 1 June 2014 and the new state's 2 June 2014 to 31 March 2015;
  * the Finance Department's link labelled "2023" opens the 2024-25 speech;
  * two FRBM rows link one file; two FRBM file names give the wrong year.
And the rules: nothing before 2014-15 is published, except the FRBM Act and
Rules, which still bind the state.
"""
import json
from collections import Counter
from pathlib import Path

import pytest

from app.scrapers.ap_finance_library import SPEECHES, frbm_title, parse_frbm, parse_speeches
from app.scrapers.cag_state_accounts import FIRST_YEAR, fiscal_year, month_year, parse, volume

FX = json.loads((Path(__file__).parent / "fixtures" / "state_accounts_and_frbm_pages.json").read_text(encoding="utf-8"))["pages"]


def kept(code, arch):
    return [e for e in parse(FX[f"{code}_{arch}"], code) if e["fy_start"] is not None and e["fy_start"] >= FIRST_YEAR]


def test_finance_accounts_run_from_2014_15_to_2024_25_with_no_gap_and_no_repeat():
    rows = kept("359", 0) + kept("359", 1)
    titles = [e["title"] for e in rows]
    assert len(titles) == len(set(titles)) == 20
    years = Counter(e["fy_start"] for e in rows)
    assert sorted(years) == list(range(2014, 2025))
    assert "Finance Accounts 2018-19, Volume I" in titles and "Finance Accounts 2018-19, Volume II" in titles


def test_the_year_comes_from_the_paper_not_the_heading_it_sits_under():
    by_url = {e["url"].rsplit("/", 1)[-1]: e for e in kept("359", 0) + kept("359", 1)}
    assert by_url["account-report-Finance-Accounts-Volume-I-2023-24-06734a342316227-73410782.pdf"]["fy_start"] == 2023
    assert by_url["account-report-Finance-Accounts-Volume-I-2023-24-06734a342316227-73410782.pdf"]["heading"] == "2024 - 25"
    assert by_url["account-report-895-05fc9e1fb386694-68811358.pdf"]["fy_start"] == 2018      # from its cover


def test_2014_15_keeps_both_periods_with_their_dates():
    t = sorted(e["title"] for e in kept("359", 1) if e["fy_start"] == 2014)
    assert t == ["Finance Accounts 2014-15 (1 April 14 to 1 June 14)", "Finance Accounts 2014-15 (2 June 14 to 31 March 15)"]


def test_appropriation_accounts_and_accounts_at_a_glance_from_2014_15():
    for code in ("358", "357"):
        rows = kept(code, 0) + kept(code, 1)
        assert sorted(e["fy_start"] for e in rows) == list(range(2014, 2025))
    older = [e for e in parse(FX["358_1"], "358") if e["fy_start"] < FIRST_YEAR]
    assert len(older) == 14          # 2000-01 to 2013-14: the undivided state's, not published


def test_monthly_key_indicators_belong_to_their_financial_year():
    rows = kept("360", 0)
    assert len(rows) == 67
    t = {e["title"]: e["fy_start"] for e in rows}
    assert t["Monthly Key Indicators, April 2026"] == 2026
    assert t["Monthly Key Indicators, March 2026"] == 2025
    assert "Monthly Key Indicators, March 2025 (provisional)" in t
    assert "Monthly Key Indicators, March 2024 (supplementary)" in t
    assert "Monthly Key Indicators, July 2025, revised" in t and "Monthly Key Indicators, July 2025" in t


@pytest.mark.parametrize("texts,start", [(("Finance Accounts 2019-20 Volume -I",), 2019),
                                         (("x", "AP_Finance_Accounts_2015_16.pdf"), 2015),
                                         (("Appropriation-Accounts-2020-2021",), 2020),
                                         (("2023 - 24",), 2023), (("Vol-I",), None), (("2019-21",), None)])
def test_year_pairs(texts, start):
    assert fiscal_year(*texts) == start


def test_months_and_volumes():
    assert month_year("March(Pre), 2025") == (3, 2025) and month_year("April, 2026") == (4, 2026)
    assert volume("FIN-ACNTS_Vol_2.pdf") == "II" and volume("Finance Accounts Vo II") is None
    assert volume("account-report-Finance-Accounts-Volume-II-2024-25.pdf") == "II"


def test_frbm_papers_from_2014_15_and_the_laws_that_still_apply():
    rows, older = parse_frbm(FX["frbmreport"])
    assert len(rows) == 33 and older == 15
    assert sum(e["kind"] == "law" for e in rows) == 4
    titles = [e["title"] for e in rows]
    assert len(set(titles)) == len(titles)
    assert "FRBM statement of fiscal policy for 2019-20, laid in July 2019" in titles   # file name says 2018-19
    assert "FRBM statement of fiscal policy for 2024-25, laid in November 2024" in titles
    assert "FRBM quarterly review, third quarter of 2025-26" in titles


def test_frbm_titles():
    assert frbm_title("Statement on Quarterly Review ... at the end of the First quarter of financial year 2024-25",
                      "FRBM_1st_Qtr_24-25.pdf") == ("FRBM quarterly review, first quarter of 2024-25", 2024)


def test_speeches_take_their_year_from_the_file_and_leave_out_the_undivided_state():
    rows, left, unknown = parse_speeches(FX["previous"])
    assert unknown == [] and left == 4 and len(rows) == 11
    by = {e["url"].rsplit("uploads/", 1)[-1]: e for e in rows}
    assert by["SpeechEnglish.pdf"]["title"] == "Budget speech 2024-25 (English)"
    assert "labels this link '2023'" in by["SpeechEnglish.pdf"]["note"]
    assert "Previous/FM English Speech.pdf" not in by          # Feb 2014 vote on account, undivided state
    assert sum(1 for v in SPEECHES.values() if v[0] is None) == 4


def test_a_speech_link_the_table_does_not_know_is_saved_with_its_label_and_says_so():
    html = '<table><tr><td><a href="https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/Previous/New.pdf">2026</a></td></tr></table>'
    rows, left, unknown = parse_speeches(html)
    assert len(unknown) == 1 and rows[0]["fy_start"] == 2026 and "not yet checked" in rows[0]["note"]
