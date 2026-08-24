"""
News Article model — stores scraped + AI-summarized news about Andhra Pradesh.
"""

import enum
from datetime import datetime
from typing import List, Optional

from sqlalchemy import BigInteger, DateTime, Enum, Index, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NewsCategory(str, enum.Enum):
    POLITICS = "politics"
    DEVELOPMENT = "development"
    ECONOMY = "economy"
    TENDERS = "tenders"
    INVESTMENTS = "investments"
    INFRASTRUCTURE = "infrastructure"
    AGRICULTURE = "agriculture"
    EDUCATION = "education"
    HEALTH = "health"
    CRIME = "crime"
    WEATHER = "weather"
    OTHER = "other"


class NewsSource(str, enum.Enum):
    SAKSHI = "sakshi"
    EENADU = "eenadu"
    ANDHRA_JYOTHY = "andhra_jyothy"
    NDTV_AP = "ndtv_ap"
    THE_HINDU_AP = "the_hindu_ap"
    DECCAN_CHRONICLE = "deccan_chronicle"
    NEWS_ON_AIR = "news_on_air"
    PIB = "pib"
    OTHER = "other"


class NewsArticle(Base):
    __tablename__ = "news_articles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Content
    headline: Mapped[str] = mapped_column(String(500), nullable=False)
    headline_telugu: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # AI-generated summaries (3-5 sentences, crisp)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_telugu: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Full article (stored for re-summarization if needed)
    full_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Classification
    category: Mapped[NewsCategory] = mapped_column(
        Enum(NewsCategory), nullable=False, default=NewsCategory.OTHER, index=True
    )
    source: Mapped[NewsSource] = mapped_column(
        Enum(NewsSource), nullable=False, default=NewsSource.OTHER, index=True
    )
    source_name: Mapped[str] = mapped_column(String(100), nullable=False)  # Human readable source name
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)  # Dedup by URL

    # Location tags
    districts: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)

    # Media
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # Dates
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Translation / summarization status
    is_summarized: Mapped[bool] = mapped_column(default=False)
    is_translated: Mapped[bool] = mapped_column(default=False)

    # Audit
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_news_category_published", "category", "published_at"),
        Index("ix_news_source_published", "source", "published_at"),
        Index("ix_news_published_at", "published_at"),
    )

    def __repr__(self) -> str:
        return f"<NewsArticle id={self.id} source={self.source} headline={self.headline[:50]!r}>"
