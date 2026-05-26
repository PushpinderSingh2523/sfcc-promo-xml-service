# API Contracts
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Base URL:** `http://localhost:3000` (dev) · `https://your-host.com` (prod)
**Related:** `src/routes/`, `src/controllers/promotionController.js`

---

## Authentication

All `/api/v1/promotions/*` endpoints require the `X-API-Key` header when
`API_KEY` is set in `.env`.

```
X-API-Key: your-secret-key
```

Auth is bypassed when:
- `API_KEY` env variable is blank or unset
- `NODE_ENV=test`

---

## Endpoints

---

### GET /health

Returns service health status. No authentication required.

**Response 200:**
```json
{
  "status": "ok",
  "service": "sfcc-promo-xml-service",
  "version": "1.0.0",
  "timestamp": "2026-05-07T10:00:00.000Z"
}
```

---

### POST /api/v1/promotions/generate

Parses a natural-language intent and returns SFCC-compliant promotion XML.

**Request headers:**
```
Content-Type: application/json
X-API-Key: <key>
```

**Request body:**
```json
{
  "intent": "string (required, non-empty, max 1000 chars)",
  "options": {}
}
```

**Response 200 — Success:**
```json
{
  "requestId": "uuid-v4",
  "intent": "original intent string",
  "parsed": {
    "id": "kebab-case-id",
    "campaignId": "campaign-kebab-id",
    "name": "Human-Readable Name",
    "description": "Promotion: ...",
    "enabled": true,
    "exclusivity": "no | class | global",
    "discountType": "percentage | fixed-price | amount-off | free-shipping | bonus-product",
    "discountValue": 10,
    "conditionType": "none | minimum-amount | minimum-quantity | coupon",
    "conditionValue": 50,
    "couponCode": null,
    "startDate": "2026-05-07T00:00:00.000Z",
    "endDate": "2026-08-05T00:00:00.000Z",
    "qualifyingProductIds": ["shoes", "boots"],
    "targetProductIds": [],
    "currency": "USD"
  },
  "xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
  "warnings": []
}
```

**Response 400 — Missing or empty intent:**
```json
{
  "error": "Bad Request",
  "message": "Field \"intent\" is required and must be a non-empty string.",
  "requestId": "uuid-v4"
}
```

**Response 401 — Missing or invalid API key:**
```json
{
  "error": "Unauthorized",
  "message": "Valid API key required in X-API-Key header."
}
```

**Response 422 — Claude returned invalid JSON structure:**
```json
{
  "error": "Intent Validation Failed",
  "message": "Claude returned a JSON structure that does not match the promotion schema.",
  "details": [
    { "field": "/exclusivity", "message": "must be equal to one of the allowed values" }
  ],
  "parsed": { "...raw Claude output..." },
  "requestId": "uuid-v4"
}
```

**Response 429 — Rate limit exceeded:**
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please slow down.",
  "retryAfter": "60"
}
```

**Response 500 — Unexpected error:**
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred."
}
```

**Response 502 — Claude API error:**
```json
{
  "error": "Claude API Error",
  "message": "Failed to communicate with the Claude AI service."
}
```

---

### POST /api/v1/promotions/parse

Parses intent and returns structured JSON only. No XML is generated.
Use this to inspect what the parser extracted without generating XML.

**Request body:** Same as `/generate`

**Response 200:**
```json
{
  "requestId": "uuid-v4",
  "intent": "original intent string",
  "parsed": { "...PromotionIntentV1 object..." },
  "valid": true,
  "errors": []
}
```

When `valid=false`, `errors` contains AJV validation errors:
```json
{
  "valid": false,
  "errors": [
    {
      "field": "/discountValue",
      "message": "must be <= 100000",
      "params": { "limit": 100000 }
    }
  ]
}
```

---

### POST /api/v1/promotions/validate

Validates an existing SFCC XML string for structural correctness.
Does not call the parser or AI.

**Request body:**
```json
{
  "xml": "<xml string>"
}
```

**Response 200 — Valid:**
```json
{
  "requestId": "uuid-v4",
  "valid": true,
  "errors": []
}
```

**Response 200 — Invalid:**
```json
{
  "requestId": "uuid-v4",
  "valid": false,
  "errors": [
    { "field": "xmlns", "message": "SFCC promotion namespace is missing." },
    { "field": "campaign-id", "message": "Required element or attribute \"campaign-id\" is missing." }
  ]
}
```

---

## Request IDs

Every response includes a `requestId` (UUID v4) generated at the start of the request.
Use this ID for log correlation, debugging, and support tickets.

Logs will contain the requestId:
```
2026-05-07T10:00:00.000Z [info] Parsing intent via Claude { requestId: "5ded2d83-...", intent: "10% off..." }
```

---

## Rate Limiting Headers

When rate limiting is active, responses include:
```
RateLimit-Limit: 60
RateLimit-Remaining: 59
RateLimit-Reset: 1715000060
```

---

## curl Examples

### Generate XML (local mode, no key needed)
```bash
curl -s -X POST http://localhost:3000/api/v1/promotions/generate \
  -H "Content-Type: application/json" \
  -d '{"intent": "20% off for VIP members on orders over $100 in July"}' \
  | python3 -m json.tool
```

### Parse intent only
```bash
curl -s -X POST http://localhost:3000/api/v1/promotions/parse \
  -H "Content-Type: application/json" \
  -d '{"intent": "Free shipping for all customers this weekend"}' \
  | python3 -m json.tool
```

### Validate existing XML
```bash
curl -s -X POST http://localhost:3000/api/v1/promotions/validate \
  -H "Content-Type: application/json" \
  -d "{\"xml\": $(cat output/sample-promo.xml | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
  | python3 -m json.tool
```

### With API key (production)
```bash
curl -s -X POST https://your-host.com/api/v1/promotions/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key-here" \
  -d '{"intent": "Partners 40% off with coupon EMPLOYEE40"}' \
  | python3 -m json.tool
```
