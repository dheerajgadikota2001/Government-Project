"""
Where a project is, as official papers print it, and which of today's districts that means.

THE PROBLEM THIS SOLVES
About 200 projects reached readers with "District not named in the paper". For many of
them another official paper does name the district: a CAG audit, a Lok Sabha answer, a
gazette notice, a district collector's page. seed/project_place_claims_seed.json holds
those readings, one row per district per project, each with its paper, date and the
exact words.

WHY A PRINTED DISTRICT IS NOT SIMPLY TODAY'S DISTRICT
Andhra Pradesh redrew its districts on 4 April 2022 (13 became 26) and again from
1 January 2026 (Markapuram and Polavaram were cut from Prakasam and Alluri Sitharama
Raju). A paper written in 2018 that says "West Godavari" means the old West Godavari.
Polavaram's dam sat in it then and sits in Eluru now. Reading that word as today's West
Godavari would put the dam in the wrong district while looking sourced, which is worse
than saying nothing.

So every reading keeps the name exactly as printed, with its date, and a row is placed
on today's districts only when one of these holds:

1. The paper is dated on or after 1 January 2026 and the name is one of today's
   districts. It was written under today's map.
2. The paper is dated between 4 April 2022 and 31 December 2025, the same paper names
   at least one district that only exists since 2022 (NTR, Tirupati, Eluru and so on),
   and the district was not split again in 2026. "The same paper" means this project's
   readings from it, or the paper's own wider use recorded in source.map_2022_evidence
   (a Lok Sabha table whose District column lists Sri Satya Sai and Annamayya was
   written with the 2022 map, even on a row that names only Krishna). The new name shows the writer used the
   2022 map, and the 2022 district still has the same land today.
3. The paper names a mandal or village, and the government's own place directory
   (the Local Government Directory, built into seed/ap_place_index.json by
   scripts/build_place_index.py) puts that place in exactly one of today's districts.
   Where the printed district disagrees, the reading says so.

Rule 2 needs the signal because papers keep using old names after a change. A forest
clearance paper of December 2022 places Varikapudisela at "Veldurthi Mandal, Guntur
District", but Veldurthi has been in Palnadu since April 2022. Without a sign that the
writer used the new map, a date alone proves nothing.

Everything else stays as printed, and the reader is told why it is not on today's map.
Pure functions and no database, so every rule here can be tested directly.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
from functools import lru_cache
from typing import Any, Optional
from urllib.parse import urlsplit

from app.constants.districts import SPLIT_IN_2026, normalise_district

SEED = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    "seed", "project_place_claims_seed.json")
PLACE_INDEX = os.path.join(os.path.dirname(SEED), "ap_place_index.json")

REDRAWN_2022 = dt.date(2022, 4, 4)
REDRAWN_2026 = dt.date(2026, 1, 1)

# Districts that exist only since April 2022. A paper that names one of them was
# written with the 2022 map in front of it.
NEW_IN_2022 = frozenset({
    "Alluri Sitharama Raju", "Anakapalli", "Annamayya", "Bapatla", "Dr. B.R. Ambedkar Konaseema",
    "Eluru", "Kakinada", "Nandyal", "NTR", "Palnadu", "Parvathipuram Manyam", "Sri Sathya Sai", "Tirupati",
})
# Districts that lost land in January 2026 (SPLIT_IN_2026, from app.constants.districts):
# Prakasam to Markapuram (G.O.Ms.No.524) and Alluri Sitharama Raju to Polavaram
# (G.O.Ms.No.517), both of 30 Dec 2025, as cited by RBI circular RBI/2026-27/09.
# A 2022-2025 paper naming one of these cannot say which of today's two districts it meant.

MEANINGS = ("located", "route", "served")
# Official sources only. Government domains, plus the statutory and public-sector bodies
# that publish about their own works. A newspaper here is a failed gate, not a source.
OFFICIAL_HOSTS = ("gov.in", "nic.in", "hindustanpetroleum.com", "nicdc.in", "ctuap.ac.in")


class PlaceGateFailure(ValueError):
    """The seed holds a reading that must not reach readers. The message says which."""


def _date(value: Optional[str]) -> Optional[dt.date]:
    """ISO day, month or year. A month or a year is read as its last day, the latest it can mean."""
    if not value:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return dt.date.fromisoformat(value)
    if re.fullmatch(r"\d{4}-\d{2}", value):
        y, m = map(int, value.split("-"))
        return (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1))
    if re.fullmatch(r"\d{4}", value):
        return dt.date(int(value), 12, 31)
    raise PlaceGateFailure(f"date {value!r} is not ISO (YYYY, YYYY-MM or YYYY-MM-DD)")


def _fold(name: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", name.lower()).split())


def _official(url: str) -> bool:
    if url == "title":
        return True
    host = (urlsplit(url).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in OFFICIAL_HOSTS)


def validate(seed: dict) -> None:
    """Refuse the seed if any reading could mislead. Raises PlaceGateFailure naming the row."""
    seen = set()
    for i, c in enumerate(seed.get("claims", [])):
        where = f"claim {i} ({c.get('project', {}).get('external_id')}, {c.get('district_as_printed')!r})"
        p = c.get("project") or {}
        if not (p.get("source_portal") and p.get("external_id") and p.get("title_starts")):
            raise PlaceGateFailure(f"{where}: the project key needs source_portal, external_id and title_starts")
        if not (c.get("district_as_printed") or "").strip():
            raise PlaceGateFailure(f"{where}: no district")
        if c.get("meaning") not in MEANINGS:
            raise PlaceGateFailure(f"{where}: meaning must be one of {MEANINGS}")
        src = c.get("source") or {}
        if not src.get("url") or not _official(src["url"]):
            raise PlaceGateFailure(f"{where}: source {src.get('url')!r} is not an official host")
        if not src.get("title"):
            raise PlaceGateFailure(f"{where}: source has no title")
        if not src.get("date") and not src.get("date_note"):
            raise PlaceGateFailure(f"{where}: an undated source must say so in date_note")
        _date(src.get("date"))
        fix = c.get("spelled_elsewhere_as")
        if fix and not (fix.get("name") and fix.get("evidence")):
            raise PlaceGateFailure(f"{where}: a misprint needs the paper's own spelling and where it prints it")
        ev = src.get("map_2022_evidence")
        if ev and not any(_fold(n) in _fold(ev) for n in NEW_IN_2022 | {"NTR", "ASR", "Sri Satya Sai"}):
            raise PlaceGateFailure(f"{where}: map_2022_evidence names no district drawn in 2022")
        quote = c.get("quote") or ""
        if not quote.strip():
            raise PlaceGateFailure(f"{where}: no quote")
        # The quote is the reader's proof. It must contain the district word it is cited for.
        first = _fold(c["district_as_printed"]).split()[0]
        if first not in {"district", "dist"} and first not in _fold(quote):
            raise PlaceGateFailure(f"{where}: the quote does not contain {first!r}")
        key = (p["source_portal"], p["external_id"], _fold(c["district_as_printed"]), c["meaning"])
        if key in seen:
            raise PlaceGateFailure(f"{where}: the same reading twice")
        seen.add(key)


def _index_lookup(index: Optional[dict], places: list[dict]) -> tuple[Optional[str], Optional[str]]:
    """Today's district for the places a paper names, if the directory gives exactly one."""
    if not index or not places:
        return None, None
    found: dict[str, str] = {}
    for kind in ("mandal", "village", "place"):
        for pl in places:
            if pl.get("kind") != kind:
                continue
            table = index.get("mandals" if kind == "mandal" else "villages", {})
            hits = table.get(_fold(pl["name"]))
            if hits and len(hits) == 1:
                # The directory may spell a district its own way (capitals, older forms);
                # fold it onto the name the rest of the site uses where one exists.
                found[pl["name"]] = (normalise_district(hits[0]) or normalise_district(hits[0].replace(".", ""))
                                     or hits[0].title())
        if found:
            break
    districts = set(found.values())
    if len(districts) != 1:
        return None, None
    d = districts.pop()
    names = ", ".join(sorted(found))
    return d, names


def place_today(claim: dict, same_paper: list[dict], index: Optional[dict] = None) -> dict:
    """
    Which of today's districts a reading points to, how that was decided, and why not
    when it cannot be. `same_paper` is every reading of this project from the same paper,
    because rule 2 looks at all the names one paper uses.
    """
    printed = claim["district_as_printed"]
    state = claim.get("state")
    if state and state != "Andhra Pradesh":
        return {"district": None, "how": None, "why": f"This district is in {state}, outside Andhra Pradesh."}
    # A misprint is read as the name the same paper prints elsewhere, never as our own guess.
    # The paper's date goes in, so a pre-2026 "Polavaram" (the dam's mandal) never
    # reads as the district of 2026.
    as_of = claim["source"].get("date")
    canonical = (normalise_district(printed, as_of=as_of)
                 or normalise_district((claim.get("spelled_elsewhere_as") or {}).get("name"), as_of=as_of))
    date = _date(as_of)
    names = {normalise_district(c["district_as_printed"], as_of=c["source"].get("date")) for c in same_paper}

    if date and date >= REDRAWN_2026 and canonical:
        return {"district": canonical, "how": "paper_after_2026",
                "why": "The paper was written under today's districts."}
    uses_2022_map = bool(names & NEW_IN_2022) or bool(claim["source"].get("map_2022_evidence"))
    if (date and REDRAWN_2022 <= date < REDRAWN_2026 and canonical
            and canonical not in SPLIT_IN_2026 and uses_2022_map):
        return {"district": canonical, "how": "paper_uses_2022_map",
                "why": "The paper names districts drawn in 2022, and this one kept its land in 2026."}

    by_place, via = _index_lookup(index, claim.get("places_as_printed") or [])
    if by_place:
        out = {"district": by_place, "how": "place_directory",
               "why": f"The government's place directory puts {via} in {by_place} district."}
        if canonical and canonical != by_place:
            out["why"] += f" The paper itself says {printed}."
        return out

    # The first reason that applies is the one a reader needs; an old date outranks a spelling.
    if date and date < REDRAWN_2022:
        reason = f"The paper is from {date.year}, before the districts were redrawn in April 2022."
    elif not date:
        reason = "The paper is undated, so we cannot tell which map of districts it used."
    elif canonical is None:
        reason = f"The paper's spelling, {printed}, is an older or local name we do not map on our own."
    elif canonical in SPLIT_IN_2026:
        reason = f"{canonical} was split in January 2026, and this paper is older than that."
    else:
        reason = "The paper uses only names that existed before 2022 too, so its map is not certain."
    return {"district": None, "how": None, "why": reason}


@lru_cache(maxsize=1)
def load() -> tuple[dict, Optional[dict]]:
    with open(SEED, encoding="utf-8") as f:
        seed = json.load(f)
    validate(seed)
    index = None
    if os.path.exists(PLACE_INDEX):
        with open(PLACE_INDEX, encoding="utf-8") as f:
            index = json.load(f)
    return seed, index


def readings_by_project(seed: Optional[dict] = None, index: Optional[dict] = None) -> dict[tuple[str, str], list[dict]]:
    """Every reading, grouped by (source_portal, external_id), each with its place today."""
    if seed is None:
        seed, index = load()
    groups: dict[tuple[str, str], list[dict]] = {}
    for c in seed["claims"]:
        groups.setdefault((c["project"]["source_portal"], c["project"]["external_id"]), []).append(c)
    out: dict[tuple[str, str], list[dict]] = {}
    for key, claims in groups.items():
        rows = []
        for c in claims:
            paper = [x for x in claims if x["source"]["url"] == c["source"]["url"]]
            rows.append({
                "district_as_printed": c["district_as_printed"],
                "meaning": c["meaning"],
                "places_as_printed": c.get("places_as_printed") or [],
                "source": c["source"],
                "quote": c["quote"],
                "note": c.get("note"),
                "today": place_today(c, paper, index),
            })
        out[key] = rows
    return out


def summary(readings: list[dict]) -> dict[str, Any]:
    """The short form a project list needs: names as printed, and today's districts where known."""
    printed = []
    for r in readings:
        if r["district_as_printed"] not in printed:
            printed.append(r["district_as_printed"])
    today = sorted({r["today"]["district"] for r in readings if r["today"]["district"]})
    return {"as_printed": printed, "today": today, "readings": len(readings)}


@lru_cache(maxsize=1)
def cached_readings() -> dict[tuple[str, str], list[dict]]:
    """The readings as the API serves them. The seed changes only with a deploy, so once per process."""
    return readings_by_project()
