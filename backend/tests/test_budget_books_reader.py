"""
WHY THIS TEST EXISTS

The departments page showed School Education's revised estimate for 2024-25 as
Rs 23,152.10 crore. The 2025-26 budget book prints Rs 28,560.68 crore (gross,
Demand XII summary, PDF page 8 of Volume III/7). The figure had been read by
hand. Reading all forty demands for twelve books by hand would repeat that kind
of slip hundreds of times, so they are now read by app/scrapers/budget_demands.

The text layer of these PDFs cannot be trusted with figures, and each page in
the fixture is a real page on which it fails in a different way:
  * a figure too wide for its cell wraps its last digit to the next line
    (107575,70.1 over a 2), beside columns that touch;
  * one figure comes out as three words (7 / 1 / 1,74.95 is 711,74.95);
  * minus signs of the recoveries wrap onto the line above their figures;
  * a total's label wraps: 'Gross Total DEMAND' over 'XXXVIII';
  * figures in touching columns glue into one run;
  * a demand prints no 'Gross Total' row, only gross revenue and nil capital;
  * an older book says 'Gross Demand' without 'Total';
  * the 2016-17 book has three columns, not four.
Every expected figure below was checked against the rendered page.

The fixture holds the pages as pdfplumber hands them over: the glyphs of the
figures and the English label words, with positions. No PDFs are in the repo.
"""
import json
from decimal import Decimal
from pathlib import Path

import pytest

from app.scrapers.budget_demands import columns_for, lakh, page_items, place, read_totals

FIX = json.loads((Path(__file__).parent / "fixtures" / "budget_book_pages.json").read_text(encoding="utf-8"))


class StoredPage:
    """A page with the two things the reader uses: glyphs and words."""

    def __init__(self, rec):
        self.chars = [{"text": t, "x0": a, "x1": b, "top": c, "bottom": d} for t, a, b, c, d in rec["chars"]]
        self._words = [{"text": t, "x0": a, "x1": b, "top": c, "bottom": d} for t, a, b, c, d in rec["words"]]

    def extract_words(self, **_):
        return self._words


def page(book, part, pno):
    for rec in FIX["pages"]:
        if (rec["book"], rec["part"], rec["pdf_page"]) == (book, part, pno):
            return rec, StoredPage(rec)
    raise KeyError((book, part, pno))


def totals(book, part, pno):
    rec, pg = page(book, part, pno)
    t, probs = read_totals([(pno, pg)], rec["demand"], book, hint_pages=[(pno, pg)])
    assert probs == [], probs
    return t


def printed(entry):
    return [c["printed"] for c in entry["columns"]]


def test_lakh_reads_the_books_notation_exactly():
    assert lakh("29772,79.24") == Decimal("2977279.24")
    assert lakh("1,32.37") == Decimal("132.37")
    assert lakh("-0.49") == Decimal("-0.49")
    assert lakh("..") == Decimal(0)
    assert lakh("-1200,00.00") == Decimal("-120000.00")


def test_the_2016_17_book_has_no_accounts_column():
    assert [c["kind"] for c in columns_for("2016-17")] == ["be", "re", "be"]
    assert [c["year"] for c in columns_for("2025-26")] == ["2023-24", "2024-25", "2024-25", "2025-26"]


def test_a_figure_wrapped_inside_its_cell_is_completed_from_the_digit_below():
    t = totals("2026-27", 5, 8)
    assert printed(t["gross"]) == ["93492,90.01", "95545,10.27", "107575,70.12", "98262,09.19"]
    assert printed(t["net"]) == ["88472,58.77", "88736,57.09", "98745,02.74", "89481,45.88"]
    # the charged and voted lines prove the wrapped 2: 60201,77.97 + 47373,92.15 = 107575,70.12
    g = t["gross"]
    assert Decimal(g["charged"][2]) + Decimal(g["voted"][2]) == Decimal(g["columns"][2]["lakh"])


def test_one_figure_split_into_three_words_is_read_as_one():
    t = totals("2016-17", 17, 7)
    assert printed(t["gross"]) == ["653,43.36", "567,00.60", "711,74.95"]
    assert t["gross"]["voted"][2] == "71174.95"


def test_minus_signs_wrapped_above_their_figures_are_joined():
    t = totals("2023-24", 5, 11)
    assert t["gross"]["recoveries"] == ["-1113208.25", "-883646.51", "-1296895.62", "-1197860.74"]
    for i in range(4):
        g = Decimal(t["gross"]["columns"][i]["lakh"])
        assert g + Decimal(t["gross"]["recoveries"][i]) == Decimal(t["net"]["columns"][i]["lakh"])


def test_a_label_wrapped_over_two_lines_still_names_its_demand():
    t = totals("2024-25", 11, 93)
    assert t["gross"]["label"] == "Gross Total DEMAND XXXVIII"
    assert printed(t["gross"]) == ["8027,68.14", "3725,32.24", "231,74.07", "3739,79.85"]


def test_figures_in_touching_columns_are_split_at_the_column_edges():
    t = totals("2019-20", 17, 8)
    assert printed(t["gross"]) == ["1384,08.97", "1743,68.76", "1378,53.02", "1912,68.38"]
    assert printed(t["net"]) == ["1371,42.03", "1743,02.35", "1355,71.49", "1912,29.25"]


def test_school_education_revised_estimate_for_2024_25_is_the_printed_one():
    t = totals("2025-26", 7, 8)
    g = t["gross"]
    assert g["label"] == "Gross Total DEMAND XII"
    re_col = [c for c in g["columns"] if c["kind"] == "re"][0]
    assert (re_col["year"], re_col["printed"]) == ("2024-25", "28560,67.59")
    acc = [c for c in g["columns"] if c["kind"] == "accounts"][0]
    assert (acc["year"], acc["printed"]) == ("2023-24", "28385,27.64")


def test_a_demand_without_a_gross_total_row_keeps_its_rows_apart():
    t = totals("2017-18", 4, 91)
    assert "gross" not in t
    assert printed(t["gross_revenue"]) == ["101,16.72", "130,13.33", "170,19.32", "147,54.69"]
    assert printed(t["total"]) == ["35,00.00", "65,00.00", "105,00.00", "75,00.00"]
    assert all(c["printed"] == ".." for c in t["capital"]["columns"])


def test_gross_demand_without_total_is_the_gross_total():
    t = totals("2015-16", 11, 8)
    assert t["gross"]["label"] == "Gross Demand XXVII"
    assert printed(t["gross"]) == ["805,67.45", "2397,63.59", "6435,89.36", "5959,22.76"]
    assert printed(t["total"]) == ["805,67.45", "2341,16.32", "6379,42.09", "5905,03.53"]


def test_place_refuses_a_figure_under_no_column_rather_than_guessing():
    cols = [{"x1": 100.0}, {"x1": 160.0}, {"x1": 220.0}]
    ok, err = place([{"text": "1,00.00", "x1": 100.5}, {"text": "2,00.00", "x1": 219.0}], cols)
    assert err is None and ok == {0: "1,00.00", 2: "2,00.00"}
    bad, err = place([{"text": "3,00.00", "x1": 190.0}], cols)
    assert bad is None and "no column" in err


@pytest.mark.parametrize("rec", FIX["pages"], ids=lambda r: "%s-III-%d-p%d" % (r["book"], r["part"], r["pdf_page"]))
def test_no_fixture_page_has_an_unreadable_figure_on_a_total_row(rec):
    nums, labels, bad, edges = page_items(StoredPage(rec))
    assert len(edges) >= 3, "the columns must be found on every summary page"
