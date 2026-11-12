"""
The verifier: does the paper really say what the model says it says?

WHY THIS IS CODE AND NOT ANOTHER MODEL CALL
The failure this platform cannot afford is a figure that looks sourced and is not.
An agent once fabricated a whole table from a PDF (27 Aug 2026), and that is why
approach C was rejected. A second model asked "is this right?" can be as confident
and as wrong as the first. So the first line of defence is plain string matching on
the stored text of the paper. It cannot be talked into agreeing.

WHAT IS CHECKED (a proposal that fails any of 1 to 6 is rejected, with the reason)
1. The proposal is complete: indicator, value, period, quote, page, source link.
2. There is paper text to check against. No text means no verification, never a pass.
3. The quote is in the paper text, word for word (spacing, letter case and the
   shapes of quotation marks and dashes are ignored, because PDF extraction
   changes those; nothing else is).
4. It is on the page the proposal names. A quote on another page is a wrong
   citation, and a reader following it would not find the line.
5. The value is a figure, and every number in it appears in the quote. This is the
   rule that stops sums, differences, conversions and rounding: if the paper does
   not print the number, the number does not pass.
6. It is not a copy of a fact already approved for the same indicator, period and stage.

WHAT IS FLAGGED (passes, but a person should look)
- the period's year is not on the quoted page;
- the unit's words are not on the quoted page (units often sit in a table heading
  on the same page, so this is a look, not a refusal);
- no stage is given (actual, revised estimate, budget estimate);
- it differs from a fact already approved for the same indicator, period and stage.

The evidence the reviewer sees (the words around the quote) is copied from the
paper text by this module. The model never writes it.

PURE ON PURPOSE: no database, no network, no clock. The caller supplies the page
texts and the approved facts, so every rule here is tested with plain dictionaries.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Mapping, Optional

from app.services.editorial_gate import nums

MIN_QUOTE = 12
MAX_QUOTE = 600
EVIDENCE_REACH = 160     # characters of paper text kept either side of the quote

_QUOTES = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
                         "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u00a0": " "})


def fold(s: Optional[str]) -> str:
    """Comparable form: spacing, case, quote and dash shapes and zero-width joiners removed."""
    t = (s or "").replace("‌", "").replace("​", "").translate(_QUOTES)
    return re.sub(r"\s+", " ", t).strip().lower()


def _collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("‌", "").replace("​", "").translate(_QUOTES)).strip()


@dataclass
class Proposal:
    indicator: str
    value: str
    period: str
    quote: str
    source_url: str
    page: Optional[int] = None
    unit: str = ""
    stage: str = ""
    paper_sha256: Optional[str] = None


@dataclass
class KnownFact:
    """A fact already approved, as the verifier needs it."""
    id: int
    indicator: str
    period: str
    stage: str
    value: str


@dataclass
class Verdict:
    ok: bool
    reasons: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    evidence: Optional[str] = None
    page_found: Optional[int] = None


def _evidence(page_text: str, quote: str) -> Optional[str]:
    collapsed = _collapse(page_text)
    low = collapsed.lower()
    q = fold(quote)
    i = low.find(q)
    if i < 0:
        return None
    if len(low) != len(collapsed):          # a case change altered the length: keep indices honest
        return low[max(0, i - EVIDENCE_REACH): i + len(q) + EVIDENCE_REACH]
    return collapsed[max(0, i - EVIDENCE_REACH): i + len(q) + EVIDENCE_REACH]


_FY = re.compile(r"(\d{4})\s*[-/]\s*(\d{2,4})")


def _period_on_page(period: str, page_numbers: set[str]) -> bool:
    """Is the period's year on the page? A financial year such as 2023-24 is usually printed
    as 'March 2024' or '2023-24', so either end of it counts. Anything else needs every figure."""
    m = _FY.search(period or "")
    if m:
        start, end = m.group(1), m.group(2)
        if len(end) == 2:
            end = start[:2] + end
        return start in page_numbers or end in page_numbers or f"{start[2:]}" in page_numbers and f"{end[2:]}" in page_numbers
    return not (nums(period) - page_numbers)


def _key(indicator: str, period: str, stage: str) -> tuple[str, str, str]:
    return fold(indicator), fold(period), fold(stage)


def verify(p: Proposal, pages: Mapping[int, str], known: Iterable[KnownFact] = ()) -> Verdict:
    reasons: list[str] = []
    flags: list[str] = []

    # 1. Complete.
    for name in ("indicator", "value", "period", "quote", "source_url"):
        if not (getattr(p, name) or "").strip():
            reasons.append(f"{name} is missing")
    if p.page is None:
        reasons.append("page is missing")
    quote = fold(p.quote)
    if p.quote and not (MIN_QUOTE <= len(quote) <= MAX_QUOTE):
        reasons.append(f"quote is {len(quote)} characters; it must be between {MIN_QUOTE} and {MAX_QUOTE}")
    if reasons:
        return Verdict(False, reasons)

    # 2. Something to check against.
    texts = {n: t for n, t in pages.items() if (t or "").strip()}
    if not texts:
        return Verdict(False, ["no paper text was supplied, so nothing could be checked"])

    # 3 and 4. The quote is on the named page, word for word.
    on_page = fold(texts.get(p.page, ""))
    found_on = [n for n, t in sorted(texts.items()) if quote in fold(t)]
    page_found = p.page if p.page in found_on else (found_on[0] if found_on else None)
    if p.page not in texts:
        reasons.append(f"page {p.page} is not in the stored text of the paper")
    elif quote not in on_page:
        if found_on:
            reasons.append(f"the quote is on page {found_on[0]}, not page {p.page}")
        else:
            reasons.append("the quote is not in the paper text")

    # 5. The value is a figure the quote prints.
    value_nums = nums(p.value)
    if not value_nums:
        reasons.append("the value contains no figure")
    else:
        missing = sorted(value_nums - nums(p.quote))
        if missing:
            reasons.append("the value has figure(s) the quote does not print: " + ", ".join(missing))

    # 6. Not a copy of an approved fact.
    key = _key(p.indicator, p.period, p.stage)
    for k in known:
        if _key(k.indicator, k.period, k.stage) != key:
            continue
        if nums(k.value) == value_nums and value_nums:
            reasons.append(f"already approved as fact #{k.id}")
        else:
            flags.append(f"differs from approved fact #{k.id} for the same indicator, period and stage ({k.value})")

    if reasons:
        return Verdict(False, reasons, flags, None, page_found)

    page_text = texts[p.page]
    page_numbers = nums(page_text) | nums(p.quote)
    if not _period_on_page(p.period, page_numbers):
        flags.append("the period's year is not on the quoted page")
    unit_words = [w for w in re.findall(r"[^\W\d_]+", p.unit or "") if len(w) > 1]
    if unit_words and not all(fold(w) in fold(page_text) for w in unit_words):
        flags.append("the unit is not on the quoted page")
    if not (p.stage or "").strip():
        flags.append("no stage given (actual, revised estimate or budget estimate)")

    return Verdict(True, [], flags, _evidence(page_text, p.quote), page_found)
