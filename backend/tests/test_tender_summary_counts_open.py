"""
The tender summary says how many notices are open today, and how many close on each
of the next seven days, by India time.

Home shows "N open today" from this one small answer instead of downloading every
notice. The rule is the same one the tenders page uses: a notice is open until its
last day to bid has passed in India, whatever the portal's own status flag says,
because that flag can lag behind the date.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert

from app.database import get_db_context
from app.main import app
from app.models.tender import Tender, TenderStatus
from app.services import cache as cache_service

MARK = "summary-open-test"
IST = ZoneInfo("Asia/Kolkata")


async def summary() -> dict:
    # The endpoint is cached for five minutes; each call here must see the table as it is now.
    cache_service.local_clear()
    await cache_service.cache_delete_pattern("*")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/api/v1/tenders/register/summary")
        assert r.status_code == 200, r.text
        return r.json()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_open_today_follows_the_india_date_not_the_status_flag():
    now_ist = datetime.now(IST)
    today = now_ist.date()
    start = datetime(today.year, today.month, today.day, tzinfo=IST)

    rows = [
        # Closes later today in India: open, though the portal already says closed.
        dict(title="a", status=TenderStatus.CLOSED, bid_submission_end=start + timedelta(hours=23, minutes=30)),
        # Closed one minute before today began in India: not open, though still flagged active.
        dict(title="b", status=TenderStatus.ACTIVE, bid_submission_end=start - timedelta(minutes=1)),
        # Closes in three days.
        dict(title="c", status=TenderStatus.ACTIVE, bid_submission_end=start + timedelta(days=3, hours=11)),
        # Closes in nine days: open, but outside the seven-day list.
        dict(title="d", status=TenderStatus.ACTIVE, bid_submission_end=start + timedelta(days=9)),
    ]
    for i, r in enumerate(rows):
        r.update(source_portal=MARK, source_url=f"https://example.test/{MARK}/{i}", tender_id=f"{MARK}-{i}")

    before = await summary()
    async with get_db_context() as db:
        await db.execute(insert(Tender), rows)
        await db.commit()
    try:
        after = await summary()
    finally:
        async with get_db_context() as db:
            await db.execute(delete(Tender).where(Tender.source_portal == MARK))
            await db.commit()

    assert after["read_on"] == today.isoformat()
    assert after["open_today"] - before["open_today"] == 3          # a, c and d

    def week(s):
        return {x["day"]: x["count"] for x in s["closing_next_7_days"]}
    b, a = week(before), week(after)
    grew = {d: a.get(d, 0) - b.get(d, 0) for d in set(a) | set(b) if a.get(d, 0) != b.get(d, 0)}
    assert grew == {today.isoformat(): 1, (today + timedelta(days=3)).isoformat(): 1}
    for d in a:
        assert today.isoformat() <= d < (today + timedelta(days=7)).isoformat()
