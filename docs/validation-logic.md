# Validation Logic
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Related Components:** `src/services/validationService.js`, `src/schemas/promotionIntent.json`

---

## Purpose

Documents all validation rules applied at each stage of the pipeline.
Validation is the safety layer between user input and SFCC XML generation.

---

## Stage 1 — HTTP Request Validation (Controller)

Applied before any parsing or generation.

| Check | Field | Rule | Error |
|---|---|---|---|
| Field presence | `intent` (generate, parse) | Must be present | 400 |
| Type check | `intent` | Must be string | 400 |
| Empty check | `intent` | Must not be blank/whitespace | 400 |
| Field presence | `xml` (validate) | Must be present | 400 |
| Type check | `xml` | Must be string | 400 |
| Empty check | `xml` | Must not be blank/whitespace | 400 |

---

## Stage 2 — JSON Schema Validation (AJV — validationService.validateIntent)

Applied after the parser produces a PromotionIntentV1 object.
Schema file: `src/schemas/promotionIntent.json`

### Required fields
`id`, `campaignId`, `name`, `enabled`, `exclusivity`, `discountType`,
`discountValue`, `conditionType`, `startDate`, `endDate`

### Field-level rules

| Field | Type | Constraint |
|---|---|---|
| `id` | string | minLength: 1, maxLength: 50, pattern: `^[a-z0-9-]+$` |
| `campaignId` | string | minLength: 1, maxLength: 50, pattern: `^[a-z0-9-]+$` |
| `name` | string | minLength: 1, maxLength: 100 |
| `description` | string (optional) | maxLength: 500 |
| `enabled` | boolean | — |
| `exclusivity` | enum | "no" \| "class" \| "global" |
| `discountType` | enum | "percentage" \| "fixed-price" \| "amount-off" \| "free-shipping" \| "bonus-product" |
| `discountValue` | number | minimum: 0, maximum: 100000 |
| `conditionType` | enum | "none" \| "minimum-amount" \| "minimum-quantity" \| "coupon" |
| `conditionValue` | number \| null | minimum: 0 when number |
| `couponCode` | string \| null | minLength: 1, maxLength: 100 when string |
| `startDate` | string | format: date-time (ISO 8601) |
| `endDate` | string | format: date-time (ISO 8601) |
| `qualifyingProductIds` | array | items: string, minLength: 1 |
| `targetProductIds` | array | items: string, minLength: 1 |
| `currency` | enum | "USD" \| "GBP" \| "EUR" \| "CAD" \| "AUD" |

### Additional properties
Schema uses `"additionalProperties": false` — unknown fields are rejected.
This prevents Claude from adding unexpected fields that would silently be ignored.

### Error response format
```json
{
  "field": "/exclusivity",
  "message": "must be equal to one of the allowed values",
  "params": { "allowedValues": ["no", "class", "global"] }
}
```

---

## Stage 3 — Structural XML Validation (validationService.validateXml)

Applied after XML generation. Uses pattern matching (not XML parsing).

### Checked patterns

| Check | Pattern | Error if missing |
|---|---|---|
| Root element | `/<promotions[\s>]/` | "Required element promotions is missing" |
| Promotion element | `/<promotion[\s>]/` | "Required element promotion is missing" |
| campaign-id attribute | `/campaign-id=["'][^"']+["']/` | "Required attribute campaign-id is missing" |
| start-date element | `/<start-date>/` | "Required element start-date is missing" |
| end-date element | `/<end-date>/` | "Required element end-date is missing" |
| discount element | `/<discount>/` | "Required element discount is missing" |
| SFCC namespace | `http://www.demandware.com/xml/impex/promotion/2008-01-31` | "SFCC promotion namespace is missing" |

### Design note
Full XSD validation was considered but rejected for v1 because:
- Requires libxml2 native bindings or external service
- Adds significant complexity and platform dependencies
- Structural pattern matching catches the most common errors at low cost

Full XSD validation is planned for v2 (see ADR-004).

### Warning vs Error
The XML validator returns `{ valid: boolean, errors: [] }`.
Validation failures during `/generate` are returned as `warnings` in the response (HTTP 200)
rather than blocking the response (HTTP 4xx), because the XML may still be importable in SFCC
even with minor structural issues. The caller decides whether to use the XML.

Exception: if the validator throws (malformed output from xmlbuilder2), it is caught
and re-thrown as a 500.

---

## Validation Result Handling

### In `/generate`
```
validationService.validateIntent(parsed) → if invalid → return 422
xmlService.buildXml(parsed)
validationService.validateXml(xml) → if invalid → warnings array (still 200)
```

### In `/validate`
```
validationService.validateXml(xml) → return { valid, errors } always 200
```

### In `/parse`
```
validationService.validateIntent(parsed) → return { valid, errors } in body, always 200
```

---

## Future Validation (v2)

When the v2 schema is implemented, additional validations will include:

| Rule | Reason |
|---|---|
| `ruleType` consistency | If `ruleType=shipping`, `discountConditionType` must be `shipment-total` |
| Tiered discount ordering | Thresholds must be in ascending order |
| Coupon presence | If `conditionType=coupon` in v1, `couponCode` must not be null |
| Date ordering | `startDate` must be before `endDate` |
| Assignment requires campaign | `assignment` present requires `campaign` |
| Shipping methods not empty | If `ruleType=shipping`, at least one `methodId` required |
| Category condition requires catalogId | `categoryCondition.catalogId` must be non-empty |
| Percentage bounds | `kind=percentage` → value 0.01–100.0 |
| Amount bounds | `kind=amount` → value > 0 |
