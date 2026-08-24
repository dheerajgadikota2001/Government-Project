"""
Global search API — searches across projects, tenders, news, and documents.
Uses Elasticsearch for fast, multilingual, fuzzy search.
"""

from fastapi import APIRouter, Depends
from app.schemas.common import SearchQuery
from app.services.search import SearchService

router = APIRouter(prefix="/search", tags=["Search"])


@router.post("/")
async def global_search(query: SearchQuery):
    """
    Search across all content types in one call.
    Supports English and Telugu queries.
    Returns ranked results with type labels.
    """
    service = SearchService()
    results = await service.search(
        query=query.query,
        language=query.language,
        district=query.district,
        page=query.page,
        page_size=query.page_size,
    )
    return results


@router.get("/suggestions")
async def search_suggestions(q: str, language: str = "en"):
    """
    Autocomplete suggestions as user types.
    E.g., typing "Polavaram" shows "Polavaram Dam Project", "Polavaram Tenders" etc.
    """
    if len(q) < 2:
        return {"suggestions": []}
    service = SearchService()
    suggestions = await service.autocomplete(q, language)
    return {"suggestions": suggestions}
