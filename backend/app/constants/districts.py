"""
Canonical district list for Andhra Pradesh.

AP was reorganised in April 2022 from 13 districts into 26. These are the
settled official names — use ONLY this list anywhere a district appears
(filters, dropdowns, validation, scraper normalisation) so the frontend,
the API and the ingested data all agree.
"""

from typing import Iterable, Optional

# All 26 districts, alphabetical. `code` is a stable slug for URLs and
# query params; `name` is what a citizen sees.
AP_DISTRICTS: list[dict[str, str]] = [
    {"code": "alluri-sitharama-raju", "name": "Alluri Sitharama Raju", "hq": "Paderu"},
    {"code": "anakapalli", "name": "Anakapalli", "hq": "Anakapalli"},
    {"code": "ananthapuramu", "name": "Ananthapuramu", "hq": "Ananthapuramu"},
    {"code": "annamayya", "name": "Annamayya", "hq": "Rayachoti"},
    {"code": "bapatla", "name": "Bapatla", "hq": "Bapatla"},
    {"code": "chittoor", "name": "Chittoor", "hq": "Chittoor"},
    {"code": "dr-br-ambedkar-konaseema", "name": "Dr. B.R. Ambedkar Konaseema", "hq": "Amalapuram"},
    {"code": "east-godavari", "name": "East Godavari", "hq": "Rajamahendravaram"},
    {"code": "eluru", "name": "Eluru", "hq": "Eluru"},
    {"code": "guntur", "name": "Guntur", "hq": "Guntur"},
    {"code": "kakinada", "name": "Kakinada", "hq": "Kakinada"},
    {"code": "krishna", "name": "Krishna", "hq": "Machilipatnam"},
    {"code": "kurnool", "name": "Kurnool", "hq": "Kurnool"},
    {"code": "nandyal", "name": "Nandyal", "hq": "Nandyal"},
    {"code": "ntr", "name": "NTR", "hq": "Vijayawada"},
    {"code": "palnadu", "name": "Palnadu", "hq": "Narasaraopet"},
    {"code": "parvathipuram-manyam", "name": "Parvathipuram Manyam", "hq": "Parvathipuram"},
    {"code": "prakasam", "name": "Prakasam", "hq": "Ongole"},
    {"code": "sri-potti-sriramulu-nellore", "name": "Sri Potti Sriramulu Nellore", "hq": "Nellore"},
    {"code": "sri-sathya-sai", "name": "Sri Sathya Sai", "hq": "Puttaparthi"},
    {"code": "srikakulam", "name": "Srikakulam", "hq": "Srikakulam"},
    {"code": "tirupati", "name": "Tirupati", "hq": "Tirupati"},
    {"code": "visakhapatnam", "name": "Visakhapatnam", "hq": "Visakhapatnam"},
    {"code": "vizianagaram", "name": "Vizianagaram", "hq": "Vizianagaram"},
    {"code": "west-godavari", "name": "West Godavari", "hq": "Bhimavaram"},
    {"code": "ysr-kadapa", "name": "YSR Kadapa", "hq": "Kadapa"},
]

DISTRICT_NAMES: list[str] = [d["name"] for d in AP_DISTRICTS]
DISTRICT_CODES: list[str] = [d["code"] for d in AP_DISTRICTS]

_BY_CODE = {d["code"]: d for d in AP_DISTRICTS}
_BY_NAME_LOWER = {d["name"].lower(): d for d in AP_DISTRICTS}

# Pre-2022 names and common variants that still appear in scraped data,
# mapped onto the current district. Extend this as scrapers hit new spellings.
LEGACY_ALIASES: dict[str, str] = {
    "anantapur": "Ananthapuramu",
    "ananthapur": "Ananthapuramu",
    "nellore": "Sri Potti Sriramulu Nellore",
    "spsr nellore": "Sri Potti Sriramulu Nellore",
    "sps nellore": "Sri Potti Sriramulu Nellore",
    "konaseema": "Dr. B.R. Ambedkar Konaseema",
    "b.r. ambedkar konaseema": "Dr. B.R. Ambedkar Konaseema",
    "ambedkar konaseema": "Dr. B.R. Ambedkar Konaseema",
    "manyam": "Parvathipuram Manyam",
    "vizag": "Visakhapatnam",
    "vishakhapatnam": "Visakhapatnam",
    "kadapa": "YSR Kadapa",
    "cuddapah": "YSR Kadapa",
    "ysr": "YSR Kadapa",
    "sri satya sai": "Sri Sathya Sai",
    "sri satyasai": "Sri Sathya Sai",
    "sathya sai": "Sri Sathya Sai",
    "sri balaji": "Tirupati",
    "alluri seetharama raju": "Alluri Sitharama Raju",
    "alluri sitarama raju": "Alluri Sitharama Raju",
    "asr": "Alluri Sitharama Raju",
    "narasaraopet": "Palnadu",
    "rajahmundry": "East Godavari",
    "rajamahendravaram": "East Godavari",
    "vijayawada": "NTR",
    "machilipatnam": "Krishna",
    "tirupathi": "Tirupati",
    "tirupati urban": "Tirupati",
    "sps nellore": "Sri Potti Sriramulu Nellore",
    "nellore": "Sri Potti Sriramulu Nellore",
    "kadapa": "YSR Kadapa",
    "ysr": "YSR Kadapa",
    "konaseema": "Dr. B.R. Ambedkar Konaseema",
    "dr br ambedkar konaseema": "Dr. B.R. Ambedkar Konaseema",
    "manyam": "Parvathipuram Manyam",
    "anantapur": "Ananthapuramu",
    "ananthapur": "Ananthapuramu",
    "anantapuramu": "Ananthapuramu",
}


def normalise_district(raw: Optional[str]) -> Optional[str]:
    """
    Map any scraped district string onto a canonical district name.

    Handles the current 26 names, their slugs, and pre-2022 / colloquial
    variants. Returns None when nothing matches, so callers can decide
    whether to store NULL or flag the row for review.
    """
    if not raw:
        return None

    key = " ".join(raw.strip().lower().split())

    if key in _BY_NAME_LOWER:
        return _BY_NAME_LOWER[key]["name"]

    slug = key.replace(" ", "-").replace(".", "")
    if slug in _BY_CODE:
        return _BY_CODE[slug]["name"]

    if key in LEGACY_ALIASES:
        return LEGACY_ALIASES[key]

    # Scraped PDFs sometimes break a name across a line, leaving a stray space
    # inside it ("Visakhapatna m"). Compare with all spaces removed.
    squashed = key.replace(" ", "")
    for d in AP_DISTRICTS:
        if d["name"].lower().replace(" ", "") == squashed:
            return d["name"]
    for alias, canonical in LEGACY_ALIASES.items():
        if alias.replace(" ", "") == squashed:
            return canonical

    # Last resort: unique substring match ("guntur district" -> "Guntur")
    hits = [d["name"] for d in AP_DISTRICTS if d["name"].lower() in key]
    if len(hits) == 1:
        return hits[0]

    return None


def spellings_folding_to(canonical: str, candidates: Iterable[Optional[str]]) -> list[str]:
    """
    Every raw spelling in `candidates` that means the same district as `canonical`.

    WHY THIS EXISTS
    The map counts fold scraper spellings onto the canonical name before showing
    them, so 16 projects stored as "Anantapur" are displayed under
    "Ananthapuramu". The list query then compared that canonical name against
    the raw column, which still holds "Anantapur", and matched nothing. Six
    districts showed a count on the map and an empty list when opened, hiding
    110 projects: Ananthapuramu, Tirupati, Sri Sathya Sai, Sri Potti Sriramulu
    Nellore, Dr. B.R. Ambedkar Konaseema and Parvathipuram Manyam.

    Folding BOTH sides with the same function is what makes that class of bug
    structurally impossible rather than merely patched. A new misspelling
    arriving from a scraper tomorrow is picked up here on its own, with nobody
    editing an alias table, because this asks the same question the counts ask.

    Pure and DB free on purpose, so the rule can be tested without a database.
    """
    target = normalise_district(canonical)
    if not target:
        return []

    out: list[str] = []
    seen: set[str] = set()
    for raw in candidates:
        if raw is None or raw in seen:
            continue
        seen.add(raw)
        if normalise_district(raw) == target:
            out.append(raw)
    return out


def is_valid_district(name: Optional[str]) -> bool:
    """True only for one of the 26 canonical names."""
    return bool(name) and name in DISTRICT_NAMES
