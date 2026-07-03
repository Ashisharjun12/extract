# Laravel integration guide

**Handoff docs (start here):**
- **[LARAVEL.md](LARAVEL.md)** — for Laravel team (APIs, payloads, mapper, PDF formats)
- **[MYSIDE.md](MYSIDE.md)** — for aimodule VPS owner (docker, expose :3000, redeploy)

This document is the full technical reference. It explains how the Laravel product backend integrates with **aimodule** (the AI extraction service). It covers architecture, APIs, queues, Docker networking, and the **mapper** Laravel must build to show extraction results on the existing UI.

For VPS deployment of aimodule + workers, see [DEPLOY.md](DEPLOY.md).

---

## Cross-server setup (Laravel on another VPS)

**Typical production:** aimodule runs on **this VPS**; Laravel runs on a **different server**. Laravel calls aimodule at `http://<aimodule-vps-ip>:3000`. aimodule workers send results back to Laravel's public webhook URL.

```mermaid
flowchart LR
  LaravelVPS[Laravel_VPS] -->|"POST :3000 extract"| AimoduleVPS[aimodule_VPS]
  AimoduleVPS --> Workers[workers_Valkey]
  Workers -->|"webhook HTTPS"| LaravelVPS
  LaravelVPS --> Mapper[WorkshopResultMapper]
  Mapper --> UI[Their_UI]
```

### Quick start — 6 steps

| Step | Who | Action |
|------|-----|--------|
| 1 | aimodule VPS owner | Redeploy with port 3000 exposed (see redeploy runbook below) |
| 2 | aimodule VPS owner | Set `WEBHOOK_URL` in `.env` to Laravel's HTTPS webhook URL |
| 3 | Both teams | Share the same `JWT_SECRET` and `WEBHOOK_SECRET` |
| 4 | Laravel team | Upload PDF → store public HTTPS URL |
| 5 | Laravel team | `POST http://<aimodule-ip>:3000/api/v1/documents/extract` with JWT |
| 6 | Laravel team | Receive webhook → run mapper → UI polls `GET /api/extractions/{id}` |

### Docker redeploy runbook (aimodule VPS)

```bash
git pull
# Edit .env:
#   WEBHOOK_URL=https://api.theirdomain.com/api/webhooks/extraction-complete
#   AIMODULE_PORT=3000
docker compose up -d --build
docker compose ps
curl http://localhost:3000/health
```

From the **Laravel server**, confirm aimodule is reachable:

```bash
curl http://<aimodule-vps-ip>:3000/health
# Expected: {"status":"ok"} or similar health JSON
```

### aimodule base URL for Laravel

Set in Laravel `.env` as `AIMODULE_URL`:

| Option | Example | Notes |
|--------|---------|-------|
| Direct IP | `http://203.0.113.10:3000` | Simplest; lock down firewall |
| Subdomain + TLS | `https://ai-api.theirdomain.com` | Nginx reverse proxy on aimodule VPS (recommended for production) |
| Private network | `http://10.0.0.5:3000` | If both VPS share VPN/private network |

### Security (aimodule VPS)

- **Firewall:** allow port `3000` (or `AIMODULE_PORT`) **only from Laravel server IP**
  ```bash
  # Example UFW
  ufw allow from <laravel-server-ip> to any port 3000
  ufw deny 3000
  ```
- **Never** put `GEMINI_API_KEY` on Laravel — only aimodule has it
- Prefer HTTPS reverse proxy over raw HTTP on the public internet
- `valkey` (Redis) must stay **internal** — never expose port 6379

### Env vars — two-server checklist

| Variable | aimodule VPS `.env` | Laravel `.env` |
|----------|---------------------|----------------|
| `JWT_SECRET` | same value | same value |
| `WEBHOOK_SECRET` | same value | same value |
| `WEBHOOK_URL` | `https://laravel-domain/.../webhooks/extraction-complete` | — |
| `AIMODULE_URL` | — | `http://<aimodule-ip>:3000` |
| `AIMODULE_PORT` | `3000` (host port bind) | — |

---

## Direct answer: a mapper is required

**Yes — after aimodule returns JSON, Laravel must run a mapper before the existing UI can display the data.**

aimodule does **not** output the legacy portal format. The two JSON shapes are different by design:

| Field | Legacy UI (Maruti Ertiga portal style) | aimodule output (workshop bill) |
|-------|----------------------------------------|----------------------------------|
| Header metadata | `estimation_details` (key-value array) | `workshopDetails` + `summary` (typed objects) |
| Line items | `result.tables[0]` — **one row = part + denting + painting + R&R** | `lineItemsTable` — **separate PART and LABOUR rows** |
| Consumables | `miscellaneous` array | Not in schema today — mapper returns `[]` or future enhancement |
| Totals | `grand_total` with numeric string keys (`"2"`, `"8"`, `"9"`) | `summary.grandTotal`, `totalPartsAmount`, `totalLabourAmount` |
| Workshop | `workshop_details` key-value pairs | `workshopDetails.name`, etc. |

**test-backend** (reference portal in this repo) stores raw aimodule JSON as-is. It does **not** map to the legacy format. Laravel must add that layer.

```mermaid
flowchart LR
  UserUI[TheirWebUI] --> Laravel[LaravelAPI]
  Laravel -->|"POST extract async"| Aimodule[aimodule:3000]
  Aimodule --> Workers[aimodule_workers]
  Workers -->|"webhook HMAC"| Laravel
  Laravel -->|"raw_result JSON"| DB[(extractions_table)]
  DB --> Mapper[WorkshopResultMapper]
  Mapper -->|"legacy DTO"| UserUI
```

---

## 1. Roles and production layout

| Component | Role | Production exposure |
|-----------|------|---------------------|
| **aimodule** | AI extraction API + enqueue | Host port `3000` (or `AIMODULE_PORT`) — Laravel calls from another server |
| **aimodule-worker** | BullMQ workers, Gemini calls | Internal only |
| **valkey** | Queue + result cache | Internal only — never expose |
| **Laravel** | Upload, DB, auth, mapper, public API, webhook | Public HTTPS (different VPS) |
| **Their frontend** | User UI | Public HTTPS |
| **test-backend + web** | Reference implementation in this repo | Dev/demo only — **not** production path |

**Cross-server production:** Laravel on server A calls `http://<aimodule-vps-ip>:3000`. aimodule workers webhook to `https://<laravel-domain>/api/webhooks/extraction-complete`. Only Laravel + frontend need to be user-facing; aimodule port 3000 should be firewall-restricted to Laravel's IP.

**Same-server option:** If Laravel joins the Docker `docs` network, use `AIMODULE_URL=http://aimodule:3000` internally (no public port required).

---

## 2. End-to-end flow

```
User upload
    ↓
[Laravel] store file → public HTTPS URL
    ↓
[Laravel] create extraction record (correlationId = UUID)
    ↓
[Laravel queue] optional — don't block HTTP while calling aimodule
    ↓
POST aimodule /api/v1/documents/extract  (mode: async)
    ↓
[aimodule BullMQ on Valkey] workers process one-by-one (parallel replicas OK)
    ↓
Webhook POST → Laravel /api/webhooks/extraction-complete
    ↓
[Laravel] save raw_result → WorkshopResultMapper → mapped_result
    ↓
UI polls GET /api/extractions/{id} → legacy JSON for display
```

### Two queue layers (use both correctly)

| Queue | Owner | Purpose |
|-------|--------|---------|
| **Laravel queue** (Redis/DB) | Laravel team | Business jobs: user uploaded file for claim X, call aimodule without blocking the HTTP request |
| **aimodule BullMQ** (Valkey) | aimodule (already built) | AI processing, chunking, rate limiting, Gemini workers |

**Do not rebuild aimodule's internal AI queue in Laravel.** Laravel only enqueues a single extract request per document. aimodule workers pick jobs automatically.

Scale throughput by adding more `aimodule-worker` replicas in `docker-compose.yml` (two run by default: `aimodule-worker`, `aimodule-worker-2`).

---

## 3. Docker and networking

Current stack from [docker-compose.yml](docker-compose.yml):

| Service | Port | Public? |
|---------|------|---------|
| valkey | 6379 internal | No — never expose |
| aimodule | `${AIMODULE_PORT:-3000}:3000` | **Yes** — for Laravel on another server |
| aimodule-worker ×N | — | No |
| test-backend | 3001 `expose` | No (dev reference) |
| web | 80 `ports` | Yes (dev tester UI only) |

`docker-compose.yml` publishes aimodule on host port `AIMODULE_PORT` (default **3000**). `WEBHOOK_URL` is read from `.env` for aimodule and workers (default: test-backend for local dev).

### Production checklist (Laravel on another server)

- [ ] `AIMODULE_PORT=3000` in aimodule VPS `.env`
- [ ] Firewall: port 3000 allowed **only** from Laravel server IP
- [ ] `WEBHOOK_URL=https://api.theirdomain.com/api/webhooks/extraction-complete` in aimodule VPS `.env`
- [ ] `JWT_SECRET` and `WEBHOOK_SECRET` match on both servers
- [ ] Laravel `AIMODULE_URL=http://<aimodule-vps-ip>:3000`
- [ ] File URLs passed to aimodule are **public HTTPS** (workers must download PDFs)
- [ ] Laravel webhook route is public HTTPS (aimodule workers call back over internet)
- [ ] After major extraction logic changes, flush Valkey cache if testing: `docker compose exec valkey valkey-cli FLUSHDB`

### Architecture diagram

```
Laravel VPS → http://aimodule-vps-ip:3000 (extract API)
aimodule-worker → valkey (BullMQ) → Gemini/GCS → webhook → Laravel VPS HTTPS
```

---

## 4. Shared secrets

| Variable | aimodule | Laravel |
|----------|----------|---------|
| `JWT_SECRET` | Verifies Bearer token | Signs Bearer token |
| `WEBHOOK_SECRET` | HMAC-SHA256 sign on webhook body | HMAC-SHA256 verify on webhook body |
| `WEBHOOK_URL` | Where workers POST results | Your webhook route URL |

### JWT for calling aimodule

Minimum payload:

```json
{ "id": "user-123", "role": "Surveyor" }
```

Allowed roles for extract: `Surveyor`, `Reviewer`, `Admin`.

Reference signing (test-backend): `test-backend/src/modules/extraction/extraction.service.js`

```javascript
jwt.sign({ id: 'test_user', role: 'Surveyor' }, JWT_SECRET, { expiresIn: '1h' });
```

### Webhook signature

- Header: `X-Webhook-Signature` = `HMAC-SHA256(WEBHOOK_SECRET, raw JSON body)`
- Header: `X-Correlation-Id` = same UUID Laravel sent when starting extraction
- Sign and verify on the **uncompressed** JSON string
- If `Content-Encoding: gzip` is present, **gunzip first**, then verify signature on the original JSON string

aimodule compresses payloads larger than 50 KB (`aimodule/src/infrastructure/webhook/webhook.service.ts`). The reference test-backend does not handle gzip — **Laravel must**.

Reference verification: `test-backend/src/modules/webhook/webhook.service.js`

---

## 5. aimodule APIs Laravel calls

Base URL: Laravel `.env` → `AIMODULE_URL` (e.g. `http://203.0.113.10:3000` when Laravel is on another server).

### `POST /api/v1/documents/extract`

**Headers:**

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | Yes | `Bearer <JWT>` |
| `X-Correlation-Id` | Recommended | UUID — same as Laravel extraction record |
| `Content-Type` | Yes | `application/json` |

**Body:**

```json
{
  "type": "WORKSHOP",
  "urls": ["https://storage.example.com/estimate.pdf"],
  "mode": "async",
  "priority": "normal",
  "tableLayout": "sequential",
  "documentId": "laravel-extraction-id",
  "documentName": "estimate.pdf"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `type` | `DL \| RC \| POLICY \| CLAIM \| WORKSHOP` | Required |
| `urls` | string or string[] | Required — public HTTPS URLs |
| `mode` | `sync \| async` | WORKSHOP/POLICY → use `async` |
| `priority` | `urgent \| normal \| low` | Optional |
| `tableLayout` | `split \| sequential` | WORKSHOP only — see section 10 |
| `documentId` | string | Optional — passed through to webhook metadata |
| `documentName` | string | Optional — logging/display |

**Responses:**

| Status | Meaning | Body highlights |
|--------|---------|-----------------|
| `200` | Sync complete or cache hit | `{ success, jobId, correlationId, data }` |
| `202` | Async queued | `{ success, jobId, correlationId, status: "queued" }` |
| `400` | Validation error | `{ success: false, message, errors }` |
| `422` | Wrong document type | `{ success: false, code, message }` |
| `503` | Queue overloaded | `{ success: false, message }` + `Retry-After` |

### `GET /api/v1/documents/jobs/:jobId`

Optional queue status poll. Same JWT auth.

### `GET /health`

Connectivity check from Laravel or ops.

---

## 5b. Full HTTP examples (copy-paste for Laravel team)

### Generate JWT (Laravel / PHP)

```php
use Firebase\JWT\JWT;

$token = JWT::encode(
    ['id' => (string) $userId, 'role' => 'Surveyor'],
    config('services.aimodule.jwt_secret'),
    'HS256'
);
```

### WORKSHOP — async extract (Laravel → aimodule)

**Request:**

```http
POST http://203.0.113.10:3000/api/v1/documents/extract
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Correlation-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "type": "WORKSHOP",
  "urls": ["https://cdn.example.com/claims/98000031250391414987/estimate.pdf"],
  "mode": "async",
  "priority": "normal",
  "tableLayout": "sequential",
  "documentId": "laravel-extraction-42",
  "documentName": "estimate.pdf"
}
```

**curl:**

```bash
curl -X POST "http://203.0.113.10:3000/api/v1/documents/extract" \
  -H "Authorization: Bearer $AIMODULE_JWT" \
  -H "X-Correlation-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "WORKSHOP",
    "urls": ["https://cdn.example.com/claims/estimate.pdf"],
    "mode": "async",
    "tableLayout": "sequential",
    "documentId": "laravel-extraction-42",
    "documentName": "estimate.pdf"
  }'
```

**Response `202 Accepted`:**

```json
{
  "success": true,
  "message": "Document extraction queued",
  "jobId": "workshop:abc123def456",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

Laravel should save `jobId`, set extraction `status = queued`, and return immediately to the UI. **Do not wait** for the PDF to finish processing.

### RC — sync extract (returns result in same request)

**Request:**

```http
POST http://203.0.113.10:3000/api/v1/documents/extract
Authorization: Bearer eyJhbG...
Content-Type: application/json

{
  "type": "RC",
  "urls": ["https://cdn.example.com/rc-front.jpg"],
  "mode": "sync"
}
```

**Response `200 OK` (abbreviated):**

```json
{
  "success": true,
  "message": "Document extracted successfully",
  "jobId": "rc:xyz789",
  "correlationId": "660e8400-e29b-41d4-a716-446655440001",
  "data": {
    "registrationNumber": "HR38AF1117",
    "ownerName": "DINESH",
    "vehicleClass": "LMV"
  }
}
```

RC/DL typically do **not** need the legacy workshop mapper.

### Laravel — start extraction (your public API)

**Request from frontend:**

```http
POST https://api.theirdomain.com/api/claims/123/extract
Authorization: Bearer <laravel-user-token>
Content-Type: application/json

{
  "fileUrl": "https://cdn.example.com/claims/estimate.pdf",
  "documentType": "WORKSHOP",
  "tableLayout": "sequential"
}
```

**Response `202`:**

```json
{
  "extractionId": "laravel-extraction-42",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

### Laravel — poll extraction (your public API)

**Request:**

```http
GET https://api.theirdomain.com/api/extractions/laravel-extraction-42
Authorization: Bearer <laravel-user-token>
```

**Response `200` while processing:**

```json
{
  "id": "laravel-extraction-42",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "mappedResult": null,
  "requiresHumanReview": null
}
```

**Response `200` when complete:**

```json
{
  "id": "laravel-extraction-42",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "requiresHumanReview": false,
  "confidenceScore": 1,
  "totalTokens": 20900,
  "totalCostINR": 12.5,
  "mappedResult": {
    "state": "SUCCESS",
    "estimation_details": [["Customer Name", "DINESH", "Registration No", "HR38AF1117"]],
    "result": {
      "headers": ["Part No.", "Part Desc.", "MRP", "Quantity", "Service Type", "R&R Hrs", "R&R Cost", "Denting Cost", "Painting Cost", "Total", "Approval Qty", "Approval Type"],
      "tables": [[{ "Part No.": "76004Q6000", "Part Desc.": "PANEL ASSY-FRONT DOOR,RH", "MRP": 9066.41, "Total": 12671.72 }]]
    },
    "miscellaneous": [],
    "grand_total": { "2": 130549, "9": 202716 },
    "workshop_details": [["Workshop Name", "Kia Workshop"]]
  }
}
```

The UI reads **`mappedResult`** (legacy shape), not raw aimodule JSON.

---

## 6. Webhook — what Laravel must build

### Why webhooks exist

Workshop and policy PDFs take **1–3 minutes** to extract. aimodule does not hold the HTTP connection open. Flow:

1. Laravel calls extract with `mode: async` → gets `202 queued`
2. aimodule workers process in background (BullMQ on Valkey)
3. When done, aimodule **POSTs to Laravel's `WEBHOOK_URL`**
4. Laravel saves result, runs mapper, UI polls

```mermaid
sequenceDiagram
  participant L as Laravel
  participant A as aimodule_API
  participant W as aimodule_worker
  L->>A: POST extract async
  A-->>L: 202 queued
  W->>W: Gemini extract PDF
  W->>L: POST webhook optional gzip
  L->>L: verify HMAC map save
  L-->>W: 200 OK
```

### Laravel endpoint to create

```
POST https://api.theirdomain.com/api/webhooks/extraction-complete
```

- Must be **public HTTPS** (aimodule VPS calls it over the internet)
- No JWT — security is **HMAC signature** on body
- Return `200` quickly; run mapper in a queue job if it is slow
- **Idempotent:** aimodule retries up to 3 times — same `correlationId` should not duplicate rows

### Incoming webhook headers

| Header | Required | Purpose |
|--------|----------|---------|
| `Content-Type` | Yes | `application/json` |
| `X-Webhook-Signature` | Yes | `HMAC-SHA256(WEBHOOK_SECRET, uncompressed JSON body)` as hex |
| `X-Correlation-Id` | Yes | Same UUID Laravel sent in extract request |
| `Content-Encoding` | Sometimes | `gzip` when payload > 50 KB — gunzip before verify |

### Webhook payload shape

aimodule POSTs to `WEBHOOK_URL` when a job completes (success or failure). Up to 3 retries with exponential backoff (1s, 2s, 4s).

```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "bullmq-job-id",
  "documentType": "WORKSHOP",
  "status": "success",
  "result": { },
  "error": null,
  "durationMs": 87432,
  "timestamp": "2026-03-25T10:15:00.000Z",
  "totalTokens": 20900,
  "totalCostINR": 12.5
}
```

| Field | Notes |
|-------|-------|
| `correlationId` | Match to Laravel `extractions.correlation_id` |
| `result` | Full workshop bill schema on success — store as `raw_result` |
| `error` | Error message on failure |
| `totalTokens`, `totalCostINR` | Cost tracking |

### Webhook success example (full)

**Incoming request from aimodule:**

```http
POST /api/webhooks/extraction-complete HTTP/1.1
Host: api.theirdomain.com
Content-Type: application/json
Content-Encoding: gzip
X-Webhook-Signature: a1b2c3d4e5f6...
X-Correlation-Id: 550e8400-e29b-41d4-a716-446655440000

<gzip-compressed JSON body>
```

**Uncompressed body (after gunzip):**

```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "workshop:abc123def456",
  "documentType": "WORKSHOP",
  "status": "success",
  "result": {
    "isCorrectDocumentType": true,
    "detectedDocumentType": "WORKSHOP_BILL",
    "tableLayout": "sequential",
    "confidenceScore": 1,
    "requiresHumanReview": false,
    "workshopDetails": {
      "name": "Kia Workshop",
      "vehicleNumber": "HR12AB1234",
      "customerName": "DINESH"
    },
    "lineItemsTable": [
      {
        "rowIndex": 1,
        "rowType": "PART",
        "itemCode": "76004Q6000",
        "description": "PANEL ASSY-FRONT DOOR,RH",
        "quantity": 1,
        "rate": 9066.41,
        "partsCost": 11605,
        "totalAmount": 11605
      }
    ],
    "summary": {
      "totalPartsAmount": 130549,
      "totalLabourAmount": 72167,
      "grandTotal": 202716
    }
  },
  "error": null,
  "durationMs": 87432,
  "timestamp": "2026-03-25T10:15:00.000Z",
  "totalTokens": 20900,
  "totalCostINR": 12.5
}
```

**Laravel response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"received": true}
```

### Webhook failure example

```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "workshop:abc123def456",
  "documentType": "WORKSHOP",
  "status": "failure",
  "result": null,
  "error": "WRONG_DOCUMENT_TYPE: uploaded file is not a workshop bill",
  "durationMs": 5200,
  "timestamp": "2026-03-25T10:12:00.000Z",
  "totalTokens": 1200,
  "totalCostINR": 0.5
}
```

Laravel sets `status = failed`, stores `error`, returns `200` (so aimodule stops retrying).

**UI must never read `result` directly.** Always map to legacy format first.

### Laravel webhook handler steps

1. Read raw body bytes (before JSON parse) for signature, or gunzip then verify
2. Verify `X-Webhook-Signature` against uncompressed JSON
3. Find extraction by `correlationId`
4. Save `raw_result = payload.result`
5. Run `WorkshopResultMapper::toLegacyFormat($rawResult, $laravelContext)`
6. Save `mapped_result`, set `status = completed`, store `total_tokens`, `total_cost_inr`
7. Return `200` quickly

---

## 7. aimodule WORKSHOP `result` schema (source)

Defined in `aimodule/src/modules/document/schema/workshop/workshop-bill.schema.ts`.

### Top-level fields

| Field | Description |
|-------|-------------|
| `isCorrectDocumentType` | Gate — false if wrong PDF type |
| `detectedDocumentType` | e.g. `WORKSHOP_BILL` |
| `confidenceScore` | 0–1 |
| `requiresHumanReview` | Surface in UI when true |
| `tableLayout` | `split` or `sequential` |
| `workshopDetails` | Workshop/invoice metadata |
| `lineItemsTable` | Sequential layout — ordered PART/LABOUR rows |
| `partsTable` | Split layout — parts rows |
| `labourTable` | Split layout — labour rows |
| `summary` | Totals, GST, grand total |
| `extraFields` | `[{ key, value }]` catch-all |
| `vehicleNumber`, `vehicleState`, `billType`, `gstSummary`, `grandTotalVerified`, `extractionMode` | Post-extraction enrichments |

### `workshopDetails`

| Field | Example |
|-------|---------|
| `name` | Workshop name |
| `gstin` | GST number |
| `invoiceNumber` | Invoice / estimate number |
| `invoiceDate` | Date string |
| `vehicleNumber` | Registration number |
| `customerName` | Customer name |
| `jobCardNumber` | Job card / estimation ID |
| `odometerReading` | Odometer |
| `documentTitle` | Document title from PDF |

### `lineItemsTable` row (sequential layout)

| Field | PART row | LABOUR row |
|-------|----------|------------|
| `rowIndex` | 1..N global order | 1..N |
| `rowType` | `PART` | `LABOUR` |
| `itemCode` | Part number | null |
| `description` | Part description | Labour description |
| `quantity` | Qty | Qty or hours |
| `rate` | Unit rate / MRP | Rate |
| `partsCost` | Part amount | null |
| `labourCost` | null | Labour amount |
| `taxableAmount` | Pre-tax | Pre-tax |
| `taxAmount` | Tax | Tax |
| `totalAmount` | Line total | Line total |

Use `rowIndex` for insert order and audit. `srNo` is the printed PDF serial (may restart per section) — optional for display.

### `summary`

| Field | Description |
|-------|-------------|
| `totalPartsAmount` | Parts subtotal |
| `totalLabourAmount` | Labour subtotal |
| `grandTotal` | Document grand total |
| `totalGstAmount` | Total GST |
| `cgstRate`, `cgstAmount`, `sgstRate`, `sgstAmount`, `igstRate`, `igstAmount` | GST breakdown |

---

## 8. Legacy mapper specification

**Laravel on another server still needs the mapper.** Exposing aimodule on port 3000 does not change the JSON shape — aimodule always returns `lineItemsTable` / `partsTable` / `labourTable`; your UI expects `estimation_details` + `result.tables` with combined Denting/Painting/R&R columns.

**Target:** existing UI JSON (Maruti portal / insurance estimate style).

Laravel implements `WorkshopResultMapper::toLegacyFormat(array $aimoduleResult, array $laravelContext): array`.

`$laravelContext` carries data aimodule does not extract: claim number, policy number, vehicle model, workshop address from DB, etc.

### 8a. `estimation_details`

Legacy format is an array of key-value row arrays:

```json
[
  ["Estimation ID", "ES00059750", "Version", "1", "Claim No", "98000031250391414987"],
  ["Policy Number", "98000031250318044572", "Customer Name", "DINESH"],
  ["IC Name", "NIA", "Vehicle Model", "ERTIGA VXI CNG 1.5L"],
  ["NCB %", "0", "Registration No", "HR38AF1117"],
  ["Total Estimated Amount", "210722"],
  ["Intimation Date", "2026-03-25"]
]
```

| Legacy key | Source |
|------------|--------|
| Estimation ID | `$laravelContext['estimationId']` or `workshopDetails.jobCardNumber` or `workshopDetails.invoiceNumber` |
| Version | `$laravelContext['version']` or `"1"` |
| Claim No | `$laravelContext['claimNo']` — **Laravel DB only** |
| Policy Number | `$laravelContext['policyNumber']` — **Laravel DB only** |
| Customer Name | `workshopDetails.customerName` |
| IC Name | `$laravelContext['icName']` — insurer from claim |
| Vehicle Model | `$laravelContext['vehicleModel']` |
| NCB % | `$laravelContext['ncbPercent']` or `"0"` |
| Registration No | `workshopDetails.vehicleNumber` or top-level `vehicleNumber` |
| Service Advisor Name / Contact | `$laravelContext` or `extraFields` |
| Total Estimated Amount | `summary.grandTotal` |
| Intimation Date | `workshopDetails.invoiceDate` |

First element may be a title row object — match existing UI convention if required.

### 8b. `result.tables` (line items)

Legacy headers:

```
Part No. | Part Desc. | MRP | Quantity | Service Type | R&R Hrs | R&R Cost | Denting Cost | Painting Cost | Total | Approval Qty | Approval Type
```

Legacy rows combine **part cost + labour costs on one row**. aimodule emits **separate PART and LABOUR rows**. The mapper must merge labour back onto part rows where possible.

#### Mapping rules — sequential (`lineItemsTable`)

| aimodule row | Legacy behavior |
|--------------|-----------------|
| `rowType: PART` | Create row: `Part No.` = `itemCode`, `Part Desc.` = `description`, `MRP` = `rate`, `Quantity` = `quantity`, `Service Type` = `REPLACE`, `Total` = `partsCost` ?? `totalAmount`, denting/painting/R&R = 0 |
| `rowType: LABOUR`, description contains `R&R` | Add `R&R Cost` = `labourCost` to **best matching preceding PART row** |
| `rowType: LABOUR`, description contains `Denting` | Add `Denting Cost` = `labourCost` to related part row or standalone |
| `rowType: LABOUR`, description contains `Body & Paint` or `Painting` | Add `Painting Cost` = `labourCost` |
| `rowType: LABOUR`, no part match | Standalone row: `Part Desc.` = description, labour column filled, `MRP` = 0 |

#### Part–labour matching heuristic

Normalize descriptions (uppercase, remove punctuation) and match keywords:

- `FRONT DOOR PANEL ASSY` (PART) + `FRONT DOOR PANEL ASSY, ONE SIDE, R&R` (LABOUR) → same row
- `PANEL-FENDER,RH` + `Fender Panel Assy, One Side, R&R` → same row
- `HEAD LAMP` + `HEAD LAMP ASSY, ONE SIDE, R&R` → same row

Scoring: token overlap between part description and labour description. Attach labour to highest-scoring open part row within a sliding window (e.g. last 5 PART rows).

If match confidence is low, set `requiresHumanReview = true` on the extraction and leave labour as a separate row.

#### Mapping rules — split (`partsTable` + `labourTable`)

1. Map each `partsTable` row to a legacy part row (`MRP` = `unitPrice`, `Total` = `totalPrice`)
2. Map each `labourTable` row using the same R&R / Denting / Painting heuristics
3. Merge labour onto parts by description matching

#### Approval columns

`Approval Qty` and `Approval Type` are typically empty after extraction — leave `""` unless Laravel has approval workflow data.

### 8c. `miscellaneous`

aimodule has no direct equivalent today.

```json
"miscellaneous": []
```

Future options: classify consumable lines from `extraFields`, or add a dedicated extraction prompt for Maruti-style misc items (`ASST AIR`, `AC GAS`, etc.).

### 8d. `grand_total`

Legacy uses column-index keys (UI table footer positions):

```json
{
  "0": "",
  "1": "",
  "2": 41251,
  "3": "",
  "4": "",
  "5": "",
  "6": "",
  "7": 0,
  "8": 41645,
  "9": 172222
}
```

Suggested mapping from `summary` (calibrate indices against your UI):

| Key | Suggested source |
|-----|------------------|
| `"2"` | `summary.totalPartsAmount` |
| `"7"` | `summary.totalLabourAmount` (or R&R subtotal if UI expects it) |
| `"8"` | `summary.totalGstAmount` |
| `"9"` | `summary.grandTotal` |

Define these as configurable constants in Laravel — do not hardcode without verifying against the live UI.

### 8e. `workshop_details`

```json
[
  ["Workshop Name", "FAIR DEAL WHEELS PVT LTD-08E1"],
  ["Workshop Address", "12/67, SAHIBABAD AREA SITE-1V, GHAZIABAD"]
]
```

| Field | Source |
|-------|--------|
| Workshop Name | `workshopDetails.name` |
| Workshop Address | `$laravelContext['workshopAddress']` or `extraFields` key `address` |

### 8f. Top-level wrapper

Legacy response shape:

```json
{
  "estimation_details": [ ],
  "result": {
    "headers": ["Part No.", "Part Desc.", "MRP", ...],
    "tables": [[ { "Part No.": "...", ... } ]]
  },
  "miscellaneous": [ ],
  "grand_total": { },
  "workshop_details": [ ],
  "state": "SUCCESS"
}
```

Set `state` to `SUCCESS` when `isCorrectDocumentType === true` and extraction completed; `FAILURE` otherwise.

Pass through `requiresHumanReview` and `confidenceScore` at the Laravel API layer (not necessarily inside legacy JSON).

### 8g. Known limitations

| Issue | Detail |
|-------|--------|
| Combined part+labour rows | Maruti portal PDFs put denting+painting on the same row as MRP. aimodule often emits separate PART + LABOUR rows. Mapper merge is best-effort. |
| Miscellaneous consumables | Not extracted today — empty array unless enhanced later. |
| Claim / policy / IC | Always from Laravel DB, not aimodule. |
| `grand_total` key indices | UI-specific — verify with frontend team. |
| Part number formats | aimodule may return OEM codes (`49501Q6550`) vs Maruti codes (`68001M72`) — same mapper logic, different PDF source. |

---

## 9. Laravel APIs to build

Mirror the reference implementation in test-backend.

| Laravel endpoint | Reference file | Purpose |
|------------------|------------------|---------|
| `POST /api/extractions` | `test-backend/src/modules/extraction/extraction.route.js` | Start extraction |
| `GET /api/extractions/{id}` | same | Poll status; return `mapped_result` for UI |
| `POST /api/webhooks/extraction-complete` | `test-backend/src/modules/webhook/webhook.route.js` | Receive aimodule callback |

### Suggested `extractions` table columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `correlation_id` | UUID | Unique — sent to aimodule |
| `claim_id` | FK | Business context |
| `document_type` | string | `WORKSHOP`, etc. |
| `file_url` | string | Public HTTPS URL |
| `table_layout` | string | `split` or `sequential` |
| `status` | enum | `queued`, `processing`, `completed`, `failed` |
| `aimodule_job_id` | string | From aimodule response |
| `raw_result` | JSON | Full aimodule payload (audit) |
| `mapped_result` | JSON | Legacy UI format |
| `requires_human_review` | bool | From aimodule + mapper confidence |
| `confidence_score` | float | From aimodule |
| `total_tokens` | int | From webhook |
| `total_cost_inr` | decimal | From webhook |
| `error` | text | Failure message |
| `created_at`, `completed_at` | timestamp | |

### Default extraction modes

| Document type | Recommended `mode` |
|---------------|-------------------|
| RC, DL | `sync` (fast, 2–5s) |
| WORKSHOP, POLICY | `async` (1–3 min — never block upload HTTP) |

---

## 10. `tableLayout` guidance

Pass `tableLayout` from Laravel UI checkbox or OEM auto-detect:

| PDF format | `tableLayout` | Examples |
|------------|---------------|----------|
| Parts block then labour block | omit or `split` | Toyota, Eicher |
| Part Detail + Labour Detail sections | `sequential` | Kia, Hyundai |
| Mixed P/L in one table | `sequential` | Honda |
| Maruti portal — combined row per part | `sequential` + mapper merge | Ertiga insurance estimate |

`sequential` returns `lineItemsTable` in PDF order plus derived `partsTable` and `labourTable` for backward compatibility.

---

## 11. Laravel implementation checklist

1. File upload → store on S3/R2 → public HTTPS URL
2. `extractions` table with `correlation_id`
3. JWT service to sign aimodule Bearer tokens
4. `POST /api/extractions` — proxy to aimodule with `tableLayout` from UI
5. Webhook endpoint — gzip decompress + HMAC verify + update DB
6. `WorkshopResultMapper` — aimodule JSON → legacy UI JSON
7. `GET /api/extractions/{id}` — return `mapped_result` + `status`
8. Show `requiresHumanReview` flag in UI
9. Store `raw_result` for audit and re-mapping when mapper rules improve
10. Laravel queue job for async aimodule call (optional but recommended)

---

## 12. Side-by-side example

### Input: aimodule `lineItemsTable` (abbreviated)

```json
{
  "tableLayout": "sequential",
  "lineItemsTable": [
    {
      "rowIndex": 9,
      "rowType": "PART",
      "itemCode": "76004Q6000",
      "description": "PANEL ASSY-FRONT DOOR,RH",
      "quantity": 1,
      "rate": 9066.41,
      "partsCost": 11605,
      "labourCost": null,
      "totalAmount": 11605
    },
    {
      "rowIndex": 33,
      "rowType": "LABOUR",
      "description": "FRONT DOOR PANEL ASSY, ONE SIDE, R&R",
      "quantity": 1,
      "rate": 904,
      "partsCost": null,
      "labourCost": 1066.72,
      "totalAmount": 1066.72
    }
  ],
  "summary": {
    "totalPartsAmount": 130549,
    "totalLabourAmount": 72167,
    "grandTotal": 202716
  },
  "workshopDetails": {
    "name": "Kia Workshop",
    "vehicleNumber": "HR12AB1234",
    "customerName": "CUSTOMER"
  },
  "requiresHumanReview": false,
  "confidenceScore": 1
}
```

### Output: legacy `mapped_result` (abbreviated)

```json
{
  "state": "SUCCESS",
  "estimation_details": [
    ["Customer Name", "CUSTOMER", "Registration No", "HR12AB1234"],
    ["Total Estimated Amount", "202716"]
  ],
  "result": {
    "headers": [
      "Part No.", "Part Desc.", "MRP", "Quantity", "Service Type",
      "R&R Hrs", "R&R Cost", "Denting Cost", "Painting Cost", "Total",
      "Approval Qty", "Approval Type"
    ],
    "tables": [[
      {
        "Part No.": "76004Q6000",
        "Part Desc.": "PANEL ASSY-FRONT DOOR,RH",
        "MRP": 9066.41,
        "Quantity": 1,
        "Service Type": "REPLACE",
        "R&R Hrs": 1,
        "R&R Cost": 1066.72,
        "Denting Cost": 0,
        "Painting Cost": 0,
        "Total": 12671.72,
        "Approval Qty": "",
        "Approval Type": ""
      }
    ]]
  },
  "miscellaneous": [],
  "grand_total": {
    "2": 130549,
    "7": 72167,
    "9": 202716
  },
  "workshop_details": [
    ["Workshop Name", "Kia Workshop"]
  ]
}
```

Note: `Total` on merged row may be `partsCost + R&R Cost` or `totalAmount` from PDF — align with how the existing UI calculates row totals.

---

## 13. PHP mapper skeleton

```php
<?php

namespace App\Services\Extraction;

class WorkshopResultMapper
{
    /** @param array<string, mixed> $aimoduleResult */
    /** @param array<string, mixed> $context claimNo, policyNumber, vehicleModel, icName, workshopAddress, ... */
    public function toLegacyFormat(array $aimoduleResult, array $context = []): array
    {
        $workshop = $aimoduleResult['workshopDetails'] ?? [];
        $summary = $aimoduleResult['summary'] ?? [];
        $layout = $aimoduleResult['tableLayout'] ?? 'split';

        $rows = $layout === 'sequential'
            ? $this->mapSequentialLineItems($aimoduleResult['lineItemsTable'] ?? [])
            : $this->mapSplitTables(
                $aimoduleResult['partsTable'] ?? [],
                $aimoduleResult['labourTable'] ?? []
            );

        return [
            'state' => ($aimoduleResult['isCorrectDocumentType'] ?? false) ? 'SUCCESS' : 'FAILURE',
            'estimation_details' => $this->mapEstimationDetails($workshop, $summary, $context),
            'result' => [
                'headers' => $this->legacyHeaders(),
                'tables' => [$rows],
            ],
            'miscellaneous' => [],
            'grand_total' => $this->mapGrandTotal($summary),
            'workshop_details' => $this->mapWorkshopDetails($workshop, $context),
        ];
    }

    private function legacyHeaders(): array
    {
        return [
            'Part No.', 'Part Desc.', 'MRP', 'Quantity', 'Service Type',
            'R&R Hrs', 'R&R Cost', 'Denting Cost', 'Painting Cost', 'Total',
            'Approval Qty', 'Approval Type',
        ];
    }

    /** @param array<int, array<string, mixed>> $lineItems */
    private function mapSequentialLineItems(array $lineItems): array
    {
        $legacyRows = [];
        $openParts = [];

        foreach ($lineItems as $item) {
            if (($item['rowType'] ?? '') === 'PART') {
                $row = $this->emptyLegacyRow();
                $row['Part No.'] = $item['itemCode'] ?? '';
                $row['Part Desc.'] = $item['description'] ?? '';
                $row['MRP'] = $item['rate'] ?? 0;
                $row['Quantity'] = $item['quantity'] ?? 1;
                $row['Service Type'] = 'REPLACE';
                $row['Total'] = $item['partsCost'] ?? $item['totalAmount'] ?? 0;
                $legacyRows[] = $row;
                $openParts[] = &$legacyRows[array_key_last($legacyRows)];
                continue;
            }

            if (($item['rowType'] ?? '') === 'LABOUR') {
                $target = $this->findBestPartMatch($openParts, $item['description'] ?? '');
                $cost = $item['labourCost'] ?? $item['totalAmount'] ?? 0;
                $desc = strtoupper($item['description'] ?? '');

                if ($target !== null) {
                    if (str_contains($desc, 'DENTING')) {
                        $target['Denting Cost'] += $cost;
                    } elseif (str_contains($desc, 'PAINT') || str_contains($desc, 'BODY')) {
                        $target['Painting Cost'] += $cost;
                    } else {
                        $target['R&R Cost'] += $cost;
                        $target['R&R Hrs'] = $item['quantity'] ?? 1;
                    }
                    $target['Total'] = ($target['MRP'] ?? 0)
                        + $target['R&R Cost'] + $target['Denting Cost'] + $target['Painting Cost'];
                } else {
                    $row = $this->emptyLegacyRow();
                    $row['Part Desc.'] = $item['description'] ?? '';
                    $row['R&R Cost'] = $cost;
                    $row['Total'] = $cost;
                    $legacyRows[] = $row;
                }
            }
        }

        return $legacyRows;
    }

    /** @param array<int, array<string, mixed>> $parts */
    /** @param array<int, array<string, mixed>> $labour */
    private function mapSplitTables(array $parts, array $labour): array
    {
        $lineItems = [];
        foreach ($parts as $p) {
            $lineItems[] = [
                'rowType' => 'PART',
                'itemCode' => $p['partNumber'] ?? null,
                'description' => $p['description'] ?? '',
                'quantity' => $p['quantity'] ?? 1,
                'rate' => $p['unitPrice'] ?? 0,
                'partsCost' => $p['totalPrice'] ?? 0,
                'totalAmount' => $p['totalPrice'] ?? 0,
            ];
        }
        foreach ($labour as $l) {
            $lineItems[] = [
                'rowType' => 'LABOUR',
                'description' => $l['description'] ?? '',
                'quantity' => $l['quantityOrHours'] ?? 1,
                'labourCost' => $l['totalAmount'] ?? 0,
                'totalAmount' => $l['totalAmount'] ?? 0,
            ];
        }
        return $this->mapSequentialLineItems($lineItems);
    }

  private function emptyLegacyRow(): array
    {
        return [
            'Part No.' => '', 'Part Desc.' => '', 'MRP' => 0, 'Quantity' => 1,
            'Service Type' => 'REPLACE', 'R&R Hrs' => 0, 'R&R Cost' => 0,
            'Denting Cost' => 0, 'Painting Cost' => 0, 'Total' => 0,
            'Approval Qty' => '', 'Approval Type' => '',
        ];
    }

    /** @param array<int, array<string, mixed>> $openParts */
    private function findBestPartMatch(array $openParts, string $labourDesc): ?array
    {
        $best = null;
        $bestScore = 0;
        $window = array_slice($openParts, -5);
        foreach ($window as &$part) {
            $score = $this->tokenOverlap($part['Part Desc.'] ?? '', $labourDesc);
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = &$part;
            }
        }
        return $bestScore >= 2 ? $best : null;
    }

    private function tokenOverlap(string $a, string $b): int
    {
        $ta = array_filter(preg_split('/\W+/', strtoupper($a)));
        $tb = array_filter(preg_split('/\W+/', strtoupper($b)));
        return count(array_intersect($ta, $tb));
    }

    private function mapEstimationDetails(array $workshop, array $summary, array $ctx): array
    {
        return array_values(array_filter([
            ['Estimation ID', $ctx['estimationId'] ?? $workshop['jobCardNumber'] ?? '', 'Claim No', $ctx['claimNo'] ?? ''],
            ['Policy Number', $ctx['policyNumber'] ?? '', 'Customer Name', $workshop['customerName'] ?? ''],
            ['IC Name', $ctx['icName'] ?? '', 'Vehicle Model', $ctx['vehicleModel'] ?? ''],
            ['Registration No', $workshop['vehicleNumber'] ?? '', 'NCB %', $ctx['ncbPercent'] ?? '0'],
            ['Total Estimated Amount', (string) ($summary['grandTotal'] ?? '')],
            ['Intimation Date', $workshop['invoiceDate'] ?? ''],
        ], fn ($row) => $row !== null));
    }

    private function mapGrandTotal(array $summary): array
    {
        return [
            '2' => $summary['totalPartsAmount'] ?? 0,
            '7' => $summary['totalLabourAmount'] ?? 0,
            '8' => $summary['totalGstAmount'] ?? 0,
            '9' => $summary['grandTotal'] ?? 0,
        ];
    }

    private function mapWorkshopDetails(array $workshop, array $ctx): array
    {
        return [
            ['Workshop Name', $workshop['name'] ?? ''],
            ['Workshop Address', $ctx['workshopAddress'] ?? ''],
        ];
    }
}
```

---

## 14. Webhook gzip handler (Laravel)

### When gzip is used

aimodule gzip-compresses webhook bodies larger than **50 KB** (common for workshop bills with 50+ line items). The `Content-Encoding: gzip` header is set; signature is always computed on the **original uncompressed JSON string**.

### Order of operations (critical)

```
1. Read raw request bytes
2. If Content-Encoding == gzip → gunzip → uncompressed bytes
3. HMAC-SHA256 verify on uncompressed bytes
4. json_decode → payload array
5. Find extraction by correlationId
6. Save raw_result → run mapper → save mapped_result
```

**Common mistake:** verifying `X-Webhook-Signature` on compressed bytes — verification will always fail.

### Laravel controller example

```php
// Disable default JSON middleware for this route — need raw bytes first.
$rawBytes = $request->getContent();

if (strtolower($request->header('Content-Encoding', '')) === 'gzip') {
    $uncompressed = gzdecode($rawBytes);
    if ($uncompressed === false) {
        abort(400, 'Invalid gzip body');
    }
    $rawBytes = $uncompressed;
}

$expected = hash_hmac('sha256', $rawBytes, config('services.aimodule.webhook_secret'));
$received = $request->header('X-Webhook-Signature', '');

if (!hash_equals($expected, $received)) {
    abort(401, 'Invalid webhook signature');
}

$payload = json_decode($rawBytes, true, 512, JSON_THROW_ON_ERROR);
$correlationId = $payload['correlationId'] ?? $request->header('X-Correlation-Id');

// Dispatch job or update DB...
return response()->json(['received' => true]);
```

### Route middleware note

For signature verification you need the **raw body** before Laravel parses JSON. Options:

- Use `$request->getContent()` in controller (as above)
- Or add middleware with `verify` on `json` parser: `req.rawBody = buf` (see `test-backend/src/app.js`)

---

## 15. Reference files in this repo

| Topic | File |
|-------|------|
| Extract API route | `aimodule/src/modules/document/document.route.ts` |
| Request validation | `aimodule/src/modules/document/validator/document.validator.ts` |
| Webhook sender | `aimodule/src/infrastructure/webhook/webhook.service.ts` |
| Workshop schema | `aimodule/src/modules/document/schema/workshop/workshop-bill.schema.ts` |
| Laravel reference — call aimodule | `test-backend/src/modules/extraction/extraction.service.js` |
| Laravel reference — webhook | `test-backend/src/modules/webhook/webhook.service.js` |
| Docker stack | `docker-compose.yml` |
| Deployment | `DEPLOY.md` |

---

## 16. Meeting summary (one paragraph)

aimodule is the internal AI engine on its own VPS; Laravel is the product backend on another server. Laravel calls `http://<aimodule-ip>:3000`, receives webhooks on its own HTTPS URL, and **maps** aimodule JSON into the legacy UI format before display. Set `WEBHOOK_URL` in aimodule `.env` to Laravel's webhook. Share `JWT_SECRET` + `WEBHOOK_SECRET`. Firewall port 3000 to Laravel IP only. Use `tableLayout: sequential` for Kia/Honda mixed formats. See section 5b and 6 in this doc for full HTTP examples.
