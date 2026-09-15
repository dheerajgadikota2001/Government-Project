"""
WHY THIS TEST EXISTS

The sitemap is built from the project list endpoint, and Google uses lastmod
to decide which of several thousand URLs to recrawl first. The list response
did not carry updated_at, so the sitemap generator got null for every project,
wrote a file with no dates at all, and a failing frontend test was read as
"expected until regenerated" and committed over.

Nothing errored. The sitemap validated. Google simply had no idea what had
changed. This pins the field to the list schema so it cannot quietly drop out
again when someone trims the list response to keep it small.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.schemas.project import ProjectListOut


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
    )
    base.update(over)
    return SimpleNamespace(**base)


def test_list_row_carries_updated_at():
    row = ProjectListOut.from_project(_project())
    assert row.updated_at is not None
    assert row.updated_at.year == 2026
    assert "updated_at" in ProjectListOut.model_fields


def test_list_row_survives_a_record_with_no_timestamp():
    """An old row with no timestamp must not break the whole list."""
    row = ProjectListOut.from_project(_project(updated_at=None))
    assert row.updated_at is None
