# System Architecture Overview
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Related Components:** `src/app.js`, `src/services/`, `src/middleware/`
**Related Decisions:** ADR-001, ADR-002, ADR-003

---

## Purpose

Provide a REST API that accepts a natural-language promotion description and returns
SFCC-compliant promotion XML that can be imported directly into Salesforce Commerce Cloud
Business Manager without modification.

---

## High-Level Architecture

```mermaid
graph TD
    A[HTTP Client<br/>Power Automate / Copilot Studio / curl] -->|POST /api/v1/promotions/generate| B[Express API]
    B --> C{FEATURE_FLAG_USE_AI?}
    C -->|true + valid key| D[claudeService<br/>→ Anthropic API]
    C -->|false or no key| E[localParser<br/>deterministic rules]
    D --> F[Promotion Intent JSON]
    E --> F
    F --> G[validationService<br/>AJV + JSON Schema]
    G -->|invalid| H[422 Response]
    G -->|valid| I[xmlService<br/>xmlbuilder2 builders]
    I --> J[SFCC Promotion XML string]
    J --> K[validationService<br/>structural XML check]
    K --> L[200 Response<br/>{ xml, parsed, requestId, warnings }]
```

---

## Layer Responsibilities

### Transport Layer — `src/app.js`
- Express server
- Global middleware: helmet, cors, JSON body parser (1 MB limit)
- Route mounting: `/health`, `/api/v1/promotions`
- Error handler registration

### Middleware Layer — `src/middleware/`

| File | Responsibility |
|---|---|
| `auth.js` | API key validation via `X-API-Key` header. Bypassed when `API_KEY` env is blank. Bypassed in `NODE_ENV=test`. |
| `rateLimiter.js` | express-rate-limit, configurable via env. Skipped in test. |
| `requestLogger.js` | Winston-based request/response logging with duration. |
| `errorHandler.js` | Centralized error handler. Maps Anthropic SDK errors to 502. Hides stack traces in production. |

### Route Layer — `src/routes/`

| Route | Method | Handler |
|---|---|---|
| `/health` | GET | Inline — returns status/version/timestamp |
| `/api/v1/promotions/generate` | POST | `promotionController.generate` |
| `/api/v1/promotions/parse` | POST | `promotionController.parse` |
| `/api/v1/promotions/validate` | POST | `promotionController.validate` |

### Controller Layer — `src/controllers/promotionController.js`
- Input validation (intent/xml field presence)
- Request ID generation (UUID v4)
- Orchestrates: claudeService → validationService → xmlService → validationService
- Returns structured JSON response

### Service Layer — `src/services/`

| File | Responsibility |
|---|---|
| `claudeService.js` | **Router.** Evaluates `FEATURE_FLAG_USE_AI` + key validity. Routes to Anthropic API or localParser. |
| `localParser.js` | **Deterministic intent parser.** Six sub-parsers (discount, condition, dates, exclusivity, currency, product keywords). Zero external dependencies. |
| `xmlService.js` | **Deterministic XML builder.** Converts validated intent JSON → SFCC XML string using xmlbuilder2. Never calls AI. |
| `validationService.js` | **Two validators.** AJV validates intent JSON against `promotionIntent.json` schema. Structural regex validates generated XML for required SFCC elements. |

### Utility Layer — `src/utils/`

| File | Responsibility |
|---|---|
| `logger.js` | Winston logger. JSON in production, colorized in dev. Silent in test. |
| `helpers.js` | `slugify()`, `toISODate()`, `addDays()` — pure functions, fully testable. |

### Schema Layer — `src/schemas/`

| File | Purpose |
|---|---|
| `promotionIntent.json` | AJV JSON Schema v7 for intent objects. Currently v1 (simple). v2 pending. |
| `promotion.xsd` | XSD reference schema for SFCC promotion XML. Used for documentation and external tooling. |

### Template Layer — `src/templates/`
- `promotion.xml` — Reference XML showing 4 real SFCC promotion patterns. Not used in code generation. Documentation only.

---

## Data Flow Detail

### `/generate` endpoint
```
POST body: { intent: "10% off orders over $50 in July" }

1. auth middleware        → verify X-API-Key (or bypass)
2. rateLimiter            → check rate limit
3. controller             → validate { intent } present and non-empty
4. claudeService          → route to localParser or Anthropic API
5. localParser/claude     → return PromotionIntentV1 JSON object
6. validationService      → validateIntent(json) via AJV
7. xmlService             → buildXml(json) via xmlbuilder2
8. validationService      → validateXml(xml) structural check
9. controller             → assemble response

Response: {
  requestId: uuid,
  intent: original string,
  parsed: PromotionIntentV1,
  xml: SFCC XML string,
  warnings: string[]
}
```

### `/parse` endpoint
Steps 1–6 only. Returns JSON without XML generation.

### `/validate` endpoint
Steps 1–2 then jumps to step 8 only. Validates existing XML string.

---

## Technology Stack

| Concern | Library | Version |
|---|---|---|
| HTTP server | express | ^4.21.2 |
| XML generation | xmlbuilder2 | ^3.1.1 |
| JSON validation | ajv + ajv-formats | ^8.17.1 / ^3.0.1 |
| AI client | @anthropic-ai/sdk | ^0.39.0 |
| ID generation | uuid | ^11.1.0 |
| Logging | winston | ^3.17.0 |
| Security | helmet, cors | latest |
| Rate limiting | express-rate-limit | ^7.5.0 |
| Env loading | dotenv | ^16.4.7 |
| Testing | jest + supertest | ^29.7.0 / ^7.0.0 |
| Dev server | nodemon | ^3.1.9 |

---

## Deployment Targets

| Target | Config |
|---|---|
| Local dev | `npm run dev` (nodemon, port 3000) |
| Docker | `docker-compose up` — multi-stage Alpine build, non-root user |
| GitHub Actions | CI on Node 18/20/22 matrix; publish to GHCR on main push |
| Azure Container Apps | Target deployment (Power Automate connectivity) |
| Copilot Studio | Via Power Platform Custom Connector → this service |

---

## Security Model

| Control | Implementation |
|---|---|
| API key auth | `X-API-Key` header, constant-time compare |
| Rate limiting | 60 req/min default (configurable) |
| Input size cap | 1 MB JSON body limit |
| HTTP security headers | helmet (CSP, HSTS, etc.) |
| Non-root Docker | `appuser` in Alpine image |
| No secrets in repo | `.env` in `.gitignore` |
| Production error masking | Stack traces hidden when `NODE_ENV=production` |
