"""
The editorial gate for district paper stories, run by the API before a draft is saved
and again before it is approved.

It is the same set of rules as web/scripts/check_editorial.py (the build-time gate for
the hand-written stories), applied to the gathered items in the database instead of the
gathering folder. It does not judge the writing. It checks what a reader must be able
to trust:

1. Every story points at an item gathered for that district (its url).
2. The quote is really in that item's stored text (title or summary). The build-time
   gate can also read the raw official file; the API cannot, so a story whose quote is
   only in a raw file carries `quote_file` and is flagged for a person to check, never
   passed silently.
3. Every number in the headline, body and meaning lines appears in the quote, the item's
   title or the dates. No sums, differences or shares of our own making.
4. No party names, no politicians' names, no em dash, en dash or double dash.

Keep the two gates in step: a rule added to one is added to the other.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

TEXT_FIELDS = ("head_en", "head_te", "en", "te", "mean_en", "mean_te", "kicker_en", "kicker_te")
REQUIRED = ("id", "kicker_en", "kicker_te", "head_en", "head_te", "en", "te", "date", "source_en", "source_te", "url", "quote")
BANNED = [
    "TDP", "YSRCP", "YSR Congress", "Janasena", "Jana Sena", "BJP", "Congress", "Telugu Desam", "Shri ", "Smt", "Hon'ble",
    "తెలుగుదేశం", "వైఎస్సార్‌సీపీ", "వైఎస్ఆర్ కాంగ్రెస్", "జనసేన", "బీజేపీ", "కాంగ్రెస్",
    "—", "–", "--",
]
NAMES_EN = re.compile(r"\b(Naidu|Chandrababu|Jagan|Pawan|Kalyan|Lokesh|Modi|Vaishnaw|Nadda|Rammohan|Reddy)\b", re.I)
NAMES_TE = ("నాయుడు", "చంద్రబాబు", "జగన్", "పవన్", "లోకేష్", "మోదీ", "రెడ్డి")
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def banned_in(v: str) -> list[str]:
    hits = [b for b in BANNED if b.lower() in v.lower()]
    hits += [m.group(0) for m in NAMES_EN.finditer(v)]
    hits += [t for t in re.split(r"[\s,.:;()]+", v) if t.startswith(NAMES_TE)]
    return hits


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("‌", "")).strip().lower()


def nums(s: str | None) -> set[str]:
    out = set()
    for m in NUM.findall(s or ""):
        v = m.replace(",", "").rstrip(".")
        if "." in v:
            v = v.rstrip("0").rstrip(".") or "0"
        out.add(v.lstrip("0") or "0")
    return out


@dataclass
class GateResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    # Stories a person must check against the raw file before approving.
    needs_person: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def as_dict(self) -> dict:
        return {"ok": self.ok, "errors": self.errors, "warnings": self.warnings, "needs_person": self.needs_person}


def check_story(story: dict, items: Iterable[dict]) -> GateResult:
    """One story against the gathered items that share its url (title, summary, date of each)."""
    r = GateResult()
    sid = story.get("id", "?")
    for k in REQUIRED:
        if not story.get(k):
            r.errors.append(f"{sid}: missing {k}")
    srcs = list(items)
    if not srcs:
        r.errors.append(f"{sid}: url is not an item gathered for this district")
        return r
    hay = " ".join(norm(f"{x.get('title', '')} {x.get('summary') or ''}") for x in srcs)
    q = story.get("quote", "")
    if norm(q) not in hay:
        if story.get("quote_file"):
            r.needs_person.append(f"{sid}: quote is in the raw file {story['quote_file']!r}, not in the stored text; check it by hand")
        else:
            r.errors.append(f"{sid}: quote not found in the item's text")
    allowed = nums(q) | nums(story.get("date", ""))
    for x in srcs:
        allowed |= nums(x.get("title", "")) | nums(str(x.get("date", "")))
    allowed |= {str(int(x)) for x in (story.get("date") or "0-0-0").split("-") if x.isdigit()}
    for k in TEXT_FIELDS:
        v = story.get(k) or ""
        extra = nums(v) - allowed
        if extra:
            r.errors.append(f"{sid}: {k} has numbers not in the quote or title: {sorted(extra)}")
        for b in banned_in(v):
            r.errors.append(f"{sid}: {k} contains banned text {b!r}")
    for k in ("source_en", "source_te"):
        for b in banned_in(story.get(k) or ""):
            r.errors.append(f"{sid}: {k} contains banned text {b!r}")
    if len(story.get("head_en", "")) > 90:
        r.warnings.append(f"{sid}: English headline over 90 characters")
    return r


def check_edition(content: dict, items_by_url: dict[str, list[dict]]) -> GateResult:
    """Every story of an edition. `items_by_url` holds this district's gathered items by url."""
    out = GateResult()
    seen = set()
    lead = content.get("lead") or []
    if not lead and not content.get("none_reason_en"):
        out.errors.append("no lead stories and no none_reason_en")
    for st in lead:
        sid = st.get("id", "?")
        if sid in seen:
            out.errors.append(f"{sid}: duplicate id")
        seen.add(sid)
        r = check_story(st, items_by_url.get(st.get("url") or "", []))
        out.errors += r.errors
        out.warnings += r.warnings
        out.needs_person += r.needs_person
    return out
