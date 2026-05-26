# XML Generation Pipeline
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Related Components:** `src/services/xmlService.js`, `src/schemas/promotion.xsd`
**Related Decisions:** ADR-001, ADR-004

---

## Purpose

Documents exactly how a validated PromotionIntent JSON object is transformed into
SFCC-compliant XML. This is the deterministic core of the system — the same input
always produces the same output, regardless of AI involvement.

---

## Current Pipeline (v1 — Simple)

```
PromotionIntentV1 (JSON)
        │
        ▼
xmlService.buildXml(data)
        │
        ├── root: <promotions xmlns="...demandware...">
        │       │
        │       └── <promotion campaign-id="{campaignId}"
        │                       enabled="{enabled}"
        │                       exclusivity="{exclusivity}"
        │                       id="{id}">
        │               │
        │               ├── <name>{name}</name>
        │               ├── <description>{description}</description>  [optional]
        │               │
        │               ├── <discount>
        │               │       └── _buildDiscount(data)
        │               │               ├── percentage  → <order-discount><discount><percentage>
        │               │               ├── amount-off  → <order-discount><discount><amount>
        │               │               ├── fixed-price → <product-discount><discount><fixed-price>
        │               │               ├── free-shipping → <shipping-discount><discount><fixed-price>0
        │               │               └── bonus-product → <product-discount><discount><bonus-choice-count>1
        │               │
        │               ├── <eligibility>
        │               │       └── _buildEligibility(data)
        │               │               ├── none     → <order-condition/>
        │               │               ├── coupon   → <coupon-condition><coupon-code>
        │               │               ├── min-amt  → <order-condition><subtotal-condition><subtotal op="gte">
        │               │               └── min-qty  → <order-condition><quantity-condition><quantity op="gte">
        │               │
        │               ├── <qualifying-products>  [if qualifyingProductIds.length > 0]
        │               │       └── <product-id> per ID
        │               │
        │               ├── <discounted-products>  [if targetProductIds.length > 0]
        │               │       └── <product-id> per ID
        │               │
        │               ├── <start-date>{startDate}</start-date>
        │               └── <end-date>{endDate}</end-date>
        │
        ▼
SFCC XML String (UTF-8, pretty-printed)
```

---

## Known Limitations of v1 Pipeline

The v1 pipeline was built before real SFCC XML exports were studied.
After analysis of 6 real export files, the following gaps were identified:

| Gap | Real SFCC pattern | v1 behavior |
|---|---|---|
| Document structure | `<campaign>` + `<promotion>` + `<assignment>` for campaign-linked promos | Only emits `<promotion>` |
| Rule element name | `<product-promotion-rule>`, `<order-promotion-rule>`, `<shipping-promotion-rule>` | Uses `<discount>` + `<eligibility>` (wrong element names) |
| Flags | `<enabled-flag>`, `<archived-flag>`, `<searchable-flag>`, etc. as child elements | Uses XML attributes (wrong) |
| Tiered discounts | Multiple `<discount>` children in one `<discounts>` block | Only supports one tier |
| Global exclusions | `<global-promotion-settings>` block | Not emitted |
| Discount condition type | `<discounts condition-type="order-total">` attribute on `<discounts>` | Not present |
| Qualifying products | `<included-products><condition-group><price-condition>` or `<category-condition>` | Only emits `<product-id>` list |
| Promotion exclusions | `<excluded-products>` block inside rule | Not implemented |
| Shipping methods | `<shipping-methods><method-id>` inside shipping rule | Not implemented |
| Campaign attributes | `campaign-id` as XML attribute on `<promotion>` | Correct on `<promotion>` but missing `<campaign>` block |
| Custom attributes | `<custom-attributes><custom-attribute attribute-id="...">` | Not emitted |
| Callout message | `<callout-msg xml:lang="x-default">` | Not emitted |

---

## Target Pipeline (v2 — Full SFCC)

Planned document structure for v2, matching real SFCC export patterns:

```
PromotionDocumentV2 (JSON)
        │
        ▼
xmlService.buildDocument(doc)
        │
        ├── [if doc.campaign] buildCampaign(doc.campaign)
        │       └── <campaign campaign-id="{id}">
        │               ├── <enabled-flag>
        │               ├── <campaign-scope><applicable-online/>
        │               ├── [optional] <start-date> / <end-date>
        │               └── [optional] <customer-groups match-mode="any">
        │
        ├── buildGlobalSettings(doc.globalSettings)
        │       └── <global-promotion-settings>
        │               ├── <global-excluded-products>
        │               │       └── <included-products> per exclusion category
        │               └── <global-excluded-product-options>
        │                       └── <product-option-id> per option
        │
        ├── buildPromotion(doc.promotion)
        │       └── <promotion promotion-id="{id}">
        │               ├── <enabled-flag> / <archived-flag> / <searchable-flag>
        │               │   <refinable-flag> / <prevent-requalifying-flag>
        │               │   <prorate-across-eligible-items-flag>
        │               ├── <exclusivity>
        │               ├── <name xml:lang="x-default">
        │               ├── [optional] <callout-msg xml:lang="x-default">
        │               ├── <custom-attributes>
        │               │       └── <custom-attribute attribute-id="...">
        │               │
        │               └── [ruleType dispatch]
        │                       ├── "product" → buildProductRule(promo)
        │                       │       ├── <qualifying-products> (price or category conditions)
        │                       │       ├── <discounts condition-type="product-amount">
        │                       │       │       └── <discount> per tier
        │                       │       └── [optional] <max-applications>
        │                       │
        │                       ├── "order" → buildOrderRule(promo)
        │                       │       ├── [optional] <qualifying-products>
        │                       │       ├── [optional] <excluded-products>
        │                       │       ├── <discount-only-qualifying-products>
        │                       │       ├── <discounts condition-type="order-total">
        │                       │       │       └── <discount> per tier (supports N tiers)
        │                       │       └── <exclude-discounted-products>
        │                       │
        │                       └── "shipping" → buildShippingRule(promo)
        │                               ├── [optional] <qualifying-products>
        │                               ├── <shipping-methods>
        │                               │       └── <method-id> per method
        │                               ├── [optional] <disable-global-excluded-products>
        │                               ├── <discounts condition-type="shipment-total">
        │                               │       └── <discount><threshold><free/>
        │                               └── [optional] <upsell-threshold>
        │
        └── [if doc.assignment] buildAssignment(doc.assignment)
                └── <promotion-campaign-assignment promotion-id="{}" campaign-id="{}">
                        ├── <qualifiers match-mode="{mode}">
                        │       ├── <customer-groups> [populated or empty]
                        │       ├── <source-codes> [populated or empty]
                        │       └── <coupons> [populated or empty]
                        ├── [optional] <coupons>
                        │       └── <coupon coupon-id="..."/> per activation coupon
                        ├── [optional] <rank>
                        └── [optional] <schedule>
                                ├── <start-date>
                                └── <end-date>
```

---

## Discount Builder Dispatch Table (v2)

| ruleType | discountKind | Emits |
|---|---|---|
| product | percentage | `<product-promotion-rule><discounts condition-type="product-amount"><discount><threshold><percentage>` |
| product | amount | `<product-promotion-rule><discounts condition-type="product-amount"><discount><threshold><amount>` |
| order | percentage | `<order-promotion-rule><discounts condition-type="order-total"><discount><threshold><percentage>` |
| order | amount | `<order-promotion-rule><discounts condition-type="order-total"><discount><threshold><amount>` |
| shipping | free | `<shipping-promotion-rule><discounts condition-type="shipment-total"><discount><threshold><free/>` |

---

## Product Condition Builder Dispatch (v2)

| conditionGroupType | Emits |
|---|---|
| priceCondition | `<condition-group><price-condition operator="{op}"><price>{val}</price></price-condition>` |
| categoryCondition | `<condition-group><category-condition catalog-id="{id}" operator="{op}"><category-id>` per category |
| productIdCondition | `<condition-group>` with `<product-condition>` per product |

---

## XML Validation Strategy

### Current (v1): Structural pattern matching
- Regex checks for required element names and namespace
- Does not parse XML — fast, no libxml2 dependency
- Validated patterns: `<promotions>`, `<promotion`, `campaign-id=`, `<start-date>`, `<end-date>`, `<discount>`, SFCC namespace

### Target (v2): XSD-based
- Full XSD validation using the schema at `src/schemas/promotion.xsd`
- Requires libxml2 binding or external XML validation service
- Decision pending on whether to use `@xmldom/xmldom` + custom XSD walking or a native binding
