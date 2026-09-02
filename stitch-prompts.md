# AP Nadu Nedu — Google Stitch Prompts (Content + Layout Only)

**How to use:** Stitch works best one screen at a time. First paste the APP CONTEXT block, then paste one page prompt per generation. No colors, fonts, or visual styles are specified — Stitch decides the design.

---

## APP CONTEXT (paste this before every page prompt)

App name: AP Nadu Nedu (Telugu: నాడు–నేడు, "Then & Now")
Tagline: ప్రజల పాలన · People's Governance

This is a citizen-facing web platform for the state of Andhra Pradesh, India. It solves one problem: government work — projects, spending, tenders, investments, and promises — is scattered across dozens of portals and impossible for a normal citizen to follow. This platform puts all of it in one place, verified and public. The platform is bilingual: English primary, Telugu secondary.

Every page shares:

STICKY TOP NAVIGATION BAR:
- Left: an original "NN" monogram logo (NOT any government emblem or official seal) + "AP Nadu Nedu" wordmark
- Center links: Home · Projects · Investments · News · Documents (current page indicated as active)
- Right: search icon, language toggle [EN | TE], "Report Issue" button

FOOTER:
- Brand name + tagline "ప్రజల పాలన · People's Governance"
- Disclaimer block: "AP Nadu Nedu is an independent, citizen-run transparency initiative. We are not affiliated with, endorsed by, or connected to the Government of Andhra Pradesh or any of its departments. All information is sourced from publicly available official government portals, with source links and timestamps."
- Links: About · Disclaimer · Privacy Policy · RTI Portal · Contact · Report a Correction
- Bottom line: "© 2024 AP Nadu Nedu. Built by citizens, for citizens."

DATA ATTRIBUTION (on every data card across all pages):
- Small footer line on each project/tender/document/MoU card: "Source: [portal name] ↗ · Last synced: [date, time] IST"
- News cards: AI summary labeled "AI-generated summary — may contain errors" + headline links to the original publisher

FLOATING ASSISTANT BUTTON (fixed bottom-right corner on every page):
- Round button with an assistant/robot icon
- Tooltip on hover: "Ask Mitra · AP's AI Assistant"

---

## PAGE 1 — HOME / DASHBOARD (route: /)

### Section 1: Hero (full-width, tall, with a background photo of an Andhra Pradesh landscape — river, dam, or coastline — behind the text)

Content, top to bottom, centered:
1. Small live badge: "LIVE · Updated 6 minutes ago"
2. Main headline (big, bold):
   **"Every Project. Every Rupee. Every Promise. Tracked."**
3. Telugu subline: "ప్రతి ప్రాజెక్ట్. ప్రతి రూపాయి. ప్రతి హామీ."
4. Supporting line: "Government work in Andhra Pradesh is scattered across dozens of portals. We put all of it in one place — 12,450 projects, live tenders, ₹1.45 lakh crore in investments, and daily news. Verified. Public. Free."
5. Large search bar with placeholder: "Search projects, districts, departments, or G.O. numbers..." with a mic icon and a Search button

### Section 2: Four stat cards (row of 4, directly below the hero, slightly overlapping it)

Card 1 — TOTAL PROJECTS: 12,450 — sub-note "+340 added this month" — small progress indicator
Card 2 — ACTIVE TENDERS: 1,892 — sub-note "45 closing in the next 7 days" — small trend sparkline
Card 3 — INVESTMENTS: ₹45.2K Cr — sub-note "Foreign Direct Investment: 32%" — small donut chart
Card 4 — MoUs SIGNED: 342 — sub-note tags "Energy · Tech · +10 sectors" — small trend line

### Section 3: Featured Projects (3 cards in a row)

Section title: "Featured Projects | ముఖ్యమైన ప్రాజెక్టులు" with a "View All →" link on the right

Card 1: photo of a dam/river · status badge "In Progress" · title "Polavaram Irrigation Project" · description "Multi-purpose dam on the Godavari River bringing water to 7 lakh acres across 3 districts." · footer: location "Eluru" + cost "₹55,548 Cr"

Card 2: photo of an airport · status badge "Phase 2 Commenced" · title "Bhogapuram International Airport" · description "Greenfield international airport to boost Vizag's connectivity and the regional economy." · footer: location "Vizianagaram" + cost "₹4,592 Cr"

Card 3: photo of a port/harbor · status badge "Planning" · title "Ramayapatnam Deep Water Port" · description "New deep-water port to handle industrial cargo and international trade in Nellore." · footer: location "Nellore" + cost "₹3,736 Cr"

### Section 4: Explore by Category (6 tiles, 3×2 grid)

Tiles with icon + label + one-line description:
1. Projects — "Track 12,450 projects district by district"
2. Tenders — "Live tenders with deadlines and documents"
3. Investments — "Every MoU and where it stands today"
4. News — "Government news with AI summaries"
5. Documents — "G.O.s, budgets, audits — searchable"
6. Search — "Find anything across the platform"

---

## PAGE 2 — PROJECTS LIST (route: /projects)

### Section 1: Page header
- Title: "Government Projects" with Telugu "ప్రభుత్వ ప్రాజెక్టులు" beside it
- Subtitle: "Showing 4,281 active and completed projects across Andhra Pradesh."

### Section 2: Status summary chips (row of 4 pill counters)
- 1,245 Under Construction
- 2,108 Completed
- 142 Delayed
- 786 Announced

### Section 3: Filter bar (sticky card)
- Dropdown "District" (options: Visakhapatnam, Srikakulam, Vizianagaram, West Godavari, Krishna, Guntur, Nellore, Kurnool, Anantapur, Chittoor)
- Dropdown "Project Type" (Infrastructure, Irrigation, Health, Education, Roads, Power, Housing)
- Dropdown "Status" (Announced, Under Construction, Completed, Delayed)
- Search input: "Project name, ID, department..."
- "Reset Filters" link

### Section 4: Project cards grid (3 columns)

Each card contains, top to bottom:
- Project type label + status badge
- Project title (max 2 lines)
- Location line · Department line
- "Est. Cost" figure and "Progress" percentage side by side
- A progress bar reflecting the percentage
- Card footer: "Updated: date" on the left, "View Details →" link on the right

Fill with these 4 (repeat pattern for more):
1. Infrastructure · Under Construction · "Visakhapatnam Metro Rail Project Phase 1" · Visakhapatnam, Gajuwaka Mandal · Dept. of Municipal Administration · ₹14,300 Cr · 45% · Updated 12 Oct 2024
2. Irrigation · Completed · "Polavaram Right Main Canal Modernization" · West Godavari, Polavaram Mandal · Water Resources Department · ₹2,450 Cr · 100% · Updated 05 Sep 2024
3. Health · Delayed · "New Government General Hospital Construction" · Kurnool Urban · Dept. of Health & Family Welfare · ₹520 Cr · 32% · Updated 28 Aug 2024
4. Education · Announced · "Digital Classrooms Initiative Phase 3" · Statewide · School Education Department · ₹850 Cr · 0% · Updated 20 Oct 2024

### Section 5: Pagination
"Showing 1 to 12 of 4,281 results" · Previous · 1 2 3 … 357 · Next

---

## PAGE 3 — PROJECT DETAIL (route: /projects/:id)

### Section 1: Breadcrumb
Home / Projects / Visakhapatnam Metro Rail

### Section 2: Project header card
Left side:
- Category eyebrow: "INFRASTRUCTURE · URBAN TRANSIT"
- Title: "Visakhapatnam Metro Rail Project — Phase 1"
- Telugu: "విశాఖపట్నం మెట్రో రైలు ప్రాజెక్ట్ — దశ 1"
- Status badge: "Under Construction"
- Meta row: Visakhapatnam, Gajuwaka Mandal · Dept. of Municipal Administration · Approved: Jan 2019

Right side (key figures panel):
- Est. Cost: ₹14,300 Cr
- Funds Released: ₹8,420 Cr (59% of budget)
- Expected Completion: Dec 2026

### Section 3: Overall progress
- Label "Overall Completion" with "45%" on the right
- A large, prominent progress bar
- Caption: "Last updated: 12 Oct 2024 · Source: AP Urban Development Authority"

### Section 4: Key facts grid (2×2 cards)
1. Project Type: Urban Metro Rail · 42.55 km total · 30 stations
2. Funding: JICA + State Government · Foreign loan component: ₹5,800 Cr
3. Coverage: District Visakhapatnam · Mandals: Gajuwaka, Bheemunipatnam
4. Clearances: DPR Approved · Environmental clearance obtained

### Section 5: Two-column body
Left column (main, with an EN/TE language toggle at top):
- Heading "Project Overview"
- Paragraph: "The Visakhapatnam Metro Rail is a 42.55 km elevated rapid transit system across two corridors — Steel Plant to Old Town (24.2 km) and Bheemunipatnam to Kommadi (18.35 km). Executed under VMRDA with JICA financing, Phase 1 covers civil construction of viaducts, stations, and depot facilities. Over 3 lakh daily commuters are expected to benefit, significantly reducing road congestion in Vizag."

Right column (sidebar):
- "Project Timeline" card, vertical list with completed/current/upcoming states:
  - Jan 2019 — DPR Approved (done)
  - Mar 2020 — Land Acquisition Complete (done)
  - Aug 2021 — Civil Works Begin (done)
  - Oct 2024 — Viaduct 65% Complete (CURRENT, highlighted)
  - Dec 2026 — Target Completion (upcoming)
- "Data Sources" card with links: AP Urban Development Authority · VMRDA Official Portal · JICA Project Page · "Last verified: 12 Oct 2024"

### Section 6: Route map
Full-width map image of the metro corridor over the Vizag city map. Caption: "Proposed Metro Corridor — 42.55 km, 2 lines, 30 stations"

### Section 7: Related News
Heading "Related News" + 3 compact news cards (source, timestamp, headline, "Read →" link)

---

## PAGE 4 — INVESTMENTS & MoUs (route: /investments)

### Section 1: Page header
- Title: "Investments & MoUs" with Telugu "పెట్టుబడులు & అవగాహన ఒప్పందాలు"
- Subtitle: "Tracking ₹1,45,000 Crores committed across 124 strategic MoUs to drive industrial and economic growth in Andhra Pradesh."

### Section 2: Four stat cards
1. Total Investment — ₹1.45L Cr
2. Total MoUs — 124 Signed
3. Expected Jobs — 2.8L Created
4. FDI Count — 32 Foreign

### Section 3: Sticky filter bar
- Search input: "Search Company or MoU..."
- Dropdowns: All Sectors (Manufacturing, IT/Tech, Ports & Logistics, Renewable Energy, Pharma) · All Statuses (Signed, Investment Started, Operational, Stalled) · All Districts

### Section 4: MoU cards (2-column grid)

Each card contains:
- Company name + sector tag + country of origin
- Status badge
- A highlighted figures strip: "Committed Investment" amount and "Expected Jobs" count
- Detail rows: location · date signed · summit/event where signed
- Footer link: "View Detailed Report →"

Fill with:
1. Kia Motors India · Automotive · South Korea · Operational · ₹13,500 Cr · 11,000 jobs · Anantapur District · Apr 2017 · AP Partnership Summit 2017
2. ArcelorMittal Nippon Steel · Manufacturing · Japan/India · Investment Started · ₹45,000 Cr · 25,000 jobs · Kakinada SEZ · Jan 2024 · Invest AP Summit 2024
3. Adani Green Energy · Renewables · Domestic · Signed · ₹12,000 Cr · 5,000 jobs · Kurnool Solar Park · Dec 2023 · AP Clean Energy 2023
4. Global Tech Park Consortium · IT/Tech · Multi-national · Signed · ₹8,200 Cr · 35,000 jobs · Visakhapatnam · Feb 2024 · Invest AP Summit 2024

### Section 5: Pagination

---

## PAGE 5 — NEWS AGGREGATOR (route: /news)

### Section 1: Breaking news ticker (thin full-width strip above the page header)
- "LATEST" badge on the left
- Continuously scrolling headlines: "AP Infra: New expressway approved for Coastal Andhra · Agriculture: MSP increased for Kharif crops, 50 lakh farmers to benefit · Education: Digital classrooms reach 10,000 schools · Health: New super-specialty hospital inaugurated in Visakhapatnam · Economy: FDI in AP manufacturing hits record high in Q3"

### Section 2: Page header
- Title: "AP Government News" with Telugu "ఆంధ్రప్రదేశ్ ప్రభుత్వ వార్తలు"
- EN/TE language toggle on the right

### Section 3: Filter bar
- Search: "Search news, topics, or keywords..."
- Dropdowns: Category (Infrastructure, Agriculture, Education, Health, Economy) · Source (Sakshi, Eenadu, PIB, AP Gov Press) · District

### Section 4: News cards grid (3 columns)

Each card contains, top to bottom:
- Category tags + relative timestamp
- Headline (bold, max 2 lines)
- Source: small avatar with initials + full source name
- An "AI Summary" box — a distinct inset panel with a small "AI Summary" badge attached to its top edge, containing a 2–3 line machine-generated summary
- Full-width button: "Read Full Article ↗"

Fill with:
1. [Infrastructure · Visakhapatnam] · 2h ago · "Bhogapuram International Airport Development Enters Phase 2" · PIB, Press Information Bureau · AI Summary: "The state has initiated Phase 2 of the Bhogapuram airport project — terminal construction and runway extension to accommodate 6 million passengers annually by 2026."
2. [Agriculture] · 5h ago · "YSR Rythu Bharosa: Third Tranche Funds Released to Farmers" · SAK, Sakshi News · AI Summary: "The CM deposited ₹1,090 crore into the accounts of 50 lakh eligible farmers — the third and final installment of the current agricultural year."
3. [Education · Statewide] · 1d ago · "Nadu-Nedu Phase II Commences in 15,000 Government Schools" · EEN, Eenadu · AI Summary: "Phase 2 targets smart classrooms, clean drinking water, and upgraded sanitation across 15,000 public schools."
4. [Health · Guntur] · 1d ago · "New Medical College Construction Ahead of Schedule" · GOV, AP Govt Portal · AI Summary: "Officials report 60% completion of the Guntur government medical college; inauguration moved up to August 2024."

### Section 5: Pagination

---

## PAGE 6 — DOCUMENT LIBRARY (route: /documents)

### Section 1: Page header
- Title: "Document Library" with Telugu "పత్రాల భాండాగారం"
- Subtitle: "Access official Government Orders, budget documents, audit reports, and policy papers published by the AP Government."

### Section 2: Four mini stat tiles (compact row)
- 24,500+ Total Documents
- 12,890 Govt. Orders
- 3,240 Policy Papers
- 480 Audit Reports

### Section 3: Sticky filter bar
- Search: "Search documents, G.O. numbers..."
- Dropdowns: Document Type (Budget, Assembly Bill, Government Order, Policy, Audit Report, White Paper) · Department (Finance, Revenue, Health & Family Welfare, Agriculture, IT & Electronics, Social Welfare) · Year (2024, 2023, 2022, 2021)

### Section 4: Featured Documents (3 cards in a row)

Each card contains:
- Document type icon + type label
- Document title
- Department · publish date · file size
- Language availability chips
- View count + download count
- Two buttons: "Download" and "View"

Fill with:
1. Budget · "State Budget 2024-25" · Finance Department · Feb 15, 2024 · 14.2 MB · English + Telugu · 45,230 views · 12,450 downloads
2. Audit Report · "CAG Report 2023" · Finance Department · Nov 20, 2023 · 8.5 MB · English only · 18,760 views · 5,890 downloads
3. Policy · "IT Policy 2024-27" · IT & Electronics Department · Jan 5, 2024 · 5.1 MB · English + Telugu · 9,340 views · 3,210 downloads

### Section 5: All Documents table
Columns: Document Info | Department | Date | Language Status | Actions

Rows:
1. [G.O.] "G.O.Ms.No.45 — Revenue Department Land Reforms" · Revenue Department · Mar 10, 2024 · English ✓, Telugu ✓ · Download / View
2. [Report] "Annual Health Infrastructure Report 2023" · Health & Family Welfare · Dec 18, 2023 · English ✓, Telugu ✓ · Download / View
3. [Policy] "AP Agriculture Policy Framework 2024" · Agriculture Department · Feb 2, 2024 · English ✓, Telugu pending · Download / View
4. [Budget] "Municipal Corporations Expenditure Statement Q3" · Finance Department · Jan 30, 2024 · English ✓, Telugu pending · Download / View
5. [G.O.] "G.O.Rt.No.112 — Social Welfare Housing Scheme Guidelines" · Social Welfare · Mar 25, 2024 · English ✓, Telugu ✓ · Download / View

Table footer: "Showing 1–5 of 24,500 documents" + pagination

---

## PAGE 7 — SEARCH RESULTS (route: /search)

### Section 1: Large search bar (top of page, prominent)
- Current query shown in the input: "water infrastructure"
- Mic icon inside the input · language selector [EN] · a Search button

### Section 2: Results meta row
- Left: "1,248 results for 'water infrastructure'"
- Right: Sort by dropdown (Relevance, Date Newest, Date Oldest, Cost High to Low)

### Section 3: Filter tabs (horizontal pill row, first one active)
All (1.2k) · Projects (450) · Tenders (312) · Investments (85) · News (215) · Documents (186)

### Section 4: Result cards (full-width vertical list, mixed result types)

Result 1 — a PROJECT result:
- Type badge "PROJECT" + status badge "Completed"
- Title: "Polavaram Water Supply Phase 1"
- Meta row: West Godavari · Water Resources Dept. · ₹12,450 Cr
- Snippet: "Delivers water to over 7 lakh acres of agricultural land across Krishna, West Godavari, and East Godavari districts."
- Link: "View Project Details →"

Result 2 — a TENDER result:
- Type badge "TENDER" + status badge "Open for Bids"
- Title: "Rural Water Purification Units — 200 Villages"
- Meta row: Srikakulam & Vizianagaram · Dept. of Rural Water Supply · Tender ID TDR-2024-RWS-04512
- Urgent line: "Bid Deadline: Dec 15, 2024"
- Snippet: "Supply, installation, and commissioning of solar-powered water purification units across 200 rural villages. Includes 3-year AMC. EMD: ₹12 Lakhs."
- Link: "View Tender & Download Docs →"

Result 3 — a NEWS result (with a thumbnail image on the right side):
- Type badge "NEWS"
- Title: "₹1,000 Crore Allocated for Clean Water Initiative in AP"
- Meta row: 3 days ago · AP Govt Press
- Snippet: "The State Cabinet approved a ₹1,000 crore allocation for expanding access to clean drinking water across all 13 districts, with a focus on fluoride-affected regions in Nellore and Prakasam."
- An inset "AI Summary" panel: "Cabinet clears ₹1,000 Cr clean water fund — 13 districts covered, fluoride-affected zones prioritised."
- Link: "Read Full Article →"

### Section 5: Pagination
"Showing 1 to 10 of 1,248 results" · Previous · 1 2 3 … 125 · Next
