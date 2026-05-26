# Testing Strategy
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Related Components:** `tests/`, `jest` config in `package.json`

---

## Test Suite Overview

```
tests/
├── unit/
│   ├── helpers.test.js          (8 tests)   — slugify, toISODate, addDays
│   ├── xmlService.test.js       (13 tests)  — XML builder for all discount/condition types
│   ├── validationService.test.js(17 tests)  — AJV intent validation + structural XML check
│   └── localParser.test.js      (70 tests)  — all 6 sub-parsers + full intent scenarios
└── integration/
    └── api.test.js              (9 tests)   — HTTP endpoint behavior (Claude mocked)

Total: 117 tests · 5 suites · all passing as of 2026-05-07
```

---

## Test Philosophy

### 1. Unit tests own the logic; integration tests own the contract
- Unit tests verify that each function produces correct output for known inputs
- Integration tests verify that the HTTP layer routes correctly and returns the right HTTP status/shape
- Integration tests mock `claudeService` to avoid real AI calls

### 2. No test should require an API key
- `NODE_ENV=test` skips auth middleware
- Rate limiter is skipped in test
- `jest.mock('../../src/services/claudeService')` in integration tests

### 3. UTC-safe date assertions
All date tests use `.getUTCMonth()`, `.getUTCDate()`, `.getUTCFullYear()` — never local-time getters.
This ensures tests pass on any server timezone.

### 4. Structural XML tests use string matching
XML tests use `expect(xml).toContain('...')` with specific element fragments.
Full XML round-trip comparison (`toEqual`) is avoided because whitespace and attribute ordering may vary.

---

## Running Tests

```bash
npm test                    # all tests
npm run test:unit           # unit only (faster)
npm run test:integration    # integration only
npm run test:coverage       # with coverage report
```

Coverage thresholds (configured in `package.json`):
```json
"coverageThreshold": {
  "global": {
    "branches": 70,
    "functions": 75,
    "lines": 75,
    "statements": 75
  }
}
```

---

## Unit Test Coverage Per Module

### `helpers.test.js`
| Function | Tests |
|---|---|
| `slugify` | spaces→hyphens, special chars stripped, multiple hyphens collapsed, 50-char truncation, already-kebab passthrough |
| `toISODate` | valid ISO passthrough, valid date string, null→today, invalid→today |
| `addDays` | adds to Date object, handles string input (timezone-safe) |

### `xmlService.test.js`
| Scenario | Tests |
|---|---|
| Valid XML string produced | basic structure, XML declaration |
| SFCC namespace present | — |
| Attributes: campaign-id, id | — |
| Discount types | percentage, amount-off, free-shipping, bonus-product |
| Condition types | minimum-amount, minimum-quantity, coupon |
| Qualifying product IDs | — |
| Target product IDs | — |
| Date elements | start-date, end-date |

### `validationService.test.js`
| Scenario | Tests |
|---|---|
| validateIntent: valid object | — |
| validateIntent: missing name | — |
| validateIntent: invalid exclusivity | — |
| validateIntent: invalid discountType | — |
| validateIntent: non-ISO date | — |
| validateIntent: value out of range | — |
| validateIntent: null conditionValue | — |
| validateIntent: all exclusivity values | — |
| validateIntent: all discountTypes | — |
| validateXml: valid SFCC XML | — |
| validateXml: missing namespace | — |
| validateXml: missing campaign-id | — |
| validateXml: missing start-date | — |
| validateXml: empty string | — |

### `localParser.test.js` (70 tests)
| Sub-parser | Test groups |
|---|---|
| parseDiscount | 5 percentage cases, 4 amount-off cases, 2 fixed-price, 2 free-shipping, 3 bonus-product, 1 fallback |
| parseCondition | 7 minimum-amount, 3 minimum-quantity, 4 coupon, 1 none |
| parseDates | 3 month-name, 6 relative keywords |
| parseExclusivity | 5 class signals, 3 global signals, 1 no-signal |
| parseCurrency | 5 currency types |
| parseProductKeywords | 4 scenarios |
| parseIntent (full) | 6 complete intent scenarios + 4 structural checks |

### `api.test.js` (integration)
| Endpoint | Tests |
|---|---|
| GET /health | status=ok, correct shape |
| POST /generate | success with XML, 400 on missing intent, 400 on empty intent |
| POST /parse | JSON returned, no xml field, 400 on missing intent |
| POST /validate | valid XML→valid, malformed→invalid, 400 on missing field |

---

## Test Fixtures

```
tests/fixtures/
├── sampleIntent.json      — complete PromotionIntentV1 object (summer 10% off)
└── samplePromotion.xml    — corresponding SFCC XML output
```

---

## Planned Test Additions (v2)

| Test type | Description |
|---|---|
| XML round-trip tests | Parse reference XML → produce v2 object → regenerate XML → compare with fixture |
| Tiered discount tests | Verify two-tier discount XML structure |
| Campaign assignment tests | Verify full document (campaign + promotion + assignment) |
| Category condition tests | Verify category-condition XML for qualifying products |
| Global exclusions tests | Verify global-promotion-settings block |
| Shipping method tests | Verify multiple method-id elements |
| SFCC import smoke test | Upload generated XML to SFCC sandbox, check for import errors |

---

## CI/CD Test Execution

GitHub Actions (`.github/workflows/ci.yml`):
- Runs on push/PR to `main` and `develop`
- Matrix: Node 18.x, 20.x, 22.x
- Coverage uploaded to Codecov on Node 20 only
- All tests must pass before Docker build step runs
