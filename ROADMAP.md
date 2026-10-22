# AP Nadu Nedu — Roadmap & Working Checklist

Last updated: 2026-08-25. Working style: one thing at a time, verified before moving on.

## NOW — current sprint (data completeness)

- [x] Postgres + Alembic migrations live
- [x] CAG audit reports scraper — 73 real documents
- [x] AP Finance budget volumes scraper (built; run pending confirmation)
- [x] Frontend wired to backend: Documents, Projects, Investments
- [x] Citation-backed seed data: 8 projects + 10 MoUs (loader delivered)
- [x] Complete AP data-source map (DATA-SOURCES.md, 12 categories)
- [ ] **NeVA assembly Q&A scraper** (apa.neva.gov.in) — ministers' answers = official project figures ← IN PROGRESS
- [ ] District S3WaaS scraper — one scraper × 26 district sites (documents + press)
- [ ] PIB "Andhra Pradesh" tag scraper — central announcements
- [ ] PAIMANA mega-project reports (ipm.mospi.gov.in)
- [ ] Wire ProjectDetail + Home pages to the API (last two sample-data pages)

## THE ACCOUNTABILITY LAYER — per-government truth (agreed 2026-08-25)

The platform's core promise: show what each government actually did, from data,
so a rural reader can check any politician's claim. Three AP tenures since
bifurcation (2 June 2014): **TDP (Chandrababu Naidu) 8 Jun 2014 – 29 May 2019 ·
YSRCP (Jagan Mohan Reddy) 30 May 2019 – 11 Jun 2024 · TDP-led NDA (Chandrababu
Naidu) 12 Jun 2024 – present.**

Non-negotiable honesty rules for every tenure claim:
1. **Only dated, cited snapshots.** "X% under govt A, Y% under govt B" is shown
   ONLY when we hold official observations near both tenure boundaries
   (progress_observations table — built, live). No interpolation, no estimates.
2. **Name the level of government.** MoSPI projects are CENTRAL projects —
   never credited to a state tenure without saying so. AMRUT is centre+state+ULB
   shared. Every chart says whose money and whose execution.
3. **A project can span tenures.** We show the timeline, not a single credit.
   "Started under A (date), Z% by end of A (source), completed under B (date,
   source)" — the reader judges.
4. **Where data is missing, say so** ("no published figure for this period"),
   never fill gaps.
5. **Manifestos: verbatim quotes with page citations, linked to related data.
   No verdicts from us** — promise text beside the record, reader decides.
6. **Debt: never one number.** Budget documents vs CAG audit vs RBI State
   Finances side by side, including off-budget borrowings/guarantees where CAG
   states them — differences shown, sourced, unexplained gaps labeled as gaps.

Build order:
- [x] progress_observations table + MoSPI importer writes dated snapshot every run
- [x] Archive backfill script (import_mospi_archive.py) for old flash reports
- [ ] Backfill observations at tenure boundaries (~May 2019, ~May 2024 reports;
      older layouts may need parser extension — expected, planned)
- [ ] **State Finances section**: debt per year FY2015→now (Budget/CAG/RBI
      side-by-side), guarantees, per-tenure debt added; then sector spending
      per year (education, health, roads, irrigation) from RBI/budget volumes
- [ ] **Governments section**: tenure scorecard (projects completed, investment
      grounded vs announced, debt added — all cited) + "Dive deeper" per
      government → story-style detail pages with charts, written for rural
      readers (simple language, Telugu-ready)
- [ ] MoU lifecycle detail: phases table (Phase 1/2/3 with own status+dates),
      expected vs actual start; timeline on each investment page
- [ ] Manifesto tracker (verbatim promise → linked data), last — highest
      neutrality risk, needs the data layers above first

## NEXT — needs a decision/asset from Dheeraj

- [ ] India access for geo-blocked portals (GOIR, e-Procurement, APEDB, CORE): try VPN first, else Oracle Cloud free tier Mumbai
- [ ] Set up real corrections@ inbox (single strongest legal protection)
- [ ] Commit + push repo to GitHub; deploy backend (render.yaml exists, untested)

## LATER — Telugu everywhere (design principle agreed 2026-08-25)

Goal: every reader can use the platform fully in Telugu — page content AND document content.

The honest quality architecture (we never promise what tech can't deliver):
- **UI text (menus, labels, headings, fixed copy): hand-written Telugu, reviewed by a human Telugu speaker before shipping.** This layer CAN be error-free, because we control every string. Implement with i18n (react-i18next), strings in te.json reviewed line by line.
- **Dynamic content (document titles, descriptions, summaries): machine translation, ALWAYS labeled** "యంత్ర అనువాదం — తప్పులు ఉండవచ్చు" (machine translation — may contain errors) with the English original one tap away. Backend already has translation_status fields + Google Cloud Translate service stubbed.
- **PDF content: on-demand translation view** — extracted text translated server-side, shown beside/instead of original, same labeling, original PDF always linked. Never alter the original document.
- **Feedback loop: "translation wrong? tell us" link on every translated block** — reported strings get human-fixed and cached so the same error never shows twice.
- Telugu font rendering QA pass (Noto Sans Telugu), spacing/conjunct checks on real devices.

## NOW — Voice agent for rural Andhra Pradesh (agreed 2026-10-05)

Who it is for: the ~40% of AP that lives in villages and does not use apps. They
should be able to say "Hey <name>" to their phone, even while it is locked, and
hear what is happening in Telugu (Hindi if they ask for it), as a short story
first and in more detail only if they say yes. Same rule as the website: every
figure comes from our database, never from the model's memory.

One brain, several ways in. Build order:

- [ ] **1. The brain (text first).** `app/services/voice_agent/` + `POST /api/v1/voice/ask`.
      Claude with tools over our own API; Telugu default, Hindi on request; short
      answer then "more detail?"; neutral; "not published" instead of guesses.
      Eval set of rural-style questions in `tests/voice_agent_eval.json`.
- [ ] **2. Name + wake-word spike.** 2-3 candidate names (3-4 syllables, unusual
      sound, not an everyday Telugu word). Train on-device wake words (Porcupine or
      openWakeWord), test on 2-3 cheap Android phones: false triggers against hours
      of Telugu TV/street/temple audio, battery over a full day.
- [ ] **3. Voice bake-off.** Telugu + Hindi speech-to-text and voices tested on real
      recordings from coastal Andhra, Rayalaseema and Uttarandhra. Candidates:
      Sarvam AI, Google Chirp, AI4Bharat open models. Rural listeners pick.
- [ ] **4. Android app (native Kotlin).** Foreground microphone service with the
      on-device wake word, answers spoken on the lock screen, restarts on boot,
      "set as default assistant" so long-press power also works, one-time
      battery-optimisation exemption. Play Store microphone disclosure.
- [ ] **5. Website Mitra button** switches from keyword matching to the brain.
- [ ] **6. Pilot in 1-2 districts**, installs done by village/ward secretariat staff.
- [ ] **7. Phone line (checklist, later).** A toll-free / missed-call number for
      keypad phones that cannot run apps; same brain over a normal call through an
      Indian telephony provider.
- [ ] WhatsApp voice notes (later).
- [ ] Secretariat kiosk with the wake word (later).

Must be true before real users: fresh data (MoSPI edition, news source),
DPDP Act 2023 consent and no audio kept by default, election-period neutrality
checks in the eval set. iPhone cannot run a third-party always-listening app;
keypad phones are covered by the phone line.

## LATER — Growth & intelligence

- Site-wide "last synced" freshness indicator
- Per-project progress-over-time charts (we store every dated % — no portal offers this)
- Committed-vs-grounded investment tracking (announced ₹ vs actual groundbreaking)
- WhatsApp/Telegram share cards per project (how AP actually shares news)
- SEO: per-project pages indexed, Telugu keywords
- Public API for journalists/researchers
- Monthly "what changed this month in your district" digest
