# Every document still missing — and what it fixes on the site

Built 2026-08-28 by auditing the seed files against what the platform actually
publishes. Nothing here is from memory; every gap below was counted from
`backend/seed/*.json`, and every source URL was opened and confirmed.

## The headline finding

**The blocked portals are not the bottleneck.** Of everything missing, the large
majority sits on servers that answer us right now, with no VPN and no browser.
What is actually missing is *extraction* — reading documents we can already open
and pulling the figures out with their quotes.

Four genuinely blocked sources remain, and between them they account for a small
slice of the gap.

---

## P0 — Weakly sourced material that is ALREADY ON THE SITE

This is the most urgent category, because unlike an empty section, it is visible
and it looks authoritative.

### The MoU register: 26 of 28 entries are not government-sourced

Counted from `mous_seed.json`. Only **2 of 28** MoUs cite a government source.
The rest split into two kinds, and they are not equally bad:

**Company press releases (primary, but not government)** — NTPC, LG, Cognizant,
Daikin, Yokohama, Apollo Tyres, Mondelez, Google, Isuzu (via Sri City). These are
the company's own statement of what it committed. Defensible if labelled as the
company's claim, not the state's record.

**Newspapers (must not carry a figure)** — Kia (Zee Business), ArcelorMittal
(Business Standard), Reliance (Business Standard), Adani (The Federal/PTI), TCS
(APAC News Network), Brookfield (Business Standard), AdaniConneX (Deccan Herald),
Indosol (Hans India), JSW (Deccan Herald), Aurobindo (Pharmabiz), Lulu (The News
Minute), Foxconn (Business Standard), Hero MotoCorp (Autocar), Asian Paints,
Patanjali (News Minute/ETV), Celkon, Greenko (Mercom).

**Three have no date at all**: ArcelorMittal Nippon Steel India, LG Electronics
India, NTPC (NP Kunta Solar).

**Documents that would fix it, all reachable now:**
- `apedb.gov.in` — APEDB investment announcements (opens; content is dated)
- `pib.gov.in` — PIB releases for the central-facing projects (opens)
- `apindustries.gov.in` via the `www` host (opens, thin)
- Cabinet approval notes and G.O.s — **needs GOIR, which is blocked**

**Until then**, the honest fix costs nothing and needs no new document: label each
entry with what it actually is — "press report, not government-confirmed" or
"company announcement, not government-confirmed". The register can stay; the
sourcing claim must match reality.

### PAGE-CONTENT.md contradicts the live site
It states YSRCP MoU figures of 10 / ₹3.23 lakh crore / 5 operational. The seed and
the live site say 8 / ₹2.75 lakh crore / 4. **The seed is correct.** Fix the doc.

---

## P1 — Promised on the site but not delivered

Three library entries currently read "figure extraction in progress". That is a
public promise. All three source documents are **reachable right now** — direct
PDF links confirmed 2026-08-28:

| # | Document | Direct URL | What it fills |
|---|---|---|---|
| 1 | **CAG Report 5 of 2025** — Performance and Compliance Audit (Civil), year ended March 2022 | `https://cag.gov.in/webroot/uploads/download_audit_report/2025/PCA-Report-No.5-of-2025_English-069aaf17d2b0187.40331878.pdf` | Mana Badi Nadu Nedu year-wise release vs spend |
| 2 | **CAG Report 4 of 2025** — Polavaram Irrigation Project | `https://cag.gov.in/webroot/uploads/download_audit_report/2025/PA-on-Polavaram-Irrigation-Project-069aaece202fa02.61046831.pdf` | Re-verify works 82% / land 67% / R&R 11% at Mar-2023 |
| 3 | **CAG Report 2 of 2024** — State Finances Audit | already mirrored in `sources/` | Off-budget borrowing detail behind ₹1,28,048 Cr |

Also worth cataloguing while we are there — none of these are in the library yet:
Report 7 of 2025 (Compliance Audit, Commercial), Report 6 of 2025 (Revenue),
Report 2 of 2025 (Revenue and Environment/Forests), Report 1 of 2025 (Mines and
Geology), Report 3 of 2024 (Public Health Infrastructure), Report 1 of 2024
(Information Systems Audit, CFMS).

---

## P2 — Sections that are empty or thin

### Departments: 2 of 40 done

`departments_seed.json` maps all 40 demands but carries rows for only **Demand XII
(School Education)** and **Demand XVI (Medical and Health)** — 13 years each,
2014-15 to 2026-27. **38 demands have no data at all.**

**The document pattern is confirmed and fully reachable.** Verified 2026-08-28:

```
https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/budget-volumes/<YEAR>/Volume-III-<N>.pdf
```

`Volume-III-1.pdf` for 2023-24 opened as *Demand I, State Legislature* — so
**III/N maps to Demand N**. Recent years use the `...Bud@et<YY-YY>/documents/`
path instead. One caveat found immediately: Demand I contains only revenue
estimates and no capital outlay, so the extractor must handle demands that
legitimately have no capital line rather than recording a zero.

The eight village-relevant demands to do first:
**XI** Roads and Buildings · **XVII** Municipal Administration and Urban
Development · **XVIII** Housing · **XXI** Social Welfare · **XXVII** Agriculture ·
**XXXI** Panchayat Raj · **XXXII** Rural Development · **XXXIII** Major and Medium
Irrigation.

This is the single largest gap on the platform, and **not one blocked site is
involved**. It is 38 demands × 13 years of reading.

### Investment grounded-by-year: 5 of 12 years empty

Seven years carry figures. Five are blank, all marked `state_silent`:
**2014-15, 2016-17, 2017-18, 2024-25, 2025-26.**

These are not all the same kind of gap, and the distinction matters:
- **2014-15, 2016-17, 2017-18** — the state genuinely did not publish an annual
  grounded figure. Re-reading the Budget Speeches and Socio-Economic Surveys for
  those years would confirm or overturn that. **Correctly shown as missing today.**
- **2024-25, 2025-26** — the state published *approvals*, not grounded
  investment. Showing an approvals number here would be exactly the substitution
  the platform exists to expose. **Correctly refused today.**

Newly available: the **2025-26 Budget Speech** (Payyavula Keshav, 28 Feb 2025) at
`apfinance.gov.in/...Bud@et25-26/documents/SpeechEnglish.pdf`, worth re-reading
for a grounded figure before leaving 2025-26 blank.

### Tenders: table is empty, card says "Coming soon"

Three routes, in order of how easily they can be had:
1. **`crda.ap.gov.in`** — its homepage carries a live tenders/auctions table,
   24+ Amaravati works. **Reachable now, no captcha.** Genuine AP government
   tender data and the fastest way to make the card real.
2. **CPPP** `eprocure.gov.in/cppp/` — portal answers; every search is
   captcha-gated. Needs a human once per harvest.
3. **AP e-Procurement** — the state system. **Blocked.**

Note: `app/scrapers/ap_tenders.py` targets the unreachable portal with guessed
selectors. It should be rewritten against whichever of the above we actually use.

### Nadu Nedu works MIS — reachable, unread
`schoolinfra.ap.gov.in/stmsworks/Public/MISPublic.aspx` — MIS Reports (General,
Progress, Payment Status, Performance), Phase II, district-wise. Moved here from
the dead `nadunedu.se.ap.gov.in`. Nothing has been extracted from it yet.

---

## P3 — Genuinely blocked, needs an India route

Only four, confirmed by a live re-test:

| Source | Failure | What is lost |
|---|---|---|
| `goir.ap.gov.in` | resolves, times out | **G.O.Rt.55** (Nadu Nedu → "Mana Badi Mana Bhavishyathu"), Phase I/II sanction orders, cabinet approvals that would fix the MoU sourcing |
| `tender.apeprocurement.gov.in` + `www.apeprocurement.gov.in` | resolve, time out | State tender system |
| `rti.ap.gov.in` | **does not resolve at all** | RTI 4(1)(b) disclosures. Dead address, not a block — `sic.ap.gov.in` also times out |
| `apegazette.cgg.gov.in` | **HTTP 403** | Gazette. A refusal, not a timeout — a browser may well succeed |

Plus **`aplegislature.org`** (403) — most likely home of the missing **2023-24
Budget Speech**, the one YSRCP-era speech we do not have.

**The permanent fix** is a fetcher running in `asia-south1`, which the deployment
already targets: an Indian IP with no VPN and no human. Worth a test deploy before
being trusted, since datacenter ranges are sometimes blocked where residential
Indian ones are not.

---

## Suggested order

1. Label the 26 MoU entries honestly — no new document needed, removes a live
   credibility risk today.
2. Extract CAG 5/2025 and 4/2025 — keeps a promise already printed on the site.
3. The eight village-relevant demands, 13 years each — the biggest real gap, and
   entirely reachable.
4. CRDA tenders — turns "Coming soon" into real data.
5. Nadu Nedu MIS extraction.
6. The remaining 30 demands.
7. Blocked sources, once the Mumbai fetcher is proven.

Items 1 through 6 need **no VPN, no browser extension and nothing from Dheeraj**
except the go-ahead.
