"""
Read the grant-wise 'Summary of Appropriation Accounts' that CAG publishes for
Andhra Pradesh each year.

The summary prints every grant by section (Revenue, Capital, Loans, Public Debt)
and by Voted or Charged: the total grant and the expenditure, in thousands of
rupees with Indian grouping (95,10,65 is 9,51,065 thousand). It prints no single
total per grant, so the sections stay apart here. The seed builder uses them two
ways: as the spending of 2014-15, the one year no budget book prints by demand,
and as an independent check on the 'Accounts' column of the budget books.

Three things are checked on every row, because the layout moves from year to year:
  * arithmetic: total grant minus expenditure equals the saving it prints, or
    expenditure minus total grant equals the excess;
  * attribution: the expenditure figure, as printed, also appears on that grant's
    own pages further on in the book (in some years the grant number is centred in
    its block, so a row can sit closer to the next grant's number than its own);
  * the text layer is readable at all: the 2016-17 and 2021-22 books are printed
    with fonts whose text layer is scrambled, and they are reported, not read.
"""
from __future__ import annotations

import re
from decimal import Decimal

ROMAN = r"(?:XL|XXX|XX|X)?(?:IX|IV|V?I{0,3})"
GRANT = re.compile(r"^\s*(?:\d{1,3}\s+)?(" + ROMAN + r")\.?(?=\s+[A-Z]|\s*$)")
SECTION = re.compile(r"\b(Revenue|Capital|Loans(?: and Advances)?|Public\s+Debt)\b")
VC = re.compile(r"\b(Voted|Charged)\b")
NUM = re.compile(r"(\(-\)|-)?(?<![\d,(])(\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{2})*,\d{2}|\d{1,3}|\.\.\.?|…)(?![\d,)])")
DETAIL = re.compile(r"(?:GRANT|APPROPRIATION)\s*No\.?\s*(" + ROMAN + r")\b", re.I)
SUMMARY_TITLE = re.compile(r"SUMMARY[ \t]*OF[ \t]*APPROPRIATION[ \t]*ACCOUNTS")
# Words may run together. The 2016-17 book is read from a copy whose fonts were given their
# letters back (scripts/repair_cag_fonts.py), and those fonts draw no space glyph, so the text
# layer can say "StateLegislature". Keywords are matched with optional spaces; figures never
# depend on spaces, and every row still has to pass the arithmetic and attribution checks.
LEGISLATURE = re.compile(r"State[ \t]*Legislature")
HEADER = re.compile(r"Number[ \t]*and[ \t]*Name|grant[ \t]*or[ \t]*appropriation|in[ \t]*thousand")
TOTALS = re.compile(r"^\s*(Grand[ \t]*)?Totals?(?![a-z])")


def thousand(sign: str, tok: str) -> Decimal:
    if tok in ("...", "..", "…"):
        return Decimal(0)
    v = Decimal(tok.replace(",", ""))
    return -v if sign else v


def readable(texts) -> bool:
    """A scrambled text layer has no 'State Legislature' line in its summary."""
    joined = "\n".join(t for t in texts if SUMMARY_TITLE.search(t))
    return bool(joined) and bool(LEGISLATURE.search(joined))


def read_summary(texts, year):
    """Rows of the summary: one per grant, section and voted/charged."""
    rows, in_summary, last_grant, edges = [], False, None, None
    for pno, pg in enumerate(texts, start=1):
        if not SUMMARY_TITLE.search(pg):
            if in_summary:
                break
            continue
        in_summary = True
        lines = _join_lifted_figures(pg.split("\n"))
        page_vals = []
        labels, vals, section, stop = [], [], None, False
        for i, ln in enumerate(lines):
            if HEADER.search(ln):
                continue
            if TOTALS.match(ln):
                stop = True  # the state totals follow the last grant
            if stop:
                continue
            m = GRANT.match(ln)
            vm = VC.search(ln)
            if m and m.group(1):
                labels.append((i, m.group(1), bool(vm)))
            sm = SECTION.search(ln)
            if sm:
                section = re.sub(r"\s+", " ", sm.group(1))
            if vm:
                toks = _cells(lines, i, vm.end())
                if len(toks) >= 2:
                    page_vals.append((i, section or "Revenue", vm.group(1), toks, ln))
        vals, edges = _columns(page_vals, edges)
        top_aligned = (not labels) or sum(1 for l in labels if l[2]) >= len(labels) / 2
        # A grant number printed alone, below its own figures (XXVI in 2018-19: the name's
        # first line carries the figures, "263  XXVI" comes two lines later). Such a bare
        # label takes the unlabelled row just above it, within three lines.
        bare = {}
        labelled = {l[0] for l in labels}
        for j, gname, has_vc in labels:
            if has_vc or NUM.search(lines[j][lines[j].find(gname) + len(gname):]):
                continue
            above = [v for v in vals if j - 3 <= v[0] < j and v[0] not in labelled]
            if above and not any(l[0] < j and l[0] > above[-1][0] for l in labels):
                bare[above[-1][0]] = gname
        for (i, sec, vc, toks, ln) in vals:
            if i in bare:
                g = bare[i]
            elif not labels:
                g = last_grant
            elif top_aligned:
                above = [l for l in labels if l[0] <= i]
                g = above[-1][1] if above else last_grant  # a block that began on the page before
            else:
                g = min(labels, key=lambda l: (abs(l[0] - i), -l[0]))[1]
            if g is None:
                continue
            on_row = any(l[0] == i and l[1] == g for l in labels)
            if toks is None or toks[0] is None or toks[1] is None:
                # the grant or the expenditure column could not be placed: keep the row, failed,
                # so the build reports it instead of comparing a wrong figure
                rows.append({"year": year, "grant": g, "section": sec, "vc": vc, "label_on_row": on_row,
                             "total_grant_thousand": None, "expenditure_thousand": None,
                             "printed": [None if t is None else "%s%s" % t for t in (toks or [None] * 4)],
                             "pdf_page": pno, "columns_ok": False,
                             "layout": "continued" if not labels else ("top" if top_aligned else "centred")})
                continue
            printed = [None if t is None else "%s%s" % t for t in toks]
            rows.append({"year": year, "grant": g, "section": sec, "vc": vc, "label_on_row": on_row,
                         "columns_ok": True,
                         "total_grant_thousand": str(thousand(*toks[0])),
                         "expenditure_thousand": str(thousand(*toks[1])),
                         "printed": printed, "pdf_page": pno,
                         "layout": "continued" if not labels else ("top" if top_aligned else "centred")})
        if labels:
            last_grant = labels[-1][1]
    _arithmetic(rows)
    _attribution(rows, texts)
    return rows


NIL = re.compile(r"\.\.\.?|…")


def _cells(lines, i, start):
    """The figures of row i, left to right, from column `start` on.

    The summary has four columns: total grant, expenditure, saving, excess, and a
    nil one is printed as a dot leader ("…"). In some books (2018-19) CAG prints the
    dot leaders slightly raised, so the text layer puts them on the line above. A
    row read without them would take its saving for its expenditure (grant II,
    charged, 2018-19: grant 9,53,18, spent nil, saved 9,53,18). So when a row has
    fewer than four figures, a nil mark on the line just above, in a column the row
    leaves empty, is put back where it was printed.
    """
    ln = lines[i]
    cells = [(m.start(), m.end(), m.group(1) or "", m.group(2)) for m in NUM.finditer(ln, start)]
    if len(cells) < 4 and i > 0:
        above = lines[i - 1]
        if not re.search(r"\d", above[start:]):
            for m in NIL.finditer(above, start):
                if not any(m.start() < ce + 1 and m.end() > cs - 1 for cs, ce, _, _ in cells):
                    cells.append((m.start(), m.end(), "", m.group(0)))
    cells.sort()
    return [(end, sign, tok) for _, end, sign, tok in cells]


def _columns(vals, edges):
    """Put each row's figures in their columns: grant, expenditure, saving, excess.

    Figures are right-aligned, so a column is known by where its figures end. The
    edges come from the page's rows that print all four columns. A row with a
    column left blank (VIII, 2016-17: no excess, not even a nil mark) keeps None
    there, so a blank can never shift the next figure into the wrong column.
    """
    full = [v[3] for v in vals if len(v[3]) == 4]
    if full:
        edges = [sorted(c[k][0] for c in full)[len(full) // 2] for k in range(4)]
    out = []
    for (i, sec, vc, cells, ln) in vals:
        if len(cells) == 4 or not edges:
            cols = [(c[1], c[2]) for c in cells[:4]] + [None] * (4 - min(4, len(cells)))
        else:
            cols = [None] * 4
            for end, sign, tok in cells:
                k = min(range(4), key=lambda j: abs(edges[j] - end))
                if cols[k] is None:
                    cols[k] = (sign, tok)
                else:
                    cols = None   # two figures in one column: the row is not trusted
                    break
        out.append((i, sec, vc, cols, ln))
    return out, edges


def _join_lifted_figures(lines):
    """Put a row's figures back on the line of its Voted/Charged label.

    Where a grant's name takes two lines, CAG sometimes centres the figures on the
    name and prints 'Revenue Voted' on the line below (grant XX in 2021-22). Such a
    line has figures but no Voted or Charged, and the next line has Voted or Charged
    but no figures. Only that exact pair is joined; the figures stay as printed.
    """
    out = list(lines)
    for i in range(len(out) - 1):
        a, b = out[i], out[i + 1]
        if VC.search(a) or not VC.search(b) or len(NUM.findall(a[30:])) < 2:
            continue
        vm = VC.search(b)
        if NUM.findall(b[vm.end():]):
            continue
        # Lay the label line over the figures line, each character in its own column, so
        # the figures keep the columns the nil marks above them are matched by.
        width = max(len(a), len(b))
        merged = list(a.ljust(width))
        clash = False
        for j, ch in enumerate(b):
            if ch != " ":
                if merged[j] != " ":
                    clash = True
                    break
                merged[j] = ch
        if clash:
            continue
        out[i] = "".join(merged).rstrip()
        out[i + 1] = ""
    return out


def _arithmetic(rows):
    for r in rows:
        if not r.get("columns_ok", True):
            r["arithmetic_ok"] = False
            continue
        p = r["printed"] + [None] * (4 - len(r["printed"]))

        def val(t):
            if t is None or t.lstrip("(-)-") in ("...", "..", "…"):
                return Decimal(0)
            neg = t.startswith("(-)") or t.startswith("-")
            v = Decimal(t.replace("(-)", "").lstrip("-").replace(",", ""))
            return -v if neg else v
        g, e = val(p[0]), val(p[1])
        rest = [val(x) for x in p[2:] if x is not None]
        # All four columns must be read. With one missing, a saving can stand in for the
        # expenditure and still "add up" (grant minus saving equals the saving's own grant).
        r["arithmetic_ok"] = r.get("columns_ok", True) and (
            (g == e and all(x == 0 for x in rest)) or (g - e in rest) or (e - g in rest))


def _attribution(rows, texts):
    txt = "\n".join(texts)
    marks = [(m.start(), m.group(1)) for m in DETAIL.finditer(txt) if m.group(1)]
    blocks = {}
    for i, (pos, g) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(txt)
        blocks[g] = blocks.get(g, "") + txt[pos:end]
    for r in rows:
        if not r.get("columns_ok", True):
            r["attribution"] = "not confirmed"
            continue
        exp = r["printed"][1].replace("(-)", "").lstrip("-")
        if exp in ("...", "..", "…"):
            r["attribution"] = "nil"
        elif exp in blocks.get(r["grant"], ""):
            r["attribution"] = "confirmed on the grant's own pages"
        elif r.get("label_on_row"):
            r["attribution"] = "grant number printed on the same line"
        else:
            r["attribution"] = "not confirmed"
