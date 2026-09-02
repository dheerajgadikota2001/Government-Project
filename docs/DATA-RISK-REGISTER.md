# What we cannot access, and where the platform could mislead

Built 2026-08-28. Two separate questions, kept separate on purpose:
**(A) what documents are out of reach**, and **(B) where limited data could make the
live site say something false**. B is the one that can damage readers.

---

# PART B FIRST — where the LIVE site is at risk today

Ordered by how badly a reader could be misled.

### 1. MoU register — 26 of 28 entries are not government-sourced
`/investments` shows 28 MoUs with investment and jobs figures. Only **2** cite a
government source. **17** cite newspapers (Zee Business, Business Standard, Deccan
Herald, Autocar, The News Minute, Mercom). **9** cite company press releases.
Three carry no date at all, so they cannot be attributed to any government's term.

Source labels were written into `mous_seed.json` on 2026-08-28 — but **they do not
reach the page.** The `MOU` model has no columns for them, the schema does not
expose them, and the frontend never reads them. So a reader still sees a newspaper
figure presented exactly like a government one.

**This is the single most dangerous thing on the site right now.** Fix: migration +
schema + frontend, roughly one focused session.

### 2. Investment grounded-by-year — 5 of 12 years blank
2014-15, 2016-17, 2017-18, 2024-25 and 2025-26 have no grounded figure. The page
marks them `state_silent` and refuses to interpolate, which is correct. The risk is
a reader reading the *shape* of a 7-point line as a trend across 12 years. Consider
showing the missing years as explicit gaps in the chart itself, not only in a note.

### 3. Departments — 2 of 40 have data
Only Demand XII (School Education) and Demand XVI (Medical and Health) carry rows.
The other 38 are listed with no data. Low risk of a false figure, high risk of a
reader assuming the two shown are representative of state spending.

### 4. Document Library — three CAG entries promise work not done
Reports 5/2025, 4/2025 and 2/2024 are labelled "figure extraction in progress".
That is a public promise the site has not kept. Direct PDF URLs are confirmed and
reachable; this is a backlog item, not a blocked one.

### 5. Tenders — empty, card says "Coming soon"
Honest as it stands. `app/scrapers/ap_tenders.py` still targets an unreachable
portal with guessed selectors and should be rewritten before it is trusted.

### 6. School education — held at "coming soon" 2026-08-28
See `school-education-section.md`. Held because UDISE+ starts only at 2018-19, the
school count is NET and mixes government with private schools, and per-student
covers 4 years. Deliberately withheld rather than shown thin.

---

# PART A — documents we cannot access

## A1. Blocked to this platform, reachable in Dheeraj's browser
| Source | What blocks us | What is lost |
|---|---|---|
| `schoolinfra.ap.gov.in` (Nadu Nedu works MIS) | WebFetch reads the landing page but not report pages; Playwright refused by the container's egress allowlist; the browser pane refuses it too (invalid TLS certificate) | Schools actually **built and upgraded**, component-wise status, payment status. The only source for "schools built" as opposed to a net count |
| `cse.ap.gov.in` — Educational Statistics 2021-22 | WebFetch opens the PDF but stops extracting long before page 115 | **Tables 92-94: management-wise schools, enrolment and teachers 2012-13 to 2021-22.** Fills the four missing years AND splits government from private |
| `tender.apeprocurement.gov.in` — `awardedreport.html`, `mis-reports.html` | Whole host times out from here; opens on his India-routed browser | Year-wise **awarded** contracts — stronger evidence than published tenders |
| `apegazette.cgg.gov.in` | HTTP 403 to automation; opens in his browser but is a JavaScript shell | Gazette notifications |

## A2. Reachable, but the content sits past our reader's reach
- **UDISE+ booklets** — enrolment for 2018-19, 2019-20, 2020-21 lives in Chapter 3 (~p62); infrastructure tables sit at p33-35. Extraction stops before both in every mirror tried. **A fabricated infrastructure row was produced once by a summarising fetch and discarded** — treat any figure that cannot be reproduced literally as absent.
- **AP Socio-Economic Survey 2024-25** — extraction stopped at Chapter 5; the education chapter is Chapter 8.
- **Files over 30 MB** refuse outright (HTTP 413). The SES editions are 37-82 MB and only exist here because Dheeraj downloaded them.

## A3. Gone, not blocked
- `rti.ap.gov.in` — DNS dead. The live portal is `rtionline.ap.gov.in`, mostly a request-filing system.
- `core.ap.gov.in` (CM CORE Dashboard) — DNS dead.
- **DISE school data 2014-15 to 2017-18** — the historic host `udise.in` is no longer a government site; it serves SEO spam. No government copy located.
- `openbudgetsindia.org` — **became a cricket-betting affiliate site while still returning HTTP 200.** Removed from the library and from `check_sources.py`, which now asserts page content.

## A4. Refused by robots.txt
- `data.gov.in` — two directly relevant datasets: enrolment 2019-20 to 2023-24, and government schools with enrolment 2019-20 to 2021-22. **The most likely government source for the missing UDISE+ enrolment years.** Needs a human.
- `ap.data.gov.in` — same.

## A5. Captcha or login
- `eprocure.gov.in/cppp/` — the portal answers; every search is captcha-gated.

## A6. JavaScript-only, need a real browser
`ndap.niti.gov.in` · `nhai.gov.in` · `mospi.gov.in` IPMD.

## A7. Searched exhaustively, never found
- **Budget Speech 2023-24 (March 2023).** Tried: the Finance speech page (current year only), the archive page (404), every filename pattern in the 2023-24 S3 folder (403), `aplegislature.org` (its budget link points at a host with a broken certificate), and `apbudget.apcfss.in` (503 from both of us). Copies exist on Scribd and PRS India; neither is a government source. The library correctly says "we could not locate it", not "not published".

---

# NOT blocked — simply not done yet
Distinguishing these matters. Nothing stands in the way of any of them:
- **CAG Reports 5/2025 and 4/2025** — direct PDF URLs confirmed working
- **Budget volumes 2014-15 to 2016-17, Volume III** — for the capital/revenue split
- **The other 38 department demands** — same S3 pattern, `Volume-III-<N>.pdf`
- **CRDA tenders table** — 24+ Amaravati works, no captcha, reachable now
- **APEDB (`apedb.gov.in`) and PIB** — for MoU sourcing

---

# The rule this register exists to enforce
A figure goes on the page only when it carries its source document AND a second
government source it was checked against. Where a year or a figure does not exist,
the page says so. **We do not fill gaps, and we do not let a partial series imply a
complete one.**
