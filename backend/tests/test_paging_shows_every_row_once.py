"""
Paging through any list shows every row exactly once.

The lists page with OFFSET: page 2 is "skip the first 10 rows, take the next 10".
That only works if the rows come back in the same order every time. A refresh saves
a whole page of papers in one transaction, and every row in a transaction gets the
same created_at; many papers also share a published date. Rows that tie on every
sort key have no order, so Postgres may return them in a different order for each
page. Page 2 then repeats some rows of page 1 and skips others.

On the live register of 18 Oct 2026 (1,580 papers), walking every page sorted by
date showed 1,573 different papers: 7 appeared twice and 7 never appeared, among
them Assembly bills. A reader paging the register could not reach them.

The rule: every paged list ends its sort with the row id, which no two rows share.
The tests below hold each paged list to it with rows that tie on everything else,
and the last test fails the build if a new paged list is added without it.
"""

import pathlib
import re
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert

from app.database import get_db_context
from app.main import app
from app.models.community import ForumPost
from app.models.document import Document, DocumentTranslationStatus, DocumentType
from app.models.mou import MOU
from app.models.news import NewsArticle
from app.models.project import Project
from app.models.tender import Tender

MARK = "paging-test"  # every row these tests write carries this, and is removed after
SAME_DAY = datetime(2026, 8, 25, tzinfo=timezone.utc)
N = 47                # more than four pages of 10, so a reorder between pages shows up


async def walk(path: str, page_size: int = 10) -> list[int]:
    """Every id a reader meets, paging from the first page to the last."""
    ids, page = [], 1
    sep = "&" if "?" in path else "?"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        while True:
            r = await client.get(f"{path}{sep}page_size={page_size}&page={page}")
            assert r.status_code == 200, r.text
            body = r.json()
            ids += [item["id"] for item in body["items"]]
            if not body.get("has_next"):
                return ids
            page += 1


async def check(model, rows: list[dict], path: str, cleanup) -> None:
    async with get_db_context() as db:
        # One statement, one transaction: every row gets the same timestamps, as in a real refresh.
        await db.execute(insert(model), rows)
        await db.commit()
    try:
        ids = await walk(path)
        assert len(ids) == len(rows), f"{path}: {len(ids)} rows served for {len(rows)} stored"
        assert len(set(ids)) == len(rows), f"{path}: a row appeared twice, so another one never appeared"
    finally:
        async with get_db_context() as db:
            await db.execute(delete(model).where(cleanup))
            await db.commit()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_papers_sorted_by_date_show_once_each():
    rows = [dict(
        title=f"District notice {i}", document_type=DocumentType.OTHER, department="Test District Collectorate",
        source_url=f"https://example.test/{MARK}/{i}.pdf", source_portal=MARK,
        published_date=SAME_DAY, translation_status=DocumentTranslationStatus.PENDING,
    ) for i in range(N)]
    await check(Document, rows, f"/api/v1/documents/?source_portal={MARK}&sort=date&order=desc", Document.source_portal == MARK)


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_tenders_closing_the_same_day_show_once_each():
    rows = [dict(
        tender_id=f"{MARK}-{i}", title=f"Village road works package {i}", department="Test Department",
        bid_submission_end=SAME_DAY, source_portal=MARK, source_url=f"https://example.test/{MARK}/t{i}",
    ) for i in range(N)]
    await check(Tender, rows, "/api/v1/tenders/?department=Test%20Department", Tender.source_portal == MARK)


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_news_with_one_timestamp_shows_once_each():
    # A third have no date at all: they tie too, and come after the dated ones.
    rows = [dict(
        headline=f"District news item {i}", source_name="Test source", source_url=f"https://example.test/{MARK}/n{i}",
        districts=[MARK], published_at=None if i % 3 == 0 else SAME_DAY,
    ) for i in range(N)]
    await check(NewsArticle, rows, f"/api/v1/news/?district={MARK}", NewsArticle.source_url.like(f"https://example.test/{MARK}/%"))


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_undated_news_comes_after_dated_news():
    rows = [dict(headline=f"Item {i}", source_name="Test source", source_url=f"https://example.test/{MARK}/u{i}",
                 districts=[MARK], published_at=None if i < 3 else SAME_DAY) for i in range(6)]
    async with get_db_context() as db:
        await db.execute(insert(NewsArticle), rows)
        await db.commit()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            items = (await client.get(f"/api/v1/news/?district={MARK}&page_size=10")).json()["items"]
        dated = [it.get("published_at") is not None for it in items]
        assert dated == sorted(dated, reverse=True), "an undated article came before a dated one"
    finally:
        async with get_db_context() as db:
            await db.execute(delete(NewsArticle).where(NewsArticle.source_url.like(f"https://example.test/{MARK}/%")))
            await db.commit()


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_community_posts_saved_together_show_once_each():
    rows = [dict(topic=MARK, display_name="Reader", body=f"Question {i}", delete_token=f"{MARK}-{i}") for i in range(N)]
    await check(ForumPost, rows, f"/api/v1/community/posts?topic={MARK}", ForumPost.topic == MARK)


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_promises_of_the_same_amount_show_once_each():
    # The MoU list already ended its sort with the id; this keeps it that way.
    rows = [dict(company_name=f"{MARK} company {i}", title=f"{MARK} promise {i}", investment_crore=1000.0, source_portal=MARK) for i in range(N)]
    await check(MOU, rows, f"/api/v1/mous/?q={MARK}&sort=investment&order=desc", MOU.source_portal == MARK)


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_projects_updated_together_show_once_each():
    # The project list already ended its sort with the id; this keeps it that way.
    rows = [dict(title=f"{MARK} work {i}", source_portal=MARK) for i in range(N)]
    await check(Project, rows, f"/api/v1/projects/?q={MARK}&sort=updated&order=desc", Project.source_portal == MARK)


ROUTERS = pathlib.Path(__file__).resolve().parents[1] / "app" / "routers"


def test_every_paged_list_ends_its_sort_with_the_row_id():
    """A paged list added later keeps the rule too: whatever it sorts by, the id is in the sort."""
    paged = []
    for path in sorted(ROUTERS.glob("*.py")):
        src = path.read_text(encoding="utf-8")
        for m in re.finditer(r"\.offset\(", src):
            start = src.rfind(".order_by(", 0, m.start())
            assert start != -1, f"{path.name}: a paged list with no sort at all"
            sort = src[start:m.start()]
            assert re.search(r"\b\w+\.id\.(desc|asc)\(\)", sort), f"{path.name}: this paged list does not end its sort with the row id:\n{sort}"
            paged.append(path.name)
    # documents, tenders, news, community posts, MoUs and projects, as of October 2026
    assert len(paged) >= 6, paged
