"""
An index scraper judges the union of its pages, never one page at a time.

On 1 Nov 2026 APSDPS was refused with "parsed 3 rows against a recent best of
20": the home page lists three recent documents, it was walked first, and the
sanity gate saw those three alone against a best taken from the full
publications page. Every run would have been refused at the first page. The
saved copy of publications.html Dheeraj sent that day lists ten documents, so
the register itself was fine.
"""

import asyncio

import httpx

from app.scrapers.pdf_index import PdfIndexScraper


def page(html: str) -> httpx.Response:
    return httpx.Response(200, text=html, request=httpx.Request("GET", "https://example.gov.in/"))


def links(names):
    return "<html><title>t</title><body>" + "".join(
        f'<a href="https://example.gov.in/publications/{n}.pdf">{n} report</a>' for n in names) + "</body></html>"


HOME = links(["recent-1", "recent-2", "recent-3"])
PUBS = links([f"volume-{i}" for i in range(10)] + ["recent-1"])
ESSAYS = links([f"policy-{i}" for i in range(20)])


class Register(PdfIndexScraper):
    PORTAL_NAME = "Test_Register"
    BASE_URL = "https://example.gov.in"
    PUBLIC_NAME = "Test register"
    DEPARTMENT = "Test department"
    INDEX_PAGES = ("https://example.gov.in/", "https://example.gov.in/publications.html",
                   "https://example.gov.in/essay-reports.html")
    PAGES = {"https://example.gov.in/": HOME, "https://example.gov.in/publications.html": PUBS,
             "https://example.gov.in/essay-reports.html": ESSAYS}

    def __init__(self):
        super().__init__()
        self.batches = []

    async def _fetch_with_retries(self, url, params=None):
        return page(self.PAGES[url])

    async def _save(self, entries):
        entries = list(entries)
        self.batches.append(len(entries))
        return len(entries)


def test_all_pages_are_saved_as_one_batch():
    r = Register()
    total = asyncio.run(r.scrape())
    # 3 + 10 + 20, with recent-1 counted once
    assert r.batches == [33] and total == 33


def test_a_small_home_page_no_longer_meets_the_gate_alone():
    from app.scrapers.sanity import SanityGate, SanitySpec
    gate = SanityGate("apsdps", SanitySpec(min_rows=1), baseline=[{"rows": 20}])
    r = Register()
    asyncio.run(r.scrape())
    # The whole run (33) is what the gate would see, well above the floor of 10.
    gate.check_shape(r.batches[0])
