"""
AMRUT 2.0 approved-projects importer — Andhra Pradesh.

Source: Ministry of Housing & Urban Affairs (national portal, reachable
worldwide) publishes the official status PDF of every approved AMRUT 2.0
project in AP: urban water supply, sewerage, water-body rejuvenation and
green-space works, per district and ULB, with sanctioned cost, milestone
and scheduled completion date.

The PDF's filename is date-stamped by MoHUA. This importer uses a local
copy at backend/fetched/amrut_ap.pdf when present (preferred), else
downloads SOURCE_URL. To refresh later, fetch the newest PDF to the same
local path and re-run — rows are upserted by the official Project Id
(e.g. AP-SRIKAKULAM-12066), so re-runs update rather than duplicate.

Verified against the real PDF of 05.03.2026: 505 projects, 9 columns:
S.no | Project Id | District | ULB | Sector | Title | Cost (Cr) |
Milestone (Ongoing/Completed/NIT Stage) | Scheduled completion (e.g. Apr-26)
"""

import os
import re
from datetime import datetime, timezone
from typing import Optional

import pdfplumber
from sqlalchemy import select

from app.scrapers.base import BaseScraper
from app.scrapers.sanity import FieldRule, SanityAbort, SanitySpec
from app.database import get_db_context
from app.models.project import Project, ProjectStatus, ProjectType
from app.utils.logger import logger

SOURCE_URL = (
    "https://amrut.mohua.gov.in/assets/"
    "Status-of-Approved-Projects-under-AMRUT-2-in-Andhra-Pradesh-as-on-05-03-2026.pdf"
)
LOCAL_PDF = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "fetched", "amrut_ap.pdf",
)

MILESTONE_STATUS = {
    "ongoing": ProjectStatus.UNDER_CONSTRUCTION,
    "completed": ProjectStatus.COMPLETED,
    "nit stage": ProjectStatus.TENDERED,   # NIT = Notice Inviting Tender
}


def _parse_completion(text: str) -> Optional[datetime]:
    """'Apr-26' / 'Jun-27' -> datetime; 'Project Completed' etc. -> None."""
    m = re.fullmatch(r"([A-Za-z]{3})-(\d{2})", text.strip())
    if not m:
        return None
    try:
        return datetime.strptime(f"{m.group(1)}-20{m.group(2)}", "%b-%Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Word-wrap repair.
#
# pdfplumber returns a table cell exactly as it is laid out on the page, so a
# title the PDF wrapped mid-word comes back as 'Visakhapatna\nm'.  Naively
# replacing the newline with a space gave us two spellings of one district
# ('Visakhapatnam' and 'Visakhapatna m') and mangled titles.  Naively deleting
# the newline is just as wrong: it welds real word breaks together
# ('water\nbodies' -> 'waterbodies').
#
# The PDF preserves no trailing space, so there is no character to key off.
# The decision is made instead from the document's own vocabulary, built in a
# first pass over every cell of every page:
#
#   joined[t]  how often t appears unbroken somewhere in the document
#   solo[t]    how often t appears where it is PROVEN to be a whole word:
#              strictly inside a line (a space on both sides), or anywhere in
#              a cell that was never wrapped at all
#
# head and tail are welded only when the head is never a proven whole word,
# the tail is never a proven whole word (or is a single letter), and either
# the welded form is attested in the document or the tail is 1-2 characters -
# an orphan like '...patna' + 'm', which no real phrase produces, since the
# genuine short words here (of, at, in, to) are all proven whole words.
# A continuation line that is one letter alone is welded outright.
#
# Verified against the real 05.03.2026 PDF: 505 rows parse to 505 unique
# project ids, 364 cells repaired, 25 districts each resolving to a single
# spelling, 3 clean sector names, Rs 9,505.89 cr total, and no false weld
# introduced - 'water bodies', 'facilities at' and 'MLD STP at' all survive.
# Two titles keep a visible split ('Narasaraopet a', 'Chilakaluripet a')
# because both spellings of those towns are real and guessing would be worse.
# ---------------------------------------------------------------------------

_TOKEN = re.compile(r"[A-Za-z]+")


def build_vocabulary(cells: list[str]) -> tuple[dict, dict]:
    """Learn, from the whole document, which tokens are real whole words."""
    joined: dict[str, int] = {}
    solo: dict[str, int] = {}
    for cell in cells:
        if not cell:
            continue
        wrapped = "\n" in cell
        for line in cell.split("\n"):
            tokens = _TOKEN.findall(line)
            for i, tok in enumerate(tokens):
                t = tok.lower()
                joined[t] = joined.get(t, 0) + 1
                if (0 < i < len(tokens) - 1) or not wrapped:
                    solo[t] = solo.get(t, 0) + 1
    return joined, solo


def repair_cell(cell: str, joined: dict, solo: dict) -> str:
    """Rebuild one cell, welding only genuine mid-word wraps."""
    lines = [l.strip() for l in (cell or "").split("\n") if l.strip()]
    if not lines:
        return ""
    out = lines[0]
    for nxt in lines[1:]:
        a = re.search(r"([A-Za-z]+)$", out)
        b = re.match(r"([A-Za-z]+)", nxt)
        weld = False
        if a and b:
            head, tail = a.group(1), b.group(1)
            # A continuation line that is a single letter on its own is always
            # an orphan: in the real PDF all 11 heads preceding one are
            # truncations ('Visakhapatna|m', 'CORPORATIO|N', 'Amadalavalas|a').
            if len(nxt) == 1 and len(head) >= 4:
                weld = True
            elif (
                solo.get(head.lower(), 0) == 0
                and (len(tail) == 1 or solo.get(tail.lower(), 0) == 0)
                and (joined.get((head + tail).lower(), 0) > 0 or len(tail) <= 2)
            ):
                weld = True
        out = out + nxt if weld else out + " " + nxt
    return re.sub(r"\s+", " ", out).strip()


class AmrutProjectsScraper(BaseScraper):
    PORTAL_NAME = "AMRUT_MoHUA"
    BASE_URL = "https://amrut.mohua.gov.in"
    SANITY = SanitySpec(
        min_rows=1,
        fields={
            "title": FieldRule(required=True, min_len=8, max_len=500),
            "external_id": FieldRule(required=True, min_len=2, max_len=100),
            "district": FieldRule(max_len=100),
            # Crore. A single urban project above five lakh crore is a units
            # error, not a project.
            "cost": FieldRule(min_value=0, max_value=500000),
        },
        key_field="external_id",
    )

    async def scrape(self) -> int:
        self.log_start()
        saved = 0
        failure: BaseException | None = None
        try:
            pdf_path = await self._get_pdf()
            rows = self._parse_pdf(pdf_path)
            logger.info(f"[{self.PORTAL_NAME}] parsed {len(rows)} AMRUT project rows")
            saved = await self._save(rows)
        except SanityAbort:
            raise
        except Exception as e:
            self.log_error("Scrape failed", e)
            failure = e
        finally:
            await self.close()
        return self.finish(saved, failure)

    async def _get_pdf(self) -> str:
        if os.path.exists(LOCAL_PDF):
            # Deliberate: the download is slow and the file rarely changes. But a
            # scheduled run that always reads the same local file can never bring
            # in a newer edition, and nothing used to say so. Now it does, and the
            # note reaches the alert email.
            self.note(
                f"read the local copy at {LOCAL_PDF} instead of downloading; "
                "delete that file to force a fresh fetch from MoHUA"
            )
            return LOCAL_PDF
        response = await self.fetch(SOURCE_URL)
        os.makedirs(os.path.dirname(LOCAL_PDF), exist_ok=True)
        with open(LOCAL_PDF, "wb") as f:
            f.write(response.content)
        return LOCAL_PDF

    def _parse_pdf(self, path: str) -> list[dict]:
        # Pass 1: read every table once and learn the document's vocabulary,
        # so the wrap repair in pass 2 can tell 'Visakhapatna|m' (one word
        # broken by the page) from 'water|bodies' (two real words).
        tables: list[list[list]] = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                tables.extend(page.extract_tables())
        joined, solo = build_vocabulary(
            [c for table in tables for raw in table for c in raw if c]
        )

        # Pass 2: rebuild each row from the repaired cells.
        rows = []
        for table in tables:
            for raw in table:
                cells = [repair_cell(c, joined, solo) for c in raw]
                cells = [c for c in cells if c != ""]
                if len(cells) != 9 or not cells[0].isdigit():
                    continue
                _, pid, district, ulb, sector, title, cost, milestone, sched = cells
                rows.append({
                    # 'AP- SRIKAKULAM -12066' -> 'AP-SRIKAKULAM-12066'
                    "external_id": re.sub(r"\s+", "", pid),
                    "district": district,
                    "ulb": ulb,
                    "sector": re.sub(r"\s+", " ", sector),
                    "title": title,
                    "cost": float(cost.replace(",", "")) if re.fullmatch(r"[\d,]+\.?\d*", cost) else None,
                    "milestone": milestone,
                    "scheduled": sched,
                })
        return rows

    async def _save(self, rows: list[dict]) -> int:
        rows = await self.gate(rows)
        saved = 0
        async with get_db_context() as db:
            for r in rows:
                status = MILESTONE_STATUS.get(r["milestone"].lower())
                if status is None:
                    status = ProjectStatus.APPROVED   # unknown milestone label — stays honest
                title = r["title"][:400]
                if r["ulb"].lower() not in title.lower():
                    title = f"{title} — {r['ulb']}"[:500]

                description = (
                    f"AMRUT 2.0 approved project ({r['sector']}) in {r['ulb']}, {r['district']} district. "
                    f"Milestone in the official MoHUA status PDF (as on 05.03.2026): {r['milestone']}"
                    + (f"; scheduled/revised completion {r['scheduled']}." if _parse_completion(r["scheduled"]) else ".")
                )

                existing = (await db.execute(
                    select(Project).where(Project.external_id == r["external_id"])
                )).scalar_one_or_none()

                if existing:
                    # Refresh the display fields too, not just the numbers:
                    # rows imported before the word-wrap repair carry mangled
                    # titles and districts ('Visakhapatna m'), and those only
                    # get corrected if a re-run is allowed to overwrite them.
                    existing.title = title
                    existing.district = r["district"][:100]
                    existing.implementing_agency = r["ulb"][:200]
                    existing.status = status
                    existing.estimated_cost_crore = r["cost"]
                    existing.completion_percentage = 100 if status == ProjectStatus.COMPLETED else existing.completion_percentage
                    existing.expected_completion = _parse_completion(r["scheduled"])
                    existing.description = description
                    existing.last_scraped_at = self.scraped_at
                else:
                    db.add(Project(
                        external_id=r["external_id"],
                        title=title,
                        description=description,
                        project_type=ProjectType.URBAN_DEVELOPMENT,
                        status=status,
                        district=r["district"][:100],
                        estimated_cost_crore=r["cost"],
                        completion_percentage=100 if status == ProjectStatus.COMPLETED else None,
                        expected_completion=_parse_completion(r["scheduled"]),
                        department="Urban Development — AMRUT 2.0 (MoHUA)",
                        implementing_agency=r["ulb"][:200],
                        source_portal=self.PORTAL_NAME,
                        source_url=SOURCE_URL,
                        last_scraped_at=self.scraped_at,
                    ))
                    saved += 1
            await db.commit()
        return saved
