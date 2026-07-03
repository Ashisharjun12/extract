# Laravel team — integration only (Phase 1)

aimodule = separate VPS (AI extraction). Laravel = your app (routes, DB, webhook, later mapper).

**Phase 1 focus:** 3 routes + payloads + save `raw_result`.  
**Phase 2 (later):** `WorkshopResultMapper` → legacy UI JSON.


---

## Flow

```
1. Frontend  →  Laravel POST /extract
2. Laravel   →  aimodule POST /api/v1/documents/extract  (tableLayout: sequential)
3. aimodule  →  Laravel 202 queued  (immediate)
4. Laravel   →  Frontend 202 queued
5. aimodule  →  Laravel webhook  (1–3 min later, raw JSON)
6. Laravel   →  save raw_result, status = completed
7. Frontend  →  Laravel GET /extractions/{id}  (poll)
8. Laravel   →  Frontend status + mappedResult  (mapper — phase 2)
```

Always send **`tableLayout: "sequential"`** to aimodule — preserves PDF row order. Never use `split`.

---

## .env

```env
AIMODULE_URL=http://<aimodule-vps-ip>:3000
AIMODULE_JWT_SECRET=<same as aimodule JWT_SECRET>
AIMODULE_WEBHOOK_SECRET=<same as aimodule WEBHOOK_SECRET>
```

JWT for aimodule calls: `{ "id": "user-id", "role": "Surveyor" }`

---

## 3 routes to build

| # | Route | Caller | Job |
|---|-------|--------|-----|
| 1 | `POST /api/claims/{id}/extract` | Frontend | Start job, return 202 |
| 2 | `POST /api/webhooks/extraction-complete` | aimodule | Receive result, save DB |
| 3 | `GET /api/extractions/{id}` | Frontend | Poll status |

---

## Route 1 — Start extraction

### A) Frontend → Laravel

```http
POST /api/claims/123/extract
Authorization: Bearer <your-user-token>
Content-Type: application/json
```

```json
{
  "fileUrl": "https://cdn.example.com/bills/estimate.pdf",
  "documentType": "WORKSHOP"
}
```

### B) Laravel → aimodule (return 202 to frontend immediately — do not wait)

```http
POST {AIMODULE_URL}/api/v1/documents/extract
Authorization: Bearer <JWT>
X-Correlation-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

```json
{
  "type": "WORKSHOP",
  "urls": ["https://cdn.example.com/bills/estimate.pdf"],
  "mode": "async",
  "tableLayout": "sequential",
  "documentId": "laravel-extraction-42",
  "documentName": "estimate.pdf"
}
```

### C) aimodule → Laravel (immediate)

```json
{
  "success": true,
  "jobId": "workshop:abc123",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

### D) Laravel → Frontend (202)

```json
{
  "extractionId": "laravel-extraction-42",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

**Laravel saves:** `correlation_id`, `aimodule_job_id`, `file_url`, `status=queued`, `table_layout=sequential`

---

## Route 2 — Webhook (aimodule → Laravel)

```http
POST /api/webhooks/extraction-complete
Content-Type: application/json
Content-Encoding: gzip
X-Webhook-Signature: <hmac-sha256-hex>
X-Correlation-Id: 550e8400-e29b-41d4-a716-446655440000
```

**Handler order:**
1. Read raw bytes → `gzdecode()` if `Content-Encoding: gzip`
2. Verify `X-Webhook-Signature` = HMAC-SHA256(secret, **uncompressed** bytes)
3. Find row by `correlationId`
4. Save `raw_result` = `payload.result`
5. Set `status = completed` (or `failed`)
6. Return `200` `{ "received": true }`

### Webhook wrapper (what aimodule POSTs)

```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "workshop:abc123",
  "documentType": "WORKSHOP",
  "status": "success",
  "result": { },
  "error": null,
  "totalTokens": 45000,
  "totalCostINR": 28.5,
  "durationMs": 120000
}
```

**On failure:**

```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failure",
  "result": null,
  "error": "WRONG_DOCUMENT_TYPE"
}
```

Large bills (>50 KB) are **gzip** — gunzip before HMAC verify.

---

## What aimodule puts inside `result` (`raw_result`)

Save the whole `result` object. This is **not** legacy UI format.

### Document-level fields

| Field | Example | Notes |
|-------|---------|-------|
| `isCorrectDocumentType` | `true` | Workshop bill? |
| `detectedDocumentType` | `WORKSHOP_BILL` | |
| `confidenceScore` | `1` | 0–1 |
| `requiresHumanReview` | `false` | Show flag in UI |
| `tableLayout` | `sequential` | Always sequential |
| `workshopDetails` | object | Name, GSTIN, invoice no, customer, vehicle no, date |
| `summary` | object | Parts total, labour total, grand total, GST |
| `vehicleNumber` | `HR38AF1117` | Normalized reg no |
| `vehicleState` | `HR` | Optional |
| `billType` | `UNKNOWN` | Classified by aimodule |
| `gstSummary` | object | GST type, rate, total tax |
| `grandTotalVerified` | `true` | `false` → human review |
| `extractionMode` | `chunk-fallback` | Audit only |

### Line items — main data (`lineItemsTable`)

All rows in **PDF document order**. Primary table for mapper (phase 2).

| Field | PART row | LABOUR row |
|-------|----------|------------|
| `rowIndex` | 1, 2, 3… | continues |
| `rowType` | `PART` | `LABOUR` |
| `srNo` | Printed S.No | Printed S.No |
| `itemCode` | Part number | Labour code |
| `hsnSac` | HSN code | SAC 998714 |
| `description` | Part name | Job description |
| `uom` | PC, L, ML | often null |
| `quantity` | Qty | Hours |
| `rate` | Unit price | Rate |
| `taxableAmount` | Taxable | Taxable |
| `taxAmount` | CGST+SGST sum | Tax |
| `totalAmount` | Line total | Line total |
| `partsCost` | total if PART | null |
| `labourCost` | null | total if LABOUR |
| `extraColumns` | `[{key, value}]` | Share %, CGST %, Status PAID, etc. |

Also returned (derived, same rows split by type):
- `partsTable` — PART rows only
- `labourTable` — LABOUR rows only

Use **`lineItemsTable`** for PDF order. Use derived tables only if needed for counting.

### Example — one PART row (from real BharatBenz bill)

```json
{
  "rowIndex": 1,
  "rowType": "PART",
  "srNo": 1,
  "itemCode": "A4003230387",
  "hsnSac": "87088000",
  "description": "BEARING BRACKET STABILIZER LH",
  "uom": "PC",
  "quantity": 1,
  "rate": 956.25,
  "taxableAmount": 956.25,
  "taxAmount": 267.76,
  "totalAmount": 1224.01,
  "partsCost": 1224.01,
  "extraColumns": [
    { "key": "Share %", "value": "100" },
    { "key": "SGST %", "value": "14" },
    { "key": "CGST %", "value": "14" },
    { "key": "IGST %", "value": "0" }
  ]
}
```

### Example — one LABOUR row

```json
{
  "rowIndex": 180,
  "rowType": "LABOUR",
  "srNo": 1,
  "itemCode": "01201263",
  "hsnSac": "998714",
  "description": "Short block assembly…",
  "quantity": 17.3,
  "rate": 9515,
  "taxableAmount": 9515,
  "taxAmount": 1712.7,
  "totalAmount": 11227.7,
  "labourCost": 11227.7,
  "extraColumns": [
    { "key": "Status", "value": "PAID" }
  ]
}
```

Real large bills: **185+ rows** (e.g. 179 PART + 6 LABOUR). Webhook will be gzip.

---

## Route 3 — Poll (Frontend → Laravel)

```http
GET /api/extractions/laravel-extraction-42
Authorization: Bearer <your-user-token>
```

### While processing

```json
{
  "id": "laravel-extraction-42",
  "status": "queued",
  "mappedResult": null
}
```

### When done (phase 1 — mapper not ready yet)

```json
{
  "id": "laravel-extraction-42",
  "status": "completed",
  "requiresHumanReview": false,
  "confidenceScore": 1,
  "mappedResult": null
}
```

Phase 1: return `status` + flags. Frontend can show "extraction complete" even before mapper exists.  
Phase 2: `mappedResult` will hold legacy UI JSON.

Poll every **3–5 seconds** until `completed` or `failed`.

---

## DB table `extractions` (minimum)

| Column | Notes |
|--------|-------|
| `id` | PK |
| `correlation_id` | UUID → aimodule |
| `claim_id` | FK |
| `file_url` | Public HTTPS URL |
| `table_layout` | Always `sequential` |
| `status` | `queued`, `completed`, `failed` |
| `aimodule_job_id` | From aimodule 202 |
| `raw_result` | Full `payload.result` JSON |
| `mapped_result` | null until mapper built (phase 2) |
| `requires_human_review` | From aimodule |
| `confidence_score` | From aimodule |
| `total_tokens`, `total_cost_inr` | From webhook |
| `error` | On failure |

---

## Phase 1 checklist

- [ ] PDF upload → public HTTPS URL
- [ ] `extractions` table
- [ ] JWT signer for aimodule
- [ ] `POST /extract` → call aimodule with `tableLayout: sequential` → 202
- [ ] `POST /webhooks/extraction-complete` → gzip + HMAC + save `raw_result`
- [ ] `GET /extractions/{id}` → return `status` (+ `mappedResult` when ready)

---

## Timing

| Step | Time |
|------|------|
| Upload + 202 | ~2 sec |
| aimodule AI | **1–3 min** (large bills 185+ rows) |
| Webhook save | **< 1 sec** |

---

## Mapper + legacy UI — Phase 2 (discuss later)

aimodule **never** returns your old portal JSON. After webhook saves `raw_result`, a **`WorkshopResultMapper`** on Laravel will convert it to `mappedResult` for the frontend (`estimation_details`, `result.tables`, `grand_total`, etc.).

Different PDF types (Maruti, BharatBenz, Volvo) need different mapping rules. **Build routes + webhook first** — mapper design is a separate discussion once `raw_result` is flowing.

Until mapper exists: save `raw_result`, return `status: completed`, `mappedResult: null`.
