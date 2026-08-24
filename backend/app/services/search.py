"""
Elasticsearch search service — multilingual search across all content types.
"""

from typing import Optional
from elasticsearch import AsyncElasticsearch

from app.config import settings
from app.utils.logger import logger


class SearchService:
    def __init__(self):
        self._client: Optional[AsyncElasticsearch] = None

    @property
    def client(self) -> AsyncElasticsearch:
        if self._client is None:
            self._client = AsyncElasticsearch(settings.elasticsearch_url)
        return self._client

    async def search(
        self,
        query: str,
        language: str = "en",
        district: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        """
        Search across projects, tenders, news, and documents simultaneously.
        Searches both English and Telugu fields regardless of input language.
        """
        # Build the multi-match query
        must_clauses = [
            {
                "multi_match": {
                    "query": query,
                    "fields": [
                        "title^3",          # Title matches rank highest
                        "title_telugu^3",
                        "description^1",
                        "description_telugu^1",
                        "department^2",
                        "company_name^2",
                        "headline^3",
                        "headline_telugu^3",
                        "summary^1",
                        "summary_telugu^1",
                    ],
                    "type": "best_fields",
                    "fuzziness": "AUTO",    # Handles typos
                }
            }
        ]

        filter_clauses = []
        if district:
            filter_clauses.append({"term": {"district": district}})

        es_query = {
            "bool": {
                "must": must_clauses,
                "filter": filter_clauses,
            }
        }

        # Search across all indices at once
        indices = [
            settings.elasticsearch_projects_index,
            settings.elasticsearch_tenders_index,
            settings.elasticsearch_news_index,
            f"{settings.elasticsearch_index_prefix}_documents",
        ]

        try:
            response = await self.client.search(
                index=",".join(indices),
                body={
                    "query": es_query,
                    "from": (page - 1) * page_size,
                    "size": page_size,
                    "highlight": {
                        "fields": {
                            "title": {},
                            "title_telugu": {},
                            "headline": {},
                            "description": {"fragment_size": 150},
                        }
                    },
                },
            )

            hits = response["hits"]["hits"]
            total = response["hits"]["total"]["value"]

            results = []
            for hit in hits:
                source = hit["_source"]
                source["_type"] = hit["_index"].replace(settings.elasticsearch_index_prefix + "_", "")
                source["_score"] = hit["_score"]
                source["_highlights"] = hit.get("highlight", {})
                results.append(source)

            return {
                "results": results,
                "total": total,
                "page": page,
                "page_size": page_size,
                "has_next": (page * page_size) < total,
            }

        except Exception as e:
            logger.error(f"Elasticsearch search failed: {e}")
            return {"results": [], "total": 0, "page": page, "page_size": page_size, "has_next": False}

    async def autocomplete(self, prefix: str, language: str = "en") -> list[str]:
        """Return autocomplete suggestions for a search prefix."""
        try:
            fields = ["title", "title_telugu", "headline", "headline_telugu", "company_name"]
            indices = [
                settings.elasticsearch_projects_index,
                settings.elasticsearch_tenders_index,
                settings.elasticsearch_news_index,
            ]

            response = await self.client.search(
                index=",".join(indices),
                body={
                    "query": {
                        "multi_match": {
                            "query": prefix,
                            "fields": fields,
                            "type": "phrase_prefix",
                        }
                    },
                    "size": 8,
                    "_source": ["title", "title_telugu", "headline", "company_name"],
                },
            )

            suggestions = []
            seen = set()
            for hit in response["hits"]["hits"]:
                src = hit["_source"]
                for field in ["title", "title_telugu", "headline", "headline_telugu", "company_name"]:
                    val = src.get(field)
                    if val and val not in seen:
                        suggestions.append(val)
                        seen.add(val)
                if len(suggestions) >= 8:
                    break

            return suggestions[:8]

        except Exception as e:
            logger.error(f"Autocomplete failed: {e}")
            return []

    async def index_document(self, index: str, doc_id: int, document: dict):
        """Index a document into Elasticsearch (called after DB insert)."""
        try:
            await self.client.index(
                index=f"{settings.elasticsearch_index_prefix}_{index}",
                id=str(doc_id),
                document=document,
            )
        except Exception as e:
            logger.error(f"Elasticsearch index failed for {index}/{doc_id}: {e}")
