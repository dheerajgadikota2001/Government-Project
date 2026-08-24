from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.models.news import NewsCategory, NewsSource


class NewsArticleOut(BaseModel):
    id: int
    headline: str
    headline_telugu: Optional[str] = None
    summary: Optional[str] = None
    summary_telugu: Optional[str] = None
    category: NewsCategory
    source: NewsSource
    source_name: str
    source_url: str
    districts: Optional[List[str]] = None
    image_url: Optional[str] = None
    published_at: Optional[datetime] = None
    is_summarized: bool
    is_translated: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NewsListOut(BaseModel):
    id: int
    headline: str
    headline_telugu: Optional[str] = None
    summary: Optional[str] = None
    summary_telugu: Optional[str] = None
    category: NewsCategory
    source_name: str
    source_url: str
    image_url: Optional[str] = None
    published_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
