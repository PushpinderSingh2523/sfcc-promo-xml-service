# Intent Parsing Modes
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Related Components:** `src/services/claudeService.js`, `src/services/localParser.js`
**Related Decisions:** ADR-002, ADR-003

---

## Purpose

Documents the two intent parsing modes, how they are selected, and the behavioral
guarantees of each mode. The goal is to make AI entirely optional while preserving
a production path to Claude when needed.

---

## Mode Selection Logic

Evaluated once at server startup in `claudeService.js`:

```
FEATURE_FLAG_USE_AI=true
        AND
ANTHROPIC_API_KEY present and not a placeholder
        │
        YES → Claude AI mode
        NO  → Local deterministic mode (with optional warning log)
```

```javascript
const AI_REQUESTED = process.env.FEATURE_FLAG_USE_AI === 'true';
const KEY = process.env.ANTHROPIC_API_KEY || '';
const KEY_LOOKS_VALID = KEY.length > 20 && !KEY.startsWith('sk-ant-xxx');
const USE_AI = AI_REQUESTED && KEY_LOOKS_VALID;
```

The Anthropic SDK is **lazy-required** — it is never imported when `USE_AI=false`,
so the server starts cleanly with no API key in the environment.

---

## Mode 1 — Local Deterministic Parser

**File:** `src/services/localParser.js`
**Trigger:** `FEATURE_FLAG_USE_AI=false` OR missing/invalid `ANTHROPIC_API_KEY`
**External calls:** None
**Latency:** < 1ms
**Deterministic:** Yes — same input, same output, every time

### Sub-parsers

| Sub-parser | Function | Patterns |
|---|---|---|
| Discount | `parseDiscount(text)` | 12 regex patterns across 5 discount types |
| Condition | `parseCondition(text)` | Min-amount, min-quantity, coupon code extraction |
| Dates | `parseDates(text, now)` | Month names, relative keywords, explicit ranges |
| Exclusivity | `parseExclusivity(text)` | VIP/member/loyalty → class; sitewide/global → global |
| Currency | `parseCurrency(text)` | £/GBP, €/EUR, CAD, AUD, default USD |
| Product keywords | `parseProductKeywords(text)` | 30+ product/category terms → qualifyingProductIds |

### Discount Pattern Table

| Pattern | Example | Extracted type | Extracted value |
|---|---|---|---|
| `(\d+)\s*%\s*off` | "20% off" | percentage | 20 |
| `save\s+(\d+)\s*%` | "save 15 percent" | percentage | 15 |
| `get\s+(\d+)\s*%\s*off` | "get 25% off" | percentage | 25 |
| `(\d+)\s*%\s+discount` | "10% discount" | percentage | 10 |
| `fixed[\s-]price\s+\$?(\d+)` | "fixed price $9.99" | fixed-price | 9.99 |
| `\$(\d+)\s*off` | "$20 off" | amount-off | 20 |
| `save\s+[£$€](\d+)` | "save £10" | amount-off | 10 |
| `(\d+)\s+dollars?\s+off` | "30 dollars off" | amount-off | 30 |
| `free\s+shipping` | "free shipping" | free-shipping | 0 |
| `bonus\|free\s+gift\|gift\s+with` | "gift with purchase" | bonus-product | 0 |

### Date Parsing Precedence

1. Explicit range: "from Jan 1 to Jan 31 2025"
2. Named month [+ year]: "in July", "during August 2026"
3. Named relative: "this week", "this month", "next month", "this weekend", "next week"
4. Named event: "holiday", "Christmas", "Black Friday", "Cyber Monday"
5. Default: start=now, end=now+90days

**Important:** All date construction uses `Date.UTC()` to avoid timezone/DST issues.
Never use `new Date(year, month, day)` — that creates local-time dates.

### Condition Parsing Precedence

1. Coupon (if "coupon", "promo code", "voucher" detected) — extracts uppercase code
2. Minimum amount (if "over $X", "spend $X", "minimum $X")
3. Minimum quantity (if "buy N" with N >= 2)
4. None (fallback)

### Fallback Behavior

| No signal found | Default |
|---|---|
| Discount | 10% off |
| Condition | none |
| Date | today + 90 days |
| Exclusivity | no |
| Currency | USD |
| Product keywords | [] (empty array) |

---

## Mode 2 — Claude AI Parser

**File:** `src/services/claudeService.js` → `parseWithClaude()`
**Trigger:** `FEATURE_FLAG_USE_AI=true` AND valid `ANTHROPIC_API_KEY`
**External calls:** Anthropic Messages API
**Latency:** 800ms–3s (typical)
**Deterministic:** No — Claude may vary slightly between calls
**Model:** Configurable via `CLAUDE_MODEL` (default: `claude-sonnet-4-6`)

### System Prompt Location
`prompts/claude-intent-parsing-system-prompt.md` (canonical copy)
`src/services/claudeService.js` (runtime copy — keep in sync)

### Output Guarantees
Claude is instructed to return **only raw JSON**, no markdown fences.
The service strips accidental fences (`\`\`\`json`) as a safety measure.
If Claude returns non-JSON, the service throws and returns a 500 to the client.

### Normalization Applied After Claude Response
```javascript
parsed.id = parsed.id || slugify(parsed.name || 'promotion');
parsed.campaignId = parsed.campaignId || `campaign-${parsed.id}`;
parsed.startDate = toISODate(parsed.startDate);   // ensures valid ISO string
parsed.endDate = toISODate(parsed.endDate);
```

---

## Switching Between Modes

### Enable local mode (no keys needed)
```bash
FEATURE_FLAG_USE_AI=false
ANTHROPIC_API_KEY=
```

### Enable AI mode
```bash
FEATURE_FLAG_USE_AI=true
ANTHROPIC_API_KEY=sk-ant-api03-your-real-key-here
CLAUDE_MODEL=claude-sonnet-4-6
```

No code changes required — only `.env` changes. Server must restart to pick up new env.

---

## Behavioral Comparison

| Dimension | Local Parser | Claude AI |
|---|---|---|
| Latency | < 1ms | 800ms–3s |
| External dependency | None | Anthropic API |
| Requires API key | No | Yes |
| Cost per request | $0 | ~$0.001–0.01 |
| Handles ambiguous phrasing | Limited | Excellent |
| Handles typos | No | Yes |
| Handles multilingual input | No (English only) | Yes |
| Tiered intent ("save more above $500 or $1000") | No (single threshold) | Yes |
| Deterministic output | Yes | No |
| Testable without mocks | Yes | No |
| Production-safe without key | Yes | No |

---

## Testing Strategy Per Mode

### Local parser
- All sub-parsers exported and unit tested independently
- 70 tests in `tests/unit/localParser.test.js`
- No mocking required

### Claude mode
- `claudeService.parseIntent` mocked in integration tests (`jest.mock`)
- Unit tests verify JSON normalization logic only
- End-to-end tests against Claude require a real API key and are run manually
