# CHANGELOG
# SFCC Promotion XML Service

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Planned
- Round-trip XML regression tests: parse reference XMLs → v2 object → regenerate → diff
- SFCC sandbox import test suite
- APIM deployment with subscription keys

---

## [1.4.3] — 2026-05-08

### Fixed — Validation gate: no more 422 before clarification completes

**`src/controllers/promotionController.js`** — restructured `generate()` into explicit stages:
- Stage 3 (new): clarification gate checks `clarificationRequired` before any validation
- If clarification required and `forceGenerate` not set: returns 200 immediately with `nextQuestionText`, `missingFields`, and `validation.document.skipped: true` — no AJV run
- Stage 4 (validation) only reached when parser reports the document is complete
- 422 is now reserved exclusively for structurally invalid *completed* documents
- All responses include flat Copilot Studio scalar fields: `nextQuestionText`, `nextQuestionHint`, `nextQuestionFieldId`

**`src/controllers/sessionController.js`** — restructured `clarify()` to match the same contract:
- Incomplete sessions (still have pending questions): return next question, skip validation entirely
- Completed sessions (no more questions): run validation; if it fails, return `completed: true, validationFailed: true, xml: null` so Copilot Studio exits the question loop and shows an error rather than asking another question
- All responses include the same flat scalar fields

### Added — Clarification flow integration tests

**`tests/integration/clarificationFlow.test.js`** — 7 new tests:
- Incomplete shipping promotion → 200 (not 422), clarificationRequired true, question text present
- Ambiguous order promotion ("10% off") → 200, clarificationRequired true
- Coupon promotion missing code → 200, clarificationRequired true
- Full flow: generate → clarify → completed: true, xml present
- 422 only fires when forceGenerate bypasses clarification on a structurally invalid doc
- 200 (not 422) when clarificationRequired is true even if the partial doc would fail AJV

### Stats
- Tests: 444 → 451 (+7)
- Test suites: 22 → 23 (+1)

---

## [1.4.2] — 2026-05-07

### Added — Copilot Studio-compatible OpenAPI spec

**`openapi/copilot-studio-api.yaml`** — second OpenAPI file tuned for Microsoft Power Platform import:
- OpenAPI 3.0.1 (Power Platform rejects 3.1.x)
- 3 endpoints only: POST /generate, POST /clarify, GET /health
- Flat response schemas — no nested objects, no $ref chains deeper than one level
- No nullable fields, no oneOf/allOf/anyOf, no format:uuid, no format:date-time
- No markdown in descriptions (plain text only, under 150 chars each)
- Unique alphanumeric operationIds: GeneratePromotion, ClarifyPromotion, GetHealth
- All POST nextQuestion fields flattened to scalar strings (nextQuestionText, nextQuestionHint, nextQuestionFieldId) instead of a nested object — Copilot Studio maps each directly to a variable
- Server URL placeholder: https://YOUR_NGROK_URL

**`openapi/validate-copilot-spec.js`** — 26-check validation script:
- Version, server, path existence, path count
- Unique/alphanumeric operationIds
- No nullable, no oneOf/allOf/anyOf, no external $ref
- No format:uuid, no format:date-time
- No markdown in descriptions, description length under 150 chars
- All schemas have explicit type, required[] only references defined properties
- All POST operations have requestBody

**`package.json`** — added `validate:copilot` script: `node openapi/validate-copilot-spec.js`

### Validation result
26/26 checks pass. 444/444 tests passing. No regressions.

---

## [1.4.1] — 2026-05-07

### Fixed — Local development stability (ngrok + nodemon)

**Problem 1 — nodemon restart loop**
- **Root cause**: nodemon's default watch scope included `runtime/`, `output/`, and log files. Every request that wrote a session or log file triggered a restart, causing an infinite restart loop.
- **Fix**: Added `nodemon.json` that restricts `watch` to `["src"]` and ignores `runtime/**`, `output/**`, `docs/**`, `coverage/**`, `tests/**`, `.git/**`, `**/*.log`. Added 500 ms debounce delay.

**Problem 2 — ERR_ERL_UNEXPECTED_X_FORWARDED_FOR behind ngrok**
- **Root cause**: ngrok injects `X-Forwarded-For` headers. express-rate-limit v7 throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` when it sees that header without Express being configured to trust proxy headers.
- **Fix**: Added `app.set('trust proxy', 1)` in `src/app.js`. Added `validate: { xForwardedForHeader: false }` in `src/middleware/rateLimiter.js` to silence the rate-limiter's independent check.

**Problem 3 — EADDRINUSE on nodemon auto-restart**
- **Root cause**: On SIGINT, Node's server held keep-alive TCP connections open. The new nodemon process tried to bind before the old one released the port.
- **Fix**: Added graceful shutdown handlers in `src/app.js` — `server.close()` on SIGINT/SIGTERM with an 8-second force-exit safety timeout. Added `server.on('error')` to surface EADDRINUSE with a helpful diagnostic message instead of an unhandled crash.

### Files changed
- `nodemon.json` (new)
- `src/app.js` — trust proxy, graceful shutdown
- `src/middleware/rateLimiter.js` — validate.xForwardedForHeader: false
- `docs/troubleshooting/ngrok-and-nodemon.md` (new)

### Tests
444/444 passing — no regressions

---

## [1.4.0] — 2026-05-07

### Phase 3: Copilot Studio + API Integration Preparation

#### New Endpoints
- `POST /api/v1/promotions/clarify` — multi-turn conversational clarification; accepts `{sessionId, answer}`, returns next question or completed XML
- `POST /api/v1/promotions/preview` — parse + XML + human-readable summary without persisting session
- `POST /api/v1/promotions/import-xml` — deterministic SFCC XML → PromotionDocumentV2 (no AI)
- `GET  /api/v1/promotions/capabilities` — all supported types, methods, groups, patterns; Copilot-adaptive metadata

#### New Services
- `src/services/sessionManager.js` — file-backed session store with 2h TTL; createSession, getSession, applyAnswer, completeSession, deleteSession, listSessions
- `src/services/promotionSummaryService.js` — generateSummary() → oneLiner, headline, bullets, businessNote; explainValidation() → plain English error descriptions
- `src/services/diffService.js` — diff(oldPromo, newPromo) comparing XML or PromotionDocumentV2; structured changes by category with human-readable summary
- `src/services/xmlImportService.js` — deterministic SFCC XML parser; importXml() → {document, warnings, fieldMap}; preserves promotionId, lifecycle, discounts, campaigns, assignments

#### New Controllers
- `src/controllers/sessionController.js` — POST /clarify handler
- `src/controllers/previewController.js` — POST /preview, POST /import-xml, GET /capabilities handlers

#### API Infrastructure
- `openapi/promotion-api.yaml` — full OpenAPI 3.1.0 spec with request/response examples for all endpoints
- Swagger UI at `/api-docs` (swagger-ui-express + js-yaml)
- All `/generate` responses now include `sessionId`, `correlationId`, `summary`
- Runtime directories auto-created: `/runtime/{logs,sessions,exports,imports,traces}`

#### Enterprise Logging
- `src/utils/logger.js` — added File transport to `runtime/logs/app.log` and `runtime/logs/error.log` (10 MB max, 5 rotated files); JSON format in production

#### Integration Documentation
- `docs/integrations/copilot-studio-v2.md` — Custom Connector setup, conversation topic design, adaptive card templates, session management, error handling, Teams deployment
- `docs/integrations/power-automate-v2.md` — 4 flow architectures (generation+approval, multi-turn clarification, bulk import/export, diff+review); adaptive card expressions; environment variables
- `docs/deployment/deployment-targets.md` — local, Docker, Azure Container Apps, APIM deployment commands and env var reference

#### Tests Added
- `tests/unit/sessionManager.test.js` — 16 tests
- `tests/unit/promotionSummaryService.test.js` — 18 tests
- `tests/unit/diffService.test.js` — 16 tests
- `tests/unit/xmlImportService.test.js` — 18 tests
- `tests/integration/phase3.test.js` — 18 tests (capabilities, preview, import-xml, clarify, generate Phase 3 fields)
- `tests/integration/businessScenarios.test.js` — 11 tests (8 real-world scenarios + capabilities + preview + import round-trip)

### Total Test Count
**444 tests across 22 suites — all passing**

---

## [1.3.0] — 2026-05-07

### Added — Phase 2: End-to-End Generation Pipeline

#### Parser Strategy Layer (`src/services/parserStrategies/`)
- `discountParser.js` — percentage/amount/fixed-price/free/GWP detection; tiered discounts ("10% off over $500 and 20% off over $2000"); per-strategy confidence + matchedPatterns + warnings
- `scheduleParser.js` — ISO ranges, named-month ranges, named events (Christmas/BlackFriday/birthday), relative keywords (this weekend/next month), 90-day fallback; campaign vs assignment level detection
- `qualifierParser.js` — SFCC customer group ID mapping (VIP, Employees, Partners, etc.); coupon code extraction; source codes; exclusivity hint
- `shippingParser.js` — SFCC shipping method ID mapping (standard/twoday/overnight/surepost/hazmat); upsell threshold extraction; disable-global-exclusion signals
- `categoryParser.js` — SFCC category ID mapping (handbags/shoes/apparel/watches/accessories/etc.); raw word extraction for backward compat
- `exclusionParser.js` — direct exclusion phrases + trigger-based two-pass detection; maps to SFCC exclusion category IDs
- `lifecycleParser.js` — lifecycle flags (enabled/archived/searchable/refinable/preventRequalifying); exclusivity (no/class/global)
- `conditionParser.js` — coupon/minimum-amount/minimum-quantity detection; coupon code extraction
- `currencyParser.js` — GBP/EUR/CAD/AUD/USD detection

#### Orchestrator Refactor (`src/services/localParser.js`)
- Refactored to pure orchestrator — no regex, only coordination of strategy modules
- `parseIntent(intent, now)` → returns full `PromotionDocumentV2` including all blocks
- Confidence scoring: weighted average `(avg×0.7 + min×0.3)` across all strategy confidences
- Ambiguity detection: `clarificationQuestions[]` for missing/low-confidence fields
- Parser trace: strategy-level matchedPatterns, warnings, confidence per strategy
- Backward-compat re-exports: parseDiscount, parseCondition, parseDates, parseExclusivity, parseCurrency, parseProductKeywords

#### Conversational UX Layer (`src/services/questionFlowService.js`)
- `QUESTION_CATALOGUE` — 6 entries with text, hint, type, severity, choices
- `getNextQuestion()` — picks ONE question, critical before recommended, by priority order
- `buildFlowState()` — full flow state for API response
- `mergeAnswer()` — combines original intent with user answer for re-parsing

#### Schema & Validation (`schemas/promotion-document.schema.json`)
- AJV runtime schema for PromotionDocumentV2 — permissive enough for all parser outputs
- `validateDocument(doc)` added to validationService.js with human-readable error suggestions

#### API Pipeline (`src/controllers/promotionController.js`)
- POST /generate: intent → parseIntent → validateDocument → buildDocument (skipped if clarification needed)
- Response: `{success, requestId, confidence, clarificationRequired, clarificationQuestions, nextQuestion, warnings, normalizedDocument, xml, validation, timing}`
- POST /validate: accepts both `xml` string and `document` PromotionDocumentV2 object
- POST /parse: returns full parse result including parserTrace

#### Test Coverage Added
- `tests/unit/parserStrategies/discountParser.test.js` — 60 tests
- `tests/unit/parserStrategies/scheduleParser.test.js` — 35 tests
- `tests/unit/parserStrategies/qualifierParser.test.js` — 25 tests
- `tests/unit/parserStrategies/shippingParser.test.js` — 30 tests
- `tests/unit/parserStrategies/categoryParser.test.js` — 20 tests
- `tests/unit/parserStrategies/exclusionParser.test.js` — 15 tests
- `tests/unit/parserStrategies/lifecycleParser.test.js` — 20 tests
- `tests/unit/parserStrategies/conditionParser.test.js` — 20 tests
- `tests/unit/questionFlowService.test.js` — 20 tests
- `tests/unit/parserScenarios.test.js` — 24 tests (10 real-world E2E + 8 schema round-trips + 6 XML round-trips)
- `tests/snapshots/parser/birthday-promo.json`
- `tests/snapshots/parser/tiered-luxury-promo.json`
- `tests/snapshots/parser/vip-free-twoday-shipping.json`

### Changed
- `src/services/localParser.js` — full rewrite as orchestrator; old flat object output replaced by PromotionDocumentV2
- `src/services/claudeService.js` — both AI and local paths return v2 shape + source field
- `src/services/validationService.js` — added `validateDocument()`; updated `validateXml()` to v2 XML patterns
- `tests/fixtures/samplePromotion.xml` — updated to v2 format (promotion-id, lifecycle flags, order-promotion-rule)
- `tests/unit/localParser.test.js` — scenario tests rewritten for v2 PromotionDocumentV2 shape (75 tests)
- `tests/integration/api.test.js` — mock returns v2 shape; assertions updated for new response fields (11 tests)
- `tests/unit/validationService.test.js` — updated for v2 XML patterns (14 tests)

### Total Test Count
**347 tests across 16 suites — all passing**

---

## [1.2.0] — 2026-05-07

### Added
- `src/services/xmlServiceV2.js` — complete v2 XML builder with 13 modular builder functions
  matching the assembly order in `reference/reusable-xml-blocks.md`
- `tests/unit/xmlServiceV2.test.js` — 54 tests covering all rule types, all discount kinds,
  all builder blocks, and error paths
- `output/fixed-amount-product-discount.xml` — generated from birthday/product-promotion example
- `output/free-shipping.xml` — generated from VIP-2024-Free-Two-Day-Shipping example
- `output/tiered-discount.xml` — generated from VJTEMP2023DTM tiered order example
- `output/welcome-free-standard-shipping.xml` — generated from standalone shipping example
- `output/percentage-order-discount.xml` — generated from percentage order example

### Builder functions implemented
| Function | Block | Description |
|---|---|---|
| `buildDocument(doc)` | — | Top-level orchestrator |
| `_buildCampaign(root, c)` | Block 2 | Campaign with optional dates + customer groups |
| `_buildGlobalSettings(root, gs)` | Block 1 | Global excluded products + product options |
| `_buildPromotion(root, p)` | Block 3 | Promotion shell + lifecycle flags |
| `_buildLifecycleFlags(el, lc)` | Block 3 | Six lifecycle boolean flags |
| `_buildCustomAttributes(el, attrs)` | Block 13 | Key-value custom attribute pairs |
| `_buildRule(promotionEl, p)` | — | Dispatches to product / order / shipping rule |
| `_buildProductRule(promotionEl, p)` | — | product-promotion-rule with qualifying products, discounts, max-applications |
| `_buildOrderRule(promotionEl, p)` | — | order-promotion-rule with excluded/qualifying products, tiered discounts |
| `_buildShippingRule(promotionEl, p)` | — | shipping-promotion-rule with methods, disable-global, upsell-threshold |
| `_buildQualifyingProducts(ruleEl, qp)` | Block 4/5 | Price or category condition groups |
| `_buildExcludedProducts(ruleEl, ep)` | Block 6 | Promotion-level excluded products |
| `_buildDiscounts(ruleEl, conditionType, tiers)` | Block 7/8 | One or many discount tiers |
| `_buildDiscountTier(discountsEl, tier)` | Block 7 | free / percentage / amount / fixed-price |
| `_buildShippingMethods(ruleEl, methodIds)` | Block 9 | shipping-methods list |
| `_buildAssignment(root, a)` | Block 10–12 | Qualifiers, activation coupons, rank, schedule |

### Verified patterns
- Standalone promotion (Welcome-free-standard-shipping): no campaign, no assignment
- Full-stack promotion (VIP-2024-Free-Two-Day-Shipping): campaign + promotion + assignment
- Tiered order discount (VJTEMP2023DTM): 2 discount tiers, category qualifying products
- Product promotion with price-gate (Birthday): product-amount condition, max-applications
- free discount element (`<free/>`) confirmed — NOT `<fixed-price>0</fixed-price>`

### Tests
- 171 tests passing across 6 suites (54 new in xmlServiceV2.test.js)

---

## [1.1.0] — 2026-05-07

### Added
- **Persistent documentation system** — complete `docs/`, `architecture/`, `decisions/`, `reference/`, `prompts/`, `examples/`, `schemas/`, `changelogs/` structure
- `PROJECT_MEMORY.md` — canonical root index of all project knowledge
- `architecture/overview.md` — full system architecture with Mermaid diagram
- `architecture/xml-generation-pipeline.md` — v1 pipeline + v2 target design
- `architecture/intent-parsing-modes.md` — local vs Claude AI mode documentation
- `architecture/promotion-object-model.md` — v1 and v2 object model specification
- `decisions/ADR-001` through `ADR-005` — all architecture decision records
- `docs/business-rules.md` — 12 sections of SFCC promotion business rules
- `docs/api-contracts.md` — complete API reference with curl examples
- `docs/validation-logic.md` — three-stage validation documentation
- `docs/edge-cases.md` — known edge cases, assumptions, and limitations
- `docs/testing-strategy.md` — full testing philosophy and coverage breakdown
- `docs/troubleshooting.md` — startup, API, XML, and parser troubleshooting
- `reference/` — 6 real SFCC XML exports copied as canonical reference
- `reference/xml-structure-analysis.md` — deep file-by-file XML analysis
- `reference/xml-capability-matrix.md` — feature matrix across all 6 files
- `reference/reusable-xml-blocks.md` — 13 parameterizable XML block patterns + assembly order
- `prompts/claude-intent-parsing-system-prompt.md` — canonical Claude system prompt
- `schemas/promotion-intent-v2.json` — full SFCC-fidelity schema (designed, not yet implemented)
- `examples/` — 5 complete v2 PromotionDocumentV2 JSON examples mapped to reference files

### Analysis
- Analyzed 6 real SFCC promotion XML exports: Birthday, THANKS-TEST, Partners-40-off, VIP-2024-Free-Two-Day-Shipping, VJTEMP2023DTM, Welcome-free-standard-shipping
- Identified 3 promotion rule types, 3 discount types, 2 document shapes, 2 schedule locations
- Catalogued 13 reusable XML block patterns
- Documented 22 v1 schema gaps requiring v2 implementation
- Identified critical structural errors in v1 xmlService (wrong element names)

---

## [1.0.1] — 2026-05-07

### Fixed
- `tests/unit/localParser.test.js` — fixed 4 timezone/DST-sensitive date assertions
  by using `.getUTCMonth()`, `.getUTCDate()`, `.getUTCFullYear()` instead of local-time getters
- `src/services/localParser.js` — replaced all `new Date(year, month, day)` constructors
  with `Date.UTC()` to ensure UTC-consistent date boundaries regardless of server timezone

---

## [1.0.0] — 2026-05-06

### Added
- Initial project structure: Express + xmlbuilder2 + AJV
- `src/app.js` — Express application entry point with helmet, cors, rate limiting
- `src/routes/health.js` — `GET /health` endpoint
- `src/routes/promotions.js` — `POST /generate`, `/parse`, `/validate`
- `src/controllers/promotionController.js` — request orchestration with UUID request IDs
- `src/services/claudeService.js` — AI routing (Claude vs local) via `FEATURE_FLAG_USE_AI`
- `src/services/localParser.js` — deterministic intent parser with 6 sub-parsers
- `src/services/xmlService.js` — deterministic XML builder (v1)
- `src/services/validationService.js` — AJV JSON validation + structural XML validation
- `src/middleware/auth.js` — API key authentication
- `src/middleware/errorHandler.js` — centralized error handling
- `src/middleware/rateLimiter.js` — express-rate-limit configuration
- `src/middleware/requestLogger.js` — Winston request logging
- `src/utils/logger.js` — Winston logger (JSON prod / colorized dev / silent test)
- `src/utils/helpers.js` — `slugify`, `toISODate`, `addDays`
- `src/schemas/promotionIntent.json` — AJV JSON Schema v1
- `src/schemas/promotion.xsd` — XSD reference schema
- `src/templates/promotion.xml` — reference SFCC XML with 4 example patterns
- `tests/unit/helpers.test.js` — 8 tests
- `tests/unit/xmlService.test.js` — 13 tests
- `tests/unit/validationService.test.js` — 17 tests
- `tests/unit/localParser.test.js` — 70 tests
- `tests/integration/api.test.js` — 9 integration tests
- `tests/fixtures/sampleIntent.json` and `samplePromotion.xml`
- `.env.example` with `FEATURE_FLAG_USE_AI` documentation
- `Dockerfile` — multi-stage Alpine build with non-root user
- `docker-compose.yml`
- `.github/workflows/ci.yml` — Node 18/20/22 matrix + GHCR publish
- `output/sample-promo.xml` — generated sample output
- `docs/power-automate-integration.md`
- `docs/copilot-studio-integration.md`
- `README.md`

### Implemented
- Local deterministic parser replaces Claude for offline/key-free operation
- `FEATURE_FLAG_USE_AI` environment variable controls AI/local routing
- 117 tests passing across 5 suites
- UTC-safe date generation in localParser (no DST issues)
