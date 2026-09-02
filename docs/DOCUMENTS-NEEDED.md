# What documents each section needs, in priority order

Audited 2026-08-28 by reading every seed file, not from memory.
Ordered by **how badly a reader could be misled today**, not by effort.

---

## P0 — Sections carrying figures with NO government source

### 1. Projects page — 6 of 8 projects have no government citation

| Project | Cost shown | Gov citations | Sourced from |
|---|---|---|---|
| **Polavaram** | ₹30,436.95 Cr | **0 of 3** | news/other |
| **Ramayapatnam Port** | ₹4,923 Cr | **0 of 2** | news/other |
| **Machilipatnam Port** | ₹5,155 Cr | **0 of 2** | news/other |
| **JSW Kadapa Steel** | ₹16,350 Cr | **0 of 2** | news/other |
| Visakhapatnam Metro | ₹11,498 Cr | 1 of 2 | mixed |
| Amaravati (post-2024) | ₹37,702 Cr | 1 of 3 | mixed |
| Mulapeta Port | ₹4,362 Cr, 70% | 1 of 3 | mixed |
| Bhogapuram | ₹5,640 Cr | 4 of 6 | mostly PIB |

**Polavaram is the state's flagship project and its cost figure has no government citation.** That is the most exposed number on the site.

**Documents that fix it**
- Polavaram — **CAG Report 4 of 2025** (Polavaram performance audit), direct PDF confirmed working: `cag.gov.in/webroot/uploads/download_audit_report/2025/PA-on-Polavaram-Irrigation-Project-069aaece202fa02.61046831.pdf`. Also **Polavaram Project Authority** at `ppa.gov.in`, and Lok Sabha answers from Ministry of Jal Shakti.
- Ports (Ramayapatnam, Machilipatnam, Mulapeta) — **AP Maritime Board**, Demand for Ports/Infrastructure in the budget volumes, Ministry of Ports Shipping & Waterways Sagarmala documents.
- JSW Kadapa — cabinet approval G.O. via GOIR (Industries & Commerce), or DPIIT/PIB.

### 2. Cross-tenure comparison — company figures used as evidence about governments

| Project | Government readings | Company readings |
|---|---|---|
| **Bhogapuram** | 2 | **9** |
| **Kia** | 0 | **3** |
| Amaravati | 1 | 0 |
| Polavaram | 2 | 0 |

Every Bhogapuram progress percentage — 18.69% (Mar 2024), ~42% (Sep 2024), 79.79% (Jun 2025) — is a **GMR exchange filing**. The seed then uses those company numbers to rebut a political claim:

> *"It is often said that Bhogapuram was about 80 per cent finished when the government changed in June 2024. The developer's own dated disclosures do not support that."*

**A private company's disclosure must not be the platform's evidence about a government's record**, whichever government it favours. Checked 2026-08-28: **no government source publishes a Bhogapuram completion percentage.** MoCA's Rajya Sabha answer (Q.15, 21 Jul 2025) says only *"Construction work … is also progressing."* PIB covers the foundation stone and the inauguration, no percentages.

**Documents that would fix it**
- AP Assembly questions on Bhogapuram, via NeVA (reachable)
- **Vizianagaram district administration progress reports** — `DATA-SOURCES.md` already records a **98.74% readiness figure from state records, June 2026**, so the district site does publish progress
- AP Airports Development Corporation status reports
- Any CAG audit of the PPP concession

Until one exists, the section should say no government figure is published, rather than print a company's.

### 3. MoU register — labels written but not reaching the page
26 of 28 entries are newspaper or company sourced. Source labels exist in the seed and **do not render**: no model columns, no schema fields, no frontend read. Needs a migration, not a document.
**Documents that would upgrade the entries themselves**: cabinet approval G.O.s and incentive orders via **GOIR, Industries & Commerce, 2014-2026** (one Export); **APEDB** at `apedb.gov.in`; PIB.

---

## P1 — Sections that are incomplete in a way that distorts comparison

### 4. Governments — TDP 2024- has NO capital outlay total
`tenures.tdp2.capital_outlay_total` is **null** while TDP1 shows ₹74,225 Cr and YSRCP ₹78,164.5 Cr. A reader comparing three governments sees two numbers and a blank.
**Document**: Demands for Grants 2024-25, 2025-26, 2026-27 — Volume I/2 and Volume III on the apfinance S3 bucket. Reachable now.

### 5. Departments — 2 of 40 demands have data
Only Demand XII (School Education) and XVI (Medical and Health).
**Documents**: `s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/budget-volumes/<YEAR>/Volume-III-<N>.pdf`, where **III/N = Demand N** (verified). Recent years use the `...Bud@et<YY-YY>/documents/` path. All reachable, no VPN.
Priority eight: **XI** Roads & Buildings · **XVII** Municipal Administration · **XVIII** Housing · **XXI** Social Welfare · **XXVII** Agriculture · **XXXI** Panchayat Raj · **XXXII** Rural Development · **XXXIII** Major & Medium Irrigation.

### 6. Investment grounded-by-year — 5 of 12 years blank
2014-15, 2016-17, 2017-18 (TDP1) and 2024-25, 2025-26 (TDP2). Correctly marked `state_silent`, but a 7-point line can read as a 12-year trend.
**Documents**: Socio-Economic Survey chapters for those years, Budget Speeches, APEDB annual reports. The **2025-26 Budget Speech is now in hand** and worth re-reading for a grounded figure.

### 7. Off-budget borrowings — only 4 data points
Every other finance series has 12. This one has 4, all CAG.
**Document**: **CAG Report 2 of 2024** (State Finances) — already mirrored in `sources/`. Extraction promised on the site and not done.

---

## P2 — Empty or thin sections

### 8. Tenders — empty, "Coming soon"
**Documents**: `crda.ap.gov.in` carries a live 24+ row Amaravati tenders table, no captcha, reachable now. `tender.apeprocurement.gov.in/awardedreport.html` (year-wise awarded contracts) needs Dheeraj's browser. CPPP is captcha-gated.

### 9. School education — held at "coming soon"
**Documents**: AP Educational Statistics 2021-22 from `cse.ap.gov.in` (Tables 92-94, pages 115-117: management-wise schools, enrolment, teachers 2012-13 onward) and the school infrastructure works MIS at `schoolinfra.ap.gov.in`. Both need Dheeraj's browser.

### 10. Governments — economy section is empty, awards and rankings have 2 each
**Documents**: MoSPI state GSDP series, RBI Handbook of Statistics on Indian States, NITI Aayog SDG India Index.

---

## What is already strong — leave alone
- **Finances**: 12 points per series across RBI, CAG, NSO and the AP budget books. The best-sourced part of the platform.
- **Document Library**: 74 entries, 62 verified, every access note honest.
- **Summits**: all five carry `figure_type: government_statement` with the speaker named.
- **Manifestos**: present for all three tenures, quoted verbatim.

---

## The three documents with the highest value per minute
1. **CAG Report 4 of 2025** — direct URL works. Fixes Polavaram, the most exposed number on the site.
2. **GOIR Export, Industries & Commerce** — one click in Dheeraj's browser. Fixes MoU sourcing.
3. **Budget volumes, the eight village-relevant demands** — reachable now, no VPN. Fixes the biggest structural gap.

Numbers 1 and 3 need nothing from Dheeraj.
