"""
The register serves a title and a description exactly as the database stores them.

It used to "rejoin" words a PDF had split across a table cell, by gluing any one
or two lower-case letters onto the word before them. Real words have that shape
too, so "Restoration of Komatigunta Pond at 30th ward in Kandukur" reached
readers as "Restorationof Komatigunta Pondat 30th wardin Kandukur", on 493 of
the 727 titles in the live register, while the project pages showed the real
words. A platform whose
promise is that it prints the government's text unchanged cannot print it
changed on its busiest list. These tests hold that promise for the three kinds
of text the register carries.
"""

from types import SimpleNamespace as NS

from app.routers import project_register as pr


def _row(**fields):
    base = dict(
        id=1, external_id=None, title="A project", project_type=None, status=None,
        district=None, department=None, implementing_agency=None,
        estimated_cost_crore=None, completion_percentage=None,
        expected_completion=None, description=None,
        source_portal="AMRUT_MoHUA", source_url="https://amrut.mohua.gov.in/status.pdf",
        announced_date=None, start_date=None, actual_completion=None,
    )
    base.update(fields)
    return NS(**base)


# Taken from the live register as it was served before the fix, each one a
# title the old rule damaged. The words that suffered were "of", "at", "in",
# "to" and "km", which is the point: they are ordinary words.
TITLES = [
    "Rejuvenation and Restoration of Komatigunta Pond at 30th ward in Kandukur Municipality",
    "Providing water supply infrastructure to weaker section housing colonies",
    "Widening to two lane with paved shoulders from km 0/0 to 64/020",
]


def test_titles_are_served_exactly_as_stored():
    for title in TITLES:
        entry = pr._entry(_row(title=title), [], None, with_events=False)
        assert entry["title"] == title


def test_descriptions_are_served_exactly_as_stored():
    text = ("Milestone in progress. Tracked in the AMRUT 2.0 status report, "
            "with the work order at 30th ward in Kandukur.")
    entry = pr._entry(_row(description=text), [], None, with_events=False)
    assert entry["description"] == text


def test_a_district_still_folds_to_its_canonical_name():
    # The one repair that stays: a district the PDF split is put back together
    # by name, against the known list, not by a pattern over free text.
    entry = pr._entry(_row(district="Visakhapatna m"), [], None, with_events=False)
    assert entry["district"] == "Visakhapatnam"
