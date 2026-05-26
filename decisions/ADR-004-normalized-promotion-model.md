# ADR-004 — Normalized Promotion Object Model (v1 → v2 Migration)

**Status:** v1 Accepted · v2 Pending Implementation
**Date:** 2026-05-07
**Author:** SFCC Engineering
**Related:** ADR-001, architecture/promotion-object-model.md

---

## Context

After analysis of 6 real SFCC promotion XML exports (see `reference/xml-structure-analysis.md`),
the current v1 PromotionIntentV1 schema was found to be significantly incomplete.

The v1 schema:
- Assumes a single flat discount value (no tiered discounts)
- Uses incorrect `discountType` taxonomy (not matching SFCC XML element names)
- Has no concept of `ruleType` (product / order / shipping)
- Has no campaign or assignment structure
- Has no lifecycle flags (archived, searchable, etc.)
- Represents qualifying products as flat string arrays, not condition groups
- Has no global exclusions block
- Has no shipping method targeting
- Has no custom attributes
- Does not support the `<free/>` discount element (ships free)
- Has no promotion-level exclusion categories

---

## Decision

Maintain v1 as the current production schema (simple, working, all tests green).
Design v2 as the complete schema, implement it in the next major phase.

The migration path is:
1. v2 schema file created at `schemas/promotion-intent-v2.json` (design artifact)
2. `xmlService.js` rewritten as `xmlService.v2.js` alongside existing
3. `localParser.js` updated to produce v2 objects
4. A shape-detection utility distinguishes v1 from v2 at runtime (presence of `ruleType`)
5. v1 schema retained for backward compatibility
6. Tests extended with round-trip tests against reference XML files

---

## Key v2 Design Decisions

### 1. ruleType is mandatory in v2
Every promotion must declare `ruleType: "product" | "order" | "shipping"`.
This determines which XML rule element is emitted and which options are valid.

### 2. discountTiers is an array (not a scalar)
```json
"discountTiers": [
  { "threshold": 500, "kind": "percentage", "value": 10 },
  { "threshold": 2000, "kind": "percentage", "value": 20 }
]
```
Single-tier promos have an array of length 1. This is validated by AJV (minItems: 1).

### 3. discountKind uses SFCC vocabulary
`"percentage"` | `"amount"` | `"free"` — matches SFCC XML element names directly.
Not: "amount-off", "free-shipping", "bonus-product" (v1 terminology).

### 4. discountConditionType uses SFCC attribute values
`"product-amount"` | `"order-total"` | `"shipment-total"` — matches `condition-type=` attribute.

### 5. Qualifying products use condition groups, not ID arrays
```json
"qualifyingProducts": {
  "conditionGroups": [
    { "priceCondition": { "operator": "greater than", "price": 0.01 } },
    { "categoryCondition": { "catalogId": "siteCatalog_ToryUS", "operator": "is equal", "categoryIds": ["handbags", "watches"] } }
  ]
}
```

### 6. Document has a top-level wrapper
v2 promotes from a flat object to a structured document:
```json
{
  "globalSettings": { ... },
  "campaign": { ... },      // optional
  "promotion": { ... },
  "assignment": { ... }     // optional, required if campaign present
}
```

### 7. Schedule location is explicit
`campaign.startDate` / `campaign.endDate` = schedule on the campaign element (VJTEMP pattern)
`assignment.schedule.startDate` / `assignment.schedule.endDate` = schedule on assignment (VIP-2024 pattern)

---

## Consequences

### Positive
- v2 can represent all 6 real SFCC export file patterns
- Round-trip fidelity: parse real XML → produce object → regenerate XML → compare
- Supports tiered spend-more-save-more promotions (VJTEMP)
- Supports campaign-linked promotions with coupons (Partners, VIP-2024)
- Supports shipping-method-targeted promos (VIP-2024, Welcome)
- Supports global exclusion blocks (all 6 files)

### Negative
- v2 is significantly more complex than v1
- Local parser must be substantially expanded to produce v2 objects
- XML builder must handle 3 rule types + tiered discounts + conditions + assignments
- AJV schema will be larger and harder to maintain
- Migration requires coordinated changes across schema, parser, builder, tests

---

## Backward Compatibility Policy
- v1 objects (flat, no `ruleType`) remain valid and are handled by the v1 builder path
- v2 objects (have `ruleType`) are routed to the v2 builder path
- Detection: `if (typeof data.ruleType === 'string') → v2 path`
