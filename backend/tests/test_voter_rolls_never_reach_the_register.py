"""
Voter lists never reach the register.

A district collectorate's Documents page carries the election office's uploads next
to its development papers: one file per polling booth, listing every voter's name,
age and house number. This platform does not keep voter lists. The words the filter
knew ("electoral", "polling station", "Part No") never appear in the titles the
offices actually use, so the August and September 2026 refreshes took in 232 of them:

    "13-SALUR-AC 222"                          Parvathipuram Manyam, 119 files
    "PATHAPATNAM Part 216 Tamaraguda Althi"    Srikakulam, 99 files
    "02 Palasa - PS. No. 297 Gunupalli"        Srikakulam
    "23-VSP North", "22- VSP SOUTH(NO MAPPING)"  Visakhapatnam, 14 files

The fixture is every title in the live register on 18 Oct 2026. The rule must refuse
every voter-roll title in it and keep every other one, from every office: a filter that
also drops land notices or budget papers would hide real government work, which is the
other way to fail.
"""

import json
import pathlib

import pytest

from app.scrapers.district_documents import is_electoral_document

FIXTURE = json.loads(
    (pathlib.Path(__file__).parent / "fixtures" / "register_titles_2026-10-18.json").read_text(encoding="utf-8")
)


def test_the_fixture_is_the_register_we_checked():
    # 232 rows carried 227 distinct titles; 1,348 kept rows carried 1,035.
    assert len(FIXTURE["electoral"]) == 227
    assert len(FIXTURE["kept"]) == 1035


@pytest.mark.parametrize("title", FIXTURE["electoral"])
def test_every_voter_roll_title_is_refused(title):
    assert is_electoral_document(title), title


def test_no_other_title_in_the_register_is_refused():
    refused = [t for t in FIXTURE["kept"] if is_electoral_document(t)]
    assert refused == []


@pytest.mark.parametrize("title", [
    # The shapes the words alone used to catch still are caught.
    "Kottagraharam Part No-130",
    "Draft Electoral Roll 2026, Polling Station 12",
    "Special Summary Revision 2027: claims and objections",
    "SIR 2026 mapping status",
])
def test_the_older_shapes_are_still_refused(title):
    assert is_electoral_document(title)


@pytest.mark.parametrize("title", [
    # Acres are written "Ac." in land notices. These are real titles from Chittoor.
    "G.D. Nellore Mandal, G.D.Nellore Village – Extent Ac.90.76 cents – land acquisition proposed for establishment of Industrial Park",
    "Gudupalle Mandal, Dasamanipalle Village – Extent Ac.2.88 cents – land acquisition proposed for establishment of Industrial Park",
    # An ordinary "Part 2" in a report or a bill is not a roll part.
    "Annual Report 2024-25 Part 2",
    "The Andhra Pradesh Municipal Laws (Amendment) Bill, 2026 Part-II",
    # A number and a dash that start a real title.
    "4-Lane road from NH 67 to the JSW Rayalaseema Steel Plant",
])
def test_ordinary_papers_are_kept(title):
    assert not is_electoral_document(title)
