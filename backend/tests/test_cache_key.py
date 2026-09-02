"""
Regression tests for the response cache.

These exist because both bugs they cover were invisible in normal use and only
appeared under concurrency — which is the one condition nobody exercises by hand.

BUG 1 (fixed 2026-08-28): the cache key was built with
`json.dumps(kwargs, default=str)`, and kwargs contains the injected AsyncSession.
AsyncSession has no __repr__, so str() produced its MEMORY ADDRESS. Concurrent
requests held different session objects at different addresses and therefore
produced different keys — every one a miss. Sequentially, CPython reused the
freed address and the keys matched, so the cache looked fine on a laptop and
stopped working exactly as load rose.

BUG 2 (found by the test for bug 1): fixing the key exposed a cache stampede.
Fifty concurrent requests for one uncached key all missed together and all ran
the query. On a db-f1-micro serving lakhs of readers, a cold cache plus a crowd
is the outage.

If either test starts failing, the cache has silently stopped protecting the
database. Do not skip them.

Run:  pytest tests/test_cache_key.py -v
"""

import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.cache import build_cache_key, cache_response, local_clear


def _session() -> AsyncSession:
    """A session object without touching a real database."""
    return AsyncSession.__new__(AsyncSession)


# ── Bug 1: the key must not depend on object identity ───────────────────────

def test_concurrent_sessions_produce_one_key():
    """Two requests alive at the same time must share a key.

    Both sessions are held in locals deliberately: if one were allowed to be
    garbage collected, CPython would reuse its address and the test would pass
    for the wrong reason. That false pass is what hid the original bug.
    """
    first, second = _session(), _session()
    assert repr(first) != repr(second), "sessions must be distinct objects"

    key_one = build_cache_key("app.routers.projects", "list_projects", {"page": 1, "db": first})
    key_two = build_cache_key("app.routers.projects", "list_projects", {"page": 1, "db": second})
    assert key_one == key_two


def test_many_live_sessions_produce_one_key():
    sessions = [_session() for _ in range(200)]
    keys = {build_cache_key("m", "f", {"page": 1, "district": "Guntur", "db": s}) for s in sessions}
    assert len(keys) == 1


@pytest.mark.parametrize("left,right", [
    ({"page": 1}, {"page": 2}),
    ({"district": "Guntur"}, {"district": "Krishna"}),
    ({"year": [2019, 2020]}, {"year": [2020, 2021]}),
    ({"q": None}, {}),
])
def test_real_parameters_still_separate_keys(left, right):
    """The fix must not over-merge: genuinely different queries need different keys."""
    db = _session()
    assert build_cache_key("m", "f", {**left, "db": db}) != build_cache_key("m", "f", {**right, "db": db})


def test_parameter_order_is_irrelevant():
    assert build_cache_key("m", "f", {"a": 1, "b": 2}) == build_cache_key("m", "f", {"b": 2, "a": 1})


def test_different_routes_do_not_collide():
    assert build_cache_key("m", "f", {"page": 1}) != build_cache_key("m", "g", {"page": 1})


# ── Bug 2: concurrent misses must be coalesced ──────────────────────────────

def test_concurrent_misses_hit_the_database_once():
    """A crowd arriving at a cold cache must produce ONE query, not one each."""
    local_clear()
    calls = {"count": 0}

    @cache_response(ttl=60)
    async def handler(page: int = 1, db=None):
        calls["count"] += 1
        await asyncio.sleep(0.01)          # a real query is not instant
        return {"page": page, "call": calls["count"]}

    async def run():
        return await asyncio.gather(*[handler(page=1, db=_session()) for _ in range(50)])

    results = asyncio.run(run())

    assert calls["count"] == 1, f"cache stampede: handler ran {calls['count']}x for 50 concurrent requests"
    assert len({r["call"] for r in results}) == 1, "callers got inconsistent payloads"


def test_sequential_repeats_are_served_from_cache():
    local_clear()
    calls = {"count": 0}

    @cache_response(ttl=60)
    async def handler(page: int = 1, db=None):
        calls["count"] += 1
        return {"page": page}

    async def run():
        for _ in range(10):
            await handler(page=1, db=_session())

    asyncio.run(run())
    assert calls["count"] == 1


def test_distinct_queries_are_not_merged_under_concurrency():
    """Coalescing must key on the query, not collapse everything into one."""
    local_clear()
    calls = {"count": 0}

    @cache_response(ttl=60)
    async def handler(page: int = 1, db=None):
        calls["count"] += 1
        await asyncio.sleep(0.01)
        return {"page": page}

    async def run():
        return await asyncio.gather(*[handler(page=p, db=_session()) for p in range(5) for _ in range(10)])

    results = asyncio.run(run())
    assert calls["count"] == 5, f"expected one query per distinct page, got {calls['count']}"
    assert {r["page"] for r in results} == set(range(5))


def test_failure_is_not_cached_and_releases_waiters():
    """A failed computation must not poison the key for the next reader."""
    local_clear()
    state = {"should_fail": True, "calls": 0}

    @cache_response(ttl=60)
    async def handler(db=None):
        state["calls"] += 1
        if state["should_fail"]:
            raise RuntimeError("database down")
        return {"ok": True}

    async def run():
        with pytest.raises(RuntimeError):
            await handler(db=_session())
        state["should_fail"] = False
        return await handler(db=_session())

    assert asyncio.run(run()) == {"ok": True}
    assert state["calls"] == 2, "the failure must not have been cached"
