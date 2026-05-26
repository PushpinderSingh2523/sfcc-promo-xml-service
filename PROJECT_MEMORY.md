# PROJECT_MEMORY.md
# SFCC Promotion XML Service — Canonical Source of Truth

> **Purpose:** This file is the permanent root index of all architectural decisions, business logic,
> implementation history, and system knowledge for this project.
> Every major change must be reflected here.
> Chat history is ephemeral. This file is not.

**Last Updated:** 2026-05-07
**Project Version:** 1.4.1
**Owner:** SFCC Merchandising Engineering

---

## Project Overview

A production-ready Node.js microservice that converts natural-language promotion descriptions
into **Salesforce Commerce Cloud (SFCC)-compliant promotion XML**, validated and ready for
Business Manager import via Merchant Tools → Promotions → Import & Export.

### Core Architecture Principle
> Claude (or any AI) **only parses intent into JSON**.
> XML generation is **fully deterministic** — same JSON always produces the same XML.
> Humans and tests can verify XML correctness without needing to understand AI outputs.

---

## Quick Navigation

### Architecture
- [System Overview](architecture/overview.md)
- [XML Generation Pipeline](architecture/xml-generation-pipeline.md)
- [Intent Parsing Modes](architecture/intent-parsing-modes.md)
- [Normalized Promotion Object Model](architecture/promotion-object-model.md)

### Decisions (ADRs)
- [ADR-001 — Deterministic XML Generation](decisions/ADR-001-deterministic-xml-generation.md)
- [ADR-002 — Local Parser as Primary Fallback](decisions/ADR-002-local-parser-fallback.md)
- [ADR-003 — FEATURE_FLAG_USE_AI Pattern](decisions/ADR-003-feature-flag-use-ai.md)
- [ADR-004 — Normalized Promotion Object Model](decisions/ADR-004-normalized-promotion-model.md)
- [ADR-005 — Global Exclusions as Site Template](decisions/ADR-005-global-exclusions-template.md)

### Documentation
- [API Contracts](docs/api-contracts.md)
- [Business Rules](docs/business-rules.md)
- [Validation Logic](docs/validation-logic.md)
- [Edge Cases & Assumptions](docs/edge-cases.md)
- [Troubleshooting Guide](docs/troubleshooting.md)
- [Testing Strategy](docs/testing-strategy.md)
- [Power Automate Integration](docs/power-automate-integration.md)
- [Copilot Studio Integration](docs/copilot-studio-integration.md)

### Schemas
- [Promotion Intent v1 — Simple](schemas/promotion-intent-v1.json) ← kept for reference
- [Promotion Intent v2 — Full SFCC](schemas/promotion-intent-v2.json) ← design schema
- [Promotion Document — AJV Runtime](schemas/promotion-document.schema.json) ← used at runtime
- [Promotion Document Model](schemas/promotion-document-model.json)
- [Promotion XSD Reference](src/schemas/promotion.xsd)

### Prompts
- [Claude Intent Parsing System Prompt](prompts/claude-intent-parsing-system-prompt.md)
- [Prompt Engineering Notes](prompts/prompt-engineering-notes.md)

### Reference XMLs (Real SFCC Exports)
- [Birthday VIP Email Promo 2018](reference/2018-April-VIP-Email-Promo-Bday.xml)
- [Thanks Test 2018](reference/2018-THANKS-TEST.xml)
- [Partners 40% Off](reference/Partners-40-off.xml)
- [VIP Free Two-Day Shipping 2024](reference/VIP-2024-Free-Two-Day-Shipping.xml)
- [VJ Temp 2023 DTM](reference/VJTEMP2023DTM.xml)
- [Welcome Free Standard Shipping](reference/Welcome-free-standard-shipping.xml)
- [XML Structure Analysis](reference/xml-structure-analysis.md)
- [XML Capability Matrix](reference/xml-capability-matrix.md)
- [Reusable XML Blocks Catalog](reference/reusable-xml-blocks.md)

### Examples
- [Percentage Discount — Order Level](examples/percentage-order-discount.json)
- [Fixed Amount — Product Level](examples/fixed-amount-product-discount.json)
- [Free Shipping — Shipping Method](examples/free-shipping.json)
- [Tiered Discount — Spend More Save More](examples/tiered-discount.json)
- [Coupon-Activated Partner Promo](examples/coupon-partner-promo.json)
- [Category-Scoped Order Discount](examples/category-scoped-order-discount.json)

### Changelogs
- [CHANGELOG.md](changelogs/CHANGELOG.md)

---

## Current System State

### What Works (as of 2026-05-07 — v1.4.0)
| Capability | Status |
|---|---|
| **v2 localParser (8 strategy modules)** | ✅ Phase 2 — returns full PromotionDocumentV2 |
| **Session manager (multi-turn flow)** | ✅ **Phase 3 — file-backed, 2h TTL** |
| **POST /clarify endpoint** | ✅ **Phase 3 — multi-turn conversational clarification** |
| **POST /preview endpoint** | ✅ **Phase 3 — doc + XML + human summary** |
| **POST /import-xml endpoint** | ✅ **Phase 3 — deterministic XML → PromotionDocumentV2** |
| **GET /capabilities endpoint** | ✅ **Phase 3 — Copilot-adaptive metadata** |
| **OpenAPI spec + Swagger UI** | ✅ **Phase 3 — /api-docs, js-yaml, swagger-ui-express** |
| **promotionSummaryService** | ✅ **Phase 3 — oneLiner / bullets / headline / businessNote** |
| **diffService** | ✅ **Phase 3 — XML or doc comparison + change summary** |
| **Enterprise logging** | ✅ **Phase 3 — file transport to runtime/logs/** |
| **Runtime storage** | ✅ **Phase 3 — runtime/{logs,sessions,exports,imports,traces}** |
| **sessionId + correlationId on /generate** | ✅ **Phase 3 — all responses include session tracking** |
| v2 XML generation (xmlServiceV2.js) | ✅ Operational — all 3 rule types, all discount kinds |
| Structural XML validation | ✅ Operational |
| /generate endpoint | ✅ Operational — v2 pipeline + session creation |
| /validate endpoint | ✅ Operational — accepts xml or document |
| /parse endpoint | ✅ Operational — returns parserTrace |
| /health endpoint | ✅ Operational |
| Claude AI intent parsing | ✅ Available (FEATURE_FLAG_USE_AI=true + key) |
| Unit tests | ✅ **444/444 passing (22 suites)** |
| Docker build | ✅ Dockerfile present |
| GitHub Actions CI | ✅ Workflow present |

### Parser Strategy Layer — Capability Coverage
| Strategy | Capabilities | Confidence Range |
|---|---|---|
| discountParser | percentage/amount/fixed-price/free/GWP; tiered multi-threshold | 0.10–0.95 |
| scheduleParser | ISO ranges, named months, named events, relative (this weekend), 90-day fallback | 0.20–0.95 |
| qualifierParser | 9 customer group IDs; coupon codes; source codes; exclusivity hint | 0.10–0.90 |
| shippingParser | 7 shipping method IDs; upsell threshold; disable-global-exclusions | 0.10–0.92 |
| categoryParser | 15+ SFCC category IDs; raw word compat extraction | 0.10–0.85 |
| exclusionParser | direct phrases + trigger+category two-pass; 12 exclusion categories | 0.30–0.90 |
| lifecycleParser | 6 lifecycle flags; exclusivity (no/class/global); one-time-use signal | 0.10–0.85 |
| conditionParser | coupon/minimum-amount/minimum-quantity; code extraction; 'PROMO10' fallback | 0.10–0.90 |

### Real-World Scenarios — All Passing
| Scenario | Rule Type | Key Features |
|---|---|---|
| Employee 30% off | product | class exclusivity, Employees group |
| Birthday $50 off VIP | product | amount, preventRequalifying, gift-cards exclusion |
| VIP free two-day shipping + coupon | shipping | free kind, twoday method, class exclusivity |
| Tiered luxury (10%/$500, 20%/$2000) | order | 2 tiers, order-total condition, handbags+watches |
| Preorder exclusions 20% off | product | exclusion categories (preorder, sale) |
| Coupon-only 25% off | product | FLASH25 coupon, no customer group |
| Category-scoped 15% off accessories | order | accessories category, $100 threshold |
| Free shipping weekend | shipping | standard method, this-weekend schedule |
| Partners 40% + coupon, no private-sale | product | Partners group, PARTNER40 coupon, exclusion |
| Welcome free multi-method shipping | shipping | standard + surepost methods, new customers |

### Local Development Notes
| Topic | Detail |
|---|---|
| nodemon watch scope | Only `src/` — `runtime/`, `output/`, `*.log` are ignored via `nodemon.json` |
| Proxy trust | `app.set('trust proxy', 1)` — required for ngrok, Azure, APIM |
| Rate limiter | `validate: { xForwardedForHeader: false }` — prevents ERR_ERL_UNEXPECTED_X_FORWARDED_FOR |
| Graceful shutdown | SIGINT/SIGTERM → `server.close()` → 8s force-exit — prevents EADDRINUSE |
| ngrok usage | `ngrok http 3000` then use HTTPS URL; inspector at `http://localhost:4040` |

### Remaining Gaps
| Capability | Status | Notes |
|---|---|---|
| Round-trip XML regression tests | ❌ Not implemented | Parse reference XMLs → regenerate → diff |
| SFCC sandbox import validation | ❌ Not tested | Need Business Manager access |

---

## Environment Configuration

```env
PORT=3000
NODE_ENV=development
FEATURE_FLAG_USE_AI=false     # true = Claude AI, false = local rule engine
ANTHROPIC_API_KEY=            # required only when FEATURE_FLAG_USE_AI=true
CLAUDE_MODEL=claude-sonnet-4-6
API_KEY=                      # blank = auth disabled (local dev only)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
LOG_LEVEL=info
```

---

## Key People / Context
- **Organization:** Tory Burch (inferred from catalog ID: `siteCatalog_ToryUS`, exclusion categories)
- **SFCC namespace:** `http://www.demandware.com/xml/impex/promotion/2008-01-31`
- **Catalog ID:** `siteCatalog_ToryUS`
- **Always-excluded categories:** Exclusions-Always, accessories-seedbox-foundation, accessories-masks
- **Always-excluded product options:** monogramming

---

## Next Planned Phases
1. **Round-trip XML regression tests** — parse reference XMLs → PromotionDocumentV2 → regenerate → diff against originals
2. **SFCC sandbox import test** — validate generated XML in live Business Manager
3. **Parser accuracy improvement** — expand pattern coverage from real merchant intents
4. **APIM deployment** — Azure API Management with subscription keys + CORS policy
5. **Teams adaptive card UX** — live Copilot Studio custom connector with real Teams bot
