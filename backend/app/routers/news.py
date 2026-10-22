"""News API — aggregated and summarized AP news."""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import or_

from app.constants.news_topics import NEWS_TOPICS, topic_by_key
from app.database import get_db
from app.models.news import NewsArticle, NewsCategory, NewsSource
from app.schemas.common import PaginatedResponse
from app.schemas.news import NewsArticleOut, NewsListOut
from app.services.cache import cache_response

router = APIRouter(prefix="/news", tags=["News"])


def _topic_clause(topic: dict):
    """
    A topic matches an article when the article's stored category belongs to
    the topic, or when one of the topic's words appears as a WHOLE WORD in the
    article's own headline or summary. Whole-word matching matters: without it
    "ai" would match "rain" and "said". Grouping only — never a claim about
    the article.
    """
    import re as _re

    conds = []
    if topic["categories"]:
        conds.append(NewsArticle.category.in_(topic["categories"]))
    words = [w.strip() for w in topic["keywords"] if w.strip()]
    if words:
        # \m ... \M are Postgres word boundaries; longest first so phrases win.
        pattern = r"\m(" + "|".join(
            _re.escape(w).replace(r"\ ", r"\s+")
            for w in sorted(words, key=len, reverse=True)
        ) + r")\M"
        conds.append(NewsArticle.headline.op("~*")(pattern))
        conds.append(func.coalesce(NewsArticle.summary, "").op("~*")(pattern))
    return or_(*conds) if conds else None


@router.get("/", response_model=PaginatedResponse[NewsListOut])
@cache_response(ttl=120)  # 2 min cache — news is time-sensitive
async def list_news(
    topic: Optional[str] = Query(None, description="Reader-facing topic key from /news/topics"),
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

    if topic:
        t = topic_by_key(topic)
        if t is not None:
            clause = _topic_clause(t)
            if clause is not None:
                stmt = stmt.where(clause)
    if category:
        stmt = stmt.where(NewsArticle.category == category)
    if source:
        stmt = stmt.where(NewsArticle.source == source)
    if district:
        # districts is an array column — check if district is in array
        stmt = stmt.where(NewsArticle.districts.contains([district]))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # Newest first, undated last, and the id ends the sort: articles that share a timestamp keep one
    # order from page to page, so none repeats or goes missing (tests/test_paging_shows_every_row_once.py).
    stmt = stmt.order_by(NewsArticle.published_at.desc().nulls_last(), NewsArticle.id.desc()).offset((page - 1) * page_size).limit(page_size)
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


@router.get("/topics")
@cache_response(ttl=300)
async def get_news_topics(db: AsyncSession = Depends(get_db)):
    """
    The reader-facing topics, each with how many collected articles fall in it
    right now. A topic is our grouping of published articles — by the article's
    stored category and by words in its own headline or summary. It is a way to
    browse, not a claim about the article, and every article keeps its outlet
    and its link.
    """
    out = []
    for t in NEWS_TOPICS:
        clause = _topic_clause(t)
        stmt = select(func.count(NewsArticle.id))
        if clause is not None:
            stmt = stmt.where(clause)
        count = (await db.execute(stmt)).scalar_one()
        out.append({
            "key": t["key"], "label": t["label"], "label_telugu": t["label_telugu"],
            "blurb": t["blurb"], "count": count or 0,
        })
    total = (await db.execute(select(func.count(NewsArticle.id)))).scalar_one()
    return {
        "topics": out,
        "total_articles": total or 0,
        "method_note": (
            "Topics are our grouping of the articles outlets published — by each article's "
            "recorded category and by words in its own headline or summary. An article can "
            "appear under more than one topic. Nothing here is a judgement of an article's "
            "accuracy; the outlet's name and a link to the original travel with every item."
        ),
    }


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
