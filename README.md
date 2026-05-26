# SFCC Promo XML Service

A production-ready Node.js microservice that converts natural language promotion descriptions into **Salesforce Commerce Cloud (SFCC) compliant XML** using Claude AI.

## Architecture

```
HTTP Request (natural language intent)
       │
       ▼
Express API  ──►  Claude AI  ──►  Structured JSON
                                       │
                                  AJV Validation
                                       │
                                  xmlbuilder2  (deterministic)
                                       │
                                  Structural XML Validation
                                       │
                                       ▼
                              SFCC-compliant XML response
```

**Key design decisions:**
- Claude **only parses intent into JSON** — it never generates XML
- XML generation is **fully deterministic** via `xmlService.js`
- JSON validated with **AJV** against a JSON Schema
- XML structure validated against SFCC namespace patterns
- XSD schema provided for reference / external tooling

---

## Quick Start

```bash
# 1. Clone and install
git clone <your-repo>
cd sfcc-promo-xml-service
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY and API_KEY

# 3. Run development server
npm run dev

# 4. Test
curl -X POST http://localhost:3000/api/v1/promotions/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"intent": "10% off orders over $50 in summer 2025"}'
```

---

## API Reference

### `GET /health`
Returns service health status. No authentication required.

**Response:**
```json
{ "status": "ok", "service": "sfcc-promo-xml-service", "version": "1.0.0", "timestamp": "..." }
```

---

### `POST /api/v1/promotions/generate`
Parses intent and returns SFCC-compliant XML.

**Headers:** `X-API-Key: <key>` · `Content-Type: application/json`

**Request:**
```json
{ "intent": "15% off all footwear with coupon code SHOES15 in December 2025" }
```

**Response (200):**
```json
{
  "requestId": "uuid",
  "intent": "15% off all footwear...",
  "parsed": {
    "id": "15pct-off-footwear-december",
    "discountType": "percentage",
    "discountValue": 15,
    "conditionType": "coupon",
    "couponCode": "SHOES15",
    "startDate": "2025-12-01T00:00:00.000Z",
    "endDate": "2025-12-31T23:59:59.000Z"
  },
  "xml": "<?xml version=\"1.0\"...>",
  "warnings": []
}
```

---

### `POST /api/v1/promotions/parse`
Returns Claude-parsed JSON only (no XML generation).

---

### `POST /api/v1/promotions/validate`
Validates an existing XML string against SFCC structural rules.

**Request:** `{ "xml": "<promotions>...</promotions>" }`

---

## Supported Discount Types

| discountType | SFCC element | Example |
|---|---|---|
| `percentage` | `<percentage>` | 10% off entire order |
| `amount-off` | `<amount>` | $20 off entire order |
| `fixed-price` | `<fixed-price>` | Product fixed at $9.99 |
| `free-shipping` | `<fixed-price>0</fixed-price>` | Free standard shipping |
| `bonus-product` | `<bonus-choice-count>` | Free gift with purchase |

## Supported Conditions

| conditionType | SFCC element | Example |
|---|---|---|
| `none` | `<order-condition/>` | No minimum requirement |
| `minimum-amount` | `<subtotal-condition>` | Orders over $50 |
| `minimum-quantity` | `<quantity-condition>` | Buy 3 or more items |
| `coupon` | `<coupon-condition>` | With coupon code |

---

## Running Tests

```bash
npm test                # All tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests only
npm run test:coverage   # With coverage report
```

---

## Docker

```bash
# Build and run
docker-compose up --build

# Or standalone
docker build -t sfcc-promo-xml-service .
docker run -p 3000:3000 --env-file .env sfcc-promo-xml-service
```

---

## Integration Guides

- [Power Automate Integration](docs/power-automate-integration.md)
- [Copilot Studio Integration](docs/copilot-studio-integration.md)

---

## Project Structure

```
sfcc-promo-xml-service/
├── src/
│   ├── app.js                         # Express app entry point
│   ├── routes/
│   │   ├── health.js
│   │   └── promotions.js
│   ├── controllers/
│   │   └── promotionController.js
│   ├── services/
│   │   ├── claudeService.js           # Claude API — intent → JSON
│   │   ├── xmlService.js              # Deterministic XML builder
│   │   └── validationService.js       # AJV + structural XML validation
│   ├── middleware/
│   │   ├── auth.js                    # API key authentication
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   └── requestLogger.js
│   ├── utils/
│   │   ├── logger.js                  # Winston logger
│   │   └── helpers.js
│   ├── schemas/
│   │   ├── promotionIntent.json       # AJV JSON Schema
│   │   └── promotion.xsd              # SFCC XSD reference
│   └── templates/
│       └── promotion.xml              # Reference template from SFCC export
├── tests/
│   ├── unit/
│   │   ├── xmlService.test.js
│   │   ├── validationService.test.js
│   │   └── helpers.test.js
│   ├── integration/
│   │   └── api.test.js
│   └── fixtures/
│       ├── sampleIntent.json
│       └── samplePromotion.xml
├── docs/
│   ├── power-automate-integration.md
│   └── copilot-studio-integration.md
├── .github/workflows/ci.yml
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-6` | Claude model ID |
| `API_KEY` | No* | — | Service API key (*recommended for production) |
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | Environment |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | No | `60` | Max requests per window |
| `LOG_LEVEL` | No | `info` | Winston log level |

---

## License

MIT
