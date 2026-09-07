"""
Response caching — an in-process layer, then Redis if it exists.

THE BUG THIS FILE USED TO HAVE (fixed 2026-08-28)
The cache key was built with:

    json.dumps(kwargs, sort_keys=True, default=str)

`kwargs` contains the database session FastAPI injects. `AsyncSession` defines no
`__repr__`, so `str()` on it yields the default object repr — which contains the
object's MEMORY ADDRESS:

    <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x7f178ed8b090>

Two requests in flight at the same time hold two different session objects at two
different addresses, so they produced two different keys for identical queries.
Sequentially the old session was garbage collected and CPython reused the address,
so the keys matched and the cache appeared to work.

The failure mode was therefore the worst possible one: the cache looked healthy on
a developer's laptop and stopped working precisely as concurrency rose — which is
the only situation it exists for.

THE FIX
Keys are now built from an explicit whitelist of value TYPES. Query and path
parameters are always primitives (or pydantic models); injected dependencies never
are. Anything that is not a primitive is not part of the logical identity of a
request, so it cannot enter the key. There is a regression test for this in
tests/test_cache_key.py that fires concurrent calls and asserts ONE key.

TWO LAYERS, DELIBERATELY
1. An in-process TTL cache. Costs nothing, needs no service, and survives the fact
   that Redis is not deployed in production. It is per-container, so it helps less
   as instances multiply — it is a second line of defence, not the main one.
2. Redis, when a server is actually reachable. Shared across instances.

A SECOND BUG, FOUND BY THE TEST FOR THE FIRST (fixed 2026-08-28)
Fixing the key exposed a cache stampede. Fifty concurrent requests for the same
uncached key all missed together — none had finished computing, so none had
written a cache entry yet — and all fifty ran the query. The verification run
showed the handler executing 50 times for 50 identical simultaneous requests.

That is precisely the moment this platform cannot afford: a cold cache plus a
crowd. It happens every time a container starts, every time a TTL rolls over,
and every time a figure is corrected — which is to say, exactly when a lot of
people are likely to be reading. A db-f1-micro does not survive a lakh of readers
arriving at an empty cache.

So misses are now coalesced: the first caller for a key computes, and everyone
else waiting on that same key awaits its result instead of issuing their own
query. One database hit per key, however many readers arrive at once.

The real first line of defence is still the CDN (see
app/middleware/cache_headers.py). Most requests should never reach this file.
"""

import asyncio
import json
import functools
import hashlib
import time
from collections import OrderedDict
from typing import Optional, Any

import redis.asyncio as aioredis

from app.config import settings
from app.utils.logger import logger

# ── Redis client, with a circuit breaker ────────────────────────────────────
# Dev boxes usually have no Redis, and production currently has none either.
# After one failed attempt we stop trying for a minute rather than making every
# request wait out a connection retry. Responses come from Postgres either way;
# the cache is only ever a speed-up.

_redis_client: Optional[aioredis.Redis] = None
_RETRY_AFTER_SECONDS = 60
_down_until: float = 0.0


def _redis_available() -> bool:
    return time.monotonic() >= _down_until


def _mark_down(op: str, exc: Exception) -> None:
    global _down_until
    _down_until = time.monotonic() + _RETRY_AFTER_SECONDS
    logger.warning(
        f"Redis unreachable on cache {op} ({exc}); caching paused for "
        f"{_RETRY_AFTER_SECONDS}s — responses served from the in-process cache "
        f"or straight from the database."
    )


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = await aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=1.0,
        )
    return _redis_client


async def close_redis():
    global _redis_client
    if _redis_client:
        # aclose(), not close(). redis-py deprecated the sync-named close() on
        # async clients in 5.0.1 and will remove it; aclose() is the same call
        # without a deprecation warning on every shutdown.
        await _redis_client.aclose()
        _redis_client = None


# ── In-process cache ────────────────────────────────────────────────────────
# Bounded so a long-running container cannot grow without limit. Least-recently
# used entries are evicted first.

_LOCAL_MAX_ENTRIES = 512
_local_cache: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()


def local_get(key: str) -> Optional[Any]:
    hit = _local_cache.get(key)
    if hit is None:
        return None
    expires_at, value = hit
    if time.monotonic() >= expires_at:
        _local_cache.pop(key, None)
        return None
    _local_cache.move_to_end(key)
    return value


def local_set(key: str, value: Any, ttl: int) -> None:
    _local_cache[key] = (time.monotonic() + ttl, value)
    _local_cache.move_to_end(key)
    while len(_local_cache) > _LOCAL_MAX_ENTRIES:
        _local_cache.popitem(last=False)


def local_clear() -> None:
    """Drop everything. Used by tests and after a deliberate data reload."""
    _local_cache.clear()
    _inflight.clear()


# ── In-flight request coalescing ────────────────────────────────────────────
# One entry per cache key that is currently being computed. Readers who arrive
# while a computation is running await its result rather than starting their own.
# This is what turns a thundering herd into a single query.
_inflight: dict[str, "asyncio.Future"] = {}


# ── Redis helpers ───────────────────────────────────────────────────────────

async def cache_get(key: str) -> Optional[Any]:
    if not _redis_available():
        return None
    try:
        redis = await get_redis()
        value = await redis.get(key)
        if value:
            return json.loads(value)
    except Exception as e:
        _mark_down("GET", e)
    return None


async def cache_set(key: str, value: Any, ttl: int = 300):
    if not _redis_available():
        return
    try:
        redis = await get_redis()
        await redis.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        _mark_down("SET", e)


async def cache_delete_pattern(pattern: str):
    """Delete all cache keys matching a pattern. Use after data updates."""
    local_clear()
    if not _redis_available():
        return
    try:
        redis = await get_redis()
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
            logger.info(f"Deleted {len(keys)} cache keys matching {pattern!r}")
    except Exception as e:
        _mark_down("DELETE", e)


# ── Cache key construction ──────────────────────────────────────────────────

# Values of these types genuinely identify a request. Everything else is an
# injected dependency and is excluded on purpose — see the module docstring.
_PRIMITIVES = (str, int, float, bool, type(None))


def _keyable(value: Any) -> tuple[bool, Any]:
    """Return (usable, normalised_value) for one parameter value.

    Whitelisting by TYPE rather than by parameter name is deliberate: a name-based
    skip list silently breaks the day someone adds a new dependency with a name
    nobody remembered to add to it, and that breakage is invisible — the cache just
    stops hitting. Types are the property that actually distinguishes "a query
    parameter" from "an injected object".
    """
    if isinstance(value, _PRIMITIVES):
        return True, value
    if isinstance(value, (list, tuple, set)):
        parts = []
        for item in value:
            usable, normalised = _keyable(item)
            if not usable:
                return False, None
            parts.append(normalised)
        return True, sorted(parts, key=repr) if isinstance(value, set) else parts
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            usable, normalised = _keyable(v)
            if not usable:
                return False, None
            out[str(k)] = normalised
        return True, out
    # Pydantic models are legitimate request bodies and have a stable dump.
    dump = getattr(value, "model_dump", None)
    if callable(dump):
        try:
            return _keyable(dump())
        except Exception:  # noqa: BLE001 — an undumpable model is simply not keyable
            return False, None
    return False, None


def build_cache_key(module: str, name: str, kwargs: dict) -> str:
    """Build a stable key from a route's identity and its real parameters.

    Non-keyable values (the DB session, Request, BackgroundTasks) are dropped.
    They are dropped rather than stringified because their identity varies per
    request while the response they produce does not.
    """
    safe: dict[str, Any] = {}
    for key, value in kwargs.items():
        usable, normalised = _keyable(value)
        if usable:
            safe[key] = normalised

    payload = f"{module}.{name}:{json.dumps(safe, sort_keys=True, default=str)}"
    return f"applatform:resp:{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:32]}"


def cache_response(ttl: int = 300):
    """Cache a route handler's JSON response for `ttl` seconds.

    Looks in the in-process cache first, then Redis, then computes. A computed
    result is written to both.

        @router.get("/projects")
        @cache_response(ttl=300)
        async def list_projects(...):
            ...
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = build_cache_key(func.__module__, func.__name__, kwargs)

            cached = local_get(cache_key)
            if cached is not None:
                return cached

            # Someone is already computing this exact key. Wait for their answer
            # instead of running the same query again. Without this, a crowd
            # arriving at a cold cache becomes a crowd arriving at the database.
            running = _inflight.get(cache_key)
            if running is not None:
                return await asyncio.shield(running)

            loop = asyncio.get_running_loop()
            pending: asyncio.Future = loop.create_future()
            _inflight[cache_key] = pending

            try:
                cached = await cache_get(cache_key)
                if cached is not None:
                    local_set(cache_key, cached, ttl)
                    if not pending.done():
                        pending.set_result(cached)
                    return cached

                result = await func(*args, **kwargs)

                if hasattr(result, "model_dump"):
                    serializable = result.model_dump()
                elif isinstance(result, list):
                    serializable = [
                        item.model_dump() if hasattr(item, "model_dump") else item
                        for item in result
                    ]
                else:
                    serializable = result

                local_set(cache_key, serializable, ttl)
                await cache_set(cache_key, serializable, ttl)

                # Waiters receive exactly what a cache hit would have given them.
                if not pending.done():
                    pending.set_result(serializable)
                return result
            except Exception as exc:
                # Everyone waiting fails together and the key is released, so the
                # next request retries rather than inheriting a poisoned entry.
                if not pending.done():
                    pending.set_exception(exc)
                raise
            finally:
                _inflight.pop(cache_key, None)
                # Stop asyncio complaining if nobody ever awaited the failure.
                if pending.done() and not pending.cancelled() and pending.exception():
                    pending.exception()

        return wrapper
    return decorator
