# Full-platform cross-check — 1 September 2026

Requested: *"more thorough check with all the data and insights we have in the platform and cross check one more time, try one more time on anything you couldn't access, and let me know in detail."*

Method in one line: every claim re-tested against a government document or recomputed from raw source data; nothing accepted from memory or from an article.

---

## A. What was checked and holds

### A1. The 100-figure sampling audit — 100 ok · 0 wrong · 0 untraceable · 0 blocked
The 2026-08-31 worksheet (draw `e6c14b02e587116b`, 100 of 7,848 published figures) now has a verdict on every row, written into `backend/verify/audit/2026-08-31.md` (evidence per row) and `2026-08-31-verdicts.json`.

| Block | Rows | How verified |
|---|---:|---|
| Department budgets (`departments_seed`) | 40 | Against your 13 mirrored Volume I/2 PDFs (`sources/budget/`). 33 rows: the exact printed figure located in the right volume (e.g. `3787,18.18` lakh on p.13 of 2023-24). 7 rows resolved by rendering the page and reading it by eye (charged + voted lines sum to the seed value — e.g. Fiscal Administration 2023-24 revenue `31217,69.16 + 34803,37.22 = 66021,06.38` lakh = ₹66,021.06 Cr). 5 token-matched rows also eye-checked as a spot audit. The 2014-15 volume prints Rupees in **Thousands**, later volumes in **Lakhs** — both handled. |
| Appropriation Accounts (`finances_seed`) | 13 | Read live from cag.gov.in — including the **archive** (`?arch=1`), which yielded direct PDFs for 2014-15, 2015-16, 2016-17, 2017-18, 2018-19, 2019-20, 2020-21 in addition to the 2021-22→2024-25 already listed. Every sampled grant row matched to the paise (e.g. Grant XXXI Panchayat Raj Rev Voted actual `64,45,97,67` thousand = ₹6,445.9767 Cr — the seed's excess-over-grant row exactly). |
| FRBM statements (`finances_seed`) | 3 | Form F-1 in FRBM March 2017, November 2024, March 2025 (all on the apfinance S3): own tax 2015-16 ₹39,921.74 Cr, own tax 2022-23 ₹78,089.02 Cr, fiscal deficit 2023-24 Accounts ₹62,719.59 Cr — verbatim, with revenue receipts and interest cross-matching too. |
| RBI leaderboards + State Facts (`governments_seed`, `state_facts_seed`) | 35 | Read live from rbi.org.in: Handbook Tables 13, 19, 21, 30, 42, 62, 89, 105, 108, 143, 146, 157, 164, 165, 172, 174 and State Finances Statements 17 & 20. Every sampled state-year cell exact, including the ₹-lakh tables where the leaderboard stores crore (printed ÷ 100 verified). Table 174 confirms `11,405 / 14,172 / 15,181` with no footnote — the 2014-15 disagreement stays documented, not resolved. |
| GOIR school education (`goir_school_education_seed`) | 5 | Recomputed from the register's own export (4,896 rows): reading A totals reproduce **exactly for all 13 years**; 2014 reading B exact; Samagra Shiksha reading C reproduces **to the rupee** (₹1,64,07,46,76,408; word-boundary match = exactly the seed's 204 orders); both sampled largest-orders match column *and* subject text. |
| CSE education series (`school_education_seed`) | 2 | Against your mirrored Educational Statistics 2021-22: the 2019-20 schools row (61 / 3,771 / 40,707 / 2,084 / 14,891 / 61,514) and 2013-14 teachers components (1,227 + 14,979 + 164,152 = 180,358) — verbatim. |
| MoU + project (`mous_seed`, `projects_seed`) | 2 | Bhogapuram ₹5,640 Cr confirmed in PIB PRID 2292165 verbatim. Greenko row's figures match its cited Hans India report — but see finding C1. |

### A2. Verify harness
`python -m verify.run`: **30 checks, 0 FAIL, 7 warn** — before and after this session's fixes. All 7 warns are the known, documented ones (grant-rounding 0.018%, the RBI 11,405 open reconciliation ×2, two plain-http contact links, two `<district>` template links).

### A3. The platform rebuilt from nothing and swept end-to-end
In a clean sandbox: migrations 0001→**0004**, seeds loaded, AMRUT import (505) and MoSPI import (100) run → **613 projects**, identical to production expectations. Then:

- All 21 API endpoints return 200 with sane shapes.
- `/mous/stats` source tiers: government 2 MoUs ₹19,600 Cr (2.3%) · company 9 ₹3,35,649 Cr (39.2%) · press 17 ₹5,01,709 Cr (58.5%) — exactly what the Investments ProvenanceStrip shows.
- `/projects/insights`: total 613, by-status sums to 613; register page serves 612 (the documented Polavaram dedupe) with the word-wrap repair active (no "Visakhapatna m"); lazy per-project detail works; no route-order 422 regression.
- `/finances` committed years identical to seed (12/12, field-level); `/mous/summits` 5/5; leaderboards 34/34/32 rows; 3 undated MoUs explain by_year summing to 25 of 28 (documented).
- Community board: post creates with delete token (201), exactly-one-of-topic/page rule enforced (422), link-spam rejected (422 `too_many_links`), admin remove 204 with the key and **403 with a wrong key**, corrections accepted (201).

### A4. Reachability — re-tested from scratch, as asked
This session's cloud egress is OPEN again (it was fully closed on 08-31 — it genuinely varies by session): apfinance.gov.in + its S3, cag.gov.in (including the AA archive), rbi.org.in, mospi.gov.in, sansad.in, pib.gov.in, apedb.gov.in, crda.ap.gov.in (live tenders table), amrut.mohua.gov.in all reachable and used above. The MoSPI MCP (`mcp.mospi.gov.in`) answered a live JSON-RPC session — 27 datasets, real CPI rows returned — so the "independent second source for State Facts" plan is unblocked (item C3).

Still unreachable from everything I have: `goir.ap.gov.in` and `tender.apeprocurement.gov.in` (India-only), `aplegislature.org` (F5 firewall 403 even through the browser pane), `ipm.mospi.gov.in` (their SSL certificate has expired). These are yours-browser-only (C2, C4).

---

## B. What was corrected (all with backups, all verified before shipping)

1. **MoSPI scraper mis-typed the NH-365BG highway as railways** (`backend/app/scrapers/mospi_projects.py`). The flash report's own section heading — ROAD TRANSPORT AND HIGHWAYS, agency NHAI — prints a hair below the row's first line, and the parser attributed the row to the previous (Railways) section. Fixed the off-by-one; re-parse changes **only that one row** (national count 1595 and AP count 100 unchanged). Also: on re-runs the scraper only refreshed progress figures, never classification — so a parser fix could never reach rows already in the DB. `_save` now refreshes title/type/department too. Proven in the sandbox: after one re-scrape, project 540 reads ROADS / Road Transport And Highways. `.bak-sectorfix` kept beside it.
2. **"Jammu & Kashmir" vs "Jammu and Kashmir"** (`ap-nadu-nedu/src/components/advanced/StateCharts.jsx`). Not a duplicate row — RBI itself spells it differently between the Handbook and State Finances. But the compare-states picker showed two J&K chips and a picked J&K silently vanished from metrics spelled the other way. The picker now dedupes and matches on a normalised name; each chart still prints its own table's spelling (the verbatim rule is untouched — no seed was edited). `.bak-jk` kept; syntax-checked.
3. **The audit worksheet is no longer blank** — verdicts and per-row evidence written in (A1), plus `2026-08-31-verdicts.json` for the harness to consume later.

## C. What only you can provide or decide

1. **Greenko ₹19,600 Cr / 4,230 jobs — the government tier hangs on a newspaper.** The amount traces to The Hans India's report of the 5-Sep-2022 SIPB approval. PIB confirms the project but prints **"$4.2 billion"** and no jobs figure; the GOIR harvests hold Greenko G.O.s (2018 establishment, land, water) with no amounts. Since this MoU is the *entire* ₹19,600 Cr government tier on the Investments page, either (a) fetch a government document that states the figure — GOIR search (Industries dept, Sep–Oct 2022, in your browser) or SIPB minutes — or (b) I demote the amount to a labelled press-reported figure. My recommendation: (b) now, upgrade later if the G.O. surfaces — the honesty architecture is the product.
2. **Budget speech 2023-24 (March 2023)** — the one YSRCP-era speech still missing. New finding: apfinance's previous.html "2023" row actually serves the **Feb-2024 vote-on-account** speech (their mislabel, itself worth a line on the site). The Assembly site rejects every non-India route I have. Needs your Chrome (India VPN): aplegislature.org → Assembly → Budget.
3. **MoSPI flash reports for the 605 projects with no timeline events.** Confirmed live: `https://www.mospi.gov.in/sites/default/files/publication_reports/FlashReport_May_2024.pdf` (and `FlashReport_April_2024.pdf`, June likely same pattern). April 2019 sits in the ipm.mospi.gov.in archive, which has an expired certificate — your browser can accept the warning where mine refuses. Download into `backend\fetched\` and I extend the parser (old layouts will trip the sanity gate — expected) and import both snapshots.
4. **India-only portals stay yours**: GOIR beyond School Education (the Greenko/SIPB hunt above; G.O.Rt.55; Phase I/II sanction GOs), AP e-procurement awarded-tenders series.
5. **Standing run list on your machine** (see the action block in chat): AMRUT re-import, `alembic upgrade head` (now reaches **0004** — the MoU-provenance migration), `ADMIN_KEY` still absent from `backend\.env`, one MoSPI re-scrape to heal row 540, and the repo now carries **77 uncommitted paths** on a single initial commit.
6. Optional, tiny: the recovered direct AA PDFs (2014-15…2024-25) can be written into the document library / finances sources as permanent citations — say the word.

*Scratch from this session (page renders, a backend tarball) is under `_to_delete\eyecheck0901` and `_to_delete\bver-0901.tgz` — delete at will.*
