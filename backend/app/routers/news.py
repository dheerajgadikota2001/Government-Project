"""News API — aggregated and summarized AP news."""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.news import NewsArticle, NewsCategory, NewsSource
from app.schemas.common import PaginatedResponse
from app.schemas.news import NewsArticleOut, NewsListOut
from app.services.cache import cache_response

router = APIRouter(prefix="/news", tags=["News"])


@router.get("/", response_model=PaginatedResponse[NewsListOut])
@cache_response(ttl=120)  # 2 min cache — news is time-sensitive
async def list_news(
    category: Optional[NewsCategory] = Query(None),
    source: Optional[NewsSource] = Query(None),
    district: Optional[str] = Query(None),
    language: str = Query("en", pattern="^(en|te)$", description="en=English, te=Telugu"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    List latest AP news. Pass language=te to get Telugu headlines and summaries.
    If Telugu translation isn't available yet, falls back to English.
    """
    stmt = select(NewsArticle)

    if category:
        stmt = stmt.where(NewsArticle.category == category)
    if source:
        stmt = stmt.where(NewsArticle.source == source)
    if district:
        # districts is an array column — check if district is in array
        stmt = stmt.where(NewsArticle.districts.contains([district]))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(NewsArticle.published_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    articles = result.scalars().all()

    items = []
    for a in articles:
        item = NewsListOut.model_validate(a)
        # If Telugu requested and translation available, swap fields
        if language == "te":
            if a.headline_telugu:
                item.headline = a.headline_telugu
            if a.summary_telugu:
                item.summary = a.summary_telugu
        items.append(item)

    return PaginatedResponse.build(items=items, total=total, page=page, page_size=page_size)


@router.get("/latest", response_model=list[NewsListOut])
@cache_response(ttl=60)  # 1 min cache for latest
async def get_latest_news(
    limit: int = Query(10, ge=1, le=50),
    language: str = Query("en", pattern="^(en|te)$"),
    db: AsyncSession = Depends(get_db),
):
    """Get the N most recent news articles. Used for home page feed."""
    result = await db.execute(
        select(NewsArticle)
        .where(NewsArticle.is_summarized == True)  # only show summarized articles
        .order_by(NewsArticle.published_at.desc())
        .limit(limit)
    )
    articles = result.scalars().all()
    items = []
    for a in articles:
        item = NewsListOut.model_validate(a)
        if language == "te":
            if a.headline_telugu:
                item.headline = a.headline_telugu
            if a.summary_telugu:
                item.summary = a.summary_telugu
        items.append(item)
    return items


@router.get("/{article_id}", response_model=NewsArticleOut)
@cache_response(ttl=3600)  # 1 hour cache — individual articles rarely change
async def get_article(
    article_id: int,
    language: str = Query("en", pattern="^(en|te)$"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(NewsArticle).where(NewsArticle.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    out = NewsArticleOut.model_validate(article)
    if language == "te":
        if article.headline_telugu:
            out.headline = article.headline_telugu
        if article.summary_telugu:
            out.summary = article.summary_telugu
    return out
