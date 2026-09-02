"""Search — across this platform's own content, and nothing else.

This used to call Elasticsearch, which is not deployed, so every query failed and
the results page showed a hardcoded sample instead. It now runs against the
database and the seed files directly: no extra infrastructure, and no way for a
result to appear that this platform does not actually hold.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import SearchQuery
from app.services.cache import cache_response
from app.services.site_search import search_site, sections

router = APIRouter(prefix="/search", tags=["Search"])

KINDS = ("all", "project", "document", "mou", "news", "section")


@router.get("/")
@cache_response(ttl=60)
async def search(
    q: str = Query(..., min_length=1, max_length=200, description="Search term"),
    kind: str = Query("all", description="all, project, document, mou, news or section"),
    district: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Ranked results from projects, documents, MoUs, news and platform sections."""
    if kind not in KINDS:
        kind = "all"
    return await search_site(db, q, kind=kind, district=district,
                             page=page, page_size=page_size)


@router.post("/")
async def search_post(query: SearchQuery, db: AsyncSession = Depends(get_db)):
    """Kept so the older POST callers keep working; same engine as the GET."""
    return await search_site(db, query.query, district=query.district,
                             page=query.page, page_size=query.page_size)


@router.get("/suggestions")
@cache_response(ttl=60)
async def suggestions(
    q: str = Query(..., min_length=2, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    """Titles only, for the type-ahead. Nothing here is invented: every suggestion
    is the title of something the platform already serves."""
    found = await search_site(db, q, page_size=8)
    return {
        "suggestions": [
            {"text": r["title"], "type": r["type"], "route": r["route"]}
            for r in found["results"]
        ]
    }


@router.get("/scope")
async def scope():
    """What search covers — shown on the results page so the reader knows the
    boundary of the index rather than assuming it is a web search."""
    return {
        "searches": ["projects", "documents", "MoUs", "news", "platform sections"],
        "does_not_search": ["the web", "external portals"],
        "section_count": len(sections()),
    }
