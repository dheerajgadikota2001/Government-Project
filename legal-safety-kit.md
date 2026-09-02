# AP Nadu Nedu — Legal Safety Kit
Ready-to-paste text + exactly where each piece goes on the site.

---

## 1. Branding rule (no emblem)

Never use: the AP state emblem, the national Lion Capital, any government seal, official department logos, or photos of the CM/ministers as part of your branding.

Instead: a simple original logo — the letters **"NN"** as a monogram, or the Telugu **"నా–నే"**, or an abstract mark (an upward arrow, an open eye, a checkmark grid). Any designer or even Stitch can generate this. Header shows: [your logo] + "AP Nadu Nedu" wordmark.

---

## 2. Global footer disclaimer (appears on EVERY page)

> **AP Nadu Nedu is an independent, citizen-run transparency initiative.** We are not affiliated with, endorsed by, or connected to the Government of Andhra Pradesh or any of its departments. All information on this platform is sourced from publicly available official government portals and is presented as published there, with source links and timestamps.

Telugu version (place beside or below the English):

> **ఏపీ నాడు–నేడు ఒక స్వతంత్ర పౌర పారదర్శకత వేదిక.** ఇది ఆంధ్రప్రదేశ్ ప్రభుత్వానికి గానీ, దాని శాఖలకు గానీ సంబంధించినది కాదు. ఇక్కడి సమాచారం అధికారిక ప్రభుత్వ పోర్టళ్ల నుండి సేకరించబడింది.

---

## 3. Per-card source line (on EVERY data card — projects, tenders, documents, MoUs)

Bottom of each card, small text:

> Source: [AP eProcurement Portal ↗] · Last synced: 24 Aug 2026, 6:15 PM IST

Rules:
- The source name is always a clickable link to the ORIGINAL page on the government portal
- The timestamp is when YOUR scraper last fetched it, in IST
- Never display scraped data without both of these

This one line is your strongest protection. It converts "your site published false information" into "we mirrored what the official portal displayed at this timestamp — here is the link."

---

## 4. Site-wide data freshness indicator (in the header or below the hero)

> 🟢 Data synced from official portals every 6 hours · Last sync: 6:15 PM IST

If a source fails to sync for more than 24 hours, show:

> 🟡 [Source name] data may be outdated — last successful sync: [date]. View the official portal for the latest.

---

## 5. News cards — special rules

- Headline links to the ORIGINAL article on the publisher's site — you never host the full article text
- Show only your AI summary, labeled clearly:

> ✨ AI-generated summary — may contain errors. [Read the full article at Sakshi ↗]

- Source name + logo initials always visible (PIB, Sakshi, Eenadu, etc.)

---

## 6. Full Disclaimer page (route: /disclaimer — linked in footer)

### Who we are
AP Nadu Nedu is an independent, non-governmental transparency platform built and maintained by private citizens. We have no affiliation with the Government of Andhra Pradesh, the Government of India, or any political party.

### Where our data comes from
Every data point displayed on this platform is collected from publicly accessible official sources, including the AP e-Procurement portal, the Government Order Issue Register (GOIR), the Open Government Data platform (data.gov.in), official press releases, and published news reports. Each item links to its original source with the date and time we last retrieved it.

### Accuracy
We display data as published by the original sources. We do not modify, editorialize, or alter figures. However, government portals update, correct, and remove information without notice, so what you see here may lag behind the official source. **Always verify against the linked original source before acting on any information.** This platform is provided for general public awareness only and is not legal, financial, or official advice.

### Corrections
If you believe any information displayed here is inaccurate, outdated, or should not be displayed, email us at **corrections@[yourdomain]** with a link to the item. We review all requests within 48 hours and will correct, update, or remove content where warranted.

### Copyright
Government orders, notifications, and public records are reproduced under the exemptions provided in the Copyright Act, 1957 (Section 52). News headlines and summaries link to and credit their original publishers; full articles remain on the publishers' sites.

### Contact
[Your email] · We respond to all correction and takedown requests.

---

## 7. About page one-liner (route: /about)

> Government work in Andhra Pradesh is spread across dozens of portals — hard to find, harder to follow. AP Nadu Nedu puts it in one place: every project, every tender, every rupee, with a link back to the official source. Built by citizens, for citizens. Free forever.

---

## 8. Where each piece goes — checklist

| Text | Location | Status |
|---|---|---|
| Footer disclaimer (EN + TE) | Footer of every page | ✅ Done — Footer.jsx rewritten 2026-08-24 |
| Source + timestamp line | Project/document detail pages | ✅ Done — SourceDocuments.jsx + Documents.jsx provenance lines |
| Source + timestamp line | Projects/Investments/Tenders LIST cards | ⬜ Not done yet — only detail pages have it so far |
| Freshness indicator | Header strip or below hero | ⬜ Not done — no site-wide "last synced" indicator yet |
| AI summary label | Every news card summary box | ⏸ Paused — News section is "Coming soon" (no scraper working yet, see SOURCES_STATUS.md) |
| Disclaimer page | /disclaimer, linked from footer | ✅ Done — 8 sections incl. Section 52 copyright, corrections policy |
| About page | /about, linked from footer | ✅ Done — states "we create nothing" pledge + source registry |
| Corrections email | Disclaimer page + footer | ⚠️ Placeholder only — corrections@apnadunedu.in is not a real inbox yet. **You need to set this up** (any real email works; a working takedown channel is your single strongest protection) |
| Own logo (no emblem) | Header, favicon, social cards | ⬜ Not designed yet |

---

## 9. Scraper etiquette (avoids the IT Act angle entirely)

- Sync on a schedule: every 4–6 hours, never continuous
- 2–5 second delay between page requests
- Descriptive User-Agent: `APNaduNedu-Bot/1.0 (+https://yourdomain/about)`
- Cache everything in your own DB — never hit their servers per user visit
- Scrape during off-peak hours (late night IST) where possible
- If a portal adds a login wall or CAPTCHA to something, treat it as "no longer public" and stop scraping that section
