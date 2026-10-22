"""
WHY THIS TEST EXISTS

Every static page on the site is built from the project list endpoint. The
prerenderer renders the project's description, its project code, its
implementing agency and its source document link, and this schema carried none
of them, so it rendered ten fields the endpoint never returns. Every project
page, in six languages, printed nothing for all ten.

It read as missing data. It was not. All four scrapers write a description and
they write good ones: the AMRUT milestone line, the Socio-Economic Survey's
table reference, a multi-paragraph Government Order account for Ramayapatnam
Port. The content was written, stored and paid for, and stopped one schema
short of the page.

This is the same failure as test_project_list_carries_updated_at, one field
family further on, and it happened for the same reason: the list response is
trimmed to stay small, and nobody notices when a page silently renders nothing.

So the test pins both halves. The full response must carry the record, and the
slim one must stay slim, because the reason those fields were left out in the
first place is real: 673 rows of description is not something to push at a
phone loading the register.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.schemas.project import ProjectListOut


# Everything the prerenderer reads off a project. Named here so that adding a
# field to the page without adding it to the schema fails loudly.
PAGE_FIELDS = (
    "description",
    "description_telugu",
    "external_id",
    "implementing_agency",
    "mandal",
    "constituency",
    "announced_date",
    "actual_completion",
    "actual_cost_crore",
    "source_portal",
    "source_url",
)

CARD_FIELDS = (
    "id",
    "title",
    "title_telugu",
    "project_type",
    "status",
    "district",
    "estimated_cost_crore",
    "department",
    "expected_completion",
    "completion_percentage",
    "cover_image",
    "image_count",
    "updated_at",
)


def _project(**over):
    base = dict(
        id=613,
        title="POLAVARAM IRRIGATION PROJECT",
        title_telugu=None,
        project_type="irrigation",
        status="under_construction",
        district=None,
        estimated_cost_crore=55548.87,
        department="Water Resources",
        expected_completion=None,
        completion_percentage=76,
        cover_image=None,
        images=[],
        updated_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        description=(
            "Central-sector project (Water Resources, PPA) tracked in the MoSPI "
            "flash report, June 2025 as ongoing."
        ),
        description_telugu=None,
        external_id="N30000002",
        implementing_agency="PPA",
        mandal=None,
        constituency=None,
        announced_date=datetime(2009, 2, 1, tzinfo=timezone.utc),
        actual_completion=None,
        actual_cost_crore=None,
        source_portal="MOSPI_IPMD",
        source_url="https://www.mospi.gov.in/example.pdf",
    )
    base.update(over)
    return SimpleNamespace(**base)


def test_the_schema_can_carry_every_field_a_page_renders():
    for name in PAGE_FIELDS:
        assert name in ProjectListOut.model_fields, (
            f"the page renders {name} and the list schema cannot carry it"
        )


def test_full_carries_the_record_the_page_needs():
    row = ProjectListOut.from_project(_project(), full=True)
    assert row.description and "MoSPI" in row.description
    assert row.external_id == "N30000002"
    assert row.implementing_agency == "PPA"
    assert row.source_url.endswith(".pdf")
    assert row.announced_date.year == 2009


def test_the_slim_row_leaves_them_unset_rather_than_null():
    """
    Unset, not None. The route serialises with exclude_unset, so this is what
    keeps full=true from costing the app anything: a card would otherwise carry
    eleven null keys it has no use for, 673 times over, on a phone.
    """
    row = ProjectListOut.from_project(_project())
    for name in PAGE_FIELDS:
        assert name not in row.model_fields_set, (
            f"{name} was set on a slim row and will be serialised"
        )

    sent = row.model_dump(exclude_unset=True)
    assert not set(sent) & set(PAGE_FIELDS)


def test_a_card_keeps_every_field_it_had_before():
    """
    The other half. exclude_unset drops anything from_project does not pass, so
    a field dropped from that constructor by accident would vanish from the
    app's response and only show up as a blank card.
    """
    row = ProjectListOut.from_project(_project())
    sent = row.model_dump(exclude_unset=True)
    for name in CARD_FIELDS:
        assert name in sent, f"{name} disappeared from the register response"


def test_full_adds_exactly_the_page_fields_and_nothing_else():
    slim = ProjectListOut.from_project(_project()).model_dump(exclude_unset=True)
    full = ProjectListOut.from_project(_project(), full=True).model_dump(exclude_unset=True)
    assert set(full) - set(slim) == set(PAGE_FIELDS)
    # And the card half is identical in both, value for value.
    for name in CARD_FIELDS:
        assert slim[name] == full[name]


def test_a_record_with_nothing_written_about_it_still_serialises():
    """A project whose scrapers filled none of this is a real row, not an error."""
    bare = _project(
        description=None, external_id=None, implementing_agency=None,
        mandal=None, constituency=None, announced_date=None,
        actual_completion=None, actual_cost_crore=None,
        source_portal=None, source_url=None,
    )
    row = ProjectListOut.from_project(bare, full=True)
    assert row.description is None
    # Still SET, so the page can tell "no description on record" apart from
    # "this response does not carry descriptions at all". That distinction is
    # the whole bug this test exists for.
    assert "description" in row.model_fields_set
