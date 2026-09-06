"""
Polavaram Project Authority — annual reports and reservoir data.
Source: https://ppa.gov.in/

WHY THIS SOURCE
Polavaram is the single most-claimed-about project in AP, and the Authority
is the statutory body that reports on it. Its annual reports are the
independent record against which progress claims can be checked — and the
site is live and current (its water-level page was carrying data dated
01-Sep-2026 when this was written).

WHAT THE PAGE IS
An ASP.NET site (~340 KB). Two pages matter:
    AnnualReportOuter.aspx           — the annual reports index
    Rpt_Water_And_Discharge_Level.aspx — current reservoir levels

Only the annual reports are scraped here. The water-level page is a live
readout rather than a published document; mirroring a number that changes
hourly as though it were a citable document would be a provenance problem,
not a feature, so it is deliberately left alone.
"""

from typing import Optional

from app.models.document import DocumentType
from app.scrapers.pdf_index import PdfIndexScraper

BASE = "https://ppa.gov.in"


class PPAReportsScraper(PdfIndexScraper):
    PORTAL_NAME = "PPA_Reports"
    BASE_URL = BASE
    PUBLIC_NAME = "Polavaram Project Authority — reports"
    DEPARTMENT = "Polavaram Project Authority"
    DOC_TYPE = DocumentType.ANNUAL_REPORT
    # Paths verified against the live site: the publications index sits deep
    # under WPSCore/, not at the web root. An earlier version guessed
    # /AnnualReportOuter.aspx and would have 404'd on every run.
    INDEX_PAGES = (
        f"{BASE}/WPSCore/Common/WebPages/Home/AnnualReportOuter.aspx",
        f"{BASE}/WPSCore/Common/WebPages/Home/Index.aspx",
        f"{BASE}/",
    )

    def classify(self, entry: dict) -> DocumentType:
        """
        The first run saved the Authority's Citizen's Charter as an annual
        report. It is a statement of service standards, not a report on the
        project's year, and the distinction matters to anyone using the type
        filter to find progress reporting.
        """
        blob = f"{entry.get('title','')} {entry.get('url','')}".lower()
        if "annual report" in blob:
            return DocumentType.ANNUAL_REPORT
        if "charter" in blob or "rti" in blob:
            return DocumentType.OTHER
        if "policy" in blob:
            return DocumentType.POLICY
        return DocumentType.PROJECT_REPORT

    def extra_description(self, entry: dict) -> Optional[str]:
        return (
            "Published by the Polavaram Project Authority, a statutory body "
            "under the Ministry of Jal Shakti."
        )
