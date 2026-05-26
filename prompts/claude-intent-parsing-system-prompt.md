# Claude Intent Parsing System Prompt
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Runtime location:** `src/services/claudeService.js` — `SYSTEM_PROMPT` constant
**Related:** `architecture/intent-parsing-modes.md`, ADR-002

---

## Purpose

This is the canonical copy of the system prompt sent to Claude for intent parsing.
The runtime copy in `claudeService.js` must always match this document.
When updating the prompt, update BOTH this file AND `claudeService.js`.

---

## Current Prompt (v1 — PromotionIntentV1)

```
You are an SFCC (Salesforce Commerce Cloud) promotion configuration expert.
Your ONLY job is to extract structured promotion data from a natural language description and return it as valid JSON.
Do NOT generate XML. Do NOT add commentary. Return ONLY a raw JSON object — no markdown fences, no explanation.

The JSON must conform exactly to this structure:
{
  "id": "string (kebab-case slug, max 50 chars)",
  "campaignId": "string (kebab-case slug, max 50 chars)",
  "name": "string (human-readable, max 100 chars)",
  "description": "string (max 500 chars)",
  "enabled": boolean,
  "exclusivity": "no" | "class" | "global",
  "discountType": "percentage" | "fixed-price" | "amount-off" | "free-shipping" | "bonus-product",
  "discountValue": number (percentage 0-100, or amount >= 0),
  "conditionType": "none" | "minimum-amount" | "minimum-quantity" | "coupon",
  "conditionValue": number | null,
  "couponCode": string | null,
  "startDate": "ISO 8601 datetime string",
  "endDate": "ISO 8601 datetime string",
  "qualifyingProductIds": string[] (empty array if not specified),
  "targetProductIds": string[] (empty array if not specified),
  "currency": "USD" | "GBP" | "EUR" | "CAD" | "AUD" (default "USD")
}

Rules:
- If dates are relative (e.g. "this month"), resolve them relative to today: {CURRENT_DATE}
- If no end date is specified, default to 90 days from start
- If no start date is specified, default to today
- conditionValue must be null when conditionType is "none"
- couponCode must be null unless conditionType is "coupon"
- discountValue for "free-shipping" or "bonus-product" should be 0
- Always return valid JSON
```

Note: `{CURRENT_DATE}` is interpolated at runtime with `new Date().toISOString().slice(0, 10)`.

---

## User Message Template

```
Extract SFCC promotion data from this description:

"{INTENT}"
```

---

## Model Configuration

| Parameter | Value |
|---|---|
| model | `process.env.CLAUDE_MODEL` (default: `claude-sonnet-4-6`) |
| max_tokens | 1024 |
| system | This prompt |
| temperature | Default (not set) |

---

## Safety Processing

After receiving Claude's response:
1. Strip accidental markdown fences: `` ```json `` and `` ``` ``
2. `JSON.parse()` the cleaned text
3. If parse fails → throw error (500 to client)
4. Normalise missing fields:
   - `id` ← `slugify(parsed.name || "promotion")`
   - `campaignId` ← `"campaign-" + parsed.id`
   - `startDate` ← `toISODate(parsed.startDate)` (validates ISO format)
   - `endDate` ← `toISODate(parsed.endDate)`
5. Pass through AJV validation (see `validationService.js`)

---

## Prompt Engineering Notes

### Why no markdown in output
Claude sometimes wraps JSON in `` ```json `` fences despite instructions.
The `"no markdown fences"` instruction reduces this but doesn't eliminate it.
The safety strip in step 2 above handles the remaining cases.

### Why current date is injected
Claude's knowledge cutoff means it may not know what "today" is.
Injecting the current date prevents incorrect relative date calculations.

### Why strict schema in prompt
Without the explicit schema, Claude may:
- Use different field names (`discount_type` vs `discountType`)
- Use different enum values (`"percent"` vs `"percentage"`)
- Add extra fields that fail AJV's `additionalProperties: false`

### Known prompt limitations (v1)
- Claude may produce percentage values > 100 for non-percentage discount types
- Claude may not correctly handle tiered discounts (produces single tier only)
- Claude may return `null` for required fields if intent is ambiguous
- Complex multi-category promos may produce only the first category in qualifyingProductIds

---

## Future Prompt (v2 — PromotionDocumentV2)

When v2 schema is implemented, the prompt will need to be updated to:
- Include `ruleType` as a required field with examples
- Support `discountTiers[]` array syntax
- Support `campaign` and `assignment` blocks
- Use `discountConditionType` instead of `conditionType` for the condition-type attribute
- Include a `qualifyingProducts` structured object instead of flat ID array

A v2 prompt draft will be created in `prompts/claude-intent-parsing-v2-draft.md`.
