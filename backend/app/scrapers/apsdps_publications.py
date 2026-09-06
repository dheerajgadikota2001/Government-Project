"""
AP State Data Policy & Statistics (Directorate of Economics & Statistics).
Source: https://apsdps.ap.gov.in/

WHY THIS SOURCE
This is the state's own statistical office — the publisher of the Monthly
Economic Report, the Socio-Economic Survey and the Statistical Abstract.
When a claim cites "state figures", these are the volumes it is citing,
and until now the platform had none of them.

WHAT THE PAGE IS
A static site (~170 KB) with a "Recent Documents" block on the home page and
two index pages, publications.html and essay-reports.html. Recent items at
time of writing: AP Monthly Economic Report July 2026, AP Population
Management 2026, Swarna Andhra @2047.

Everything served here is a statistical publication, so unlike CSE there is
no keyword filter — filtering would only risk dropping a volume whose title
does not contain an expected word.
"""

import re
from typing import Optional

from app.models.document import DocumentType
from app.scrapers.pdf_index import PdfIndexScraper

BASE = "https://apsdps.ap.gov.in"


class APSDPSPublicationsScraper(PdfIndexScraper):
    PORTAL_NAME = "APSDPS_Publications"
    BASE_URL = BASE
    PUBLIC_NAME = "AP Economics & Statistics — publications"
    DEPARTMENT = "Directorate of Economics and Statistics"
    DOC_TYPE = DocumentType.ANNUAL_REPORT
    INDEX_PAGES = (
        f"{BASE}/",
        f"{BASE}/publications.html",
        f"{BASE}/essay-reports.html",
    )

    def classify(self, entry: dict) -> DocumentType:
        """
        This portal mixes three kinds of document in one index, and the first
        run filed all 31 as annual reports — including twenty industrial and
        sectoral policies. Anyone filtering the archive for state policy would
        have found none of them. The URL is the strongest signal: the site
        keeps policies under /Policies/.
        """
        raw = f"{entry.get('title','')} {entry.get('url','')}".lower()
        # These file names run words together ("MonthlyEconomicReport-JUL2026"),
        # so separators are stripped before matching; otherwise the Monthly
        # Economic Report — the flagship publication here — falls through to
        # "other" purely because of how the file was named.
        blob = re.sub(r"[\s_\-.]+", "", raw)

        if "/policies/" in raw or "policy" in blob:
            return DocumentType.POLICY
        if any(k in blob for k in ("survey", "statistic", "economicreport", "abstract")):
            return DocumentType.ANNUAL_REPORT
        if "newsletter" in blob:
            return DocumentType.PRESS_RELEASE
        if any(k in blob for k in ("discussionnote", "vision", "note")):
            return DocumentType.WHITE_PAPER
        return DocumentType.OTHER

    def extra_description(self, entry: dict) -> Optional[str]:
        return (
            "Published by the Directorate of Economics and Statistics, "
            "Government of Andhra Pradesh."
        )
