"""
Shared test setup: two pieces of state that leak between tests, closed off.

1. THE CONNECTION POOL AND THE EVENT LOOP

app/database.py builds one module level async engine with a real connection
pool, which is right for production and wrong for a test run. pytest-asyncio
gives each test its own event loop, but the pool does not know that: it hands
test B a connection that asyncpg opened inside test A's loop, and the result is
a "Task got Future attached to a different loop" failure in whichever test
happens to run second.

That is why these tests passed one at a time and failed as a suite, and why the
failing test moved around with ordering. It was never a flake. It was a real
resource outliving the loop that created it.

Disposing the pool after every test closes each connection while its own loop
is still alive. It costs a reconnect per test, a few milliseconds at this suite
size, and it buys a suite that gives the same answer every time.

2. REDIS, WHICH SURVIVES THE PROCESS

The cache stampede test asserts a handler runs exactly once for fifty
concurrent misses. On a second local run the value was still sitting in Redis
from the first, so the handler ran zero times and the test failed. CI never saw
that because CI gets a fresh Redis container each time, which is exactly the
kind of difference that makes a suite pass in one place and fail in another.

Flushing before each test makes local runs and CI runs agree.

The APP_ENV guard is not decoration. Without it, running the suite against a
developer's own .env would flush whatever Redis that points at.
"""

import socket
from urllib.parse import urlsplit

import pytest
import pytest_asyncio

from app.config import settings
from app.database import engine
from app.services import cache as cache_service


# --------------------------------------------------------------------------
# 3. THE DATABASE, WHICH IS NOT ALWAYS THERE
#
# Several tests exercise real endpoints against a real database, and they are
# marked requires_db for it. The marker was being declared and then ignored: on
# a laptop with the Cloud SQL proxy stopped they ran anyway and failed with a
# connection traceback, which reads as "your change broke six tests" when the
# change had nothing to do with it. A suite that cries wolf about the
# environment is a suite people stop reading.
#
# A TCP probe rather than a real connection: the question is only whether
# anything is listening, and that answer must not depend on credentials, on
# asyncpg, or on an event loop this hook does not own. A URL with no host is a
# unix socket, which is how this runs in Cloud Run, and there the database is
# always there, so nothing is skipped.
# --------------------------------------------------------------------------

def _database_target() -> tuple[str, int] | None:
    parts = urlsplit(settings.database_url)
    return (parts.hostname, parts.port or 5432) if parts.hostname else None


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "requires_db: needs a reachable database; skipped, not failed, when there is none",
    )


def pytest_collection_modifyitems(config, items):
    target = _database_target()
    if target is None:
        return
    host, port = target
    try:
        with socket.create_connection((host, port), timeout=2):
            return
    except OSError:
        pass
    skip = pytest.mark.skip(
        reason=f"no database listening on {host}:{port}. Start the Cloud SQL proxy to run these."
    )
    for item in items:
        if "requires_db" in item.keywords:
            item.add_marker(skip)


@pytest_asyncio.fixture(autouse=True)
async def _isolate_test_state():
    if settings.app_env == "testing":
        try:
            redis = await cache_service.get_redis()
            await redis.flushdb()
        except Exception:
            # No Redis in this environment. The cache layer already degrades
            # gracefully, so the suite should too rather than failing here.
            pass
    cache_service.local_clear()

    yield

    await engine.dispose()
    if settings.app_env == "testing":
        await cache_service.close_redis()
