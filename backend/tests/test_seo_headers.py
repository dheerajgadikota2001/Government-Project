"""
The API must be readable by crawlers and invisible in search results.

Those are two different controls and this file guards the one the API owns.

WHY THIS TEST EXISTS

robots.txt used to say "Disallow: /api/". It read as obviously correct: JSON is
not a page, so keep it out of Google. What it actually did was stop Google's
renderer fetching the data every page is built from. Search Console showed the
homepage rendered with every figure as a dash, plus the site's own error box
saying the data server was not responding. We had told Google not to look, and
Google reported the site as broken.

The fix is to let crawlers fetch the API and tell them not to list it. This
header is the second half. If it ever goes missing, someone will reasonably
re-add the robots.txt block to keep JSON out of search results, and the empty
pages come straight back.
"""

import pytest
from fastapi.routing import APIRoute
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/health",
        # These two read the database. With none running the endpoint raises,
        # the exception is re-raised past the test, and this file's assertion
        # never runs at all: the failure it reports is a connection traceback,
        # not a missing header. Marked so a stopped service reads as a skip.
        pytest.param("/api/v1/projects/stats", marks=pytest.mark.requires_db),
        pytest.param("/api/v1/projects/?page_size=1", marks=pytest.mark.requires_db),
        "/api/v1/nope",          # errors least of all belong in a search result
    ],
)
async def test_every_response_says_noindex(path):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(path)
    assert response.headers.get("X-Robots-Tag") == "noindex", (
        f"{path} returned {response.status_code} without X-Robots-Tag: noindex. "
        "Without it the JSON can be listed in search results, and the usual "
        "reflex is to block /api/ in robots.txt, which blinds the renderer."
    )


@pytest.mark.asyncio
async def test_a_crash_still_says_noindex():
    """The one response the middleware cannot reach.

    Every path above returns normally, so every path above is stamped by
    CacheControlMiddleware and this file passed while the rule had a hole in
    it. A crash does not return: Starlette turns it into a 500 inside
    ServerErrorMiddleware, which sits outside every middleware the app adds,
    so that response went out with no X-Robots-Tag and no Cache-Control.

    A 500 is exactly the response that must not be listed. It is also the one
    that appears on the worst day, when a database is gone and every endpoint
    is producing one, and it is the body that says the data server is not
    responding. That is the string this project has already had indexed once.

    Probing it needs a route that fails on purpose, added for the length of
    this test and taken out again, and a transport that hands back the 500
    instead of re-raising, which is what a real reader and a real crawler get.
    """

    async def _always_fails():
        raise RuntimeError("simulated crash, to check the headers on a 500")

    probe = APIRoute("/__crash_probe", _always_fails, methods=["GET"])
    app.router.routes.append(probe)
    try:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/__crash_probe")
    finally:
        app.router.routes.remove(probe)

    assert response.status_code == 500
    assert response.headers.get("X-Robots-Tag") == "noindex", (
        "a 500 left without X-Robots-Tag: noindex. It is set in "
        "global_exception_handler in app/main.py and not by the middleware, "
        "because ServerErrorMiddleware builds this response above the "
        "middleware stack. If that header was moved back to the middleware, "
        "this is the hole it reopened."
    )
    assert "no-store" in response.headers.get("Cache-Control", ""), (
        "a 500 left without Cache-Control: no-store, so a CDN is free to pin "
        "an error page at the edge for whatever its own default happens to be."
    )
