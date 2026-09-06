"""
Tests for the scraper sanity gate.

Each test is a failure that has actually happened, or that the gate exists to
stop. The wrong-column test is the important one: it is the only failure mode
that no exit code, no row count and no error log can see.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.scrapers.sanity import FieldRule, SanityAbort, SanityGate, SanitySpec, summarise

SPEC = SanitySpec(
    min_rows=3,
    fields={
        "title": FieldRule(required=True, min_len=8, max_len=500),
        "district": FieldRule(),
        "published": FieldRule(min_year=1950, max_year_ahead=1),
        "url": FieldRule(required=True, host_suffix="gov.in"),
    },
    key_field="portal_id",
)


def rows(n=20, **overrides):
    out = []
    for i in range(n):
        row = {
            "title": f"Notification number {i} for public works",
            "district": "Guntur",
            "published": datetime(2026, 3, 1, tzinfo=timezone.utc),
            "url": f"https://crda.ap.gov.in/notice/{i}",
            "portal_id": f"NOT{i:05d}",
        }
        row.update(overrides)
        out.append(row)
    return out


def baseline(n=5, **stat_overrides):
    base = summarise(rows(40), SPEC)
    base.update(stat_overrides)
    return [dict(base) for _ in range(n)]


# ---- layer 1 -------------------------------------------------------------

def test_shape_rejects_a_batch_far_below_the_last_good_run():
    """A 40-row board that suddenly parses 4 rows is a redesign, not a quiet week."""
    gate = SanityGate("crda", SPEC, baseline())
    with pytest.raises(SanityAbort, match="redesign or a truncated response"):
        gate.run(rows(4))


def test_shape_allows_ordinary_shrinkage():
    gate = SanityGate("crda", SPEC, baseline())
    assert len(gate.run(rows(25)).rows) == 25


# ---- layer 2 -------------------------------------------------------------

def test_a_few_bad_rows_are_dropped_not_fatal():
    batch = rows(20)
    batch[0]["title"] = "PDF"          # a parse artefact, not a title
    result = SanityGate("crda", SPEC, baseline()).run(batch)
    assert len(result.rows) == 19
    assert "title" in result.rejected[0][1]


def test_mostly_bad_rows_abort_the_run():
    """If four rows in five fail, the parser is wrong — not the page."""
    batch = rows(20)
    for row in batch[:16]:
        row["title"] = "S.No"
    with pytest.raises(SanityAbort, match="the parser is wrong"):
        SanityGate("crda", SPEC, baseline()).run(batch)


def test_year_beyond_the_horizon_is_refused():
    """'Swarna Andhra @2047' was once read as a publication year."""
    batch = rows(20)
    batch[0]["published"] = datetime(2047, 1, 1, tzinfo=timezone.utc)
    result = SanityGate("crda", SPEC, baseline()).run(batch)
    assert len(result.rows) == 19


def test_url_leaving_the_expected_host_is_refused():
    batch = rows(20)
    batch[0]["url"] = "https://ads.example.com/track"
    result = SanityGate("crda", SPEC, baseline()).run(batch)
    assert "unexpected host" in result.rejected[0][1]


# ---- layer 3: the one that matters --------------------------------------

def test_a_moved_column_is_caught_even_though_every_row_looks_fine():
    """
    The silent failure. The portal moves the district into another column, so
    the parser reads an empty cell. Every row still validates — district is not
    a required field — the count is normal, nothing raises, and plausible rows
    with no district would be written.

    Only the comparison against previous runs can see it.
    """
    batch = rows(38)
    for row in batch:
        row["district"] = None

    gate = SanityGate("crda", SPEC, baseline())
    with pytest.raises(SanityAbort, match="a column that moved"):
        gate.run(batch)


def test_drift_is_skipped_until_there_is_a_baseline():
    """A cold start must never block a scrape."""
    batch = rows(38)
    for row in batch:
        row["district"] = None
    assert len(SanityGate("crda", SPEC, baseline(n=1)).run(batch).rows) == 38


def test_parser_repeating_one_record_is_caught():
    batch = rows(38, portal_id="NOT00001")
    with pytest.raises(SanityAbort, match="repeating itself"):
        SanityGate("crda", SPEC, baseline()).run(batch)


# ---- layer 4 -------------------------------------------------------------

def test_missing_keys_abort_because_the_next_run_would_duplicate():
    batch = rows(20)
    for row in batch[:5]:
        row["portal_id"] = None
    with pytest.raises(SanityAbort, match="stable key"):
        SanityGate("crda", SPEC, baseline()).run(batch)


def test_keys_differing_only_by_whitespace_are_treated_as_unstable():
    batch = rows(20)
    batch[0]["portal_id"] = "NOT00001 "     # trailing space: same record, new row
    with pytest.raises(SanityAbort, match="not stable"):
        SanityGate("crda", SPEC, baseline()).run(batch)


# ---- the happy path ------------------------------------------------------

def test_a_healthy_batch_passes_untouched():
    result = SanityGate("crda", SPEC, baseline()).run(rows(40))
    assert len(result.rows) == 40
    assert result.rejected == []
    assert result.stats["rows"] == 40


# ---- the refusal must not be reported as a crash -------------------------

@pytest.mark.asyncio
async def test_track_records_a_refusal_as_blocked_not_failed():
    """
    A deliberate refusal and a crash reach `track` as the same kind of object —
    an exception — and if both are recorded as FAILED the whole point of the
    sanity layers is lost at the last step. The alert would say "the scraper
    broke" when what happened is "the scraper noticed the page moved and kept
    the site correct".
    """
    from unittest.mock import AsyncMock, patch

    from app.models.data_update import RunStatus, RunTrigger
    from app.services import run_recorder

    class Dummy:
        pass

    with patch.object(run_recorder, "record", new=AsyncMock()) as recorded:
        async with run_recorder.track("run1", "Districts", Dummy, RunTrigger.MANUAL) as slot:
            raise SanityAbort("district NULL rate 3% -> 71%")

    assert slot.get("blocked")
    assert not slot.get("failed")
    assert recorded.await_args.kwargs["status"] is RunStatus.SKIPPED
    assert "sanity refusal" in recorded.await_args.kwargs["error"]


@pytest.mark.asyncio
async def test_track_still_records_a_real_crash_as_failed():
    from unittest.mock import AsyncMock, patch

    from app.models.data_update import RunStatus, RunTrigger
    from app.services import run_recorder

    class Dummy:
        pass

    with patch.object(run_recorder, "record", new=AsyncMock()) as recorded:
        async with run_recorder.track("run1", "CAG", Dummy, RunTrigger.MANUAL) as slot:
            raise RuntimeError("404 from the portal")

    assert slot.get("failed")
    assert not slot.get("blocked")
    assert recorded.await_args.kwargs["status"] is RunStatus.FAILED
