"""
Where a document lives decides what kind of document the register calls it.

Two hosts were wrong. The state publishes its Socio-Economic Survey from an S3
bucket named after apfinance.gov.in, and the register called it "press", so
all 60 survey projects lost their printed cost there while their own pages
showed it. GMR serves its investor presentations and exchange filings from its
own document host, and the register called those "press" too. The frontend's
sourceDocs.js and verify/checks/register.py hold the same rule, and the last
test here keeps the harness in step with the router.
"""

from app.routers.project_register import source_tier
from verify.checks.register import tier as harness_tier

SURVEY = "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/AP_Socio_Economic_Survey_2024_25.pdf"
GMR_FILING = ("https://publish-p168597-e1857439.adobeaemcloud.com/content/dam/aero-investor-pdf/"
              "corporate-announcements/fy-2025-26/august/x.pdf")

CASES = [
    (SURVEY, "government"),
    # The S3 host alone proves nothing: anyone can have a bucket there.
    ("https://s3.ap-south-1.amazonaws.com/someone-else/apfinance.gov.in/fake.pdf", "press"),
    ("https://s3.ap-south-1.amazonaws.com/apfinance.gov.in.evil/x.pdf", "press"),
    (GMR_FILING, "company"),
    ("https://investor.gmraero.com/pdf/report.pdf", "company"),
    ("https://www.pib.gov.in/PressReleasePage.aspx?PRID=2292165", "government"),
    ("https://www.business-standard.com/amp/markets/x.html", "press"),
    (None, "press"),
]


def test_each_host_gets_the_tier_of_what_it_publishes():
    for url, want in CASES:
        assert source_tier(url) == want, url


def test_the_verify_harness_agrees_with_the_router():
    for url, _ in CASES:
        assert harness_tier(url) == source_tier(url), url
