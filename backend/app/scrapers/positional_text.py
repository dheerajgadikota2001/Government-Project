"""Page text rebuilt from where each glyph sits, for PDFs whose fonts lie about their widths.

WHY THIS EXISTS
CAG's 2016-17 Appropriation Accounts was printed through a PostScript driver that
turned every letter into a Type 3 drawing, declared each one exactly one em wide,
and gave the fonts no map from glyph to letter. scripts/repair_cag_fonts.py gives
the letters back (a ToUnicode map per font, every glyph identified by its shape
and checked by eye). Widths cannot be fixed the same way: within a string the
page places each glyph by its declared width, so changing a width would move
glyphs off where CAG printed them.

With every glyph one em wide, text tools see the glyphs overlap and drop the gaps
between words ("StateLegislature", "GRANTNo.IISTATE..."). Here each glyph's own
origin is read from the page (that is always right), and the end of a glyph is
its origin plus its true width in Times New Roman (Liberation Serif has the same
widths). A gap wider than SPACE of the font size is a space; wider gaps become
more spaces, so the columns stay apart as pdftotext -layout keeps them.

Only the spacing is decided here. Every figure read from this text still has to
pass the summary reader's arithmetic and attribution checks.
"""
from __future__ import annotations

import math
from collections import Counter

SPACE = 0.15      # of the font size: a word gap in these books is about 0.25 em, rounding noise under 0.05
COLUMN = 0.5      # one layout column per half em, the width of a figure
LINE = 0.35       # glyphs whose baselines are this close (of the size) are on one line
# Advance widths of Times New Roman, in em. Liberation Serif is built to the same widths;
# these were read from it (LiberationSerif-Regular.ttf) on 24 Oct 2026.
TIMES = {
    '0': 0.5, '1': 0.5, '2': 0.5, '3': 0.5, '4': 0.5, '5': 0.5, '6': 0.5, '7': 0.5,
    '8': 0.5, '9': 0.5, 'a': 0.444, 'b': 0.5, 'c': 0.444, 'd': 0.5, 'e': 0.444, 'f': 0.333,
    'g': 0.5, 'h': 0.5, 'i': 0.278, 'j': 0.278, 'k': 0.5, 'l': 0.278, 'm': 0.778, 'n': 0.5,
    'o': 0.5, 'p': 0.5, 'q': 0.5, 'r': 0.333, 's': 0.389, 't': 0.278, 'u': 0.5, 'v': 0.5,
    'w': 0.722, 'x': 0.5, 'y': 0.5, 'z': 0.444, 'A': 0.722, 'B': 0.667, 'C': 0.667, 'D': 0.722,
    'E': 0.611, 'F': 0.556, 'G': 0.722, 'H': 0.722, 'I': 0.333, 'J': 0.389, 'K': 0.722, 'L': 0.611,
    'M': 0.889, 'N': 0.722, 'O': 0.722, 'P': 0.556, 'Q': 0.722, 'R': 0.667, 'S': 0.556, 'T': 0.611,
    'U': 0.722, 'V': 0.722, 'W': 0.944, 'X': 0.722, 'Y': 0.722, 'Z': 0.611, '!': 0.333, '"': 0.408,
    '#': 0.5, '$': 0.5, '%': 0.833, '&': 0.778, "'": 0.18, '(': 0.333, ')': 0.333, '*': 0.5,
    '+': 0.564, ',': 0.25, '-': 0.333, '.': 0.25, '/': 0.278, ':': 0.278, ';': 0.278, '<': 0.564,
    '=': 0.564, '>': 0.564, '?': 0.444, '@': 0.921, '[': 0.333, '\\': 0.278, ']': 0.333, '^': 0.469,
    '_': 0.5, '`': 0.333, '{': 0.48, '|': 0.2, '}': 0.48, '~': 0.541, '…': 1.0, '–': 0.5,
    '—': 1.0, '‘': 0.333, '’': 0.333, '“': 0.444, '”': 0.444,
}


def width_em(ch: str) -> float:
    return TIMES.get(ch[:1], 0.5)


def page_text(page) -> str:
    """One page (a pdfplumber page) as layout text."""
    glyphs = []
    for c in page.chars:
        t = c.get("text") or ""
        if not t:
            continue
        a, b, _, _, e, f = c["matrix"]
        size = math.hypot(a, b)
        if size == 0:
            continue
        glyphs.append((t, (a / size, b / size), size, e, f))
    if not glyphs:
        return ""
    # Read along the direction most glyphs on the page run (some summary pages are turned).
    dirs = Counter((round(d[0], 2), round(d[1], 2)) for _, d, _, _, _ in glyphs)
    out = []
    for (dx, dy), _ in dirs.most_common():
        group = [g for g in glyphs if (round(g[1][0], 2), round(g[1][1], 2)) == (dx, dy)]
        out.append(_lines(group, dx, dy))
    return "\n".join(out)


def _lines(glyphs, dx, dy):
    # u along the line, v across it (larger v = higher on the page as read)
    pts = [(t, e * dx + f * dy, -e * dy + f * dx, s) for t, _, s, e, f in glyphs]
    sizes = sorted(p[3] for p in pts)
    unit = sizes[len(sizes) // 2] * COLUMN
    u0 = min(p[1] for p in pts)
    pts.sort(key=lambda p: -p[2])
    lines, cur = [], []
    for p in pts:
        if cur and abs(cur[-1][2] - p[2]) > LINE * max(p[3], cur[-1][3]):
            lines.append(cur)
            cur = []
        cur.append(p)
    if cur:
        lines.append(cur)
    text = []
    for ln in lines:
        ln.sort(key=lambda p: p[1])
        s, end, spaced = "", None, False
        for t, u, _, size in ln:
            if not t.strip():
                spaced = True      # a space the printer drew: always a word break, whatever the widths say
                continue
            col = int(round((u - u0) / unit))
            if end is not None and (spaced or u - end > SPACE * size):
                s += " " * max(1, col - len(s))
            elif end is None:
                s += " " * col
            s += t
            end, spaced = u + width_em(t) * size, False
        text.append(s.rstrip())
    return "\n".join(text)


def page_texts(pdf_path) -> list[str]:
    import pdfplumber

    out = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            out.append(page_text(page))
            page.flush_cache()
    return out
