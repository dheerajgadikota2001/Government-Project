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
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/health",
        "/api/v1/projects/stats",
        "/api/v1/projects/?page_size=1",
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
