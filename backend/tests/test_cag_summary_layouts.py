"""
WHY THIS TEST EXISTS

The live departments page said CAG's 2018-19 accounts print Demand II's charged
spending as Rs 9.53 crore. CAG's page prints a grant of 9,53,18 thousand, spending
nil ("…") and a saving of 9,53,18. In that book the nil marks are printed slightly
raised, so the text layer puts them on the line above, and the reader took the
saving for the spending. The arithmetic check passed anyway (grant minus saving
looked like a nil saving), so nothing stopped it. Seven rows of 2018-19 were read
this way (II, V, XI, XIX, XXX, XXXIV, XXXVIII); no other year was affected.

In the same book grant XXVI's number is printed two lines below its figures,
so its row was credited to XXV.

The lines below are pdftotext's, from CAG's 2018-19 file, page 10 and page 13
(reported by Dheeraj on 24 Oct 2026 from the live site, checked against the page).
"""
from app.scrapers.appropriation_accounts import read_summary

HEAD = "                                       SUMMARY OF APPROPRIATION ACCOUNTS-2018-19\n"

PAGE_10 = HEAD + "\n".join([
    "                  State Legislature                                                                                            …",
    "12       I                                 Revenue    Voted          1,26,39,01    1,07,05,16           19,33,85",
    "                                                                                                                               …",
    "                                                      Charged          3,61,86       2,61,94              99,92",
    "                                                                                                                               …",
    "16       II       Governor and             Revenue    Voted           26,25,85      20,71,58             5,54,27",
    "                                                                                          …                                    …",
    "                  Council of Ministers                Charged          9,53,18                           9,53,18",
    "",
    "                  Administration of Justice Revenue                                                                            …",
    "19       III                                          Voted          8,00,72,26    6,86,87,03         1,13,85,23",
])

PAGE_13 = HEAD + "\n".join([
    "                  Women, Child and                                                                                              …",
    "249      XXV                               Revenue   Voted          31,52,17,00    20,10,81,37        11,41,35,63",
    "",
    "                  Disabled Welfare                                                                                              …",
    "                                           Capital   Voted           2,18,06,58       49,10,71         1,68,95,87",
    "                  Administration of        Revenue   Voted           1,63,82,73     1,42,81,00           21,01,73",
    "                  Religious Endowments                                                                                          …",
    "263      XXVI",
    "",
    "                  Agriculture                                                                                                   …",
    "265      XXVII                             Revenue   Voted         1,55,69,41,03   80,20,52,68        75,48,88,35",
])


def rows_of(page):
    return {(r["grant"], r["section"], r["vc"]): r for r in read_summary([page], "2018-19")}


def test_a_raised_nil_mark_is_put_back_in_its_column():
    r = rows_of(PAGE_10)[("II", "Revenue", "Charged")]
    assert r["printed"] == ["9,53,18", "…", "9,53,18", "…"]
    assert r["expenditure_thousand"] == "0" and r["arithmetic_ok"]


def test_rows_with_all_figures_on_their_line_are_unchanged():
    rows = rows_of(PAGE_10)
    assert rows[("II", "Revenue", "Voted")]["printed"] == ["26,25,85", "20,71,58", "5,54,27", "…"]
    assert rows[("I", "Revenue", "Charged")]["printed"] == ["3,61,86", "2,61,94", "99,92", "…"]


def test_a_grant_number_printed_below_its_figures_takes_its_own_row():
    rows = rows_of(PAGE_13)
    assert rows[("XXVI", "Revenue", "Voted")]["printed"][:2] == ["1,63,82,73", "1,42,81,00"]
    assert [k for k in rows if k[0] == "XXV"] == [("XXV", "Revenue", "Voted"), ("XXV", "Capital", "Voted")]


def test_a_row_whose_expenditure_cannot_be_placed_fails_instead_of_guessing():
    page = HEAD + "16  II  Governor   Revenue  Voted   26,25,85   20,71,58   5,54,27   …\n" \
                  "                   Charged   9,53,18   1,00   2,00   9,53,18   4,00"
    r = rows_of(page)[("II", "Revenue", "Charged")]
    assert r["arithmetic_ok"] is False
