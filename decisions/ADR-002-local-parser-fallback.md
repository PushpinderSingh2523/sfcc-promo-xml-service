# ADR-002 — Local Deterministic Parser as Primary Fallback

**Status:** Accepted
**Date:** 2026-05-07
**Author:** SFCC Engineering
**Related:** ADR-001, ADR-003

---

## Context

During early development and SFCC sandbox testing, the Anthropic API key is not available.
Requiring a live API key to run the service locally creates friction for:
- Local development
- CI/CD pipelines
- SFCC sandbox testing
- Offline environments
- Teams without Anthropic access

---

## Decision

Implement a **local deterministic intent parser** (`localParser.js`) that handles
intent parsing using regex patterns and rule tables, with zero external dependencies.

The local parser is the **default** when:
- `FEATURE_FLAG_USE_AI=false`
- `ANTHROPIC_API_KEY` is absent or a placeholder

The local parser is a **permanent production-grade component**, not a temporary stub.
It is fully tested, exported with named sub-parsers, and version-controlled.

---

## Implementation

`src/services/localParser.js` exports six named sub-parsers:
- `parseDiscount(text)` — identifies discount type and value
- `parseCondition(text)` — identifies eligibility conditions and coupon codes
- `parseDates(text, now)` — extracts date ranges (UTC-safe)
- `parseExclusivity(text)` — maps customer signals to SFCC exclusivity values
- `parseCurrency(text)` — detects currency from symbols and keywords
- `parseProductKeywords(text)` — extracts product/category terms

All sub-parsers are independently unit-tested in `tests/unit/localParser.test.js`.

---

## Consequences

### Positive
- Service runs fully offline with no API keys
- All tests pass without mocking AI
- CI pipeline works without Anthropic credentials
- SFCC sandbox testing can proceed before AI integration
- Provides a performance baseline (< 1ms vs 800ms–3s for AI)
- Makes AI integration genuinely optional — not a required dependency

### Negative
- Local parser has lower semantic accuracy than Claude for complex or ambiguous intents
- Does not handle multilingual input
- Does not handle typos or abbreviations well
- Pattern table must be manually maintained as new intent patterns emerge
- A very complex intent ("VIP loyalty members get 10% off handbags and 15% off shoes but only if they spend over $200 in October") will not parse correctly — Claude handles this much better

---

## Maintenance Policy

When a new intent pattern fails to parse correctly with the local parser:
1. Add the failing case as a test in `tests/unit/localParser.test.js`
2. Add the pattern to the appropriate sub-parser in `localParser.js`
3. Document the pattern in `architecture/intent-parsing-modes.md`
4. If the pattern is too complex for regex, route to Claude and document the decision
