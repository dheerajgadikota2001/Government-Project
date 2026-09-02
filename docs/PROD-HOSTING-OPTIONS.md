# AP Nadu Nedu — production hosting options (checked 2 Sep 2026)

What has to run: a **static React/Vite site** (CDN), a **FastAPI API** (always-on preferred — cold starts hurt a data site), **PostgreSQL** (~700 projects, seeds, community posts; small), optional **Redis** (cache/Celery), and **scheduled scrapers** (MoSPI monthly, CRDA tenders daily, AP portals). Two constraints shape the choice: **readers are in India** (serve from Mumbai/Bangalore/Singapore), and **several AP portals are India-only** (e-procurement), so scrapers must run from an Indian IP or from your PC.

Prices are list prices from the providers' own pricing pages on the date above; INR is approximate at ₹88/$ and €1≈$1.15. Everything changes — re-check before paying.

## Master comparison

| Platform | What it hosts for us | Free tier (real limits) | Cheapest paid that fits us | India / nearest region | Sleeps / cold start? | Scrapers from here? | Verdict for this project |
|---|---|---|---|---|---|---|---|
| **Cloudflare Pages** | Frontend (static) | 500 builds/mo, unlimited bandwidth & requests, custom domain + SSL, 100 projects | $0 — Free covers a public data site indefinitely | Global CDN incl. Indian PoPs | No | n/a | **Best frontend choice.** Free, fast in India, no bandwidth bill ever. |
| **Vercel** | Frontend | Hobby: 100 GB transfer/mo, 1M edge requests — **non-commercial use only** | Pro $20/member/mo, 1 TB | Global CDN | No | n/a | Fine technically; Hobby ToS is a grey area for a public platform; Pro is overkill. |
| **Firebase Hosting** | Frontend | Spark: 10 GB storage, **360 MB/day transfer** (≈11 GB/mo) | Blaze: $0.15/GB after 360 MB/day | Global CDN | No | n/a | The 360 MB/day cap is small for a chart-heavy site; you already hit its no-purge caching issue in code. |
| **Render** | API, Postgres, cron, Redis | Web service 512 MB **spins down when idle** (cold start ~30-60 s); Postgres free 256 MB RAM / 1 GB; Key-Value 25 MB | Web $7/mo (512 MB) + Postgres $6/mo (256 MB) = **$13/mo ≈ ₹1,150**; cron $0.00016/min; 5 GB egress then $0.15/GB | Singapore (no India) | Free: yes. Paid: no | Singapore IP — India-only portals blocked | Simplest PaaS; your repo already has a Render deploy hook. Free tier's sleep makes first load feel broken. |
| **Railway** | API, Postgres, Redis, cron | $5 trial credit, 30 days, then $1/mo minimum (no true free) | Hobby $5/mo incl. $5 usage; ~$0.028/vCPU-hr, ~$0.014/GB-hr, egress $0.05/GB → realistic **$8-12/mo ≈ ₹700-1,050** for API+PG+Redis | Singapore (no India) | No | Singapore IP | Best developer experience among PaaS; usage billing needs watching. |
| **Fly.io** | API, Postgres, Redis | None (card required); no monthly minimum | shared-cpu-1x 512 MB $3.19/mo; 1 GB $5.70/mo; Postgres = machines + volumes (≈$5-10); Asia egress $0.04/GB → **~$10-15/mo ≈ ₹900-1,300** | **Mumbai (bom)** ✔ | No (can auto-stop) | **Mumbai IP ✔** | Only PaaS with a Mumbai region. Postgres is self-managed unless you take Managed Postgres. |
| **Google Cloud Run** (your existing `ap-nadu-nedu` project) | API (+ Jobs for scrapers) | 240k vCPU-s + 450k GiB-s + 2M requests/mo free; Mumbai is Tier 1 | Beyond free ≈ $0.000018/vCPU-s; 1 warm min-instance ≈ $6-8/mo; realistic **$0-10/mo** | **asia-south1 Mumbai** ✔ | Yes unless min-instances=1 | **Mumbai IP ✔** (Cloud Run Jobs / Scheduler) | Cheapest serious option per request; needs a DB elsewhere (Cloud SQL is the expensive part). |
| **Google Cloud SQL** | Postgres | $300 new-customer credit only | db-f1-micro ≈ $7.67/mo + $0.17/GiB-mo storage, **no SLA** → ~$10/mo ≈ ₹880 | Mumbai ✔ | No | n/a | Works with Cloud Run; pricier than Neon for the same tiny DB. |
| **Neon** | Postgres (serverless) | 0.5 GB storage, 100 compute-hours/mo, autosuspend after 5 min, 5 GB egress | Launch: pay-as-you-go, $0.106/CU-hr + $0.35/GB-mo (≈ $5-15/mo) | Singapore (AWS ap-southeast-1) | Yes (autosuspend, ~sub-second resume) | n/a | Excellent free DB for our size; branching is handy for seed reloads. Pair with Cloud Run or Fly. |
| **Supabase** | Postgres | 500 MB, 5 GB egress, **pauses after 1 week idle**, 2 projects | Pro $25/mo (8 GB, 250 GB egress, Micro compute included) | Mumbai ✔ (AWS ap-south-1) | Free: pauses | n/a | Free tier pause is a trap for a low-traffic public site; Pro is the priciest DB here. |
| **DigitalOcean Droplet** | Everything on one VM (API + Postgres + Redis + cron via Docker Compose) | $200 credit for 60 days only | **$4/mo** (1 vCPU / 512 MB / 10 GB / 500 GB transfer); $6/mo 1 GB; $12/mo 2 GB ≈ ₹1,050 | **Bangalore (BLR1)** ✔ | No | **Bangalore IP ✔ — best for AP portals** | **Best all-in-one for ₹500-1,000/mo.** You own the box: backups, updates and Postgres are on you (1-2 hrs/month). |
| **Hetzner Cloud** | Everything on one VM | None | Germany CX23 €5.49/mo (cheap, but Europe); **Singapore CPX12 €15.49/mo ≈ ₹1,560** after the June-2026 price rise | Singapore (no India) | No | Singapore IP | Great value only in Germany; Singapore is now dearer than DigitalOcean Bangalore. |
| **Oracle Cloud Always Free** | Everything on one VM | Ampere A1 **2 OCPU / 12 GB** (halved from 4/24 in June 2026), block storage, 10 TB egress; Mumbai & Hyderabad regions | $0 (Pay-as-you-go account keeps 4/24 per support, unconfirmed) | **Mumbai / Hyderabad** ✔ | No | **Indian IP ✔** | The only genuinely free always-on server in India. Risks: capacity shortages when creating, unannounced limit cuts, instances stopped if over limit. Fine as a ₹0 start, not as the only copy of anything. |
| **GitHub Actions (cron)** | Scrapers only | Free unlimited minutes on public repos; 2,000 min/mo private | Beyond: $0.008/min | US runners | n/a | **No** — US IP; India-only portals fail | Good for MoSPI/CAG/PIB (global sites); useless for e-procurement. |
| **Your Windows PC (Task Scheduler)** | Scrapers only | ₹0 | electricity | Your ISP (Indian IP) ✔ | Off when PC is off | ✔ | What you have today; fine until the platform is public, then move to a server. |
| **Cloudflare (DNS + proxy + WAF)** | In front of everything | Free: DNS, SSL, DDoS, caching rules, 100k Workers requests/day | Pro $20/mo (not needed) | Indian PoPs ✔ | No | n/a | Put the API behind it too — free edge caching of `s-maxage` responses, hides the origin IP. |
| **Domain (.in / .org)** | — | — | ≈ ₹700-1,200/yr | — | — | — | Buy at Cloudflare Registrar or any Indian registrar; keep DNS on Cloudflare. |

## Three ways to put it together

| Package | Frontend | API | Database | Redis / cron | Monthly cost | Trade-off |
|---|---|---|---|---|---|---|
| **A. ₹0 launch** | Cloudflare Pages | Oracle Always Free VM (Mumbai) running Docker Compose | Postgres on the same VM (nightly dump to Cloudflare R2 free 10 GB) | Same VM | **₹0 + domain** | Free but fragile: Oracle can trim limits or lack capacity; you carry ops. Good to go public and learn traffic. |
| **B. Recommended: ₹1,000-1,200/mo** | Cloudflare Pages | **DigitalOcean $12 droplet, Bangalore** (2 GB) — FastAPI + Postgres + Redis + cron in Docker Compose, weekly DO backups (+20%) | Same droplet | Same droplet | **≈ $14.40 ≈ ₹1,270** all-in | Indian IP for every scraper, no cold starts, one box to understand. Postgres backups and OS updates are yours (automate day one). |
| **C. Managed, ₹900-1,800/mo** | Cloudflare Pages | **Cloud Run, Mumbai** (min-instances 1) + Cloud Run Jobs + Cloud Scheduler for scrapers | **Neon** free → Launch when it outgrows 0.5 GB | Upstash Redis free tier / skip Redis | **≈ $8-20 ≈ ₹700-1,800** | Zero servers to patch, scales on its own, Indian IP for scrapers. More moving parts and two dashboards; GCP billing needs a budget alarm (you already set one). |

## What I'd do, in order

1. Buy the domain; put DNS on Cloudflare (free).
2. Deploy the frontend to Cloudflare Pages now — free, no downside, immediate India speed.
3. Start the backend on **Package B** (DigitalOcean Bangalore, $12). It is the only option where *everything* — API, DB, Redis, every scraper — sits on one Indian machine for about the price of a coffee a week. Your `backend/Dockerfile` already exists; add a `docker-compose.yml` with Postgres + Redis + a cron container.
4. Enable DO automated backups and a nightly `pg_dump` to Cloudflare R2 (free 10 GB). The seeds are in git; the DB is the only thing that can be lost.
5. Move to Package C only if traffic makes the droplet sweat — Cloud Run + Neon is the clean upgrade path and your GCP project already exists.
6. Rotate `ADMIN_KEY` and any keys pasted in chat before the first public deploy.

## Sources (pricing pages read 2 Sep 2026)
Render pricing · Railway pricing · Fly.io pricing · Cloud Run pricing · Cloud SQL pricing · Neon pricing · Supabase pricing · Cloudflare Pages limits · Vercel pricing · Firebase pricing · DigitalOcean Droplet pricing · Hetzner price adjustment 15 June 2026 · InfoQ on Oracle Always Free limit change (July 2026).
