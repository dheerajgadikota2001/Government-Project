"""Basic tests: health check and API smoke tests.

The list endpoints here read the database, so they carry requires_db and are
skipped with a plain message when nothing is listening (see conftest.py).
/health is tested from both sides. The 200 needs a database; the 503 does not
and must not, because the 503 is the one that pages the monitor and it only
ever fires on a day when the database is gone.
"""

import pytest
from httpx import AsyncClient, ASGITransport

from app import main as main_module
from app.main import app


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_root():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "api" in data
    assert "supported_languages" in data
    assert "te" in data["supported_languages"]


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_projects_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/projects/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_tenders_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/tenders/")
    assert response.status_code == 200


@pytest.mark.requires_db
@pytest.mark.asyncio
async def test_news_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/news/latest")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_reports_degraded_when_the_database_is_down(monkeypatch):
    """The outage path, tested on a day when there is no outage.

    /health returning 503 is what makes an uptime monitor fire for a container
    that is up but serving nothing. Asserting only the 200 leaves that branch
    unrun until the night it is needed, and a monitor that has never once been
    proven to fire is not a monitor. Replacing the engine with one that refuses
    is the whole outage, in one line, with no database involved.
    """

    class _UnreachableEngine:
        def connect(self):
            raise ConnectionRefusedError("simulated: nothing listening")

    monkeypatch.setattr(main_module, "engine", _UnreachableEngine())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["db"] == "unreachable"
    assert data["db_error"] == "ConnectionRefusedError"
    # The monitor reads the body, a crawler reads the headers. Both matter.
    assert response.headers.get("X-Robots-Tag") == "noindex"
