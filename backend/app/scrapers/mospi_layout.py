"""
The PAIMANA-era flash report, read by position.

WHY THIS FILE EXISTS

MoSPI redesigned the monthly flash report when the PAIMANA portal launched.
The state-wise "Table:-7" the old parser looked for is gone. Ongoing projects
now live in "Table 6: All Ongoing Projects", grouped by ministry and sector,
one block of four to six PDF lines per project, with the state printed on the
same line as the serial number. The old parser found no "Table:-7" heading,
parsed nothing, and the site kept saying Polavaram was 76 per cent built on
figures from June 2025 while the July 2026 report said 86.

This module turns a page's words (pdfplumber's extract_words) into project
blocks. It is pure: no PDF, no network, no database, so the layout rules are
tested against a captured page in a few milliseconds, and a future layout
change fails a test rather than silently parsing zero rows.

THE LAYOUT, MEASURED ON THE JULY 2026 REPORT (page width 1080)

  Sl.No       x 50..80    once per block, on the same line as the state
  Name/agency x 80..470   name lines first, then "(Agency)", then codes:
                          "(Project Code) (Legacy OCMS Code) (PMGID)",
                          each "(-)" when absent
  State       x 470..560
  Approval    x 560..645  "03/2023" then "(01/2024)" = (start date)
  DoC         x 645..745  "01/2026" then "(09/2026)" = (revised DoC)
  Cost        x 745..835  "265.91" then "(265.91)" = (revised cost)
  Expenditure x 835..915
  Progress    x 915..     per cent

Headings ("Ministry of Civil Aviation", "Water Resources") are name-column
lines with nothing else on them, set apart by a larger vertical gap than a
wrapped project name uses: 18 points against 11 or 12. "Total (8) ..." lines
close a group and are skipped.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional

COLUMNS = (
    ("sl", 0, 80), ("name", 80, 470), ("state", 470, 560), ("approval", 560, 645),
    ("doc", 645, 745), ("cost", 745, 835), ("exp", 835, 915), ("prog", 915, 10_000),
)

# A wrapped project name continues 11 or 12 points below; a heading sits
# 18 above the next line. 15 splits the two with room on both sides.
HEADING_GAP = 15
HEADER_BOTTOM = 250     # the column headers end at 241; the first row starts at 263

TABLE_TITLE = "All Ongoing Projects"

_CODE = re.compile(r"^\(([A-Za-z]?\d{4,12}|-)\)$")
_MONTH = re.compile(r"^\(?(\d{1,2})/(\d{4})\)?$")
_MONEY = re.compile(r"^\(?([\d,]+(?:\.\d+)?)\)?$")


def column_of(x0: float) -> str:
    for name, lo, hi in COLUMNS:
        if lo <= x0 < hi:
            return name
    return "prog"


@dataclass
class Block:
    sl: Optional[int] = None
    ministry: Optional[str] = None
    sector: Optional[str] = None
    state: list = field(default_factory=list)
    name: list = field(default_factory=list)
    agency: list = field(default_factory=list)
    codes: list = field(default_factory=list)
    approval: list = field(default_factory=list)
    doc: list = field(default_factory=list)
    cost: list = field(default_factory=list)
    exp: list = field(default_factory=list)
    prog: list = field(default_factory=list)


FOOTER_TOP = 1430      # the PAIMANA footer and page number sit below this


def _lines(words: Iterable[dict], header_bottom: float) -> list[tuple[float, dict]]:
    """Group words into lines by their top, one dict of column -> tokens each."""
    rows: dict[int, list] = {}
    for w in words:
        if w["top"] <= header_bottom or w["top"] >= FOOTER_TOP:
            continue
        rows.setdefault(round(w["top"]), []).append(w)
    out = []
    for top in sorted(rows):
        cols: dict[str, list[str]] = {}
        for w in sorted(rows[top], key=lambda w: w["x0"]):
            cols.setdefault(column_of(w["x0"]), []).append(w["text"])
        out.append((top, cols))
    return out


def _is_paren_line(tokens: list[str]) -> bool:
    text = " ".join(tokens)
    return text.startswith("(") and text.endswith(")")


def _is_group_total(tokens: list[str]) -> bool:
    """'Total (8)' closes a sector group. 'Total project length 70.9 Km.' is a name."""
    return len(tokens) >= 2 and tokens[0] == "Total" and bool(re.match(r"^\(\d+\)$", tokens[1]))


def _is_heading_text(text: str) -> bool:
    return bool(re.match(r"^(Ministry|Department|Cabinet|NITI|Prime Minister)", text))


def parse_page_words(words: Iterable[dict], header_bottom: float = HEADER_BOTTOM,
                     ministry: Optional[str] = None, sector: Optional[str] = None) -> tuple[list[Block], str, str]:
    """
    Blocks on one page, plus the ministry and sector in force at its end
    (a group can run across pages, so the caller threads them through).
    """
    lines = _lines(words, header_bottom)
    blocks: list[Block] = []
    cur: Optional[Block] = None

    def close():
        nonlocal cur
        if cur is not None and cur.sl is not None:
            blocks.append(cur)
        cur = None

    for i, (top, cols) in enumerate(lines):
        name_only = set(cols) == {"name"}
        name_tokens = cols.get("name", [])

        if name_only:
            text = " ".join(name_tokens)
            if _is_group_total(name_tokens):
                close()
                continue
            if _is_paren_line(name_tokens):
                if cur is None:
                    cur = Block(ministry=ministry, sector=sector)
                for tok in name_tokens:
                    (cur.codes if _CODE.match(tok) else cur.agency).append(tok)
                continue
            # Plain text in the name column: a wrapped name, a new name, or a
            # heading. A block is complete once it has both its serial number
            # and its codes; either can print first (a multi-state row lists
            # its codes above the serial number), and a long name keeps
            # wrapping past the serial number (Sl 780 runs two lines below
            # it). Until both are in, plain text is the same project's name.
            if cur is not None and not (cur.sl is not None and cur.codes):
                cur.name.extend(name_tokens)
                continue
            next_top = lines[i + 1][0] if i + 1 < len(lines) else None
            gap = (next_top - top) if next_top is not None else None
            if _is_heading_text(text) or (gap is not None and gap > HEADING_GAP):
                close()
                if _is_heading_text(text):
                    ministry, sector = text, None
                else:
                    sector = text
                continue
            close()
            cur = Block(ministry=ministry, sector=sector, name=list(name_tokens))
            continue

        # A line carrying figures. It belongs to the open block; a block whose
        # first line already carries figures is opened here. A group's
        # "Total (8) 4039.12 1658.37" line is not a project and closes the group.
        if name_tokens and _is_group_total(name_tokens):
            close()
            continue
        complete = cur is not None and cur.sl is not None and bool(cur.codes)
        plain_name = bool(name_tokens) and not _is_paren_line(name_tokens)
        # A multi-state row prints "Multi-States" on its first name line, so
        # the new project's name arrives with a figure beside it. When the
        # open block already has its number and codes, this is the next one.
        if complete and (plain_name or (cols.get("sl") or [""])[0].isdigit()):
            close()
        if cur is None:
            cur = Block(ministry=ministry, sector=sector)
        if name_tokens:
            if _is_paren_line(name_tokens):
                for tok in name_tokens:
                    (cur.codes if _CODE.match(tok) else cur.agency).append(tok)
            else:
                cur.name.extend(name_tokens)
        sl = cols.get("sl")
        if sl and sl[0].isdigit():
            cur.sl = int(sl[0])
        for col in ("state", "approval", "doc", "cost", "exp", "prog"):
            if col in cols:
                getattr(cur, col).extend(cols[col])

    close()
    return blocks, ministry, sector


def _month(tok: Optional[str]) -> Optional[datetime]:
    if not tok:
        return None
    m = _MONTH.match(tok)
    if not m:
        return None
    mo, yr = int(m.group(1)), int(m.group(2))
    if not (1 <= mo <= 12):
        return None
    return datetime(yr, mo, 1, tzinfo=timezone.utc)


def _money(tok: Optional[str]) -> Optional[float]:
    if not tok:
        return None
    m = _MONEY.match(tok)
    return float(m.group(1).replace(",", "")) if m else None


def _split(tokens: list[str]) -> tuple[Optional[str], Optional[str]]:
    """The bare value and the bracketed one, whichever order they printed in."""
    bare = next((t for t in tokens if not t.startswith("(")), None)
    paren = next((t for t in tokens if t.startswith("(")), None)
    return bare, paren


def extract(block: Block) -> Optional[dict]:
    """Clean fields from a block, or None when it is not a usable project row."""
    name = re.sub(r"\s+", " ", " ".join(block.name)).strip()
    if not name or block.sl is None:
        return None
    agency = re.sub(r"\s+", " ", " ".join(block.agency)).strip()
    agency = agency[1:-1].strip() if agency.startswith("(") and agency.endswith(")") else agency
    codes = [c[1:-1] for c in block.codes]
    codes = [None if c == "-" else c for c in codes]
    code, legacy, pmgid = (codes + [None, None, None])[:3]
    if code is None:
        return None

    approval, start = _split(block.approval)
    doc_orig, doc_rev = _split(block.doc)
    cost_orig, cost_rev = _split(block.cost)
    exp = _money(block.exp[0]) if block.exp else None
    prog = None
    if block.prog:
        try:
            prog = float(block.prog[0].strip("()%"))
        except ValueError:
            prog = None
        if prog is not None and not (0 <= prog <= 100):
            prog = None

    return {
        "sl": block.sl,
        "code": code,
        "legacy_code": legacy,
        "pmgid": pmgid,
        "name": name[:500],
        "agency": agency[:200] or None,
        "state": re.sub(r"\s+", " ", " ".join(block.state)).strip() or None,
        "ministry": block.ministry,
        "sector": block.sector or "",
        "approval": _month(approval),
        "start": _month(start),
        "expected": _month(doc_rev) or _month(doc_orig),
        "expected_original": _month(doc_orig),
        "cost": _money(cost_rev) if cost_rev else _money(cost_orig),
        "cost_original": _money(cost_orig),
        "expenditure": exp,
        "progress": prog,
    }


_REPORT_MONTH = re.compile(
    r"\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{4})\b",
    re.I,
)


def report_month(cover_text: str) -> Optional[tuple[int, int]]:
    """(year, month) from the cover's "JULY 2026", or None."""
    m = _REPORT_MONTH.search(cover_text or "")
    if not m:
        return None
    month = datetime.strptime(m.group(1)[:3].title(), "%b").month
    return int(m.group(2)), month


def month_end(year: int, month: int) -> datetime:
    nxt = datetime(year + (month == 12), (month % 12) + 1, 1, tzinfo=timezone.utc)
    return datetime.fromtimestamp(nxt.timestamp() - 86400, tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


_OVERVIEW_COUNT = re.compile(r"\n(\d{3,5})\s*\|")


def overview_project_count(overview_text: str) -> Optional[int]:
    """
    The national ongoing-project count the report prints on its overview
    page ("1775 | 17 ₹ 33,70,138 ..."). Parsing every row of Table 6 must
    reproduce this number exactly, or the layout has moved under us.
    """
    m = _OVERVIEW_COUNT.search(overview_text or "")
    return int(m.group(1)) if m else None
