"""
AP School Education (Commissionerate of School Education) — statistics reports.
Source: https://cse.ap.gov.in/

WHY THIS SOURCE
School enrolment, teacher counts and infrastructure are among the most
frequently claimed and least frequently sourced numbers in AP politics. CSE
publishes the department's own Educational Statistics volumes as PDFs, which
is the document a claim about school numbers has to be checked against.

WHAT THE PAGE IS
A static site. The statistics volumes are direct links under
/MISdownload/MIS_REPORT_NOTIFICATION/, named "Educational Statistics
{year}.pdf" for years 2016-17 through 2022-23 at the time of writing.

The scraper walks the site's index pages rather than constructing those URLs
from a year range. Guessing URLs would mean the scraper keeps "working"
against files that do not exist and silently misses any volume CSE names
differently — and a fact-check platform must not link a 404.
"""

from app.models.document import DocumentType
from app.scrapers.pdf_index import PdfIndexScraper

BASE = "https://cse.ap.gov.in"


class CSEStatisticsScraper(PdfIndexScraper):
    PORTAL_NAME = "CSE_Statistics"
    BASE_URL = BASE
    PUBLIC_NAME = "AP School Education — statistics"
    DEPARTMENT = "School Education Department"
    DOC_TYPE = DocumentType.ANNUAL_REPORT
    # The home page carries the statistics links directly. Two other paths were
    # tried and are gone: /downloads 404s, and /#/downloads is a fragment — the
    # server never sees it, so fetching it just re-fetches the home page.
    INDEX_PAGES = (
        f"{BASE}/",
    )
    # The site also serves circulars and forms; only statistical publications
    # belong in this source. Anything else would misattribute a routine
    # office memo as a departmental statistic.
    REQUIRE = (
        "statistic", "enrolment", "enrollment", "annual report",
        "MIS_REPORT", "udise", "school education",
    )
