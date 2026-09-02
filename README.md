# AP Politics Platform

An independent, no-login platform that lets anyone in Andhra Pradesh check a political
claim against the government's own published record — budgets, audited accounts, projects,
MoUs, official documents and statistics — in six languages (English, తెలుగు, हिन्दी, اردو,
தமிழ், ଓଡ଼ିଆ), with a voice assistant ("Mitra" 🎙️).

**The rule the whole thing rests on:** every figure comes from a government document and
carries that document. Newspapers appear only as a labelled claim, never as the source of a
number. Where two official sources disagree, the disagreement is the content — we show
both. Where we could not get something, we say so and name the page a person should open.
This is enforced by a verification harness, not by good intentions; see
[Checking the data](#checking-the-data-before-you-ship-it).

## Project Structure

```
politics-platform/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # All settings from env vars
│   │   ├── database.py          # Async SQLAlchemy setup
│   │   ├── models/              # PostgreSQL table definitions
│   │   ├── schemas/             # Pydantic request/response models
│   │   ├── routers/             # API route handlers
│   │   │   ├── projects.py      # GET /api/v1/projects/
│   │   │   ├── tenders.py       # GET /api/v1/tenders/
│   │   │   ├── news.py          # GET /api/v1/news/
│   │   │   ├── mous.py          # GET /api/v1/mous/
│   │   │   ├── documents.py     # GET /api/v1/documents/
│   │   │   ├── search.py        # POST /api/v1/search/
│   │   │   └── voice.py         # POST /api/v1/voice/query
│   │   ├── services/
│   │   │   ├── cache.py         # Redis when present, in-process fallback when not
│   │   │   ├── translation.py   # Google Translate
│   │   │   ├── summarization.py # Claude API news summaries
│   │   │   ├── site_search.py   # Search across this platform only — no Elasticsearch
│   │   │   └── voice.py         # STT + TTS (Mitra assistant)
│   │   ├── scrapers/            # Government portal crawlers
│   │   │   ├── base.py          # Base scraper (retry, rate limit)
│   │   │   ├── ap_tenders.py    # AP eProcurement
│   │   │   └── news/            # News source scrapers
│   │   └── tasks/               # Celery background jobs
│   ├── tests/
│   ├── seed/                    # The curated, cited data every page reads
│   ├── verify/                  # The verification harness — 24 checks, run before every commit
│   ├── docker-compose.yml       # Optional. Local dev needs only PostgreSQL.
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── .github/workflows/deploy.yml # CI/CD pipeline
├── render.yaml                  # Render.com deployment config
└── README.md
```

## Running it locally

Two processes: a FastAPI backend on **port 8005** and a Vite dev server on **port 5173**.
PostgreSQL must be running; Redis and Elasticsearch are **not** required — the cache
falls back to an in-process one when Redis is absent, and search runs against the
database and the seed files directly.

### Prerequisites

| | |
|---|---|
| Python | 3.12+ (the machine this is developed on uses the Anaconda install; there is no virtualenv in the repo) |
| Node | 18+ |
| PostgreSQL | 16, listening on **5434**, with a database called `applatform`. On Windows this is the `postgresql-x64-16` service. |
| Optional | Redis on 6379 — only speeds the cache up. Nothing needs Elasticsearch. |

### First time only

```powershell
# from the repo root
cd backend
pip install -r requirements.txt

# create the database if it does not exist
psql -h localhost -p 5434 -U postgres -c "CREATE DATABASE applatform;"

# schema
alembic upgrade head

# load the curated, cited data (safe to re-run; it replaces rather than duplicates)
python scripts\load_seed_data.py

cd ..\ap-nadu-nedu
npm install
```

`backend/.env` and `ap-nadu-nedu/.env` are both already present on the dev machine and are
git-ignored. If you are setting up somewhere new, copy `backend/.env.example` to
`backend/.env` and fill it in; the frontend only needs one line:

```
VITE_API_URL=http://127.0.0.1:8005/api/v1
```

### Every day — two terminals

**Terminal 1 — backend**

```powershell
cd "backend"
uvicorn app.main:app --reload --port 8005
```

- API root: <http://127.0.0.1:8005/api/v1>
- Swagger: <http://127.0.0.1:8005/docs>
- Health: <http://127.0.0.1:8005/health>

**Terminal 2 — frontend**

```powershell
cd "ap-nadu-nedu"
npm run dev
```

- Site: <http://localhost:5173>

The port matters. The frontend reads `VITE_API_URL` from `ap-nadu-nedu/.env`, which points
at **8005**; the fallback baked into `src/lib/api.js` is 8001 and will not work. If every
page loads but every chart is empty, the backend is on the wrong port or is not running.

### Production build

```powershell
cd "ap-nadu-nedu"
npm run build      # emits dist/
npm run preview    # serves dist/ on 4173, to check the built bundle
```

Run `npm run build` after any change to a component or a translation file — the dev server
is forgiving about things the build is not.

## Checking the data before you ship it

Every figure this platform publishes has to trace back to a government document, and that
is enforced mechanically rather than by remembering. The harness lives in `backend/verify`.

```powershell
cd "backend"
python -m verify.run                     # 24 checks, about a second
python -m verify.run --json ..\ap-nadu-nedu\public\verification.json
$env:VERIFY_LINKS=1; python -m verify.run   # also probe every cited URL (weekly, not per edit)
```

Exit code 1 on any **FAIL**; warnings never block. It checks that every cited source
resolves to a real document, that an estimate is never drawn as an outcome, that no
part-year figure sits in a full-year series, that no pre-2014 figure leaks into a
per-government comparison, that every stored percentage still equals its own inputs, that
independent sources still agree where both are audited, and that all six languages carry
exactly the same keys. `backend/verify/README.md` explains each check and why it exists.

Run it before every commit that touches `backend/seed/` or a locale file.

### Refreshing the scraped data

```powershell
cd "backend"
.\refresh_data.bat
```

Runs every scraper, reloads the seed files and re-checks source health, logging to
`refresh_log.txt`. Safe to re-run; every scraper dedupes against the database. The header
of that file has the `schtasks` line to register it as a daily 07:00 job.

### Tests

```powershell
cd "backend"
pytest tests/ -v
```

### When something is wrong

| Symptom | Cause |
|---|---|
| Pages load, every chart empty | Backend not running, or on the wrong port. Check <http://127.0.0.1:8005/health>. |
| `DuplicateTable` from alembic | `create_all` built the tables before Alembic stamped them. Run `python scripts\check_schema.py` — it prints the exact remedy. |
| A page renders a key like `finances.q.threeSources` | Missing translation key. `python -m verify.run` names it. |
| CORS error in the browser console | The frontend origin is not in `ALLOWED_ORIGINS` in `backend/.env`. 5173, 5174, 5175 and 4173 are already there. |
| `npm run build` fails on a native binary | `node_modules` was installed for a different platform. Delete it and `npm install` again. |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/v1/projects/ | List all AP government projects |
| GET | /api/v1/projects/stats | Dashboard summary stats |
| GET | /api/v1/projects/{id} | Single project details |
| GET | /api/v1/tenders/ | List tenders (default: active) |
| GET | /api/v1/tenders/closing-soon | Tenders closing within 7 days |
| GET | /api/v1/news/latest | Latest AP news (English/Telugu) |
| GET | /api/v1/news/ | Paginated news list |
| GET | /api/v1/mous/ | Investment MoUs list |
| GET | /api/v1/mous/stats | Total investment stats |
| GET | /api/v1/documents/ | Government documents |
| POST | /api/v1/documents/{id}/translate | Request Telugu translation |
| POST | /api/v1/search/ | Global search (English + Telugu) |
| GET | /api/v1/search/suggestions | Autocomplete suggestions |
| POST | /api/v1/voice/query | Mitra voice query |
| POST | /api/v1/voice/transcribe | Audio → text transcription |
| GET | /api/v1/voice/greeting | Mitra welcome audio |

## Language Support
All list endpoints accept `?language=te` to return Telugu headlines and summaries.
