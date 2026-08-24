# AP Politics Platform

A public platform that aggregates Andhra Pradesh government data — projects, tenders, MoUs, investments, news, and official documents — and makes it accessible in English and Telugu (తెలుగు), including via a voice assistant ("Mitra" 🎙️).

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
│   │   │   ├── cache.py         # Redis caching
│   │   │   ├── translation.py   # Google Translate (Telugu)
│   │   │   ├── summarization.py # Claude API news summaries
│   │   │   ├── search.py        # Elasticsearch
│   │   │   └── voice.py         # STT + TTS (Mitra assistant)
│   │   ├── scrapers/            # Government portal crawlers
│   │   │   ├── base.py          # Base scraper (retry, rate limit)
│   │   │   ├── ap_tenders.py    # AP eProcurement
│   │   │   └── news/            # News source scrapers
│   │   └── tasks/               # Celery background jobs
│   ├── tests/
│   ├── docker-compose.yml       # Local dev: PostgreSQL + Redis + Elasticsearch
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── .github/workflows/deploy.yml # CI/CD pipeline
├── render.yaml                  # Render.com deployment config
└── README.md
```

## Local Development Setup

### Prerequisites
- Python 3.12+
- Docker Desktop (for PostgreSQL, Redis, Elasticsearch)
- Git

### Steps

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd politics-platform/backend

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy and fill env vars
cp .env.example .env
# Edit .env with your API keys

# 5. Start local services (PostgreSQL + Redis + Elasticsearch)
docker-compose up -d postgres redis elasticsearch

# 6. Run database migrations
alembic upgrade head

# 7. Start the API server
uvicorn app.main:app --reload --port 8000

# 8. In a separate terminal, start Celery worker
celery -A app.tasks.celery_app worker --loglevel=info

# 9. In another terminal, start Celery Beat (scheduler)
celery -A app.tasks.celery_app beat --loglevel=info
```

API docs: http://localhost:8000/docs

### Run Tests
```bash
pytest tests/ -v
```

### Trigger a manual scrape
```bash
# From Python shell or the /docs Swagger UI
curl -X POST http://localhost:8000/api/v1/admin/scrape/all
```

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
