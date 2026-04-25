# CrisisSync Backend

Production-ready FastAPI backend for CrisisSync, a real-time emergency response system.

## Architecture

```text
app/
  api/v1/endpoints/   Versioned HTTP and WebSocket routes
  core/               Settings, security, dependency injection, errors, enums
  db/                 MongoDB connection and collection names
  schemas/            Pydantic request/response models
  services/           Business logic and integration placeholders
  utils/              Logging and shared utilities
  websocket/          Connection manager for real-time alerts
```

## Features

- Async FastAPI application with MongoDB through Motor
- JWT register/login flow
- Role-based access for `guest`, `staff`, and `admin`
- SOS creation, triage placeholder, assignment/status updates
- WebSocket alert stream at `/api/v1/ws/alerts`
- GeoJSON location storage with MongoDB `2dsphere` indexing
- Multi-venue tenancy through `venue_id` across users, alerts, SOS incidents, and dashboard queries
- AI incident classification placeholder with a Gemini-ready adapter interface
- Incident timeline for full emergency lifecycle tracking
- Token auth middleware and role dependencies
- In-process API rate limiting, designed to be replaced with Redis at multi-instance scale
- Background notification dispatch for SOS and alert workflows
- Extensible AI and notification service placeholders
- Environment-driven settings
- Docker-ready deployment files

## Setup

```bash
cd crisis-sync-backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

## Required Environment

```bash
PROJECT_NAME=CrisisSync
ENVIRONMENT=development
API_V1_PREFIX=/api/v1
BACKEND_CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=crisis_sync
SECRET_KEY=replace-with-a-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
LOG_LEVEL=INFO
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=120
RATE_LIMIT_WINDOW_SECONDS=60
```

## Main Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/users/` admin only
- `POST /api/v1/venues/` admin only
- `GET /api/v1/venues/` admin only
- `POST /api/v1/sos/` authenticated users
- `GET /api/v1/sos/` staff/admin
- `PATCH /api/v1/sos/{sos_id}` staff/admin
- `POST /api/v1/sos/{sos_id}/timeline` staff/admin
- `GET /api/v1/dashboard/summary` staff/admin
- `POST /api/v1/alerts/` staff/admin
- `GET /api/v1/alerts/` authenticated users
- `WS /api/v1/ws/alerts`
- `GET /health`

## Scaling Notes

The API is async end-to-end and WebSocket connections are tracked in a dedicated manager. For 10,000+ concurrent users in production, run multiple Uvicorn/Gunicorn workers behind a load balancer, move rate-limit state to Redis, and back WebSocket fan-out with Redis Pub/Sub, NATS, or Kafka so alerts broadcast across all instances.

## Docker

```bash
docker build -t crisissync-backend .
docker run --env-file .env -p 8000:8000 crisissync-backend
```

For production, use a managed MongoDB instance, set a strong `SECRET_KEY`, and restrict `BACKEND_CORS_ORIGINS`.

## Docker Compose

Run the backend with MongoDB:

```bash
docker compose up --build
```

The compose file uses `config/env/development.env` by default and exposes:

- Backend: `http://localhost:8000`
- MongoDB: `localhost:27017`

For a production-style compose run, create `config/env/production.env` from `config/env/production.env.example`, then run:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

## Production Runtime

Production runs through Gunicorn with Uvicorn workers:

```bash
ENVIRONMENT=production gunicorn app.main:app -c gunicorn_conf.py
```

Docker uses `scripts/start.sh`, which chooses:

- `uvicorn --reload` when `ENVIRONMENT=development`
- `gunicorn -c gunicorn_conf.py` when `ENVIRONMENT=production`

On Windows local development, you can run:

```powershell
.\scripts\start.ps1
```

## Environment Files

- `.env.example`: generic local template
- `config/env/development.env`: Docker Compose development config
- `config/env/production.env.example`: production deployment template

Copy the production template into your deployment secret manager or hosting platform environment variables. Do not commit real production secrets.

## CI/CD

GitHub Actions workflows are included at:

- `.github/workflows/backend-ci.yml` for repo-root deployments
- `crisis-sync-backend/.github/workflows/ci.yml` if this backend is pushed as its own repo

The workflow installs dependencies, compiles the app, runs `pytest`, and builds the Docker image.

## Tests

The test suite uses pytest and an in-memory async MongoDB fake, so auth and SOS API tests do not require a running database.

```bash
pip install -r requirements.txt
pytest
```

Use Python 3.12 for local parity with Docker and CI.
