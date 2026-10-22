"""
The map count and the district list must agree.

These are the six real cases from production on 6 Sep 2026: the map showed a
count, opening the district showed nothing, and 110 projects were unreachable.
The stored spelling is on the left, the name the map displays is on the right.
"""
import pytest

from app.constants.districts import (
    DISTRICT_NAMES,
    normalise_district,
    spellings_folding_to,
)

# (stored spelling in projects.district, canonical name shown on the map)
PRODUCTION_MISMATCHES = [
    ("Anantapur", "Ananthapuramu"),
    ("Tirupathi", "Tirupati"),
    ("Sri Satya Sai", "Sri Sathya Sai"),
    ("SPS Nellore", "Sri Potti Sriramulu Nellore"),
    ("Nellore", "Sri Potti Sriramulu Nellore"),
    ("Konaseema", "Dr. B.R. Ambedkar Konaseema"),
]


@pytest.mark.parametrize("stored,canonical", PRODUCTION_MISMATCHES)
def test_the_stored_spelling_is_found_under_its_canonical_name(stored, canonical):
    assert spellings_folding_to(canonical, [stored]) == [stored]


@pytest.mark.parametrize("stored,canonical", PRODUCTION_MISMATCHES)
def test_and_still_folds_to_that_canonical_name(stored, canonical):
    # If this drifts, the count and the list part company again.
    assert normalise_district(stored) == canonical


def test_a_district_never_claims_another_districts_rows():
    stored = [s for s, _ in PRODUCTION_MISMATCHES] + DISTRICT_NAMES
    for name in DISTRICT_NAMES:
        for match in spellings_folding_to(name, stored):
            assert normalise_district(match) == name


def test_the_canonical_name_matches_itself():
    for name in DISTRICT_NAMES:
        assert name in spellings_folding_to(name, DISTRICT_NAMES)


def test_duplicates_and_nulls_are_dropped():
    got = spellings_folding_to("Ananthapuramu", ["Anantapur", None, "Anantapur", "Kurnool"])
    assert got == ["Anantapur"]


def test_an_unknown_district_matches_nothing():
    assert spellings_folding_to("Chennai", ["Anantapur", "Kurnool"]) == []


def test_an_unrecognised_spelling_is_not_swept_into_a_district():
    # Better an empty list than a district quietly absorbing rows that are not
    # its own. Wrong counts on a transparency site are worse than missing ones.
    assert spellings_folding_to("Kurnool", ["Qqqq Zzzz"]) == []


# ---------------------------------------------------------------- the 2026 map (28 districts)

from app.constants.districts import (  # noqa: E402
    DISTRICT_NAMES_2022,
    NEW_IN_2026,
    SPLIT_IN_2026,
    map_of,
)


def test_the_site_lists_28_districts_and_remembers_the_26_of_2022():
    assert len(DISTRICT_NAMES) == 28 and len(set(DISTRICT_NAMES)) == 28
    assert len(DISTRICT_NAMES_2022) == 26
    assert NEW_IN_2026 == {"Markapuram": "Prakasam", "Polavaram": "Alluri Sitharama Raju"}
    assert SPLIT_IN_2026 == {"Prakasam", "Alluri Sitharama Raju"}


def test_the_new_districts_fold_only_by_their_own_name():
    assert normalise_district("Markapuram") == "Markapuram"
    assert normalise_district("POLAVARAM") == "Polavaram"
    assert normalise_district("Markapuram District") == "Markapuram"
    # The dam and its mandal are in Eluru (West Godavari before 2022); text about them
    # must never land on Polavaram district.
    assert normalise_district("Polavaram project, West Godavari") == "West Godavari"
    assert normalise_district("Polavaram Irrigation Project") is None
    assert normalise_district("Markapuram town") is None


def test_a_paper_older_than_2026_never_means_a_2026_district():
    assert normalise_district("Polavaram", as_of="2018-05-01") is None
    assert normalise_district("Markapuram", as_of="2025-12-31") is None
    assert normalise_district("Markapuram", as_of="2026-01-01") == "Markapuram"
    # Districts that existed then are unaffected by the date
    assert normalise_district("Prakasam", as_of="2018-05-01") == "Prakasam"


def test_map_of_dates():
    assert map_of("2026-03-31") == "2026"
    assert map_of("2022-04-04") == "2022"
    assert map_of("2022-04-03") == "before 2022"
    assert map_of(None) == "unknown"
