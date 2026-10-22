"""
MoSPI flash-report importer: central-sector projects in Andhra Pradesh.

Source: the Ministry of Statistics & Programme Implementation's monthly
flash report tracks every central-sector infrastructure project of
Rs 150 crore and above, with agency, project code, approval date,
original and revised completion, original and revised cost, cumulative
expenditure and physical progress.

HOW IT FINDS THE REPORT

It asks mospi.gov.in's own listing endpoint for the newest edition
(mospi_editions.py). The old way, building FR_<MONTH>_<YEAR>.pdf from a
pattern, stopped working after June 2025 and nobody was told: the daily
job simply re-read the same PDF for thirteen months. A run that finds the
newest edition already recorded stops there and says so.

HOW IT READS IT

The PAIMANA-era report (from mid 2025) lists every ongoing project in
"Table 6: All Ongoing Projects", grouped by ministry and sector, one
multi-line block per project. mospi_layout.py turns each page's words into
those blocks by x position; the boundaries were measured on the July 2026
report and the parser reproduces the national count the report prints on
its overview page (1,775), which every run re-checks before writing.

The pre-PAIMANA "Table:-7" parser is kept below for
scripts/import_mospi_archive.py, which backfills older editions.

HOW ROWS ARE MATCHED

PAIMANA renumbered every project: Polavaram was N30000002 and is now
701415, and the report prints the legacy code as "-". A row is matched by
its current code, then by its legacy code, then by the reviewed
renumbering map (mospi_renumbering.json: which old code each PAIMANA code
replaced, with the evidence for every pair), then by its exact title among
this portal's own rows. On a map or title match the row is re-keyed to the
current code and the change is logged. Matching by likeness happens in
scripts/mospi_renumbering.py, offline, where a person can read the
evidence; the daily job only ever follows the reviewed list.

A register row the newest edition no longer lists (finished, dropped, or
moved under another state) keeps its last figures and is marked in its
description as not listed in that edition. Nothing is inferred from the
absence: the row says what the last report said, and that it is no longer
reported.
"""

import json
import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional

import pdfplumber
from sqlalchemy import func, select

from app.scrapers.base import BaseScraper
from app.scrapers.mospi_editions import Edition, fetch_newest
from app.scrapers.mospi_layout import (
    TABLE_TITLE, check_groups, extract as extract_block, month_end, overview_project_count,
    parse_page_words, report_month,
)
from app.scrapers.sanity import FieldRule, SanityAbort, SanitySpec
from app.database import get_db_context
from app.models.project import Project, ProjectStatus, ProjectType
from app.models.progress_observation import ProgressObservation
from app.utils.logger import logger

# The edition is discovered, not configured. MOSPI_FLASH_URL / _LABEL /
# _AS_OF / _PDF still pin one edition by hand (a re-import, or a month the
# listing is down); MOSPI_FORCE=1 re-ingests an edition already recorded.
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

# The PAIMANA report names sectors differently from the old Table 7.
# Matched as lowercase substrings against the sector heading, first hit wins.
SECTOR_KEYWORDS = (
    ("road", ProjectType.ROADS), ("highway", ProjectType.ROADS),
    ("railway", ProjectType.RAILWAYS), ("aviation", ProjectType.AIRPORTS), ("airport", ProjectType.AIRPORTS),
    ("port", ProjectType.PORTS), ("shipping", ProjectType.PORTS),
    ("water resources", ProjectType.IRRIGATION), ("irrigation", ProjectType.IRRIGATION),
    ("transmission", ProjectType.POWER), ("power", ProjectType.POWER), ("renewable", ProjectType.POWER),
    ("oil", ProjectType.INDUSTRIAL), ("gas", ProjectType.INDUSTRIAL), ("petroleum", ProjectType.INDUSTRIAL),
    ("coal", ProjectType.INDUSTRIAL), ("steel", ProjectType.INDUSTRIAL), ("mine", ProjectType.INDUSTRIAL),
    ("telecom", ProjectType.IT_TECH), ("education", ProjectType.EDUCATION),
    ("health", ProjectType.HEALTH), ("hospital", ProjectType.HEALTH),
    ("waste", ProjectType.URBAN_DEVELOPMENT), ("urban", ProjectType.URBAN_DEVELOPMENT),
    ("housing", ProjectType.HOUSING),
)


def sector_type(sector: str) -> ProjectType:
    key = (sector or "").lower()
    for word, ptype in SECTOR_KEYWORDS:
        # Whole words: "port" must not fire on "transport" or "support".
        if re.search(rf"\b{re.escape(word)}", key):
            return ptype
    return SECTOR_TYPE.get(key.upper(), ProjectType.INFRASTRUCTURE)


def _norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


RENUMBERING_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mospi_renumbering.json")


@lru_cache(maxsize=1)
def renumbering() -> dict[str, str]:
    """
    PAIMANA code -> the pre-PAIMANA code it replaced, from the reviewed map.
    Every pair in the file carries the evidence it was accepted on;
    scripts/mospi_renumbering.py check verifies the file against the
    fixtures before it is trusted.
    """
    with open(RENUMBERING_FILE, encoding="utf-8") as f:
        pairs = json.load(f)["pairs"]
    out: dict[str, str] = {}
    for p in pairs:
        if p["new"] in out or p["old"] in out.values():
            raise ValueError(f"mospi_renumbering.json lists a code twice: {p['new']} / {p['old']}")
        out[p["new"]] = p["old"]
    return out


def old_code_for(code: str) -> Optional[str]:
    return renumbering().get(code)


def new_code_for(old_code: str) -> Optional[str]:
    for new, old in renumbering().items():
        if old == old_code:
            return new
    return None


_ABSENT = re.compile(r"\s*Not listed among ongoing projects in the [^.]+\.")


def absent_note(label: str) -> str:
    """The sentence a register row carries once an edition stops listing it."""
    return f"Not listed among ongoing projects in the {label}."


def with_absent_note(description: Optional[str], label: str) -> str:
    """The description carrying exactly one such sentence, for the newest
    edition: a row that stays unlisted month after month does not grow a
    sentence a month."""
    base = _ABSENT.sub("", description or "").rstrip()
    return (base + " " + absent_note(label)).strip()


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


def cost_on_record(current: Optional[float], row: dict, first_sighting: bool = False) -> Optional[float]:
    """The cost a project should hold after one report row is read.

    A row that prints a cost replaces the one held. A row that prints no
    revised cost (the bare 0.00 of the August 2026 report) leaves the held
    cost alone, so a page never swaps a printed figure for one the report did
    not print. Only a project seen for the first time falls back to the
    original cost, because that is the one cost the report does give for it.
    """
    if row.get("cost") is not None:
        return row["cost"]
    if first_sighting and current is None:
        return row.get("cost_original")
    return current


async def upsert_observation(db, project_id, observed_date, *, progress, expenditure,
                             cost, portal, url, label) -> int:
    """
    One dated observation per (project, date, portal).

    Returns 1 when added, 2 when an existing row was corrected, 0 when the row
    already said exactly this. It used to insert-or-skip, which meant a row
    written by a broken parse could never be repaired: the July 2026 date was
    occupied on the local database, so the correct import wrote nothing for
    it. A dated observation is a claim about what one report said; if a
    better read of that report disagrees, the better read wins.
    """
    row = (await db.execute(
        select(ProgressObservation).where(
            ProgressObservation.project_id == project_id,
            ProgressObservation.observed_date == observed_date,
            ProgressObservation.source_portal == portal,
        ).limit(1)
    )).scalars().first()
    if row:
        changed = False
        for attr, value in (("completion_percentage", progress), ("cumulative_expenditure_crore", expenditure),
                            ("estimated_cost_crore", cost), ("source_url", url), ("source_label", label)):
            if value is not None and getattr(row, attr) != value:
                setattr(row, attr, value)
                changed = True
        return 2 if changed else 0
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
    # Layer 1 only. What arrives here are the flash report's own raw columns,
    # before _extract turns them into fields we have names for — so per-field
    # rules would be asserting against a shape that changes with the report.
    # The row-count floor still catches the case that matters: a report whose
    # table moved and now yields a handful of rows instead of hundreds.
    SANITY = SanitySpec(min_rows=1)

    async def scrape(self) -> int:
        self.log_start()
        saved = 0
        failure: BaseException | None = None
        try:
            edition = await self._resolve_edition()
            if edition is None:
                raise RuntimeError("could not determine which flash report to read")
            as_of = month_end(edition.year, edition.month)
            done = 0 if os.environ.get("MOSPI_FORCE") else await self._already_recorded(edition)
            if done:
                self.note(
                    f"{edition.label} is already imported ({done} project rows carry its URL) and "
                    "nothing newer is listed on mospi.gov.in. Set MOSPI_FORCE=1 to re-ingest."
                )
                await self.close()
                return self.finish(0, None)

            pdf_path = await self._get_pdf(edition)
            rows, printed_total, cover_month = self._read_report(pdf_path)
            if os.environ.get("MOSPI_FLASH_URL"):
                self._check_pinned(cover_month)
            if cover_month and cover_month != (edition.year, edition.month):
                self.note(f"the PDF cover says {cover_month[1]}/{cover_month[0]} but the listing "
                          f"called it {edition.month}/{edition.year}; the cover wins")
                as_of = month_end(*cover_month)
                edition = Edition(cover_month[0], cover_month[1], edition.title, edition.url)
            if printed_total is not None and len(rows) != printed_total:
                raise SanityAbort(
                    f"[{self.PORTAL_NAME}] parsed {len(rows)} ongoing projects but the report's "
                    f"overview page says {printed_total}. The table layout has moved; refusing to write."
                )
            problem = check_groups(rows, self.group_totals)
            if problem:
                raise SanityAbort(
                    f"[{self.PORTAL_NAME}] {edition.label}: {problem}. The table layout has moved; "
                    "refusing to write."
                )
            ap = [r for r in rows if r["state"] and "andhra pradesh" in r["state"].lower()]
            multi = sum(1 for r in ap if r["state"].lower().startswith("multi"))
            logger.info(
                f"[{self.PORTAL_NAME}] {edition.label}: {len(rows)} projects nationally, "
                f"{len(ap)} in Andhra Pradesh ({multi} shared with other states)"
            )
            saved = await self._save(ap, edition, as_of)
        except SanityAbort:
            raise
        except Exception as e:
            self.log_error("Scrape failed", e)
            failure = e
        finally:
            await self.close()
        return self.finish(saved, failure)

    @staticmethod
    def _check_pinned(cover_month: Optional[tuple[int, int]]) -> None:
        """A pinned run imports only the month it was pinned to.

        A pinned run reads backend/fetched/mospi_flash.pdf when that file
        exists, and that file is whichever report was fetched last. Before
        this check the cover's month simply won, so an August file read under
        a July pin was written to the site as if July's URL had printed it.
        The pin now has to say its month (MOSPI_FLASH_AS_OF) and the cover has
        to agree.
        """
        if not os.environ.get("MOSPI_FLASH_AS_OF"):
            raise SanityAbort(
                "[MOSPI_IPMD] MOSPI_FLASH_URL is set without MOSPI_FLASH_AS_OF. Set it to the "
                "report's date (for July 2026: 2026-07-31) so a stale local copy cannot be "
                "imported under the wrong report's URL."
            )
        pinned = (REPORT_AS_OF.year, REPORT_AS_OF.month)
        if cover_month and cover_month != pinned:
            raise SanityAbort(
                f"[MOSPI_IPMD] the run is pinned to {pinned[1]}/{pinned[0]} but the PDF it read "
                f"({LOCAL_PDF} or the download) is the {cover_month[1]}/{cover_month[0]} report. "
                "Refusing to write."
            )

    async def _resolve_edition(self) -> Optional[Edition]:
        """The pinned edition when one is configured, else the newest listed."""
        if os.environ.get("MOSPI_FLASH_URL"):
            y, m = REPORT_AS_OF.year, REPORT_AS_OF.month
            self.note(f"MOSPI_FLASH_URL is set, so the {m}/{y} edition it names is used instead of the newest listed")
            return Edition(y, m, REPORT_LABEL, os.environ["MOSPI_FLASH_URL"])
        try:
            edition = await fetch_newest(self.client)
        except Exception as e:
            self.note(f"could not read the flash report listing on mospi.gov.in: {e}")
            return None
        if edition:
            self.note(f"newest edition listed: {edition.label}")
        return edition

    async def _already_recorded(self, edition: Edition) -> int:
        """
        How many of this portal's project rows were last refreshed from this
        exact report file. Zero means the edition has not been imported.

        Keyed on the file URL, not the observation date. An archive backfill
        writes observations only, and a first cut of this check took an
        occupied date as "done" and skipped the import that actually updates
        what the site shows. The project rows carry the URL of the edition
        that last wrote them, and no two editions share a URL.
        """
        async with get_db_context() as db:
            return (await db.execute(
                select(func.count(Project.id))
                .where(Project.source_portal == self.PORTAL_NAME)
                .where(Project.source_url == edition.url)
            )).scalar_one()

    async def _get_pdf(self, edition: Edition) -> str:
        # A pinned local copy is only honoured for a pinned edition. The daily
        # job must never read last month's file because it happened to be there.
        if os.environ.get("MOSPI_FLASH_URL") and os.path.exists(LOCAL_PDF):
            self.note(f"read the local copy at {LOCAL_PDF} instead of downloading")
            return LOCAL_PDF
        response = await self.fetch(edition.url)
        if not response.content.startswith(b"%PDF"):
            raise RuntimeError(f"{edition.url} did not return a PDF")
        os.makedirs(os.path.dirname(LOCAL_PDF), exist_ok=True)
        with open(LOCAL_PDF, "wb") as f:
            f.write(response.content)
        return LOCAL_PDF

    def _read_report(self, path: str) -> tuple[list[dict], Optional[int], Optional[tuple[int, int]]]:
        """
        Every ongoing project in the report, the count the report itself
        prints, and the month on its cover.

        Pages are flushed as they go, for the reason the old parser gave:
        pdfplumber keeps every page it has parsed, and a 150-page report
        walked without flushing was measured at 1.1 GB against Cloud Run's
        1 GiB.
        """
        rows: list[dict] = []
        printed_total = None
        cover_month = None
        ministry = sector = None
        # Every "Total (n)" the table prints, for check_groups in scrape().
        self.group_totals = []
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                if i == 0:
                    cover_month = report_month(text)
                if printed_total is None and i < 8:
                    printed_total = overview_project_count(text)
                if text[:40].startswith(TABLE_TITLE):
                    blocks, ministry, sector = parse_page_words(page.extract_words(), ministry=ministry,
                                                                sector=sector, totals=self.group_totals)
                    for b in blocks:
                        r = extract_block(b)
                        if r is None:
                            logger.warning(f"[{self.PORTAL_NAME}] skipped an unreadable block on page {i + 1} (Sl {b.sl})")
                            continue
                        rows.append(r)
                page.flush_cache()
        return rows, printed_total, cover_month

    # ---- pre-PAIMANA "Table:-7" layout, kept for scripts/import_mospi_archive.py
    def _parse_table7(self, path: str) -> list[dict]:
        projects, current = [], None
        state_buf, cur_state, state_block = [], None, None
        sector_buf, cur_sector, sector_block = [], None, None

        with pdfplumber.open(path) as pdf:
            # The flush after each page is what keeps this inside a Cloud Run
            # job's memory. pdfplumber caches every object it parses on the Page
            # that produced it, so walking a 14 MB report to find the Table 7
            # pages leaves the whole document decoded in memory: measured at
            # 1132 MB peak, against a 1 GiB limit. Flushing each page once we
            # have what we need drops the peak by more than half and changes
            # nothing about what is parsed.
            t7_pages = []
            for i, pg in enumerate(pdf.pages):
                heading = (pg.extract_text() or "")[:200]
                pg.flush_cache()
                if "Table:-7" in heading:
                    t7_pages.append(i)

            for pi in t7_pages:
                lines: dict[int, list] = {}
                page = pdf.pages[pi]
                words = page.extract_words()
                for w in words:
                    if w["top"] <= 118:
                        continue  # repeated page header
                    lines.setdefault(round(w["top"] / 4), []).append(w)

                page.flush_cache()

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
        # "1,852.12 {1,787.00}": original, then the anticipated figure in
        # braces. `cost` is the anticipated one when printed (what the site
        # shows); both are kept for the renumbering proposer, which needs the
        # original as a witness.
        m_orig = re.search(r"^([\d,]+\.\d\d)", cost_txt)
        m_rev = re.search(r"\{([\d,]+\.\d\d)\}", cost_txt)
        cost_original = float(m_orig.group(1).replace(",", "")) if m_orig else None
        cost_revised = float(m_rev.group(1).replace(",", "")) if m_rev else None
        cost = cost_revised if cost_revised is not None else cost_original

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
            "cost_original": cost_original, "cost_revised": cost_revised,
            "expenditure": expenditure, "progress": progress,
        }

    # A project's sector almost never changes from one month to the next. When
    # a fifth of the projects the site already tracks would change sector at
    # once, the report was misread, not the country reorganised. The August
    # 2026 misread moved 103 of 110 (most to "Real Estate").
    SECTOR_DRIFT_SHARE = 0.2
    SECTOR_DRIFT_MIN_ROWS = 10

    def _check_sector_drift(self, matched: int, moved: list[str], edition: Edition) -> None:
        """Refuse the edition, before anything is committed, when too many
        tracked projects would change sector. MOSPI_ALLOW_SECTOR_CHANGES=1
        lets a deliberate correction through (a repair re-import)."""
        if matched < self.SECTOR_DRIFT_MIN_ROWS or len(moved) <= self.SECTOR_DRIFT_SHARE * matched:
            return
        if os.environ.get("MOSPI_ALLOW_SECTOR_CHANGES"):
            self.note(f"{len(moved)} of {matched} tracked project(s) change sector in the {edition.label}; "
                      "allowed by MOSPI_ALLOW_SECTOR_CHANGES")
            return
        raise SanityAbort(
            f"[{self.PORTAL_NAME}] {edition.label}: {len(moved)} of {matched} tracked projects would change "
            f"sector ({'; '.join(moved[:5])}{' ...' if len(moved) > 5 else ''}). That is a misread, not "
            "a month's news; nothing was written. If the change is intended, set MOSPI_ALLOW_SECTOR_CHANGES=1."
        )

    async def _find_existing(self, db, r: dict, by_title: dict[str, list[Project]]) -> tuple[Optional[Project], str]:
        """The row this report row updates, and how it was matched."""
        for code, how in ((r["code"], "code"), (r.get("legacy_code"), "legacy code"),
                          (old_code_for(r["code"]), "renumbering map")):
            if not code:
                continue
            hit = (await db.execute(
                select(Project).where(Project.source_portal == self.PORTAL_NAME, Project.external_id == code)
            )).scalar_one_or_none()
            if hit:
                return hit, how
        # A project the site already tracks can arrive under a code it has
        # never seen (the PAIMANA renumbering; the map above covers the rows
        # it reworded). When the title has not changed, among this portal's
        # own rows a title is unique.
        hits = by_title.get(_norm_title(r["name"]), [])
        if len(hits) == 1:
            return hits[0], "title"
        return None, "new"

    async def _note_absent(self, db, edition: Edition) -> int:
        """
        Mark this portal's rows that this edition did not list: every row
        this edition did write carries its URL, so the rest are the absent
        ones. The row keeps its last reported figures and its description
        ends with one sentence saying the newest report no longer carries
        it. Idempotent: a row already carrying that sentence is left alone.
        """
        note = absent_note(edition.label)
        marked = 0
        for p in (await db.execute(
            select(Project).where(Project.source_portal == self.PORTAL_NAME, Project.source_url != edition.url)
        )).scalars().all():
            if note in (p.description or ""):
                continue
            p.description = with_absent_note(p.description, edition.label)
            marked += 1
        return marked

    async def _save(self, ap_rows: list[dict], edition: Edition, as_of: datetime) -> int:
        ap_rows = await self.gate(ap_rows)
        saved = 0
        updated = 0
        obs_added = 0
        obs_fixed = 0
        rekeyed: list[str] = []
        mapped: list[str] = []
        claimed: set[int] = set()
        moved_sector: list[str] = []
        matched = 0
        no_cost_kept = no_cost_new = 0
        async with get_db_context() as db:
            # This portal's rows by normalised title, read once. It is the
            # fallback match for rows that arrive under a code the site has
            # never seen, which after the PAIMANA renumbering is all of them.
            by_title: dict[str, list[Project]] = {}
            for p in (await db.execute(
                select(Project).where(Project.source_portal == self.PORTAL_NAME)
            )).scalars().all():
                by_title.setdefault(_norm_title(p.title), []).append(p)

            for r in ap_rows:
                sector = re.sub(r"\s+", " ", r["sector"] or "").strip()
                ptype = sector_type(sector)
                description = (
                    f"Central-sector project ({sector or 'sector not stated'}"
                    + (f", {r['agency']}" if r["agency"] else "")
                    + f") tracked in the {edition.label} as ongoing."
                    + (f" Cumulative expenditure Rs {r['expenditure']:,.2f} Cr" if r["expenditure"] is not None else "")
                    + (f"; physical progress {r['progress']:.2f}% as of {as_of.day} {as_of:%B %Y}." if r["progress"] is not None else ".")
                    + (f" Shared with other states: {r['state']}." if r["state"].lower().startswith("multi") else "")
                )

                existing, how = await self._find_existing(db, r, by_title)
                if existing and existing.id in claimed:
                    # Two report rows with one title (two packages named alike)
                    # must not both land on the same database row.
                    existing, how = None, "new"
                if existing:
                    claimed.add(existing.id)
                    matched += 1
                    no_cost_kept += bool(r.get("cost_not_given"))
                    if existing.department and sector and existing.department != sector:
                        moved_sector.append(f"{r['code']} {existing.department} -> {sector}")
                    if existing.external_id != r["code"]:
                        rekeyed.append(f"{existing.external_id} -> {r['code']} ({r['name'][:60]})")
                        if how == "renumbering map":
                            mapped.append(f"{existing.external_id} -> {r['code']}")
                        existing.external_id = r["code"]
                    existing.completion_percentage = r["progress"]
                    # A report that prints no revised cost says nothing about
                    # the cost, so the cost already held stays, and the page
                    # keeps crediting it to the report that printed it
                    # (mospi_layout._costs explains the August 2026 zeros).
                    existing.estimated_cost_crore = cost_on_record(existing.estimated_cost_crore, r)
                    existing.expected_completion = r["expected"]
                    existing.description = description
                    existing.title = r["name"]
                    existing.project_type = ptype
                    existing.department = sector or None
                    existing.implementing_agency = (r["agency"] or "")[:200] or existing.implementing_agency
                    existing.source_url = edition.url
                    existing.last_scraped_at = self.scraped_at
                    project = existing
                    updated += 1
                else:
                    project = Project(
                        external_id=r["code"],
                        title=r["name"],
                        description=description,
                        project_type=ptype,
                        status=ProjectStatus.UNDER_CONSTRUCTION,   # the table is "All Ongoing Projects"
                        district=None,                              # the report is state-level; honest null
                        # A first sighting with no revised cost printed takes
                        # the original cost the report does print.
                        estimated_cost_crore=cost_on_record(None, r, first_sighting=True),
                        completion_percentage=r["progress"],
                        announced_date=r["approval"],
                        expected_completion=r["expected"],
                        department=sector or None,
                        implementing_agency=(r["agency"] or "")[:200] or None,
                        source_portal=self.PORTAL_NAME,
                        source_url=edition.url,
                        last_scraped_at=self.scraped_at,
                    )
                    db.add(project)
                    saved += 1
                    no_cost_new += bool(r.get("cost_not_given"))

                await db.flush()
                outcome = await upsert_observation(
                    db, project.id, as_of,
                    progress=r["progress"], expenditure=r["expenditure"], cost=r["cost"],
                    portal=self.PORTAL_NAME, url=edition.url, label=edition.label,
                )
                obs_added += outcome == 1
                obs_fixed += outcome == 2
            self._check_sector_drift(matched, moved_sector, edition)
            absent = await self._note_absent(db, edition)
            await db.commit()
        logger.info(f"[{self.PORTAL_NAME}] {edition.label}: {saved} new project row(s), {updated} refreshed, "
                    f"{absent} older row(s) marked as not listed in this edition")
        if no_cost_kept or no_cost_new:
            # Said on the updates page, not only in the log: a report that
            # stops printing a figure is a change in the source, and the owner
            # should see it without reading logs.
            self.note(f"{no_cost_kept + no_cost_new} Andhra Pradesh row(s) in the {edition.label} print the revised "
                      f"cost as 0.00. {no_cost_kept} already tracked kept their cost, credited to the report "
                      "that printed it"
                      + (f"; {no_cost_new} new project(s) show the original cost the report prints" if no_cost_new else ""))
        if rekeyed:
            self.note(f"{len(rekeyed)} project(s) re-keyed to their PAIMANA code"
                      + (f" ({len(mapped)} through the reviewed renumbering map)" if mapped else "")
                      + ": " + "; ".join(rekeyed[:10]) + (" ..." if len(rekeyed) > 10 else ""))
        if obs_added or obs_fixed:
            logger.info(f"[{self.PORTAL_NAME}] dated observations for {as_of:%d %b %Y}: "
                        f"{obs_added} recorded, {obs_fixed} corrected")
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
