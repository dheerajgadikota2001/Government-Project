# AP Nadu Nedu — Data Source Registry

The complete map of where the Government of Andhra Pradesh (and related bodies)
publishes documents and data online, split by category. Researched and verified
August 2026. This is the master reference for what we mirror and from where.

**The single most important fact about AP data:**

> AP government content lives on **two different kinds of infrastructure**, and
> that decides whether we can reach it:
>
> - **AP State Data Centre / CGG hosting** (`goir.ap.gov.in`, `*.cgg.gov.in`,
>   `core.ap.gov.in`, `cfms.ap.gov.in`, `apedb.ap.gov.in`, `aplegislature.org`,
>   `tender.apeprocurement.gov.in` …) — **rejects non-Indian IPs**. Needs an
>   India VPN or India-based server. Roughly half the map.
> - **National infrastructure** (NIC S3WaaS district sites, NeVA, CAG, PIB,
>   CPPP/etenders, MoSPI, `data.gov.in`, `ppa.gov.in`) plus `apfinance.gov.in`
>   (AWS S3-backed) — **accessible worldwide**. This is what we build on first.

Accessibility markers below: 🌍 = reachable from anywhere · 🇮🇳 = Indian IP required.

---

## Category 1 — Government Orders (G.O.s)

| Portal | URL | What it holds | Access |
|---|---|---|---|
| **GOIR** (canonical) | https://goir.ap.gov.in | Every G.O. (Ms/Rt) by dept/number/date, PDFs | 🇮🇳 |
| AP e-Gazette | https://apegazette.cgg.gov.in | Official gazette notifications | 🇮🇳 |
| AP Finance "GOs, Acts & Memos" | https://www.apfinance.gov.in | Finance G.O.s, budget release orders, memos (S3-hosted PDFs) | 🌍 |
| CFMS G.O. repository | https://cfms.ap.gov.in | Budget-related G.O.s | 🇮🇳 |
| Department & district sites | e.g. `apsirdpr.ap.gov.in`, `<district>.ap.gov.in/documents/` | Dept-specific G.O.s and circulars | 🌍 (district S3WaaS) |

**Best now:** AP Finance G.O.s + district document pages. **GOIR needs India access.**

## Category 2 — Projects & Progress

| Portal | URL | What it holds | Access |
|---|---|---|---|
| CM CORE Dashboard (RTGS) | https://www.core.ap.gov.in/cmdashboard/Index.aspx | Department KPIs, scheme/project progress | 🇮🇳 |
| **Polavaram Project Authority** | https://ppa.gov.in | Authority meetings, Polavaram status, statutory docs | 🌍 |
| AP Water Resources | https://irrigationap.cgg.gov.in | Irrigation project pages, dashboards | 🇮🇳 |
| APWRIMS | https://apwrims.ap.gov.in | Live reservoir levels, rainfall, canal flows | 🇮🇳 |
| APCRDA | https://crda.ap.gov.in | Amaravati status reports, master plans, tenders | 🇮🇳 (mixed) |
| **MoSPI PAIMANA** (new, Feb 2026) | https://ipm.mospi.gov.in | All central projects ≥₹150cr incl. AP: cost/time overruns, monthly Flash Reports | 🌍 |
| NHAI | https://nhai.gov.in | AP highway projects, status disclosures | 🌍 |
| South Coast Railway | https://scor.indianrailways.gov.in | Rail projects of the new Visakhapatnam-HQ zone | 🌍 |
| PIB (tag: Andhra Pradesh) | https://www.pib.gov.in/TagbasedSearch.aspx?Tag=Andhra+Pradesh | Central announcements on AP projects | 🌍 |

**Best now:** PAIMANA Flash Reports (mega-project overruns) + PPA (Polavaram) + PIB.

## Category 3 — Tenders

| Portal | URL | What it holds | Access |
|---|---|---|---|
| AP e-Procurement | https://tender.apeprocurement.gov.in | All state dept/PSU tenders + awards | 🇮🇳 |
| **CPPP / eTenders** | https://etenders.gov.in/eprocure/app | Central agencies' AP tenders (NHAI, Railways, AAI…), browsable without login | 🌍 |
| GeM | https://gem.gov.in | Goods/services procurement incl. AP buyers | 🌍 (JS-heavy) |

**Best now:** CPPP for central works in AP. State tenders need India access.

## Category 4 — Investments & MoUs

| Portal | URL | What it holds | Access |
|---|---|---|---|
| APEDB | https://apedb.ap.gov.in | MoU announcements, summit material, sector profiles | 🇮🇳 |
| AP Industries Single Desk | https://www.apindustries.gov.in | Clearances, industrial policies, incentives | 🇮🇳 (partly login) |
| CII Partnership Summit | https://www.ciipartnershipsummit.in | Summit MoU tallies | 🌍 |
| IBEF AP page | https://www.ibef.org/states/andhra-pradesh | Secondary investment data | 🌍 |
| PIB / News On AIR | https://www.pib.gov.in | Central-side announcements | 🌍 |

**Best now:** PIB + credible press with citations (our curated seed approach). APEDB needs India access.

## Category 5 — Budgets & Finance

| Portal | URL | What it holds | Access |
|---|---|---|---|
| **AP Finance Dept** | https://www.apfinance.gov.in | Budget volumes (all years), FRBM, pay commission, G.O.s | 🌍 ✅ scraper built |
| CFMS | https://cfms.ap.gov.in | Expenditure system (public views limited) | 🇮🇳 |
| **Open Budgets India** | https://openbudgetsindia.org/organization/about/andhra-pradesh | AP budgets 2016-17→2025-26 as PDFs AND CSVs, CKAN API | 🌍 |
| RBI State Finances | https://rbi.org.in | Audited AP fiscal aggregates | 🌍 |

**Best now:** apfinance.gov.in (done) + Open Budgets India for machine-readable CSVs.

## Category 6 — Audit & Oversight

| Portal | URL | What it holds | Access |
|---|---|---|---|
| **CAG — AG (Audit) AP** | https://cag.gov.in/ag/andhra-pradesh/en/audit-report | Audit reports: state finances, Polavaram, revenue, PSUs | 🌍 ✅ scraper built |
| CAG — AG (A&E) AP | https://cag.gov.in/ae/andhra-pradesh | Monthly civil accounts, finance/appropriation accounts | 🌍 |
| APERC | https://aperc.gov.in | Power tariff orders, DISCOM filings | intermittent |
| AP State Audit Dept | https://stateaudit.ap.gov.in | Local-body audit reports | 🇮🇳 |

## Category 7 — District-Level Data (all 26 districts)

| Portal | URL pattern | What it holds | Access |
|---|---|---|---|
| **District collectorate network** (NIC S3WaaS) | `https://<district>.ap.gov.in` — e.g. visakhapatnam.ap.gov.in, tirupati.ap.gov.in | `/documents/` (orders, tender notices as dated PDF tables), `/media-corner/` (press, photos), `/rti/`, DIPRO press notes | 🌍 |
| District index | https://andhrapradesh.s3waas.gov.in | Directory of all 26 sites | 🌍 |

**Why this matters:** all 26 sites share ONE uniform template — a single scraper
covers every district's documents, press notes and photos. Top accessible source
for district-level activity.

## Category 8 — Schemes & Beneficiaries

| Portal | URL | What it holds | Access |
|---|---|---|---|
| GSWS (Sachivalayam) | https://gramawardsachivalayam.ap.gov.in | Village/ward secretariat services & delivery | 🇮🇳 + login |
| NBM / Navasakam | https://gsws-nbm.ap.gov.in | Scheme beneficiary management | 🇮🇳 + login |
| National MIS covering AP | nrega.nic.in, omms.nic.in (PMGSY), ejalshakti.gov.in (JJM), pmawas | AP rows in national scheme dashboards — often the easiest scheme data | 🌍 |

**Best now:** national MIS portals filtered to AP.

## Category 9 — Open Data & Statistics

| Portal | URL | What it holds | Access |
|---|---|---|---|
| data.gov.in (AP catalog) | https://www.data.gov.in/catalogs/?state=Andhra+Pradesh | AP datasets, CSV/API (free API key) | 🌍 |
| NDAP (NITI Aayog) | https://ndap.niti.gov.in | Standardised cross-ministry datasets filterable to AP | 🌍 |
| DES AP | https://des.ap.gov.in | Statistical abstracts, district income, prices | 🇮🇳 |
| APSDPS | https://apsdps.ap.gov.in | Socio-Economic Survey (flagship annual stats PDF), SDG reports | 🇮🇳 |

## Category 10 — Press Releases / Official News

| Portal | URL | What it holds | Access |
|---|---|---|---|
| I&PR Dept AP | https://ipr.ap.nic.in | Daily state press releases (Telugu/English PDFs), photos | unstable from abroad |
| **PIB** | https://www.pib.gov.in/TagbasedSearch.aspx?Tag=Andhra+Pradesh | Central govt releases about AP | 🌍 |
| CMO AP / IPR on X | @AndhraPradeshCM, @IPR_AP, @APCOREdashboard | Often the first publication venue for announcements | API-limited |
| District DIPRO pages | `<district>.ap.gov.in/media-corner/` | District press notes + photos | 🌍 |

## Category 11 — Legislature ⭐ biggest find

| Portal | URL | What it holds | Access |
|---|---|---|---|
| **NeVA — AP Assembly** | https://apa.neva.gov.in | Bills, starred/unstarred QUESTIONS & ANSWERS, debates, session papers — ministers' written answers are a goldmine of official project/scheme figures | 🌍 |
| NeVA — AP Council | https://apc.neva.gov.in | Same for Legislative Council | 🌍 |
| AP Legislature (state site) | https://www.aplegislature.org | Bills, proceedings | 🇮🇳 |

**Why NeVA matters:** when an MLA asks "what is the status of X project?", the
minister's written answer — cost, spend, % complete, timeline — is an official,
citable government document. NeVA hosts these on national infrastructure,
publicly, as PDFs. This is arguably the single richest accessible source for
authoritative project figures.

## Category 12 — RTI Proactive Disclosures

| Portal | URL | What it holds | Access |
|---|---|---|---|
| District `/rti/` pages | `<district>.ap.gov.in/rti/` | Section 4(1)(b) manuals, PIO lists | 🌍 |
| Dept RTI sections | apfinance.gov.in, cag.gov.in/ae/andhra-pradesh | Departmental disclosures | 🌍 mostly |
| AP Information Commission | https://apic.ap.gov.in | Commission orders, annual reports | 🇮🇳 |

---

## Priority build order (accessible-first)

1. ✅ **CAG audit reports** — done (73 docs)
2. ✅ **AP Finance budget volumes** — scraper built
3. **NeVA assembly Q&A** (apa.neva.gov.in) — official project figures, PDFs, worldwide access
4. **District S3WaaS network** — one scraper × 26 districts: documents, press notes, photos
5. **PIB tag feed** — central announcements about AP
6. **PAIMANA Flash Reports** (ipm.mospi.gov.in) — mega-project cost/time overruns
7. **CPPP/etenders** — central-agency tenders in AP
8. **Open Budgets India CSVs** — machine-readable budget data
9. 🇮🇳 *After India access exists:* GOIR (all G.O.s) → tender.apeprocurement.gov.in → APEDB → CORE dashboard → e-Gazette

---

## The one rule across everything

Every row we store carries `source_url`, `source_portal`, and a fetch timestamp.
No exceptions. Link out to originals; extract text for search; never claim
authorship of government content; never display a number we can't cite.

## Scraper etiquette

- Sync on schedule (every 4–6h), never continuous
- 2–5 second delay between requests
- User-Agent: `APNaduNedu-Bot/1.0` with contact email
- Cache in our own DB — never hit their servers per user visit
- Prefer off-peak hours (late night IST)
- If a portal adds a login wall or CAPTCHA, treat that section as no longer public and stop

---

# PART 2 — THE VERIFICATION STANDARD (agreed 26 Aug 2026)

The rule the platform now runs on: **every claim carries evidence from its own era, from the
highest-authority source that publishes that kind of document.** News articles are never the basis of a
figure — at most they are labeled records of a document we cannot fetch directly. This is the map of
where each kind of document actually lives, learned by verifying every source in this list.

## Where the AP government publishes (state level)

| Document type | Portal | Access from abroad | What it proves |
|---|---|---|---|
| Government Orders (G.O.s) — every approval, allotment, sanction since 2008 | goir.ap.gov.in (GOIR) | ❌ geo-blocked (India VPN unlocks) | The legal act itself: project sanctions, MoU approvals, scheme rules |
| Budget volumes, FRBM Statements of Fiscal Policy, Budget-in-Brief, budget speeches | apfinance.gov.in (files on S3 — reachable worldwide) | ✅ | Allocations (BE), revisions (RE), the government's own accounts and debt statements |
| Socio-Economic Survey (annual) | apfinance.gov.in/socio.html | ✅ | The government's own annual account of schemes, beneficiaries, sector data |
| Assembly/Council questions, answers, business | apa.neva.gov.in (NeVA — national infra) | ✅ (we scrape it) | Ministers' statements on record — official figures given to the legislature |
| District administration documents, notices | 26 × district S3WaaS sites (…ap.gov.in, national infra) | ✅ (we scrape all 26) | Local works, notices, progress statements (e.g. Bhogapuram 98.74% readiness) |
| Tenders (works actually procured) | tender.apeprocurement.gov.in | ❌ geo-blocked | That a work went to procurement — the strongest "money moved" signal below audits |
| Investment/MoU announcements | apedb.ap.gov.in (APEDB) | ❌ geo-blocked | Summit MoU lists. NOTE: signed MoU PDFs themselves are almost never published anywhere — commercial confidentiality. The verifiable trail is: G.O. approving it (GOIR) + the company's stock-exchange filing + PIB where the Centre is party |

## Where the CENTRAL government publishes about AP (all ✅ accessible — our backbone)

| Document type | Portal | What it proves |
|---|---|---|
| Audited state accounts, off-budget borrowings, committed expenditure | cag.gov.in — State Finances Audit Reports | The constitutional auditor's certified numbers — the final word on "was it actually spent" |
| Every state's debt, deficits, capital outlay, sector spending (uniform series) | rbi.org.in — State Finances: A Study of Budgets; Handbook of Statistics on Indian States | Comparable, compiled-from-budget-documents series across all states and years |
| Central-sector projects ≥₹150 Cr in AP — monthly cost/progress | mospi.gov.in flash reports (archive back years) | Dated progress % per project — our progress_observations feed |
| Union cabinet decisions, ministry releases, PM programmes (with photos) | pib.gov.in | Cabinet approvals (e.g. Polavaram revised cost 28 Aug 2024), inaugurations, central funding |
| Union Budget commitments to AP | indiabudget.gov.in (speech + documents) | E.g. ₹15,000 Cr capital support, Polavaram completion commitment (paras 33–34, 2024-25) |
| Airport licensing | dgca.gov.in licenced-aerodromes register | Whether an airport may legally operate |
| Environmental/forest clearances per project | parivesh.nic.in | Statutory clearance trail for any large project (to integrate) |
| Rural roads — every sanctioned/completed work | omms.nic.in (OMMAS) + PMGSY datasets (GODL) | Work-level rural infrastructure (to integrate — needs one browser capture) |
| Urban missions (AMRUT, Smart Cities) project lists | amrut.mohua.gov.in, MoHUA sites | Our 505 AMRUT rows — official project status PDFs |
| Listed-company disclosures (Kia excepted — unlisted in India; GMR, JSW, Adani, ArcelorMittal-NSE etc.) | nseindia.com / bseindia.com corporate announcements | A regulated, legally-accountable record of MoUs, investments, commissioning — the corporate half of every investment claim |
| State performance indices ("leaderboards") | niti.gov.in (Fiscal Health, SDG, Innovation, Export Preparedness), DPIIT eodb.dpiit.gov.in (BRAP), DARPG (Good Governance Index) | How central institutions rank the state government's performance, edition by edition |
| Parliament Q&A on AP subjects | sansad.in (Lok/Rajya Sabha questions) | Ministry answers with figures on AP schemes/projects |

## The money-verification chain (why our numbers are not "articles")

Budget Estimate (BE — a promise, apfinance.gov.in) → Revised Estimate (RE — mid-year correction)
→ **Accounts (A — actual money, audited and certified by CAG)** → compiled by RBI into uniform series.
Our charts mark every figure's stage; solid bars are CAG-audited actuals. When someone asks "how do you
know they really spent it on the ground" — the answer is the CAG audit, plus (project-level) MoSPI's
monthly physical-progress %, procurement records, and statutory clearances. Never a headline.

## Standing gaps we disclose rather than paper over

- Signed MoU documents: not published by any government; trail = G.O. + exchange filing + PIB.
- GOIR / e-procurement / APEDB: geo-blocked — the India-VPN unlock remains the single biggest coverage step.
- CAG SFAR FY2023-24: not yet published (as of 26 Aug 2026) — audited data ends FY2023 in places.
- Scheme beneficiary gender/district splits: only what budget speeches/SES state; no open per-district registry.
