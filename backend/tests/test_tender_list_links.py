"""
Every tender in the list carries the links a reader needs to act on it.

The tenders page showed each notice with no way to reach it: the list endpoint
left out the two addresses the register already keeps, the notice board that
announced it (source_url) and the site that holds the bid papers (document_urls).
A reader in a village who sees "Open, closes Monday" must be one tap from the
official page. This pins both on the list and on the closing-soon list.
"""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert

from app.database import get_db_context
from app.main import app
from app.models.tender import Tender, TenderStatus
from app.services import cache as cache_service

MARK = "list-links-test"
BOARD = "https://crda.ap.gov.in/apcrdav2/views/NotificationsView.aspx"
PAPERS = "https://apeprocurement.gov.in"


async def get(path: str):
    cache_service.local_clear()
    await cache_service.cache_delete_pattern("*")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get(path)
        assert r.status_code == 200, r.text
        return r.json()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_the_list_and_closing_soon_carry_the_board_and_the_papers_links():
    row = dict(title="Links test notice", status=TenderStatus.ACTIVE, source_portal=MARK, tender_id=f"{MARK}-1",
               nit_number="38/TEST/2026", source_url=BOARD, document_urls=[PAPERS],
               published_date=datetime.now(timezone.utc),
               bid_submission_end=datetime.now(timezone.utc) + timedelta(days=2))
    async with get_db_context() as db:
        await db.execute(insert(Tender), [row])
        await db.commit()
    try:
        listed = await get("/api/v1/tenders/?page=1&page_size=100")
        mine = [t for t in listed["items"] if t["tender_id"] == f"{MARK}-1"]
        assert len(mine) == 1
        assert mine[0]["source_url"] == BOARD and mine[0]["document_urls"] == [PAPERS]
        assert mine[0]["nit_number"] == "38/TEST/2026"

        soon = [t for t in await get("/api/v1/tenders/closing-soon") if t["tender_id"] == f"{MARK}-1"]
        assert soon and soon[0]["source_url"] == BOARD and soon[0]["document_urls"] == [PAPERS]
    finally:
        async with get_db_context() as db:
            await db.execute(delete(Tender).where(Tender.source_portal == MARK))
            await db.commit()
