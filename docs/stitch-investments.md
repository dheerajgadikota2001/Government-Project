# AP Nadu Nedu — Stitch prompt: INVESTMENTS section (content + layout only)

Paste the APP CONTEXT block from `stitch-prompts.md` first, then this. Two pages: the Investments page and the per-government dive page it links to. Every number below is the one the live page shows today; it comes from the state's own budget speeches, surveys, or the register. Do not invent, round up, or "improve" any figure.

Design brief for Stitch: desktop-first, mobile must work. The page is a ledger, not a brochure: calm surfaces, strong typographic hierarchy, generous whitespace, charts drawn flat with labels (no 3D, no gradients, no decorative icons inside charts). Two visual registers only: "announced" (outline / lighter) and "built or operational" (solid / darker). Empty and "not published" states are first-class content, styled deliberately, never hidden. Telugu subtitles sit beside English titles at the same visual weight.

---

## PAGE A — INVESTMENTS (route: /investments)

### Section 1: Page header

- Title: **Investments & MoUs** with Telugu beside it: **పెట్టుబడులు & అవగాహన ఒప్పందాలు**
- Intro (one paragraph, max 70 characters per line): "Memoranda of Understanding signed with the Government of Andhra Pradesh, as announced through official channels. An MoU is a promise on paper: it is not money spent, land allotted, or a job created."
- Right-aligned small toggle button: "Advanced view" (switches to a denser analyst layout; design only the default).

### Section 2: Hero insight strip (4 equal cards in one row; on mobile 2×2)

Each card: small uppercase label, one mini chart, one bold "readout" sentence, one grey footer line, and a ⤢ expand icon top-right (opens the same chart enlarged with a data table below it).

Card 1 — label "Promised money, by sector"
- Mini chart: 5 horizontal share bars, longest first
- Readout: "**Renewable energy** was promised the most — ₹4.13 lakh crore."
- Footer: "Announced figures, not spending"

Card 2 — label "What became of the promises"
- Mini chart: 5 horizontal count bars: Operational · Investment started · Signed · Stalled · Cancelled
- Readout: "**12** of 28 signed commitments are recorded as operational."
- Footer: "Older MoUs have had longer to get there"

Card 3 — label "Districts promised the most"
- Mini chart: 5 horizontal bars (Anakapalli, Visakhapatnam, Sri Potti Sriramulu Nellore, Tirupati, Kurnool)
- Readout: "**Anakapalli** was promised the most investment — ₹3.34 lakh crore."
- Footer: "3 MoUs name no district"

Card 4 — label "Signed under which government"
- Mini chart: 3 rows, each "party · count signed · ₹ promised · n operational"
  - TDP 2014–19 · 9 signed · ₹22,900 Cr promised · 5 operational
  - YSRCP 2019–24 · 8 signed · ₹2.75 lakh Cr promised · 4 operational
  - NDA 2024– · 6 signed · ₹4.03 lakh Cr promised · 0 operational
- Readout: "Counted by each MoU's own signing date — the record, not a claim."
- Footer: "3 records carry no signing date"

### Section 3: "Summits, and what reached the ground" (the accountability ledger; the most important block on the page)

Section title: **Summits, and what reached the ground**
Intro paragraph: "Since Andhra Pradesh was divided, its governments have held five investment summits and announced ₹45.97 lakh crore across 2,722 agreements. Every figure on this page is the state's own, quoted from a budget speech or a survey you can open. The hard part is the second column."

#### 3a. Three government columns (side by side; stack on mobile)

Each column has a party colour stripe on top, a header, and two stacked blocks: **Announced at summits** (outline style) and **Reported as built** (solid style).

Column 1 — **TDP (Chandrababu Naidu)** · "8 Jun 2014 to 29 May 2019"
- Announced at summits: **₹19.6 lakh crore** · "1,726 MoUs across 3 summits" · "42.9 lakh jobs promised"
- Reported as built: **₹29,874 crore** · "across the 2 of 5 years this government published a figure for"

Column 2 — **YSRCP (Y.S. Jagan Mohan Reddy)** · "30 May 2019 to 11 Jun 2024"
- Announced at summits: **₹13.11 lakh crore** · "386 MoUs across 1 summit" · "6.07 lakh jobs promised"
- Reported as built: **₹37,055 crore** · "across the 3 of 5 years this government published a figure for"

Column 3 — **TDP-led NDA (Chandrababu Naidu)** · "12 Jun 2024 to today"
- Announced at summits: **₹13.25 lakh crore** · "610 MoUs across 1 summit" · "16.13 lakh jobs promised"
- Reported as built: styled empty state, not a zero: "No year of this term has a published figure for investment actually built. What is published is what was approved."

#### 3b. Chart: "What was announced, summit by summit"

Subtitle: "Committed investment as the state itself recorded it, in ₹ crore."
Horizontal bar chart, 5 bars, tenure colour, value label at the end of each bar, MoU count in the tooltip:
- Partnership Summit 2016 (Jan, Visakhapatnam) — ₹4,67,577 Cr — 328 MoUs
- Partnership Summit 2017 — ₹10,54,000 Cr — 664 MoUs
- Partnership Summit 2018 — ₹4,39,000 Cr — 734 MoUs
- Global Investors Summit 2023 (Mar) — ₹13,11,000 Cr — 386 MoUs
- Partnership Summit 2025 (Nov) — ₹13,25,000 Cr — 610 MoUs
Below the chart, a 5-row table with columns: Summit · MoUs · Announced · Jobs promised · **The document this comes from** (each a link chip, e.g. "Budget Speech 2017-18", "Budget Speech 2026-27, para 50").
Provenance line under the table (small, grey): "Andhra Pradesh Finance Department budget speeches, 2016-17 through 2026-27. Every row links to the speech it is quoted from."

Collapsible row under the table, closed by default, titled **"Where the numbers for the same summit disagree"**:
"Partnership Summit 2025: the Budget Speech 2026-27 says 610 MoUs, ₹13.25 lakh crore, 16.13 lakh jobs. Akashvani's closing-day report said 400 companies, ₹11 lakh crore, 13 lakh jobs. Both are shown; we do not pick one."

Second collapsible row, titled **"Two things widely described as summits that we could not confirm"**:
"'Sunrise AP Investment Meet, June 2015' does not appear in any government document; the name attaches to the January 2017 summit. Davos 2025 and 2026: the state published no totals."

#### 3c. Chart: "What the state said actually got built, year by year"

Subtitle: "Investment reported as grounded or established, in ₹ crore. A dashed outline means the state published no figure for that year."
Column chart, 12 columns, 2014-15 through 2025-26, coloured by tenure. Three column styles, with a legend:
- **Solid** = published figure
- **Dashed outline, empty** = "state never published" (label inside: "no figure published")
- **Dashed outline, hatched** = "we could not open the document" (label: "unchecked")
Values: 2014-15 none · 2015-16 ₹9,505 Cr (76,818 jobs) · 2016-17 none · 2017-18 none · 2018-19 ₹20,369 Cr (1,07,370 jobs) · 2019-20 ₹26,673 Cr (1,00,707 jobs) · 2020-21 ₹6,234.64 Cr (39,578 jobs) · 2021-22 ₹4,147 Cr (50,800 jobs) · 2022-23 unchecked · 2023-24 unchecked · 2024-25 none · 2025-26 none
Provenance line: "Andhra Pradesh budget speeches and Socio Economic Surveys. Seven of the twelve years since bifurcation have no published figure."

#### 3d. "The times a government published both sides of the ledger"

Subtitle: "Announcing is easy to count. Delivering is what governments publish least."
Row of quote cards (3 across, 2 on tablet, 1 on mobile). Each card: a large quoted sentence, the document name as a chip, and a one-line "what this means" in plain words. The three sentences below are paraphrases for layout only; the live page prints the verbatim sentence from the cited document, so size the card for 2 to 3 lines of quote. Fill with:
1. "Of 1,946 projects tracked with ₹13.54 lakh crore committed, 531 have commenced with ₹1.29 lakh crore committed." — Budget Speech 2018-19, para 98 — "27% of projects by count, 9.5% by value; committed, not spent."
2. "A hit rate of about 48%." — Budget Speech 2017-18 — "No denominator was published with this figure."
3. "SIPB approved 8 projects with ₹2,45,275 crore investment and 65,541 jobs in 2024-25." — Budget Speech 2025-26 — "Approvals, not investment on the ground."
Provenance line: "Quoted verbatim from the budget speeches and central reports named on each card."

#### 3e. "Projects built across two governments"

Subtitle: "Who gets the credit when the ribbon is cut by whoever happens to be in office that month."
Four wide cards (2×2). Each card: project name, a horizontal timeline bar shaded by tenure with dated progress markers on it, and a row of source chips that distinguish **government** sources from **company** sources by colour.
1. **Bhogapuram International Airport** — markers: "18.69% at 31 Mar 2024 (GMR filing)", "government changed 12 Jun 2024", "~42% at 30 Sep 2024 (GMR filing)", "79.79% by Jun 2025 (GMR filing)", "opened 1 Aug 2026 as Alluri Sitarama Raju International (PIB)". Shaded bracket labelled "25–30% at the change of government, by the company's own filings". Chips: PIB (government) · GMR exchange filings (company).
2. **Amaravati capital** — markers: "works stopped May 2019", "CAG Sep 2021: ₹35,444.62 Cr contracted, ₹6,059.60 Cr spent", "trunk infrastructure 0–59%, LPS infrastructure 0–18%". Chips: CAG (government).
3. **Polavaram** — markers: "began 2004", "Mar 2023: works 82%, land acquisition 67%, R&R 11% (11,677 of 1,06,006 families) — CAG Report 4/2025 chart 2.5". Note line: "Belongs to no single government." Chips: CAG (government) · Lok Sabha answer Jun 2021 (government).
4. **Kia Motors, Anantapur** — markers: "MoU Apr 2017", "production Aug 2019". Note line: "No progress curve was ever published." Chips: company.

### Section 4: "By government" summary (three clickable cards) and method note

Three cards, party colour stripe, each with: party + years · "**9 MoUs on record** · ₹22,900 Cr promised" · "62,250 jobs, across the 5 that state a figure" · "5 operational so far" · link "Dive into this government's record →" · secondary text link "or just filter the list".
- TDP (Naidu) 2014–19 — 9 MoUs on record · ₹22,900 Cr promised · 5 operational so far
- YSRCP (Jagan) 2019–24 — 8 MoUs on record · ₹2.75 lakh Cr promised · 40,720 jobs, across the 3 that state a figure · 4 operational so far
- TDP-led NDA (Naidu) 2024– — 6 MoUs on record · ₹4.03 lakh Cr promised · 4,58,000 jobs, across the 4 that state a figure · 0 operational so far
Method note under the cards (small, full width): "Counted by the signing date on each record; the amounts are the announcements' own figures: promises, not audited money. 3 records carry no signing date and are not attributed."

### Section 5: Live totals (4 compact stat tiles, icon + label + value + unit)

- Committed Investment — ₹8.57 lakh — crore
- Total MoUs — 28 — Agreements
- Expected Jobs — 6,64,065 — Projected (only 15 of 28 records publish a jobs figure; where a single record has none, show "none published", never 0)
- Foreign Investors — 12 — Non-domestic

### Section 6: MoU register (sticky filter bar + card grid)

Filter bar (one card, sticky under the nav):
- Search input, placeholder "Search company, sector, summit…"
- Dropdowns: "All sectors" · "All statuses" · "All 26 districts" · "Any year signed" (the year list ends with "No date on record (3)")
- Sort select "Sort: Investment size" (options: Investment size · Expected jobs · Date signed · Company A–Z) with an ascending/descending toggle
- Right side: "28 matching MoUs" and, when filters are active, "Clear 2 filters"

Card grid, 2 columns (1 on mobile). Each card:
- Company name (bold) · sector chip · "Foreign investment" chip only when applicable
- Status badge, five variants with distinct but muted colours: Signed · Investment started · Operational · Stalled · Cancelled
- Figures strip: "Committed ₹1,85,000 Cr" · "Expected Jobs: none published"
- Meta row: district · "Signed Mar 2023" · summit name when one exists
- Footer: "Source: NTPC Limited (official) ↗ · in our register since 26 Aug 2026" and a "Full record" link
Fill the first six cards with real records:
1. NTPC Green Energy Ltd · Renewable energy · Investment started · ₹1,85,000 Cr · Anakapalli · Signed Mar 2023 · AP Global Investors Summit 2023
2. Google (Alphabet Inc.) · IT/Tech · Investment started · ₹1,35,000 Cr · Visakhapatnam · Signed Oct 2025 · Bharat AI Shakti, New Delhi (announcement)
3. Greenko Group · Renewable energy · Operational · ₹19,600 Cr · Kurnool · Signed Sep 2022
4. LG Electronics India · Manufacturing · Investment started · ₹5,001 Cr · Tirupati · "No signing date on record"
5. Daikin Industries · Manufacturing · Operational · ₹1,000 Cr · Tirupati · Signed Sep 2021
6. Foxconn (Rising Stars / Bharat FIH) · Manufacturing · Stalled · "Amount not published" · Tirupati · Signed Aug 2015

Pagination row under the grid: "Page 1" with previous/next.

### Section 7: MoU full record (dialog / side panel opened from "Full record")

- Header: company name · agreement title · summit name
- Four figure tiles: Committed investment · Expected jobs · Sector · District ("not specified" when absent)
- Status badge with a plain-words explanation line beneath, one of:
  - Signed — "Signed means a memorandum exists — a promise on paper. No land, no construction, no jobs are implied yet."
  - Investment started — "The record shows work or investment has begun; the promise is being acted on."
  - Operational — "The record shows the promised facility is running."
  - Stalled — "The record shows the commitment has stalled — signed, but not moving."
  - Cancelled — "The record shows this commitment was cancelled after signing."
- Block "What the record says": the description as published
- Block "The announced schedule": a 3-step vertical stepper — "MoU signed" → "Projected start (as announced)" → "Expected completion (as announced)", completed steps filled, others outlined. Note beneath: "Start and completion here are the announcement's own projections — whether they were kept is exactly what the status above tracks, from the record, not from us."
  - When no dates exist, replace the stepper with: "No dates were published with this commitment — we show none rather than estimate."
- Footer line: "Record source: NTPC Limited (official) ↗ · in our register since 26 Aug 2026"
- Close button; on mobile the panel is full-screen.

### Section 8: States to design

- Empty (filters): "No MoUs match these filters" with a "Clear filters" button
- Empty (no data): title "No investment records synced yet", body "MoU records appear here as our collectors mirror official investment announcements. We show nothing until there is something real to show."
- Error (API down): a bordered card, title "Can't reach the data server", body "Investment records load live from our database, and the backend API isn't responding right now. Nothing on this page is cached or invented."
- Loading: "Loading investment records…" with skeleton cards

---

## PAGE B — GOVERNMENT INVESTMENT DIVE (route: /investments/tenure/:key)

Reached from "Dive into this government's record →". Design it for the YSRCP example; the other two follow the same layout.

### Section 1: Header
- Back link: "← All investments"
- Title: **YSRCP — investment commitments on record** · date range "30 May 2019 to 11 Jun 2024"
- Party colour stripe across the top of the page

### Section 2: Three tiles
- "MoUs on record" — **8** — "signed in this term"
- "Investment promised" — **₹2.75 L Cr** — "across the 7 that name an amount"
- "Jobs promised" — **40,720** — "across the 3 that state a figure"

### Section 3: "Read these numbers correctly" (a bordered explanatory box, always visible, never collapsible)
- "Every commitment here is counted by **the signing date on its own record**, and every amount is the announcement's own figure. An MoU is a promise on paper: it is not money spent, land allotted, or a job created."
- "**This is a floor, not a full tally.** Our register holds 8 commitments signed in this term, of which 7 state an investment amount. The state's own summit tally for the same term is 386 MoUs." Link: "Where these records come from →"

### Section 4: Status breakdown (5 rows, count bars, each with its one-line plain-words meaning)
- Operational — 4 — "The record shows the promised facility is running."
- Investment started — 4 — "The record shows work or investment has begun."
- Signed — 0 — "A memorandum exists. No land, no construction, no jobs are implied yet."
- Stalled — 0 — "Signed, but the record shows it is not moving."
- Cancelled — 0 — "Cancelled after signing."

### Section 5: Timeline of the term
Horizontal timeline from 30 May 2019 to 11 Jun 2024 with one dot per MoU at its signing month, company name on hover, dot colour by status. The Global Investors Summit (Mar 2023) marked as a labelled tick.

### Section 6: The records (same MoU cards as Page A, filtered to this term, sorted by date signed)

### Section 7: Empty variant (design once)
Title "TDP-led NDA — no investment commitments on record" (only if the term had none), body "Our register holds no MoU with a signing date inside 12 Jun 2024 to today. That means we have not documented one, not that none was signed." Link: "The documents we do hold →"

---

## Global rules for this section (repeat to Stitch at the end)

1. Never show a zero where the truth is "not published"; use the words.
2. "Announced" and "built" are never the same colour, weight, or fill.
3. Every figure sits next to the document it came from, as a chip or a footer line.
4. Telugu title sits beside English at equal weight; nothing is smaller for being Telugu.
5. Charts carry axis labels, value labels and a legend; each has an expand control.
6. No em-dash-heavy copy in labels; short sentences; digits always Latin (2019, ₹, %).
