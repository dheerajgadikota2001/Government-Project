"""Pydantic schemas for the community board and correction reports."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PostCreate(BaseModel):
    topic: Optional[str] = Field(None, max_length=50)
    page_key: Optional[str] = Field(None, max_length=100)
    parent_id: Optional[int] = None
    display_name: str = Field(..., min_length=2, max_length=40)
    body: str = Field(..., min_length=2, max_length=2000)
    lang: str = Field("en", max_length=5)


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    topic: Optional[str]
    page_key: Optional[str]
    parent_id: Optional[int]
    display_name: str
    body: str
    lang: str
    status: str
    reply_count: int
    created_at: datetime


class PostCreated(PostOut):
    """Returned only to the author, once — carries the self-delete secret."""
    delete_token: str


class TopicOut(BaseModel):
    key: str
    post_count: int
    last_post_at: Optional[datetime]


class CorrectionCreate(BaseModel):
    page_key: Optional[str] = Field(None, max_length=200)
    body: str = Field(..., min_length=10, max_length=4000)
    contact: Optional[str] = Field(None, max_length=200)
    lang: str = Field("en", max_length=5)


class CorrectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    page_key: Optional[str]
    body: str
    contact: Optional[str]
    lang: str
    status: str
    admin_note: Optional[str]
    created_at: datetime
