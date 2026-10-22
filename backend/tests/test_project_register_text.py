"""
The project register must hand back each project's title, description and cost exactly as stored,
and must call a document "government" when the government published it.

Why this file exists. The register shipped on 21 Oct 2026 with two faults that no test noticed,
because every test database held a handful of invented rows:

1. A read-time "repair" for words a PDF had split across a line glued any four-letter word to a
   one or two letter word after it. "diversion of" became "diversionof" and "Widening to" became
   "Wideningto", in 711 of 730 descriptions and 496 titles.
2. The Finance Department keeps its papers in an S3 bucket named apfinance.gov.in, so their
   address starts with Amazon's host. The host alone said "press", which blanked the cost of 56
   projects and turned 185 dated government events into press events.

The fixture holds real text from the live register of 18 Oct, before either fault.
"""

import json
import pathlib

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert

from app.models.project import Project, ProjectStatus, ProjectType
from app.routers import project_register as pr

FIX = json.loads(
    (pathlib.Path(__file__).parent / "fixtures" / "project_text_2026-10-18.json").read_text(encoding="utf-8")
)["rows"]

FINANCE = "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/AP_Socio_Economic_Survey_2024-25.pdf"


def _row(title, description=None, cost=None, url=None, district=None):
    return Project(
        id=1, title=title, description=description, estimated_cost_crore=cost,
        source_portal="Test portal", source_url=url, district=district,
        project_type=ProjectType.OTHER, status=ProjectStatus.ANNOUNCED,
    )


# ---------------------------------------------------------------- text is never rewritten

def test_fixture_is_the_real_register():
    assert len(FIX) == 730
    assert any(" of " in r["title"] for r in FIX) and any(" to " in r["title"] for r in FIX)


def test_every_real_title_and_description_comes_back_unchanged():
    changed = []
    for r in FIX:
        e = pr._entry(_row(r["title"], r["description"]), [], None, with_events=False)
        if e["title"] != r["title"]:
            changed.append(("title", r["id"], r["title"][:50], e["title"][:50]))
        if e["description"] != r["description"]:
            changed.append(("description", r["id"]))
    assert not changed, f"{len(changed)} texts were altered, for example {changed[:3]}"


@pytest.mark.parametrize("text", [
    "Veligonda: flood-water diversion of 43.50 TMC by gravity to the drought-prone uplands of Prakasam",
    "Widening to two lane with paved shoulders from Km 0/0 to 64/020 Pamarru to Akiveedu",
    "the figure is kept exactly as printed; 81% work is completed by December 2018",
    "Construction of a bridge at Km 12 on NH-16 in Eluru",
])
def test_short_words_are_never_glued_to_the_word_before(text):
    e = pr._entry(_row(text, text), [], None, with_events=False)
    assert e["title"] == text and e["description"] == text


def test_a_district_still_goes_onto_its_canonical_name_and_is_otherwise_kept():
    assert pr._entry(_row("X", district="Visakhapatnam"), [], None, with_events=False)["district"] == "Visakhapatnam"
    assert pr._entry(_row("X", district="Somewhere Else"), [], None, with_events=False)["district"] == "Somewhere Else"


# ---------------------------------------------------------------- what counts as a government paper

@pytest.mark.parametrize("url,tier", [
    ("https://amrut.mohua.gov.in/x.pdf", "government"),
    ("https://www.mospi.gov.in/a", "government"),
    ("https://goir.ap.gov.in/Reports.aspx", "government"),
    (FINANCE, "government"),
    # an address that only looks official: another bucket, another host, or the name in a later path part
    ("https://s3.ap-south-1.amazonaws.com/evil-bucket/apfinance.gov.in/x.pdf", "press"),
    ("https://s3.ap-south-1.amazonaws.com/evil.gov.in/x.pdf", "press"),
    ("https://evil.gov.in.s3.ap-south-1.amazonaws.com/x.pdf", "press"),
    ("https://apfinance.gov.in.evil.com/x.pdf", "press"),
    ("https://evil.com/apfinance.gov.in/x.pdf", "press"),
    ("https://s3.ap-south-1.amazonaws.com/", "press"),
    ("https://www.thehindu.com/news/x", "press"),
    ("https://www.gmrgroup.in/press", "company"),
    ("", "press"),
    (None, "press"),
])
def test_source_tier(url, tier):
    assert pr.source_tier(url) == tier


def test_a_cost_taken_from_the_finance_bucket_is_printed_as_the_governments():
    e = pr._entry(_row("Veligonda", cost=6017.99, url=FINANCE), [], None, with_events=False)
    assert e["estimated_cost_crore"] == 6017.99
    assert e["has_published_cost"] is True
    assert e["cost_source_tier"] == "government"
    assert e["cost_source_url"] == FINANCE


def test_a_cost_taken_from_a_newspaper_is_still_not_printed():
    e = pr._entry(_row("Some road", cost=100.0, url="https://www.thehindu.com/news/x"), [], None, with_events=False)
    assert e["estimated_cost_crore"] is None and e["has_published_cost"] is False


def test_dated_events_from_the_finance_bucket_count_as_government_events():
    import datetime as dt
    row = _row("Veligonda", url=FINANCE)
    row.announced_date = dt.datetime(2018, 3, 1)
    e = pr._entry(row, [], None, with_events=False)
    assert e["government_event_count"] == 1 and e["non_government_event_count"] == 0


# ---------------------------------------------------------------- through the real route

@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_the_register_route_returns_text_and_cost_as_stored():
    from app.database import get_db_context
    from app.main import app
    text = "Veligonda: flood-water diversion of 43.50 TMC from the Krishna by gravity to the uplands of Prakasam"
    async with get_db_context() as db:
        await db.execute(delete(Project).where(Project.source_portal == "TEST_REGISTER_TEXT"))
        pid = (await db.execute(insert(Project).values(
            title="Widening to two lane from Pamarru to Akiveedu", description=text,
            estimated_cost_crore=6017.99, source_portal="TEST_REGISTER_TEXT", external_id="t1", source_url=FINANCE,
            project_type=ProjectType.OTHER, status=ProjectStatus.ANNOUNCED,
        ).returning(Project.id))).scalar_one()
        await db.commit()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/v1/projects/register/{pid}")
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["title"] == "Widening to two lane from Pamarru to Akiveedu"
        assert b["description"] == text
        assert b["estimated_cost_crore"] == 6017.99 and b["cost_source_tier"] == "government"
    finally:
        async with get_db_context() as db:
            await db.execute(delete(Project).where(Project.id == pid))
            await db.commit()
