"""
Redis caching service.
Provides a decorator to cache FastAPI endpoint responses.
Handles serialization, TTL, and cache invalidation.
"""

import json
import functools
import hashlib
from typing import Optional, Any
from fastapi import Request, Response

import redis.asyncio as aioredis

from app.config import settings
from app.utils.logger import logger

# Global Redis client (reused across requests)
_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = await aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def close_redis():
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None


async def cache_get(key: str) -> Optional[Any]:
    try:
        redis = await get_redis()
        value = await redis.get(key)
        if value:
            return json.loads(value)
    except Exception as e:
        logger.warning(f"Cache GET failed for key={key}: {e}")
    return None


async def cache_set(key: str, value: Any, ttl: int = 300):
    try:
        redis = await get_redis()
        await redis.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.warning(f"Cache SET failed for key={key}: {e}")


async def cache_delete_pattern(pattern: str):
    """Delete all cache keys matching a pattern. Use after data updates."""
    try:
        redis = await get_redis()
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
            logger.info(f"Deleted {len(keys)} cache keys matching {pattern!r}")
    except Exception as e:
        logger.warning(f"Cache DELETE pattern failed: {e}")


def cache_response(ttl: int = 300):
    """
    Decorator for FastAPI route handlers.
    Caches the JSON response in Redis for `ttl` seconds.
    Cache key is built from the function name + all query params.

    Usage:
        @router.get("/projects")
        @cache_response(ttl=300)
        async def list_projects(...):
            ...
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Build a stable cache key from function name + kwargs
            key_data = f"{func.__module__}.{func.__name__}:{json.dumps(kwargs, sort_keys=True, default=str)}"
            cache_key = f"applatform:resp:{hashlib.md5(key_data.encode()).hexdigest()}"

            cached = await cache_get(cache_key)
            if cached is not None:
                return cached

            result = await func(*args, **kwargs)

            # Serialize pydantic models / dicts for caching
            if hasattr(result, "model_dump"):
                serializable = result.model_dump()
            elif isinstance(result, list):
                serializable = [
                    item.model_dump() if hasattr(item, "model_dump") else item
                    for item in result
                ]
            else:
                serializable = result

            await cache_set(cache_key, serializable, ttl)
            return result

        return wrapper
    return decorator
