# AP Nadu Nedu — read this first

Independent, no-login citizen transparency platform for Andhra Pradesh, by Dheeraj
("by dhethi"). React + Vite frontend, FastAPI + PostgreSQL backend, six languages.
Anyone can check a politician's claim against the government's own published record.

## Start every session by reading project memory
Use `project_memory_read` (no argument lists the files; MEMORY.md is the index):
**`standing-rules.md` → `current-state.md` → `pending-work.md`**, then whichever of
`deployment.md`, `community-feature.md`, `data-findings.md`, `workflows.md`,
`automation-plan.md`, `project-architecture.md` the task touches.
Those files carry the detail: what is built, what was rejected, every verified figure
with its source, and the traps that cost hours to learn.

## How Dheeraj wants to be worked with
Understand the question → ask as many clarifying questions as needed BEFORE starting →
present the approaches → recommend ONE and say why → **wait for his go** → then execute
end-to-end without asking permission at each step. He is direct; match that. He notices
when something is claimed as done that is not — never overstate.

## The honesty architecture (non-negotiable)
- Government sources only. Every figure carries a verbatim quote, page number and link.
- Missing data is shown as missing (`published` / `state_silent` / `unchecked`), never
  interpolated, never guessed into a period.
- When two official documents disagree, show BOTH readings side by side; never choose
  silently. Manifestos quoted verbatim. No verdicts. No voter data.
- Newspapers are only ever labelled claims, never the source of a number.
- TDP, YSRCP and NDA records are held to the identical audit-tier standard:
  CAG/RBI/central audited > state budget books/SES > speeches/press.

## Layout
- `ap-nadu-nedu/` — frontend (dev on :5174). i18n: six locales in `src/i18n/locales/`,
  keys must stay at parity across all six.
- `backend/` — FastAPI (dev on :8005). Alembic head is **0003**. Seeds in `backend/seed/`
  are curated by hand and never auto-overwritten by scrapers.
- `sources/` — big/blocked PDFs Dheeraj downloads for us. Git-ignored except its README.
- `docs/GCP-SETUP.html` — the deployment runbook.

## Two rules that will bite you
1. **Never run git write commands (`add`/`commit`/`checkout`) through the device bridge.**
   It cannot delete files, so `.git/index.lock` is left behind and every later git write
   fails. This silently blocked commits for a full day. Read-only git is fine; commits
   happen in Dheeraj's own terminal.
2. **Seed changes need `python scripts\load_seed_data.py` on his machine** — restarting
   the backend does not reload seeds. Say so every time a seed ships.

## Standing rules learned 2026-08-29 (source collection and extraction)

13. **GOIR exports need no renaming.** `sources/goir/normalise_goir.py` reads each
    downloaded `.xls`, detects the department from the file's own contents, renames it
    `goir-<CODE>.xls` and writes a matching `.json`. Duplicates are parked as `_dup_*`.
    Twenty departments are collected, roughly 100,000 orders.

14. **Never total the GOIR amount column.** It is zero or blank on most orders even when
    the subject line states a figure. Counting those zeros as spending understated YSRCP
    school orders by Rs 28,019 crore in the first attempt. GOIR is a count of dated
    decisions; every rupee figure comes from the budget books or the audit reports.

15. **Detect a budget book's year from "to YYYY-YY (Budget)", not the first year on the
    cover.** The 2025-26 and 2026-27 Annual Financial Statements open with "Summary of
    the Financial Position from 2023-2024 (Accounts) to 2025-26 (Budget)", so a
    first-match year detector files them under the wrong year. This actually happened.

16. **The Plan/Non-Plan to Revenue/Capital change is at 2017-18, not at the Roman-to-
    Arabic numbering change in 2023-24.** The two are independent. Assuming they moved
    together mislabels six years and draws a fake step in any chart at 2017-18.

17. **Only the 2014-15 budget book is printed in thousands.** Every book from 2015-16
    onward is in lakhs, including the eight that still number demands in Roman. Read the
    unit from each book's banner; deriving it from the year is out by a factor of 100.

18. **Validate an extraction against the document's own printed total.** The Statement of
    Demands for Grants prints a Grand Total after the last demand. All thirteen years now
    reconcile to the paisa; that gate caught a missing demand XL and a duplicate-page bug
    that no per-row eyeball would have found.

19. **CAG reports do not need downloading.** `sources/cag/CAG-AP-REPORTS.md` holds direct
    PDF URLs for every Andhra Pradesh audit report, read off the site's own listing. The
    cloud shell cannot reach cag.gov.in, but WebFetch can.

20. **The local Linux shell cannot build the frontend.** `node_modules` is installed for
    Windows, so rollup's native binary is missing and there is no network in that VM to
    install it. `npm run build` has to run on the Windows side.

## Standing rules added 2026-08-29 (school data and partial figures)

21. **The school series comes from ONE table, not seven volumes.** Educational
    Statistics 2022-23, Table 92 (printed page 196) restates management-wise schools
    for ten years, 2013-14 to 2022-23, on a single consistent basis; Tables 93 and 94
    do the same for enrolment and teachers. The individual annual volumes each print
    their own year, but 2019-20 and 2020-21 add a higher-secondary-only column the
    others lack, which fabricates a +578 / -554 swing that is definitional, not real.
    Use Table 92. The seven-volume extraction in `sources/cse/extract_cse.py` is kept
    as the cross-check and agrees with it.

22. **The 2016-17 volume's management table is a scan with no text layer.** It needs
    OCR, and the digits are genuinely ambiguous ("56" reads as "36" at some
    resolutions). The extractor reads each cell twelve times and votes. Without that
    the series silently starts a year late.

23. **Government schools have been flat.** 44,654 in 2016-17 to 44,617 in 2022-23 on
    the consistent basis: a range of 237 across seven years and two governments. What
    moved is aided schools, 2,269 down to 1,084. Any claim that either government
    built or closed schools at scale contradicts the state's own table.

24. **A single-year jump of thousands is a definition change until proved otherwise.**
    Local-body schools fall 42,418 to 40,703 between 2014-15 and 2015-16 with no
    explanation printed. That is recorded on the page as unexplained, and is not
    attributed to any government's action.

25. **A figure on a narrower basis gets `missing_kind: published_partial`,** a striped
    bar in the tenure colour, and the basis printed on it. Used for 2016-17 and
    2017-18 (large-and-mega only, or nine months) and 2024-25 (nine months). Never
    added into a total, never compared with the full-basis bars.

26. **Live dashboard counters need a date or they are unusable.** The STMS Phase-II
    expenditure counter, the UDISE+ "Real Time" setting and the schoolinfra reports all
    move hour to hour. Every figure taken from them carries its "Data as on" stamp.

27. **The STMS phase exports could not be labelled.** Five R1.2 exports came back
    identical (the grid only rebinds on GO); the five At-a-Glance PDFs do differ but
    were not taken in dropdown order, so no phase can be assigned. School
    infrastructure therefore publishes as state totals only, with no split by
    government, until a labelled export exists.
