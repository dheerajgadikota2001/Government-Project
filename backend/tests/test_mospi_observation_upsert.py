"""
WHY THIS TEST EXISTS

upsert_observation used to insert-or-skip. A dated observation written once
by a broken parse could never be repaired: the date was occupied, so the
correct import wrote nothing for it. This pins the three outcomes: added,
corrected, unchanged. The database is stubbed; the rule is what matters.
"""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from app.scrapers.mospi_projects import upsert_observation

AS_OF = datetime(2026, 7, 31, tzinfo=timezone.utc)


class StubDB:
    def __init__(self, row):
        self.row = row
        self.added = []

    async def execute(self, _stmt):
        row = self.row
        return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: row))

    def add(self, obj):
        self.added.append(obj)


def run(coro):
    return asyncio.run(coro)


def existing(**over):
    base = dict(completion_percentage=76.0, cumulative_expenditure_crore=23775.68,
                estimated_cost_crore=55548.87, source_url="old.pdf", source_label="June 2025")
    base.update(over)
    return SimpleNamespace(**base)


def test_a_missing_observation_is_added():
    db = StubDB(None)
    out = run(upsert_observation(db, 1, AS_OF, progress=86.15, expenditure=27961.55, cost=55548.87,
                                 portal="MOSPI_IPMD", url="new.pdf", label="July 2026"))
    assert out == 1 and len(db.added) == 1
    assert db.added[0].completion_percentage == 86.15


def test_a_wrong_observation_is_corrected_not_skipped():
    row = existing()
    db = StubDB(row)
    out = run(upsert_observation(db, 1, AS_OF, progress=86.15, expenditure=27961.55, cost=55548.87,
                                 portal="MOSPI_IPMD", url="new.pdf", label="July 2026"))
    assert out == 2 and not db.added
    assert row.completion_percentage == 86.15
    assert row.cumulative_expenditure_crore == 27961.55
    assert row.source_label == "July 2026"


def test_an_identical_observation_is_left_alone():
    row = existing(completion_percentage=86.15, cumulative_expenditure_crore=27961.55,
                   source_url="new.pdf", source_label="July 2026")
    out = run(upsert_observation(StubDB(row), 1, AS_OF, progress=86.15, expenditure=27961.55, cost=55548.87,
                                 portal="MOSPI_IPMD", url="new.pdf", label="July 2026"))
    assert out == 0


def test_a_missing_figure_never_erases_a_recorded_one():
    # The pre-PAIMANA layout prints no progress percentage. Re-importing such a
    # report must not blank a percentage a later, better source recorded.
    row = existing(completion_percentage=86.15)
    out = run(upsert_observation(StubDB(row), 1, AS_OF, progress=None, expenditure=27961.55, cost=55548.87,
                                 portal="MOSPI_IPMD", url="old.pdf", label="June 2025"))
    assert row.completion_percentage == 86.15
    assert out in (0, 2)
