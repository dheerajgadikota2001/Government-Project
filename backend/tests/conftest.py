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

3. POSTGRES, WHICH IS NOT ALWAYS RUNNING

Five tests drive real endpoints, so they need a real database. With nothing
listening they did not report that. asyncpg raised ConnectionRefusedError, the
app's exception handler turned it into a 500, ServerErrorMiddleware re-raised
it, and httpx handed the raw connection traceback to the test. Six red tests
and not one line saying "start Postgres": the run looked like broken code and
was a stopped service.

So those tests carry a requires_db marker and this file checks the port once
before the run. Unreachable and local: skip, naming the database and how to
start it. Unreachable in CI: leave them to fail, because CI supplies Postgres
as a service and a skip there would turn a broken gate green. The point is
that a developer reads one sentence instead of six tracebacks, and the gate
loses nothing.
"""

import os
import socket
from urllib.parse import urlsplit

import pytest
import pytest_asyncio

from app.config import database_target, settings
from app.database import engine
from app.services import cache as cache_service


def _database_is_listening(timeout: float = 1.0) -> bool:
    """Is anything answering on the configured database host and port?

    A TCP probe, not a connection: it asks the one question that separates
    "nothing is running" from every other failure, and it asks it without
    credentials, without a driver and in a millisecond. A wrong password or a
    missing table still fails the test properly, which is right, because those
    are problems a developer has to see.
    """
    parts = urlsplit(settings.database_url)
    host = parts.hostname
    if not host:
        # Unix socket form, which is how Cloud Run reaches Cloud SQL. There is
        # no port to probe, so let the real connection give the real answer.
        return True
    try:
        with socket.create_connection((host, parts.port or 5432), timeout=timeout):
            return True
    except OSError:
        return False


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "requires_db: needs a reachable PostgreSQL. Skipped locally when there "
        "is none, never skipped in CI.",
    )


def pytest_collection_modifyitems(config, items):
    marked = [item for item in items if item.get_closest_marker("requires_db")]
    if not marked or _database_is_listening():
        return
    if os.environ.get("CI"):
        return
    skip = pytest.mark.skip(
        reason=(
            f"no database at {database_target()}. Start it and re-run "
            "(on the dev laptop that is the postgresql-x64-16 service). "
            "Skipped rather than failed, because a stopped service is not a "
            "broken build."
        )
    )
    for item in marked:
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
