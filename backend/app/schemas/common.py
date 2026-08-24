"""Shared schema components used across all endpoints."""

from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response wrapper for all list endpoints."""
    items: List[T]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool

    @classmethod
    def build(cls, items: List[T], total: int, page: int, page_size: int) -> "PaginatedResponse[T]":
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_next=(page * page_size) < total,
            has_prev=page > 1,
        )


class SearchQuery(BaseModel):
    """Search request body."""
    query: str = Field(..., min_length=1, max_length=200, description="Search term")
    language: str = Field(default="en", pattern="^(en|te)$", description="en=English, te=Telugu")
    district: Optional[str] = Field(default=None, description="Filter by district")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
