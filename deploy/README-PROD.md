# Going live — Package B (Cloudflare Pages + one Bangalore droplet)

Cost: DigitalOcean 2 GB droplet $12/mo + 20% for automated backups ≈ **₹1,270/month**. Cloudflare Pages, DNS and R2 are free. Everything below is copy-paste; budget an evening.

What runs where:

| Piece | Where | Why |
|---|---|---|
| Static site (`ap-nadu-nedu/dist`) | Cloudflare Pages | Free, unlimited bandwidth, fast in India |
| API + Postgres + Redis + scrapers | One droplet in **Bangalore** | Indian IP — the AP portals that block foreign IPs answer from here |
| TLS for the API | Caddy on the droplet + Cloudflare in front | Automatic certificates; droplet IP never exposed |
| Backups | Nightly `pg_dump` on the droplet (14 days) + copy to Cloudflare R2 (60 days) | The database is the only thing not in git |

---

## 0. Before you start (10 min)

1. Buy the domain (Cloudflare Registrar or any Indian registrar). Add the site to **Cloudflare (free plan)** and point the registrar's nameservers at Cloudflare.
2. Rotate `ADMIN_KEY` (the one pasted in chat) and generate a `SECRET_KEY`: `python -c "import secrets;print(secrets.token_urlsafe(48))"`.
3. Commit and push the repo to GitHub (`main`), including the `deploy/` folder. **Never commit `deploy/.env.prod`.**

## 1. Droplet (15 min)

DigitalOcean → Create Droplet → Region **Bangalore (BLR1)** → Ubuntu 24.04 LTS → Basic, Regular, **2 GB / 1 vCPU ($12)** → tick **Enable backups** → add your SSH key → hostname `apnn-blr`.

SSH in as root, then:

```bash
apt update && apt -y upgrade
adduser deploy && usermod -aG sudo deploy && rsync -a ~/.ssh /home/deploy/ && chown -R deploy:deploy /home/deploy/.ssh
# Docker (official script) and let the deploy user run it
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
# firewall: only SSH + web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
# swap helps a 2 GB box during image builds
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Log out, log back in as `deploy`.

## 2. DNS (2 min, Cloudflare dashboard)

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api` | droplet IP | **Proxied (orange)** |
| CNAME | `@` and `www` | (Cloudflare Pages will tell you the target in step 5) | Proxied |

SSL/TLS → **Full (strict)**. (Caddy issues a real certificate on the droplet, so strict works.)

## 3. First deploy (15 min, as `deploy`)

```bash
git clone https://github.com/<you>/politics-platform.git && cd politics-platform
cp deploy/env.prod.example deploy/.env.prod && nano deploy/.env.prod     # fill every CHANGE_ME
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod logs -f api   # wait for "Application startup complete", Ctrl-C
```

Caddy gets its certificate the first time `https://api.<domain>/health` is requested — open it in a browser; it should return `{"status": ...}`.

## 4. Data (20 min) — pick ONE

**A. Copy your working database (recommended — keeps every observation, tender, community post).** On your PC (PowerShell):

```powershell
pg_dump -h localhost -p 5434 -U postgres -d applatform -Fc -f apnn.dump
scp apnn.dump deploy@<droplet-ip>:~/
```

On the droplet:

```bash
cd ~/politics-platform
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod cp ~/apnn.dump db:/tmp/apnn.dump
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec db pg_restore -U apnn -d applatform --no-owner --clean --if-exists /tmp/apnn.dump
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec api alembic upgrade head
```

**B. Rebuild from seeds + scrapers** (clean start):

```bash
X="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec api"
$X alembic upgrade head
$X python scripts/load_seed_data.py
$X python scripts/load_state_projects.py
$X python scripts/reimport_amrut.py
$X python scripts/rescrape_mospi.py
$X python scripts/scrape_tenders.py
# archived MoSPI editions: copy the PDFs into backend/fetched/ first, then e.g.
$X python scripts/import_mospi_archive.py --pdf fetched/FlashReport_May_2024.pdf --as-of 2024-05-31 --label "MoSPI flash report, May 2024" --url "https://www.mospi.gov.in/sites/default/files/publication_reports/FlashReport_May_2024.pdf"
```

Either way, run the harness once: `$X python -m verify.run --repo /app/..` is not available inside the image (it needs the frontend) — run `python -m verify.run` on your PC before each push instead.

## 5. Frontend on Cloudflare Pages (10 min)

Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `ap-nadu-nedu` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `VITE_API_URL` = `https://api.<domain>/api/v1` |
| Environment variable | `NODE_VERSION` = `22` |

Add a file `ap-nadu-nedu/public/_redirects` containing `/* /index.html 200` so deep links (`/projects/622`) load on refresh. Then Custom domains → add `<domain>` and `www.<domain>` (this is the CNAME target for step 2).

Make sure `ALLOWED_ORIGINS` in `deploy/.env.prod` lists exactly these origins (`https://<domain>`, `https://www.<domain>`, and the `*.pages.dev` preview URL), then `docker compose ... up -d api` to apply.

## 6. Off-site backups (10 min, optional but do it)

Cloudflare → R2 → Create bucket `apnn-backups` → Manage R2 API tokens → create a token with Object Read & Write → put the four `R2_*` values in `deploy/.env.prod` → `docker compose ... up -d offsite`. Check the first copy next morning: `docker compose ... logs offsite`.

## 7. Auto-deploy on push (5 min)

Replace the `deploy` job in `.github/workflows/deploy.yml` with the one in `deploy/github-deploy.yml`, and add repo secrets `DROPLET_HOST`, `DROPLET_USER` (`deploy`), `DROPLET_SSH_KEY` (a private key whose public half is in `/home/deploy/.ssh/authorized_keys`). From then on: push to `main` → tests → droplet pulls and rebuilds the API. Cloudflare Pages rebuilds the frontend on the same push by itself.

## Day-to-day

| Task | Command (from `~/politics-platform`, alias `X` as above) |
|---|---|
| See what's running | `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod ps` |
| API logs | `... logs -f --tail 200 api` |
| Scraper runs | `... logs jobs` (ofelia prints every run) — schedules are in the compose labels, times in UTC |
| Run a scraper now | `$X python scripts/scrape_tenders.py` |
| Load a new MoSPI edition | copy PDF to `backend/fetched/`, run `import_mospi_archive.py` as in step 4B, update the `MOSPI_FLASH_*` lines in `.env.prod` |
| Restore a backup | `... exec db sh -c 'gunzip -c /backups/apnn-YYYY-MM-DD.sql.gz \| psql -U apnn -d applatform'` |
| OS updates | `sudo apt update && sudo apt -y upgrade` monthly; DigitalOcean weekly image backups are on |
| Resize later | DigitalOcean → Resize (CPU/RAM only) — no data moves |

## When to move to Package C (Cloud Run + Neon)

If `docker stats` shows the API pinned at 100% CPU during the day, or you want zero servers to patch. The image is already Cloud Run-ready (it honours `$PORT`); Neon takes the `pg_dump` as-is.
