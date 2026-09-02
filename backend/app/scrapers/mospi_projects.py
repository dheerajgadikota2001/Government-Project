"""
MoSPI flash-report importer — central-sector projects in Andhra Pradesh.

Source: the Ministry of Statistics & Programme Implementation's monthly
flash report tracks every central-sector infrastructure project of
Rs 150 crore and above. Table 7 lists each ongoing project with agency,
official project code, approval date, original/anticipated commissioning,
original/revised/anticipated cost, cumulative expenditure and physical
progress %. The mospi.gov.in mirror is reachable worldwide.

Parsing: Table 7 is a positional PDF layout (state and sector are
left-margin group labels that wrap across lines), so this parser assigns
words to columns by x-coordinate — boundaries measured from the real
June 2025 report and verified to reproduce the exact national total
(1,595 projects) and AP total (100 projects, Sl 10-109).

Uses backend/fetched/mospi_flash.pdf when present, else downloads
SOURCE_URL. Rows upsert by official project code (e.g. N30000002), so
each month's report refreshes progress/cost on the same rows.
"""

import os
import re
from datetime import datetime, timezone
from typing import Optional

import pdfplumber
from sqlalchemy import select

from app.scrapers.base import BaseScraper
from app.database import get_db_context
from app.models.project import Project, ProjectStatus, ProjectType
from app.models.progress_observation import ProgressObservation
from app.utils.logger import logger

# Which edition the DAILY job ingests. MoSPI publishes a new flash report every
# month at an irregular upload URL, so the edition is configured, never
# discovered: set MOSPI_FLASH_URL / MOSPI_FLASH_LABEL / MOSPI_FLASH_AS_OF
# (YYYY-MM-DD) / MOSPI_FLASH_PDF in backend\.env to move the job to a newer
# report. The defaults are the June 2025 edition this parser was measured on.
# Historic editions are backfilled with scripts/import_mospi_archive.py.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE_URL = os.environ.get(
    "MOSPI_FLASH_URL",
    "https://www.mospi.gov.in/sites/default/files/publication_reports/FR_JUNE_2025.pdf",
)
REPORT_LABEL = os.environ.get("MOSPI_FLASH_LABEL", "MoSPI flash report, June 2025")
# The date the report says its figures are true ("Ongoing Projects as of 30th
# June 2025") — every import also writes a ProgressObservation at this date,
# building the dated history that per-government attribution needs.
REPORT_AS_OF = datetime.strptime(
    os.environ.get("MOSPI_FLASH_AS_OF", "2025-06-30"), "%Y-%m-%d"
).replace(tzinfo=timezone.utc)
LOCAL_PDF = os.environ.get(
    "MOSPI_FLASH_PDF", os.path.join(_BACKEND_DIR, "fetched", "mospi_flash.pdf")
)

SECTOR_TYPE = {
    "CIVIL AVIATION": ProjectType.AIRPORTS,
    "RAILWAYS": ProjectType.RAILWAYS,
    "ROAD TRANSPORT AND HIGHWAYS": ProjectType.ROADS,
    "POWER": ProjectType.POWER,
    "PETROLEUM": ProjectType.INDUSTRIAL,
    "WATER RESOURCES": ProjectType.IRRIGATION,
    "DEPARTMENT OF HIGHER EDUCATION": ProjectType.EDUCATION,
    "SHIPPING AND PORTS": ProjectType.PORTS,
    "COAL": ProjectType.INDUSTRIAL,
    "STEEL": ProjectType.INDUSTRIAL,
    "TELECOMMUNICATION": ProjectType.IT_TECH,
    "URBAN DEVELOPMENT": ProjectType.URBAN_DEVELOPMENT,
    "HEALTH AND FAMILY WELFARE": ProjectType.HEALTH,
}

_FIELDS = ("name", "approval", "comm", "cost", "exp", "prog")


def _col_of(x: float) -> str:
    """Measured column boundaries of Table 7 (June 2025 layout)."""
    if x < 76: return "state"
    if x < 138: return "sector"
    if x < 158: return "sl"
    if x < 295: return "name"
    if x < 340: return "approval"
    if x < 425: return "comm"
    if x < 495: return "cost"
    if x < 545: return "exp"
    return "prog"


def _month_year(m: str, y: str) -> Optional[datetime]:
    try:
        return datetime(int(y), int(m), 1, tzinfo=timezone.utc)
    except ValueError:
        return None


async def upsert_observation(db, project_id, observed_date, *, progress, expenditure,
                             cost, portal, url, label) -> int:
    """Insert one dated observation if not already recorded. Returns 1 if added."""
    exists = (await db.execute(
        select(ProgressObservation.id).where(
            ProgressObservation.project_id == project_id,
            ProgressObservation.observed_date == observed_date,
            ProgressObservation.source_portal == portal,
        ).limit(1)
    )).scalars().first()
    if exists:
        return 0
    db.add(ProgressObservation(
        project_id=project_id,
        observed_date=observed_date,
        completion_percentage=progress,
        cumulative_expenditure_crore=expenditure,
        estimated_cost_crore=cost,
        source_portal=portal,
        source_url=url,
        source_label=label,
    ))
    return 1


class MospiProjectsScraper(BaseScraper):
    PORTAL_NAME = "MOSPI_IPMD"
    BASE_URL = "https://www.mospi.gov.in"

    async def scrape(self) -> int:
        self.log_start()
        saved = 0
        try:
            pdf_path = await self._get_pdf()
            rows = self._parse_table7(pdf_path)
            ap = [r for r in rows if r["state"] and "ANDHRA PRADESH" in r["state"]]
            logger.info(
                f"[{self.PORTAL_NAME}] Table 7 parsed: {len(rows)} projects nationally, "
                f"{len(ap)} in Andhra Pradesh"
            )
            saved = await self._save(ap)
        except Exception as e:
            self.log_error("Scrape failed", e)
        finally:
            await self.close()
        self.log_done(saved)
        return saved

    async def _get_pdf(self) -> str:
        if os.path.exists(LOCAL_PDF):
            logger.info(f"[{self.PORTAL_NAME}] using local PDF {LOCAL_PDF}")
            return LOCAL_PDF
        response = await self.fetch(SOURCE_URL)
        os.makedirs(os.path.dirname(LOCAL_PDF), exist_ok=True)
        with open(LOCAL_PDF, "wb") as f:
            f.write(response.content)
        return LOCAL_PDF

    def _parse_table7(self, path: str) -> list[dict]:
        projects, current = [], None
        state_buf, cur_state, state_block = [], None, None
        sector_buf, cur_sector, sector_block = [], None, None

        with pdfplumber.open(path) as pdf:
            t7_pages = [
                i for i, pg in enumerate(pdf.pages)
                if "Table:-7" in (pg.extract_text() or "")[:200]
            ]
            for pi in t7_pages:
                lines: dict[int, list] = {}
                for w in pdf.pages[pi].extract_words():
                    if w["top"] <= 118:
                        continue  # repeated page header
                    lines.setdefault(round(w["top"] / 4), []).append(w)

                for key in sorted(lines):
                    cols: dict[str, list[str]] = {}
                    for w in sorted(lines[key], key=lambda w: w["x0"]):
                        cols.setdefault(_col_of(w["x0"]), []).append(w["text"])

                    if "sl" in cols and cols["sl"][0].isdigit():
                        if current:
                            projects.append(current)
                        sl = int(cols["sl"][0])
                        current_key = key
                        # A label on the same line as a new row belongs to that row;
                        # otherwise take whatever was buffered just above it.
                        if "state" in cols:
                            cur_state, state_block = " ".join(cols["state"]), sl
                        elif state_buf:
                            cur_state, state_block = " ".join(state_buf), sl
                        state_buf = []
                        if "sector" in cols:
                            cur_sector, sector_block = " ".join(cols["sector"]), sl
                        elif sector_buf:
                            cur_sector, sector_block = " ".join(sector_buf), sl
                        sector_buf = []
                        current = {"sl": sl, "state": cur_state, "sector": cur_sector,
                                   **{f: [] for f in _FIELDS}}
                    else:
                        # Wrapped label lines: continuation of the current block's
                        # label, or the label for the next block.
                        if "state" in cols:
                            if current and state_block == current["sl"]:
                                cur_state += " " + " ".join(cols["state"])
                                current["state"] = cur_state
                            elif current and key - current_key <= 1:
                                cur_state, state_block = " ".join(cols["state"]), current["sl"]
                                current["state"] = cur_state
                            else:
                                state_buf.extend(cols["state"])
                        if "sector" in cols:
                            if current and sector_block == current["sl"]:
                                cur_sector += " " + " ".join(cols["sector"])
                                current["sector"] = cur_sector
                            elif current and key - current_key <= 1:
                                # Section headings can print a hair below the row's
                                # first line (NH-365BG under ROAD TRANSPORT AND
                                # HIGHWAYS was typed railways this way): a sector
                                # fragment landing on the row's own band starts
                                # THIS row's sector, it is not a buffered label
                                # for the next row.
                                cur_sector, sector_block = " ".join(cols["sector"]), current["sl"]
                                current["sector"] = cur_sector
                            else:
                                sector_buf.extend(cols["sector"])

                    if current:
                        for f in _FIELDS:
                            if f in cols:
                                current[f].extend(cols[f])
            if current:
                projects.append(current)
        return projects

    @staticmethod
    def _extract(row: dict) -> Optional[dict]:
        """Turn a raw parsed block into clean fields. Returns None if malformed."""
        name = " ".join(row["name"])
        # Project codes are alphanumeric (N30000002) or purely numeric for
        # railways (220100265) — always the last parenthesised token.
        code_m = re.search(r"\(([A-Z]?\d{6,})\)\s*$", name)
        code = code_m.group(1) if code_m else None
        if code_m:
            name = name[: code_m.start()].strip()
        agency_m = re.search(r"\(([^()]+)\)\s*$", name)
        agency = agency_m.group(1).strip() if agency_m else None
        if agency_m:
            name = name[: agency_m.start()].strip()
            # Some rows repeat the agency, e.g. "... (SCR) (SCR)" — drop the echo.
            while agency and name.endswith(f"({agency})"):
                name = name[: -len(f"({agency})")].strip()
        if not name or code is None:
            return None

        approval = None
        m = re.search(r"(\d{1,2})-(\d{4})", " ".join(row["approval"]))
        if m:
            approval = _month_year(m.group(1), m.group(2))

        comm_txt = " ".join(row["comm"])
        expected = None
        m = re.search(r"\{(\d{1,2})/(\d{4})\}", comm_txt)      # anticipated
        if not m:
            m = re.search(r"^(\d{1,2})/(\d{4})", comm_txt)      # original
        if m:
            expected = _month_year(m.group(1), m.group(2))

        cost_txt = " ".join(row["cost"])
        cost = None
        m = re.search(r"\{([\d,]+\.\d\d)\}", cost_txt)          # anticipated
        if not m:
            m = re.search(r"^([\d,]+\.\d\d)", cost_txt)         # original
        if m:
            cost = float(m.group(1).replace(",", ""))

        exp_m = re.search(r"([\d,]+\.\d\d)", " ".join(row["exp"]))
        expenditure = float(exp_m.group(1).replace(",", "")) if exp_m else None

        prog_m = re.search(r"([\d.]+)", " ".join(row["prog"]))
        progress = float(prog_m.group(1)) if prog_m else None
        if progress is not None and not (0 <= progress <= 100):
            progress = None

        return {
            "code": code, "name": name[:500], "agency": agency,
            "sector": row["sector"] or "", "approval": approval,
            "expected": expected, "cost": cost,
            "expenditure": expenditure, "progress": progress,
        }

    async def _save(self, ap_rows: list[dict]) -> int:
        saved = 0
        obs_added = 0
        async with get_db_context() as db:
            for raw in ap_rows:
                r = self._extract(raw)
                if r is None:
                    logger.warning(f"[{self.PORTAL_NAME}] skipped malformed row Sl {raw.get('sl')}")
                    continue

                sector = re.sub(r"\s+", " ", r["sector"]).strip().upper()
                ptype = SECTOR_TYPE.get(sector, ProjectType.INFRASTRUCTURE)
                description = (
                    f"Central-sector project ({sector.title() if sector else 'sector not stated'}"
                    + (f", {r['agency']}" if r["agency"] else "")
                    + f") tracked in the {REPORT_LABEL} as ongoing."
                    + (f" Cumulative expenditure Rs {r['expenditure']:,.2f} Cr" if r["expenditure"] is not None else "")
                    + (f"; physical progress {r['progress']:.2f}% as of {REPORT_AS_OF.day} {REPORT_AS_OF:%B %Y}." if r["progress"] is not None else ".")
                )

                existing = (await db.execute(
                    select(Project).where(Project.external_id == r["code"])
                )).scalar_one_or_none()

                if existing:
                    existing.completion_percentage = r["progress"]
                    existing.estimated_cost_crore = r["cost"]
                    existing.expected_completion = r["expected"]
                    existing.description = description
                    # Refresh classification too — a parser fix must be able to
                    # reach rows already in the DB (the NH-365BG row sat typed
                    # 'railways' because only progress fields were refreshed).
                    existing.title = r["name"]
                    existing.project_type = ptype
                    existing.department = sector.title() if sector else None
                    existing.last_scraped_at = self.scraped_at
                    project = existing
                else:
                    project = Project(
                        external_id=r["code"],
                        title=r["name"],
                        description=description,
                        project_type=ptype,
                        status=ProjectStatus.UNDER_CONSTRUCTION,   # Table 7 = ongoing projects
                        district=None,                              # report is state-level; honest null
                        estimated_cost_crore=r["cost"],
                        completion_percentage=r["progress"],
                        announced_date=r["approval"],
                        expected_completion=r["expected"],
                        department=sector.title() if sector else None,
                        implementing_agency=(r["agency"] or "")[:200] or None,
                        source_portal=self.PORTAL_NAME,
                        source_url=SOURCE_URL,
                        last_scraped_at=self.scraped_at,
                    )
                    db.add(project)
                    saved += 1

                # Dated snapshot — the raw material of per-tenure attribution.
                await db.flush()
                obs_added += await upsert_observation(
                    db, project.id, REPORT_AS_OF,
                    progress=r["progress"], expenditure=r["expenditure"], cost=r["cost"],
                    portal=self.PORTAL_NAME, url=SOURCE_URL, label=REPORT_LABEL,
                )
            await db.commit()
        if obs_added:
            logger.info(f"[{self.PORTAL_NAME}] recorded {obs_added} dated progress observations ({REPORT_LABEL})")
        return saved


# --------------------------------------------------------------------------
# Pre-PAIMANA flash reports (e.g. May 2024, and earlier): no state-wise
# Table 7. Instead the report carries national "Details of Delayed / On
# Schedule Projects" sections — one entry per project with its stable code
# ([N2400xxxx]), approval month, original cost, anticipated cost and
# cumulative expenditure. No physical-progress percentage is printed, so
# none is stored: the observation carries exactly what the report prints.
# State is not printed either; the project CODE is the join key and the
# database decides which entries are ours.

_ENTRY_MONEY = re.compile(r"^(?:-|[\d,]+\.\d{2})$")
_ENTRY_DATE = re.compile(r"^(?:-|\d{1,2}/\d{4})$")
_ENTRY_CODE = re.compile(r"\[([A-Z]?\d{6,})")


def _status_money(tok):
    return None if tok == "-" else float(tok.replace(",", ""))


def parse_status_details(path: str) -> list[dict]:
    """Parse the per-project 'Details of ... Projects' sections of a
    pre-PAIMANA flash report. Returns ready rows: {code, name, cost,
    expenditure, progress(None)} — deduplicated by code, first wins."""
    import pdfplumber

    out: dict[str, dict] = {}
    current = None

    def close(entry):
        if not entry or not entry.get("code"):
            return
        out.setdefault(entry["code"], {
            "code": entry["code"],
            "name": re.sub(r"\s+", " ", entry["name"]).strip(" -"),
            "cost": entry["cost"],
            "expenditure": entry["expenditure"],
            "progress": None,
        })

    with pdfplumber.open(path) as pdf:
        for pi, pg in enumerate(pdf.pages, 1):
            text = pg.extract_text() or ""
            pg.flush_cache()
            if pi % 100 == 0:
                logger.info(f"[MOSPI_IPMD] archive parse: page {pi}/{len(pdf.pages)}, {len(out)} projects so far")
            for line in text.split("\n"):
                toks = line.split()
                # An entry starts with a serial number and ends with the
                # six columns (approval, orig, antic, cum-exp, orig date,
                # anticipated date) — parsed from the right so that names
                # containing numbers (NH 365BG, KM 124.60) cannot confuse it.
                is_entry = (
                    len(toks) >= 8
                    and re.fullmatch(r"\d{1,4}", toks[0])
                    and _ENTRY_DATE.fullmatch(toks[-1])
                    and _ENTRY_DATE.fullmatch(toks[-2])
                    and _ENTRY_MONEY.fullmatch(toks[-3])
                    and _ENTRY_MONEY.fullmatch(toks[-4])
                    and _ENTRY_MONEY.fullmatch(toks[-5])
                    and _ENTRY_DATE.fullmatch(toks[-6])
                )
                if is_entry:
                    close(current)
                    current = {
                        "name": " ".join(toks[1:-6]),
                        "cost": _status_money(toks[-4]),          # anticipated cost
                        "expenditure": _status_money(toks[-3]),   # cumulative expenditure
                        "code": None,
                    }
                    m = _ENTRY_CODE.search(line)
                    if m:
                        current["code"] = m.group(1)
                    continue
                if current is not None:
                    m = _ENTRY_CODE.search(line)
                    if m and not current["code"]:
                        current["code"] = m.group(1)
                        # Expenditure sometimes wraps onto the code line.
                        if current["expenditure"] is None:
                            for t in line.split():
                                if _ENTRY_MONEY.fullmatch(t) and t != "-":
                                    current["expenditure"] = _status_money(t)
                                    break
                        close(current)
                        current = None
                    elif not m and not any(ch.isdigit() for ch in line[:6]) and line.strip():
                        # wrapped project-name line
                        current["name"] += " " + line.strip()
        close(current)
    return list(out.values())
