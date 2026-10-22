"""
Which row in the register a report row is talking about, when the codes
do not say.

WHY THIS FILE EXISTS

PAIMANA renumbered every central-sector project and prints the old code as
"-". The first live import matched rows by code, then by exact title, and
found five of a hundred: the redesigned report also reworded most names
("KADAPPA AIRPORT- CONSTRUCTION OF NEW DOMESTIC TERMINAL BUILDING ..."
became "Construction of New Domestic Terminal Building Building and
miscellaneous works ... at Kadapa Airport"). The other 95 were treated as
new projects, so the register held two rows for each: the June 2025 one,
stale at 76 per cent, and the July 2026 one. Same dam, twice.

HOW IT IS USED

This module proposes; it does not decide what production writes.
scripts/mospi_renumbering.py runs it over two editions and prints every
pair with its evidence. The pairs that hold up are recorded in
mospi_renumbering.json, and that file is what the importer consults
(mospi_projects._find_existing). A reviewed list is deterministic and can
be audited line by line; a live heuristic in the daily job could one day
merge a new package into its neighbour and rewrite a real project's
history without anyone noticing.

WHAT IDENTIFIES A PROJECT

Measured on the real June 2025 and July 2026 rows, not assumed:

* Cost. A project's original cost is printed to the paisa and does not
  change between editions. Equal to the paisa is strong evidence; "within
  half a per cent" is not, because two different road packages costing
  907.76 and 909.19 crore exist, and so do 956.14 and 956.40.
* Name. Reworded, re-cased, re-punctuated, but the place names and the
  chainage numbers survive ("Kodur", "Vanavolu", "24.300"). Words that
  appear in most titles ("access controlled", "highway") say nothing
  about which project is meant, so every word is weighted by how rare it
  is among the rows on both sides of the run.
* Package number. Package-3 is never Package-4, however alike the rest of
  the title reads.
* Stretch. Adjacent road sections share a boundary chainage (22.300 to
  58.635, then 58.635 to 99.409); a shared number is not a shared stretch.
* Approval month. Usually the same, often a month or two apart, sometimes
  a year apart (PAIMANA re-entered these). Worth points when it agrees and
  nothing when it does not.
* Sector. A road is never a railway. Different sectors never match.
* Progress. It only goes up. A register row already further along than
  the report row is a different work, whatever the name says.

Silence is the safe answer. A row nobody claims clearly becomes a new
project, which the reviewed map can still merge later; a wrong match
rewrites a real project's history. So a match needs a clear score AND a
clear lead over the runner-up, and every match carries the evidence it was
made on.

Everything here is pure: no database, no I/O.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Iterable, Optional

STOP = frozenset("""
of the and to in at on for from with by a an km kms mtr mtrs no ch package pkg phase stage
part section state under new work works project projects including incl i/c design existing
""".split())

# Letters and digits are split apart: the PDF glues "Vijayawada19.50 km" and
# "Plant12.04 km" together, and "NH-716B" reads the same as "NH 716 B".
_WORD = re.compile(r"[a-z]+|[0-9]+")
# A chainage is printed "228+000", "228.000", "228/000" or (PAIMANA) "228000":
# one token either way, because it is the most exact thing a road title says.
_CHAINAGE = re.compile(r"(?<![0-9])(\d{1,3})[.+/](\d{3})(?![0-9])")
_ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}
# "Package-08", "Pkg-III", "(PKG 2)", "Phase-II", "Phase 1".
_UNIT = re.compile(r"(?<![a-z])(package|pkg|phase)\s*[-.]?\s*(\d{1,2}|[ivx]{1,4})(?![a-z0-9])", re.I)


def tokens(text: str) -> frozenset[str]:
    """Words that carry identity: lowercase, no punctuation, no filler,
    chainages joined into one token, and a normalised token for a package or
    phase number ("pkg3", "phase2")."""
    # "26.150" becomes "26150 26": the joined chainage and its kilometre.
    low = _CHAINAGE.sub(r"\1\2 \1", (text or "").lower())
    out = {w for w in _WORD.findall(low) if w not in STOP and len(w) > 1}
    for kind, num in _UNIT.findall(low):
        n = int(num) if num.isdigit() else _ROMAN.get(num)
        if n:
            out.add(("phase" if kind == "phase" else "pkg") + str(n))
    return frozenset(out)


def chainages(toks: frozenset[str]) -> frozenset[str]:
    """The chainage tokens in a title: runs of four to six digits that are
    not a year ("22300", "58635", "0000")."""
    return frozenset(t for t in toks if t.isdigit() and 4 <= len(t) <= 6 and not t[:2] in ("19", "20"))


def different_stretch(a: frozenset[str], b: frozenset[str]) -> bool:
    """
    Both titles name a from-to stretch and neither end agrees. Adjacent
    sections share their boundary chainage (22.300-58.635 and 58.635-99.409),
    so one shared number is not agreement. One edition may print existing
    and design chainages together ("existing km 39.380 (design ch. 37.000) to
    km 74.450 (design ch. 69.000)") where the other prints design only
    ("37.000 to 69.000"): a shared start or a shared end is agreement enough.
    """
    ca, cb = chainages(a), chainages(b)
    if len(ca) < 2 or len(cb) < 2:
        return False
    ia, ib = sorted(int(t) for t in ca), sorted(int(t) for t in cb)
    return ia[0] != ib[0] and ia[-1] != ib[-1]


def unit(toks: frozenset[str]) -> Optional[str]:
    """The package or phase number a title names, if any ("pkg3")."""
    for t in toks:
        if t.startswith("pkg") and t[3:].isdigit():
            return t
    return None


def same_month(x, y) -> bool:
    return bool(x and y and x.year == y.year and x.month == y.month)


def months_apart(x, y) -> Optional[int]:
    if not (x and y):
        return None
    return abs((x.year - y.year) * 12 + (x.month - y.month))


def close(a: Optional[float], b: Optional[float]) -> bool:
    """Equal to the paisa, or within 0.01 per cent for the odd re-rounded
    figure (34,012.00 against 34,012.50). Never looser: 956.14 and 956.40
    are two different road packages, and so are 907.76 and 909.19."""
    if a is None or b is None or a <= 0 or b <= 0:
        return False
    return abs(a - b) <= 0.011 or abs(a - b) / max(a, b) <= 0.0001


class Lexicon:
    """
    How much each word says about which project is meant, learned from the
    titles on both sides of one run. A word in most titles weighs almost
    nothing; a word in one or two weighs the most (smoothed inverse
    document frequency).
    """

    def __init__(self, token_sets: Iterable[frozenset[str]]):
        sets = list(token_sets)
        self.n = len(sets)
        self.df: Counter = Counter()
        for s in sets:
            self.df.update(s)

    def weight(self, tok: str) -> float:
        return math.log((self.n + 1) / (self.df.get(tok, 0) + 1))

    def mass(self, toks: frozenset[str]) -> float:
        return sum(self.weight(t) for t in toks)

    def similarity(self, a: frozenset[str], b: frozenset[str]) -> float:
        """Weighted containment: the share of the lighter title's meaning
        found in the other. 0..1."""
        if not a or not b:
            return 0.0
        denom = min(self.mass(a), self.mass(b))
        if denom <= 0:
            return 0.0
        return self.mass(a & b) / denom


@dataclass
class Candidate:
    """One register row as the matcher sees it. `key` is whatever the caller
    needs back (a Project object, an id)."""
    key: object
    title: str
    approval: object = None            # datetime or None
    cost: Optional[float] = None       # the cost the register holds
    progress: Optional[float] = None
    ptype: Optional[str] = None
    toks: frozenset = field(default_factory=frozenset)

    def __post_init__(self):
        if not self.toks:
            self.toks = tokens(self.title)


@dataclass
class Match:
    candidate: Candidate
    score: int
    evidence: list[str]

    @property
    def why(self) -> str:
        return "; ".join(self.evidence)


THRESHOLD = 4       # e.g. cost + a strong name, or the same month + a strong name
MARGIN = 2          # the runner-up must be at least this far behind, or nobody is chosen
SAME_NAME = 0.9     # +3: every distinctive word of the shorter title is in the other
STRONG_NAME = 0.6   # +2
WEAK_NAME = 0.4     # +1


def score(new: dict, cand: Candidate, new_type: Optional[str], lex: Lexicon) -> Match:
    """Points for each independent witness (module note)."""
    ev: list[str] = []
    pts = 0
    if new_type and cand.ptype and new_type != cand.ptype:
        return Match(cand, -10, ["different sector"])
    gap = months_apart(new.get("approval"), cand.approval)
    if gap == 0:
        pts += 2
        ev.append(f"approved {cand.approval:%m/%Y}")
    elif gap is not None and gap <= 3:
        pts += 1
        ev.append(f"approval {gap} month(s) apart")
    for label, value in (("original cost", new.get("cost_original")), ("revised cost", new.get("cost"))):
        if close(value, cand.cost):
            pts += 2
            ev.append(f"{label} {value:,.2f} matches")
            break
    new_toks = tokens(new.get("name", ""))
    # Two sibling works never share a package number: Package-3 is not
    # Package-4 however alike the rest of the title reads.
    a, b = unit(new_toks), unit(cand.toks)
    if a and b:
        if a != b:
            pts -= 3
            ev.append(f"different package ({a} vs {b})")
        else:
            pts += 1
            ev.append(f"same package ({a})")
    if different_stretch(new_toks, cand.toks):
        pts -= 2
        ev.append("different stretch")
    sim = lex.similarity(new_toks, cand.toks)
    if sim >= SAME_NAME:
        pts += 3
    elif sim >= STRONG_NAME:
        pts += 2
    elif sim >= WEAK_NAME:
        pts += 1
    if sim >= WEAK_NAME:
        ev.append(f"name {sim:.0%} shared")
    if cand.progress is not None and new.get("progress") is not None and cand.progress > new["progress"] + 5:
        pts -= 3
        ev.append(f"progress would fall {cand.progress:.0f}% -> {new['progress']:.0f}%")
    return Match(cand, pts, ev)


def rank(new: dict, candidates: Iterable[Candidate], new_type: Optional[str], lex: Lexicon) -> list[Match]:
    return sorted((score(new, c, new_type, lex) for c in candidates), key=lambda m: -m.score)


def best_match(new: dict, candidates: Iterable[Candidate], new_type: Optional[str], lex: Lexicon) -> Optional[Match]:
    """
    The one candidate this report row is about, or None when no candidate is
    both good enough and clearly better than the rest.
    """
    scored = rank(new, candidates, new_type, lex)
    if not scored or scored[0].score < THRESHOLD:
        return None
    if len(scored) > 1 and scored[0].score - scored[1].score < MARGIN:
        return None
    return scored[0]


def lexicon_for(new_rows: Iterable[dict], candidates: Iterable[Candidate]) -> Lexicon:
    """Word weights for one run: every title on both sides."""
    return Lexicon([tokens(r.get("name", "")) for r in new_rows] + [c.toks for c in candidates])


def assign(new_rows: list[dict], candidates: list[Candidate], types: list[Optional[str]]) -> dict[int, Match]:
    """
    Match a whole report against the register at once, best evidence first,
    so that one register row is never claimed by two report rows: the
    stronger claim wins and the weaker one becomes a new project (or waits
    for the renumbering map). Returns {index of report row: Match}.
    """
    lex = lexicon_for(new_rows, candidates)
    ranked = {i: rank(r, candidates, types[i], lex) for i, r in enumerate(new_rows)}
    claims = sorted(
        ((ms[0].score, i) for i, ms in ranked.items() if ms and ms[0].score >= THRESHOLD),
        key=lambda t: -t[0],
    )
    out: dict[int, Match] = {}
    taken: set[int] = set()
    for _, i in claims:
        free = [m for m in ranked[i] if id(m.candidate) not in taken]
        if not free or free[0].score < THRESHOLD:
            continue
        if len(free) > 1 and free[0].score - free[1].score < MARGIN:
            continue
        out[i] = free[0]
        taken.add(id(free[0].candidate))
    return out
