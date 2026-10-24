"""
Read each demand's totals from Volume III of the Andhra Pradesh budget books.

Every year's book prints, for every demand, a summary with four columns: the
Accounts of two years back, the Budget Estimate and the Revised Estimate of the
year before, and the Budget Estimate of the new year. That one page per demand is
where a department's revised estimate and its actual spending are printed. The
books from 2015-16 to 2016-17 print a Non-Plan summary and a Plan summary for each
demand instead of one, and the 2016-17 book leaves out the Accounts column.

Why this reads glyph positions and not the text layer
-----------------------------------------------------
The text layer of these PDFs cannot be trusted with figures. On real pages it:
  * clips the last digit at the right edge: 114,38.55 comes out as 114,38.5;
  * glues figures in touching columns: 1384,08.971743,68.761378,53.02 is three;
  * splits one figure into words: 7 / 1 / 1,74.95 is 711,74.95;
  * wraps a long figure inside its cell: 107575,70.1 over a 2 is 107575,70.12;
  * wraps a minus sign onto the line above its figure.
Each of those was found on a real page and each produced a wrong figure that
looked right. So figures are rebuilt from the glyphs: glyphs of one figure sit
edge to edge, a gap of more than half a point starts a new one, touching columns
are split only where a glyph ends on a column's right edge, and a wrapped digit or
sign is joined only when it sits right-aligned directly above or below. Anything
else that looks like a broken figure is reported as a problem, never guessed.

Figures are put in columns by their right edges (the columns are right-aligned),
and each total is found by its English label. The checks that prove the columns
were placed right live with the seed builder (scripts/read_budget_books.py).

Units: the books print Rupees in Lakhs as <crore>,<lakh>.<decimals>; 29772,79.24
is 29,772 crore and 79.24 lakh. Values are kept in lakh, as Decimal, exactly.
"""
from __future__ import annotations

import re
from decimal import Decimal

ROMAN = r"(?:XL|XXX|XX|X)?(?:IX|IV|V?I{0,3})"
SECTION_HEAD = re.compile(r"\b(" + ROMAN + r")\s+DEMAND\b|\bDEMAND\s+(" + ROMAN + r")\b(?!\s*FOR)")
ESTIMATE = re.compile(r"ESTIMATE OF THE AMOUNTS REQUIRED", re.I)
GROSS = re.compile(r"\bGross\s+(?:Total\s+)?Demand\s+(" + ROMAN + r")\b", re.I)
NET = re.compile(r"\bNet(?:\s+Total)?\s+Demand\s+(" + ROMAN + r")\b", re.I)
TOTAL = re.compile(r"(?<!Gross )(?<!Net )(?<!Total )\bTotal\s+Demand\s+(" + ROMAN + r")\b", re.I)
GROSS_REV = re.compile(r"\bGross\s+Revenue\s+Demand\s+(" + ROMAN + r")\b", re.I)
NET_REV = re.compile(r"\bNet\s+Revenue\s+Demand\s+(" + ROMAN + r")\b", re.I)
CAPITAL = re.compile(r"\b(?:Total|Gross)\s+Capital\s+Demand\s+(" + ROMAN + r")\b", re.I)
NET_CAP = re.compile(r"\bNet\s+Capital\s+Demand\s+(" + ROMAN + r")\b", re.I)
LOANS = re.compile(r"\b(?:Total|Gross|Net)?\s*Loans?\s+(?:and\s+Advances\s+)?Demand\s+(" + ROMAN + r")\b", re.I)
RECOV = re.compile(r"Deduct\s*-?\s*Recoveries", re.I)
GRANT_VOTED = re.compile(r"DEMAND FOR GRANT \(Voted\)\s*`?₹?\s*(-?\d[\d,]*\.\d{2})", re.I)
SUMS_CHARGED = re.compile(r"Total of Sums Charged\s*`?₹?\s*(-?\d[\d,]*\.\d{2})", re.I)
TOTAL_KINDS = (("gross", GROSS), ("net", NET), ("total", TOTAL), ("gross_revenue", GROSS_REV),
               ("net_revenue", NET_REV), ("capital", CAPITAL), ("net_capital", NET_CAP), ("loans", LOANS))

FULL = re.compile(r"^(?:-?\d{1,7},\d{2}\.\d{2}|-?\d{1,2}\.\d{2}|\.\.)$")
PARTIAL = re.compile(r"^-?\d{1,7},\d{2}\.\d$|^-?\d{1,7},\d{2}\.$")


def lakh(tok: str) -> Decimal:
    """'29772,79.24' -> Decimal('2977279.24') lakh. '..' (nil) -> 0."""
    if tok == "..":
        return Decimal(0)
    neg = tok.startswith("-")
    t = tok.lstrip("-")
    if "," in t:
        a, b = t.split(",", 1)
        v = Decimal(a) * 100 + Decimal(b)
    else:
        v = Decimal(t)
    return -v if neg else v


def columns_for(book: str) -> list[dict]:
    """What the summary columns of a book are, left to right."""
    y = int(book[:4])
    acc = "%d-%02d" % (y - 2, (y - 1) % 100)
    prev = "%d-%02d" % (y - 1, y % 100)
    if book == "2016-17":  # this book prints no Accounts column
        return [{"kind": "be", "year": prev}, {"kind": "re", "year": prev}, {"kind": "be", "year": book}]
    return [{"kind": "accounts", "year": acc}, {"kind": "be", "year": prev},
            {"kind": "re", "year": prev}, {"kind": "be", "year": book}]


def _is_label_word(text: str) -> bool:
    if not re.search(r"[A-Za-z]", text):
        return False
    # Telugu glyphs come out as (cid:NNN) or as non-ASCII; only the English labels are used
    return "(cid:" not in text and all(ord(ch) < 128 for ch in text)


def _edges(nums):
    """Right edges shared by at least three clean figures: the page's columns."""
    xs = sorted(n["x1"] for n in nums if not n.get("partial"))
    edges, grp = [], []
    for x in xs:
        if grp and x - grp[-1] > 3.0:
            if len(grp) >= 3:
                edges.append(sum(grp) / len(grp))
            grp = []
        grp.append(x)
    if len(grp) >= 3:
        edges.append(sum(grp) / len(grp))
    return edges


def page_items(page, edge_hint=None):
    """Figures and English label words of one page, with positions.

    Returns (figures, labels, unreadable, edges). `page` is a pdfplumber page or
    anything with `.chars` and `.extract_words()` (the tests use stored pages)."""
    labels = [{"text": w["text"], "x0": w["x0"], "x1": w["x1"], "top": w["top"], "bottom": w["bottom"]}
              for w in page.extract_words(x_tolerance=1.5, y_tolerance=2) if _is_label_word(w["text"])]
    chars = [c for c in page.chars if c["text"] in "0123456789,.-"]
    chars.sort(key=lambda c: (round(c["top"], 0), c["x0"]))
    lines = []
    for c in chars:
        if lines and abs(lines[-1][0]["top"] - c["top"]) <= 1.5:
            lines[-1].append(c)
        else:
            lines.append([c])
    runs = []
    for ln in lines:
        ln.sort(key=lambda c: c["x0"])
        cur = [ln[0]]
        for a, b in zip(ln, ln[1:]):
            if b["x0"] - a["x1"] > 0.5:
                runs.append(cur)
                cur = [b]
            else:
                cur.append(b)
        runs.append(cur)

    def mk(r):
        t = "".join(c["text"] for c in r)
        return t, {"text": t, "x0": r[0]["x0"], "x1": r[-1]["x1"], "top": r[0]["top"], "bottom": r[0]["bottom"]}

    nums, bad, dashes, digit_bits, glued = [], [], [], [], []
    for r in runs:
        t, item = mk(r)
        if t == "-":
            dashes.append(item)
        elif FULL.match(t):
            nums.append(item)
        elif PARTIAL.match(t):
            item["partial"] = True
            nums.append(item)
        elif re.fullmatch(r"\d{1,2}", t):
            digit_bits.append(item)
        elif re.search(r"\d", t) and ("," in t or "." in t) and not re.fullmatch(r"\d+\.", t):
            glued.append(r)
    edges = _edges(nums)
    if len(edges) < 3 and edge_hint:
        edges = list(edge_hint)  # same table as the section's first page
    for r in glued:
        pieces, cur = [], []
        for i, c in enumerate(r):
            cur.append(c)
            if i < len(r) - 1 and any(abs(c["x1"] - e) <= 1.5 for e in edges):
                pieces.append(cur)
                cur = []
        if cur:
            pieces.append(cur)
        made = []
        for pc in pieces:
            t, item = mk(pc)
            if FULL.match(t):
                made.append(item)
            elif PARTIAL.match(t):
                item["partial"] = True
                made.append(item)
            else:
                made = None
                break
        if made and len(made) >= 2:
            for m_ in made:
                m_["split"] = True
            nums.extend(made)
        else:
            bad.append(mk(r)[1])
    for n in [n for n in nums if n.get("partial")]:
        below = [d for d in digit_bits if abs(d["x1"] - n["x1"]) < 3 and 4 < d["top"] - n["top"] < 15]
        fixed = n["text"] + "".join(d["text"] for d in sorted(below, key=lambda d: d["x0"]))
        if len(below) == 1 and FULL.match(fixed):
            n["text"] = fixed
            n["wrapped"] = True
            del n["partial"]
            digit_bits.remove(below[0])
        else:
            nums.remove(n)
            bad.append(n)
    for dsh in dashes:
        below = [n for n in nums if abs(n["x1"] - dsh["x1"]) < 3.5 and 3 < n["top"] - dsh["top"] < 15
                 and not n["text"].startswith("-")]
        if len(below) == 1:
            n = below[0]
            n["text"] = "-" + n["text"]
            n["top"], n["bottom"] = dsh["top"], dsh["bottom"]
            n["wrapped_sign"] = True
    return nums, labels, bad, edges


def rows_of(items, tol=2.5):
    rows = []
    for it in sorted(items, key=lambda i: (i["top"], i["x0"])):
        if rows and abs(rows[-1]["top"] - it["top"]) <= tol:
            rows[-1]["items"].append(it)
        else:
            rows.append({"top": it["top"], "items": [it]})
    for r in rows:
        r["items"].sort(key=lambda i: i["x0"])
        r["text"] = " ".join(i["text"] for i in r["items"])
        r["x0"] = min(i["x0"] for i in r["items"])
        r["x1"] = max(i["x1"] for i in r["items"])
    return rows


def merge_wrapped_labels(rows):
    """'Gross Total DEMAND' on one line and 'XXXVIII' on the next are one label."""
    out = []
    for r in rows:
        if out and r["text"].strip() and re.fullmatch(ROMAN, r["text"].replace(" ", "")) and \
           re.search(r"Demand$", out[-1]["text"].strip(), re.I) and 0 < r["top"] - out[-1]["top"] < 14:
            out[-1]["text"] = out[-1]["text"].rstrip() + " " + r["text"].replace(" ", "")
            continue
        out.append(r)
    return out


def table_columns(nums, book, fallback_edges=None):
    """The columns of a summary page, from the right edges of figures in rows that
    hold two or more figures. The k rightmost clusters are the k columns. A page that
    carries only the last row or two of a summary has too few figures for that; it
    takes the columns of the section's earlier page, which is the same table."""
    cols = columns_for(book)
    k = len(cols)
    xs = sorted(n["x1"] for r in rows_of(nums, tol=2.0) if len(r["items"]) >= 2 for n in r["items"])
    clusters = []
    for x in xs:
        if clusters and x - clusters[-1][-1] <= 3.0:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    clusters = [c for c in clusters if len(c) >= 2]
    if len(clusters) >= k:
        return [dict(cols[i], x1=sum(c) / len(c)) for i, c in enumerate(clusters[-k:])]
    if fallback_edges and len(fallback_edges) >= k:
        return [dict(cols[i], x1=x) for i, x in enumerate(sorted(fallback_edges)[-k:])]
    return []


def place(row_nums, cols):
    """Each figure goes to the column whose right edge it shares, within 6 points."""
    res = {}
    for n in row_nums:
        d = [abs(n["x1"] - c["x1"]) for c in cols]
        k = min(range(len(cols)), key=lambda i: d[i])
        if d[k] > 6:
            return None, "figure %s is under no column" % n["text"]
        if k in res:
            return None, "two figures in one column"
        res[k] = n["text"]
    return res, None


def read_totals(pages, demand, book, hint_pages=()):
    """Totals of one demand section. `pages` are (page_number, page) pairs to search,
    `hint_pages` the section's first pages, used for column edges when a totals page
    has too few clean figures of its own. Returns (totals, problems)."""
    hint = None
    for _, hp in hint_pages:
        e = page_items(hp)[3]
        if len(e) >= 3:
            hint = e
    found, probs = {}, []
    for pno, page in pages:
        nums, labels, bad, _ = page_items(page, hint)
        if not nums:
            continue
        cols = table_columns(nums, book, hint)
        lrows = merge_wrapped_labels(rows_of(labels))
        nrows = rows_of(nums, tol=2.0)
        owner = {}
        for ni, nr in enumerate(nrows):
            best, bd = None, 1e9
            for li, lr in enumerate(lrows):
                if lr["x1"] > min(n["x0"] for n in nr["items"]):
                    continue  # a label sits to the left of its figures
                d = abs(lr["top"] - nr["top"])
                if d < bd:
                    best, bd = li, d
            if best is not None and bd <= 16:
                owner.setdefault(best, []).append((bd, ni))

        def figures_for(li):
            cand = sorted(owner.get(li, []))
            return nrows[cand[0][1]] if cand else None

        for li, lr in enumerate(lrows):
            for kind, rx in TOTAL_KINDS:
                if kind in found:
                    continue
                m = rx.search(lr["text"])
                if not m or m.group(1) != demand:
                    continue
                nr = figures_for(li)
                why = None
                if nr is None:
                    why = "no figures beside the label"
                elif len(cols) not in (3, 4):
                    why = "columns not found on the page"
                elif any(abs(b["top"] - nr["top"]) < 2.5 for b in bad):
                    why = "an unreadable figure on the total row"
                if why:
                    probs.append({"kind": kind, "page": pno, "why": why, "label": lr["text"][:80]})
                    found[kind] = None
                    continue
                placed, err = place(nr["items"], cols)
                if err:
                    probs.append({"kind": kind, "page": pno, "why": err, "label": lr["text"][:80], "figures": nr["text"]})
                    found[kind] = None
                    continue
                entry = {"page": pno, "label": re.sub(r"\s+", " ", m.group(0)),
                         "columns": [{"kind": c["kind"], "year": c["year"], "printed": placed.get(i),
                                      "lakh": str(lakh(placed[i])) if i in placed else None}
                                     for i, c in enumerate(cols)]}
                for lj in range(li + 1, min(li + 5, len(lrows))):
                    t = lrows[lj]["text"].strip()
                    key = "recoveries" if RECOV.search(t) else ("charged" if re.fullmatch(r"Charged", t, re.I)
                                                              else ("voted" if re.fullmatch(r"Voted", t, re.I) else None))
                    if key is None:
                        break
                    sub = figures_for(lj)
                    if sub is not None and key not in entry:
                        pl, e2 = place(sub["items"], cols)
                        if not e2:
                            entry[key] = [str(lakh(pl[i])) if i in pl else None for i in range(len(cols))]
                if kind == "net" and found.get("gross") and "recoveries" not in found["gross"] \
                        and found["gross"]["page"] != pno:
                    # the gross total ended the page before; its recoveries open this page, above the net
                    above = [lj for lj in range(li) if RECOV.search(lrows[lj]["text"])]
                    if above and not any(rx.search(lrows[lj]["text"]) for lj in range(above[-1] + 1, li) for _, rx in TOTAL_KINDS):
                        sub = figures_for(above[-1])
                        if sub is not None:
                            pl, e2 = place(sub["items"], cols)
                            if not e2:
                                found["gross"]["recoveries"] = [str(lakh(pl[i])) if i in pl else None for i in range(len(cols))]
                found[kind] = entry
        if "net" in found or ("total" in found and "gross" not in found):
            break  # this section's totals are complete; a gross total alone waits for its net on the next page
    return {k: v for k, v in found.items() if v}, probs


def page_texts(pdf_path, pdf=None):
    """The text layer of every page, used only to find pages, never figures.

    pdftotext (poppler) does this in seconds; pdfplumber takes many minutes for a
    200-page volume, so it is the fallback when poppler is not installed."""
    import shutil
    import subprocess
    if shutil.which("pdftotext"):
        out = subprocess.run(["pdftotext", "-layout", str(pdf_path), "-"], capture_output=True, check=True)
        return out.stdout.decode("utf-8", errors="replace").split("\f")
    texts = []
    for page in pdf.pages:
        texts.append(page.extract_text() or "")
        page.flush_cache()
    return texts


def find_sections(texts):
    """Where each demand section opens: a '<R> DEMAND' line followed within a few
    lines by the 'ESTIMATE OF THE AMOUNTS REQUIRED' banner."""
    starts = []
    for pi, txt in enumerate(texts, start=1):
        lines = txt.split("\n")
        for i, ln in enumerate(lines[:25]):
            m = SECTION_HEAD.search(ln)
            dem = (m.group(1) or m.group(2)) if m else None
            if dem and any(ESTIMATE.search(x) for x in lines[i + 1:i + 12]):
                head = "\n".join(lines[i:i + 16])
                sec = "NON-PLAN" if re.search(r"NON\s*-?\s*PLAN", head) else (
                    "PLAN" if re.search(r"(?<![A-Z])PLAN(?![A-Z])", head) else "ALL")
                gv = GRANT_VOTED.search(txt)
                sc = SUMS_CHARGED.search(txt)
                starts.append({"page": pi, "demand": dem, "section": sec,
                               "grant_voted": gv.group(1) if gv else None,
                               "sums_charged": sc.group(1) if sc else None})
                break
    return starts


def read_volume(pdf, book, part, texts):
    """All demand sections of one Volume III part. `pdf` is an open pdfplumber PDF,
    `texts` its page texts from page_texts()."""
    sections, problems = [], []
    starts = find_sections(texts)
    for si, s in enumerate(starts):
        if si and starts[si - 1]["demand"] == s["demand"] and starts[si - 1]["section"] == s["section"] \
                and s["page"] - starts[si - 1]["page"] <= 1:
            continue  # the same opening banner repeated on the next page
        end = len(texts)
        for nxt in starts[si + 1:]:
            if (nxt["demand"], nxt["section"]) != (s["demand"], s["section"]):
                end = nxt["page"]
                break
        rec = {"book": book, "part": part, "demand": s["demand"], "section": s["section"],
               "start_page": s["page"],
               "grant_voted_be": str(lakh(s["grant_voted"])) if s["grant_voted"] else None,
               "sums_charged_be": str(lakh(s["sums_charged"])) if s["sums_charged"] else None}
        cand = [pi for pi in range(s["page"], end + 1) if pi - 1 < len(texts)
                and any(m.group(1) == s["demand"] for rx in (GROSS, NET, TOTAL) for m in rx.finditer(texts[pi - 1]))]
        if not cand:
            problems.append({"book": book, "part": part, "demand": s["demand"], "section": s["section"],
                             "page": s["page"], "why": "no total label found"})
            rec["totals"] = {}
            sections.append(rec)
            continue
        cand = cand[:2]
        hint_pages = [(q, pdf.pages[q - 1]) for q in range(max(1, cand[0] - 2), cand[0] + 1)]
        totals, probs = read_totals([(q, pdf.pages[q - 1]) for q in cand], s["demand"], book, hint_pages)
        for q in set([q for q, _ in hint_pages] + cand):
            pdf.pages[q - 1].flush_cache()
        for pr in probs:
            pr.update({"book": book, "part": part, "demand": s["demand"], "section": s["section"]})
        problems += probs
        rec["totals"] = totals
        sections.append(rec)
    return sections, problems
