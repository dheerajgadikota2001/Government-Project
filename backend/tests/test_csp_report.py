"""The CSP report sink must accept a browser report, log one line, store nothing, and shrug at junk."""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_report_is_accepted_and_logged(caplog):
    body = {"csp-report": {"document-uri": "https://apfactcheck.dhethi.com/projects",
                           "blocked-uri": "https://evil.example/x.js",
                           "violated-directive": "script-src", "disposition": "report"}}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/meta/csp-report", json=body)
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_junk_and_oversize_are_swallowed():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r1 = await c.post("/api/v1/meta/csp-report", content=b"not json", headers={"content-type": "application/csp-report"})
        r2 = await c.post("/api/v1/meta/csp-report", content=b"x" * 10_000)
    assert r1.status_code == 204 and r2.status_code == 204
