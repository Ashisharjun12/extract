# VPS deployment

Full stack: **valkey** + **aimodule** (API) + **aimodule-worker** + **test-backend** + **web**.

Same `docker-compose.yml` for local dev and production.

## Prerequisites

- Docker and Docker Compose on the VPS
- External services (not in compose):
  - **MongoDB** — portal user/session data
  - **Google Cloud Storage** — aimodule file staging
  - **Cloudflare R2** — portal file uploads
  - **Gemini API key** — document extraction
  - **New Relic license key** — observability

## Setup

1. Clone the repo on the VPS.

2. Create environment file:
   ```bash
   cp .env.sample .env
   ```
   Edit `.env` and fill every value. Required highlights:
   - `PUBLIC_URL` — public URL users open (e.g. `https://docs.yourdomain.com`)
   - `GEMINI_API_KEY` and model slugs (`AI_MODEL`, `AI_MODEL_LITE`, `AI_MODEL_PRO`)
   - `GCS_*` credentials
   - `DATABASE_URI`, `R2_*`
   - `JWT_SECRET`, `WEBHOOK_SECRET`, `SESSION_SECRET`, `ADMIN_API_KEY` — use strong random values
   - `NEW_RELIC_LICENSE_KEY`

   `WEBHOOK_URL` is set internally by compose (`http://test-backend:3001/api/webhook/extraction-complete`). Do not point it at localhost on VPS.

3. Build and start all services:
   ```bash
   docker compose up -d --build
   ```

4. Open the app at `http://<vps-ip>` or your `PUBLIC_URL` (port `WEB_PORT`, default 80).

## Verify

```bash
# All containers running
docker compose ps

# API health (inside aimodule container)
docker compose exec aimodule curl -s localhost:3000/health

# Valkey (queue)
docker compose exec valkey valkey-cli ping

# Logs
docker compose logs -f aimodule aimodule-worker
```

**Smoke test:** upload a document via the web UI → test-backend enqueues to aimodule → worker processes → webhook returns result to portal.

## Workers

Two worker replicas run by default: `aimodule-worker` and `aimodule-worker-2`. Both pull jobs from the same Valkey queues in parallel.

## Architecture

```
Browser → web:80 → test-backend:3001 → aimodule:3000 (enqueue)
aimodule-worker → valkey (BullMQ) → Gemini/GCS → webhook → test-backend
```

Valkey runs in compose (`redis://valkey:6379`), internal network only — not exposed on the host.

## Observability

Production defaults to **New Relic only** (`OBSERVABILITY_PROVIDER=newrelic`, `OTEL_ENABLED=false`).

Optional SigNoz/OTel for local dev: set `OTEL_ENABLED=true` and configure `OTEL_EXPORTER_OTLP_*` in `.env`.

## Security

- Never commit `.env` or real secrets to git.
- Rotate any keys that were ever committed to `.env.sample` history.
- Set `PUBLIC_URL` before `docker compose build` — web bakes API URLs at build time.
