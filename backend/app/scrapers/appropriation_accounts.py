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
SUMMARY_TITLE = "SUMMARY OF APPROPRIATION ACCOUNTS"


def thousand(sign: str, tok: str) -> Decimal:
    if tok in ("...", "..", "…"):
        return Decimal(0)
    v = Decimal(tok.replace(",", ""))
    return -v if sign else v


def readable(texts) -> bool:
    """A scrambled text layer has no 'State Legislature' line in its summary."""
    joined = "\n".join(t for t in texts if SUMMARY_TITLE in t)
    return bool(joined) and "State Legislature" in joined


def read_summary(texts, year):
    """Rows of the summary: one per grant, section and voted/charged."""
    rows, in_summary, last_grant = [], False, None
    for pno, pg in enumerate(texts, start=1):
        if SUMMARY_TITLE not in pg:
            if in_summary:
                break
            continue
        in_summary = True
        lines = pg.split("\n")
        labels, vals, section, stop = [], [], None, False
        for i, ln in enumerate(lines):
            if "Number and Name" in ln or "grant or appropriation" in ln or "in thousand" in ln:
                continue
            if re.match(r"^\s*(Grand\s+)?Totals?\b", ln):
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
                toks = NUM.findall(ln[vm.end():])
                if len(toks) >= 2:
                    vals.append((i, section or "Revenue", vm.group(1), toks, ln))
        top_aligned = (not labels) or sum(1 for l in labels if l[2]) >= len(labels) / 2
        for (i, sec, vc, toks, ln) in vals:
            if not labels:
                g = last_grant
            elif top_aligned:
                above = [l for l in labels if l[0] <= i]
                g = above[-1][1] if above else last_grant  # a block that began on the page before
            else:
                g = min(labels, key=lambda l: (abs(l[0] - i), -l[0]))[1]
            if g is None:
                continue
            printed = ["%s%s" % t for t in toks[:4]]
            on_row = any(l[0] == i and l[1] == g for l in labels)
            rows.append({"year": year, "grant": g, "section": sec, "vc": vc, "label_on_row": on_row,
                         "total_grant_thousand": str(thousand(*toks[0])),
                         "expenditure_thousand": str(thousand(*toks[1])),
                         "printed": printed, "pdf_page": pno,
                         "layout": "continued" if not labels else ("top" if top_aligned else "centred")})
        if labels:
            last_grant = labels[-1][1]
    _arithmetic(rows)
    _attribution(rows, texts)
    return rows


def _arithmetic(rows):
    for r in rows:
        p = r["printed"] + [None] * (4 - len(r["printed"]))

        def val(t):
            if t is None or t.lstrip("(-)-") in ("...", "..", "…"):
                return Decimal(0)
            neg = t.startswith("(-)") or t.startswith("-")
            v = Decimal(t.replace("(-)", "").lstrip("-").replace(",", ""))
            return -v if neg else v
        g, e = val(p[0]), val(p[1])
        rest = [val(x) for x in p[2:] if x is not None]
        r["arithmetic_ok"] = (g == e and all(x == 0 for x in rest)) or (g - e in rest) or (e - g in rest)


def _attribution(rows, texts):
    txt = "\n".join(texts)
    marks = [(m.start(), m.group(1)) for m in DETAIL.finditer(txt) if m.group(1)]
    blocks = {}
    for i, (pos, g) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(txt)
        blocks[g] = blocks.get(g, "") + txt[pos:end]
    for r in rows:
        exp = r["printed"][1].replace("(-)", "").lstrip("-")
        if exp in ("...", "..", "…"):
            r["attribution"] = "nil"
        elif exp in blocks.get(r["grant"], ""):
            r["attribution"] = "confirmed on the grant's own pages"
        elif r.get("label_on_row"):
            r["attribution"] = "grant number printed on the same line"
        else:
            r["attribution"] = "not confirmed"
