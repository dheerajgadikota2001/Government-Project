"""
WHY THIS TEST EXISTS

CAG's Appropriation Accounts for 2016-17 and 2021-22 print correctly but carry
no text a program can read, so the spending of those two years was never
checked against the budget books (80 department-years shown as "CAG's file has
no readable text"). They are now read from copies whose fonts were given their
letters back from glyph maps checked by eye (app/scrapers/font_repair.py).

A wrong letter in a figure would put a wrong figure on the site, so these tests
hold the pieces that decide letters and spaces:
  * the two maps: checked by eye, tied to one file each, every digit present;
  * repair() refuses any other file, so a changed book is never misread;
  * the page text built from glyph positions finds word gaps even though every
    2016-17 glyph is declared one em wide, and keeps a space CAG drew;
  * the summary reader joins a row whose figures CAG printed one line above its
    'Revenue Voted' label (grant XX, and XVII and XXIX, in 2021-22), and accepts
    keywords whose spaces were lost;
  * the repaired summary pages, as read on 24 Oct 2026, give all 40 grants with
    every row passing the arithmetic check.
The test at the end runs the whole repair on the real books when they are in
the cache (READ_BUDGET_BOOKS_CACHE); it was run on 24 Oct 2026: 2016-17 gave
92 rows and 2021-22 gave 96, every one passing arithmetic, and every non-nil
row confirmed on its grant's own pages.
"""
import json
import os
import re
from pathlib import Path

import pytest

from app.scrapers import font_repair
from app.scrapers.appropriation_accounts import LEGISLATURE, SUMMARY_TITLE, TOTALS, _join_lifted_figures, read_summary
from app.scrapers.positional_text import page_text, width_em

HERE = Path(__file__).parent
MAPS = {"AA_2016-17.json": 742, "AA_2021-22.json": 231}


@pytest.mark.parametrize("name,shapes", MAPS.items())
def test_each_map_was_checked_by_eye_and_names_its_one_file(name, shapes):
    m = font_repair.load_map(name)
    assert m["reviewed"] is True and m["made"] == "2026-10-24"
    assert re.fullmatch(r"[0-9a-f]{64}", m["source_sha256"])
    assert m["source_url"].startswith("https://d1jmc0u14z2tmp.cloudfront.net/uploads/state_accounts_report/")
    g = m["glyphs"]
    assert len(g) == shapes
    assert all(k.startswith(("t3:", "cff:")) for k in g)
    assert all(len(v) == 1 for v in g.values()), "one glyph is one character"
    assert set("0123456789,.()") <= set(g.values()), "every figure character is mapped"


def test_the_corrections_made_by_eye_are_in_the_2016_17_map():
    # The matcher read these with confidence and was wrong; they were corrected on the sheets.
    vals = list(font_repair.load_map("AA_2016-17.json")["glyphs"].values())
    assert "$" not in vals and "J" in vals          # bold 5 is not '$'; real J stays
    assert "₹" in vals and "…" in vals


def test_repair_refuses_a_file_the_map_was_not_made_from(tmp_path):
    other = tmp_path / "other.pdf"
    other.write_bytes(b"%PDF-1.4 not CAG's book")
    with pytest.raises(ValueError, match="not the file this glyph map was made from"):
        font_repair.repair(other, tmp_path / "out.pdf", font_repair.load_map("AA_2021-22.json"))


def test_tounicode_maps_are_written_for_one_and_two_byte_codes():
    one = font_repair._cmap([(5, "R"), (0, "0")], two_byte=False).decode()
    assert "<00> <FF>" in one and "<00> <0030>" in one and "<05> <0052>" in one
    two = font_repair._cmap([(19, "0"), (3, " ")], two_byte=True).decode()
    assert "<0000> <FFFF>" in two and "<0013> <0030>" in two and "<0003> <0020>" in two


def test_outline_keys_do_not_depend_on_how_floats_print():
    a = font_repair.outline_key([("moveTo", ((100, 0),)), ("lineTo", ((100.00000001, 50),))])
    b = font_repair.outline_key([("moveTo", ((100.0, 0.0),)), ("lineTo", ((100.0, 50.0),))])
    assert a == b


class Page:
    """Just enough of a pdfplumber page: glyphs with their text and matrix."""

    def __init__(self, chars):
        self.chars = chars


def glyphs(text, x, y, size=12.0, step=None, turned=False):
    """Lay out text as CAG's 2016-17 driver did: each glyph at its true Times advance."""
    out = []
    for ch in text:
        m = (0.0, size, -size, 0.0, y, x) if turned else (size, 0.0, 0.0, size, x, y)
        out.append({"text": ch, "matrix": m})
        x += (step or width_em(ch)) * size
    return out


def test_word_gaps_are_found_from_positions_not_declared_widths():
    # "GRANT No.I STATE" with real word gaps of a quarter em, and a space glyph CAG drew
    def end(text, x):
        return x + sum(width_em(c) for c in text) * 12

    a = 100.0
    b = end("GRANT", a) + 3.0            # a quarter-em gap
    c = end("No.I", b) + 0.2             # touching, but CAG drew a space glyph between
    cs = glyphs("GRANT", a, 700) + glyphs("No.I", b, 700) + glyphs(" ", c - 0.1, 700) + glyphs("STATE", c, 700)
    assert page_text(Page(cs)).split() == ["GRANT", "No.I", "STATE"]
    # without the drawn space, a gap that small is not a word break
    cs = glyphs("No.I", b, 700) + glyphs("STATE", c, 700)
    assert page_text(Page(cs)).split() == ["No.ISTATE"]


def test_no_space_is_made_inside_a_figure():
    assert page_text(Page(glyphs("1,09,15,11", 300, 500))).strip() == "1,09,15,11"


def test_turned_pages_are_read_along_their_own_direction():
    cs = glyphs("Revenue", 200, 130, turned=True) + glyphs("Voted", 200 + 5.2 * 12, 130, turned=True)
    assert page_text(Page(cs)).split() == ["Revenue", "Voted"]


def test_a_row_printed_one_line_above_its_label_is_joined():
    lines = [
        "196    XX     Labour, Factories, Boilers &                                     7,11,94,39     3,07,55,72     4,04,38,67              …",
        "                                                Revenue        Voted",
        "              Insurance Medical Services",
    ]
    out = _join_lifted_figures(lines)
    assert "Revenue" in out[0] and "Voted" in out[0] and out[0].rstrip().endswith("4,04,38,67  …".split()[-1])
    assert out[1] == ""
    # a normal row is left alone
    row = "  12    I     State Legislature        Revenue  Voted   1,08,32,63   1,00,95,83   7,36,80   …"
    assert _join_lifted_figures([row, "   Charged   2,73,71   2,03,42   70,29   …"])[0] == row


def test_keywords_whose_spaces_were_lost_are_still_found():
    assert SUMMARY_TITLE.search("SUMMARYOFAPPROPRIATIONACCOUNTS - 2016-2017")
    assert not SUMMARY_TITLE.search(" SUMMARY OF\nAPPROPRIATION\n  ACCOUNTS")   # the divider page, three lines
    assert LEGISLATURE.search("12  I  StateLegislature   Revenue Voted")
    assert TOTALS.match("   GrandTotal   ") and TOTALS.match("Total Voted") and not TOTALS.match("Totally")


@pytest.mark.parametrize("year", ["2016-17", "2021-22"])
def test_the_repaired_summaries_give_all_40_grants_and_their_arithmetic_holds(year):
    fx = json.loads((HERE / "fixtures" / "cag_repaired_summaries.json").read_text(encoding="utf-8"))[year]
    texts = [""] * (fx["first_page"] - 1) + fx["pages"]
    rows = read_summary(texts, year)
    assert len({r["grant"] for r in rows}) == 40
    assert all(r["arithmetic_ok"] for r in rows)
    xx = [r for r in rows if r["grant"] == "XX" and r["section"] == "Revenue"]
    assert xx and xx[0]["printed"][:2] == (["3,61,44,26", "3,02,83,32"] if year == "2016-17" else ["7,11,94,39", "3,07,55,72"])


CACHE = os.environ.get("READ_BUDGET_BOOKS_CACHE")


@pytest.mark.skipif(not CACHE, reason="set READ_BUDGET_BOOKS_CACHE to the budget-books cache to run on the real books")
@pytest.mark.parametrize("year,name,how,expected_rows", [("2016-17", "AA_2016-17.json", "positions", 92),
                                                          ("2021-22", "AA_2021-22.json", "pdftotext", 96)])
def test_the_real_books_repair_and_read(tmp_path, year, name, how, expected_rows):
    from app.scrapers import positional_text
    from app.scrapers.budget_demands import page_texts

    src = Path(CACHE) / "cag" / f"AA_{year}.pdf"
    out = tmp_path / "fixed.pdf"
    font_repair.repair(src, out, font_repair.load_map(name))
    texts = positional_text.page_texts(out) if how == "positions" else page_texts(out)
    rows = read_summary(texts, year)
    assert len(rows) == expected_rows and len({r["grant"] for r in rows}) == 40
    assert all(r["arithmetic_ok"] for r in rows)
    assert all(r["attribution"] in ("confirmed on the grant's own pages", "nil") for r in rows)
