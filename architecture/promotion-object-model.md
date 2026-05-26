# Normalized Promotion Object Model
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Related Decisions:** ADR-004
**Status:** v1 implemented · v2 designed but not yet implemented
**Schema files:** `schemas/promotion-intent-v1.json`, `schemas/promotion-intent-v2.json`

---

## Purpose

Defines the internal JSON representation of a promotion that:
1. Can be produced by either the local parser or Claude
2. Validates against a JSON schema (AJV)
3. Maps deterministically to SFCC promotion XML
4. Supports all promotion types found in the real SFCC export files

---

## v1 Object Model (Currently Implemented)

Simple flat model. Sufficient for basic single-tier, single-rule promotions.

```typescript
interface PromotionIntentV1 {
  id: string;               // kebab-case, max 50 chars, [a-z0-9-]+
  campaignId: string;       // kebab-case, max 50 chars
  name: string;             // human-readable, max 100 chars
  description?: string;     // max 500 chars
  enabled: boolean;

  exclusivity: "no" | "class" | "global";

  // Discount (single tier only)
  discountType: "percentage" | "fixed-price" | "amount-off" | "free-shipping" | "bonus-product";
  discountValue: number;    // 0–100000

  // Condition (single condition only)
  conditionType: "none" | "minimum-amount" | "minimum-quantity" | "coupon";
  conditionValue: number | null;
  couponCode: string | null;

  // Schedule
  startDate: string;        // ISO 8601
  endDate: string;          // ISO 8601

  // Products (flat ID arrays)
  qualifyingProductIds: string[];
  targetProductIds: string[];

  // Localisation
  currency: "USD" | "GBP" | "EUR" | "CAD" | "AUD";
}
```

**Limitations of v1 identified from real XML study:**
- No `ruleType` field → XML builder cannot choose correct rule element name
- `discountType` naming does not match SFCC XML taxonomy
- `conditionType` values do not match `condition-type` attribute in SFCC
- No support for tiered discounts
- No campaign/assignment block
- No lifecycle flags (archived, searchable, etc.)
- No product conditions (price-condition, category-condition)
- No global exclusions
- No shipping methods
- No custom attributes

---

## v2 Object Model (Designed — Implementation Pending)

Full model derived from analysis of 6 real SFCC export files.

```typescript
// ─── Root document ─────────────────────────────────────────────────────────

interface PromotionDocumentV2 {
  globalSettings: GlobalSettings;
  campaign?: Campaign;              // absent = standalone promotion
  promotion: Promotion;
  assignment?: CampaignAssignment;  // absent = standalone promotion
}

// ─── Global settings (site-level constant) ─────────────────────────────────

interface GlobalSettings {
  catalogId: string;                    // e.g. "siteCatalog_ToryUS"
  excludedCategoryIds: string[];        // always-excluded categories
  excludedProductOptionIds: string[];   // e.g. "monogramming"
}

// ─── Campaign ──────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  enabled: boolean;
  scope: "online" | "offline" | "both";
  startDate?: string;           // ISO 8601 — schedule option A
  endDate?: string;             // ISO 8601 — schedule option A
  customerGroups?: {
    matchMode: "any" | "all";
    groupIds: string[];         // e.g. ["Everyone"]
  };
}

// ─── Promotion ─────────────────────────────────────────────────────────────

interface Promotion {
  id: string;
  name: string;                 // xml:lang="x-default"
  calloutMsg?: string;          // xml:lang="x-default"

  lifecycle: PromotionLifecycle;
  exclusivity: "no" | "class" | "global";
  ruleType: "product" | "order" | "shipping";

  discountConditionType: "product-amount" | "order-total" | "shipment-total";
  discountTiers: DiscountTier[];         // 1..N tiers (VJTEMP has 2)

  qualifyingProducts?: ProductCondition; // absent = no restriction
  customAttributes: Record<string, string | boolean>;

  // Rule-type-specific options
  productRuleOptions?: ProductRuleOptions;
  orderRuleOptions?: OrderRuleOptions;
  shippingRuleOptions?: ShippingRuleOptions;
  promotionExcludedProducts?: ProductCondition; // order rule only (Partners)
}

interface PromotionLifecycle {
  enabled: boolean;
  archived: boolean;
  searchable: boolean;
  refinable: boolean;
  preventRequalifying: boolean;
  prorateAcrossEligibleItems: boolean;
}

// ─── Discount tier ─────────────────────────────────────────────────────────

interface DiscountTier {
  threshold: number;            // minimum amount/quantity to trigger this tier
  kind: "percentage" | "amount" | "free";
  value?: number;               // null/absent when kind="free"
}

// ─── Product conditions ────────────────────────────────────────────────────

interface ProductCondition {
  conditionGroups: ConditionGroup[];
}

interface ConditionGroup {
  // Each group is OR-combined; conditions within a group are AND-combined
  priceCondition?: {
    operator: "greater than" | "less than" | "is equal"
              | "greater than or equal" | "less than or equal";
    price: number;
  };
  categoryCondition?: {
    catalogId: string;
    operator: "is equal" | "is not equal";
    categoryIds: string[];       // multiple IDs in one condition = OR
  };
  productIdCondition?: {
    productIds: string[];
  };
}

// ─── Rule options ──────────────────────────────────────────────────────────

interface ProductRuleOptions {
  maxApplications?: number;     // Birthday: 1
}

interface OrderRuleOptions {
  discountOnlyQualifyingProducts: boolean;  // VJTEMP: true
  excludeDiscountedProducts: boolean;       // Partners, VJTEMP: false
}

interface ShippingRuleOptions {
  methodIds: string[];                      // e.g. ["twoday"] or ["standard", "surepost"]
  disableGlobalExcludedProducts?: boolean;  // Welcome: true
  upsellThreshold?: number;                 // Welcome: 0.0
}

// ─── Campaign assignment ───────────────────────────────────────────────────

interface CampaignAssignment {
  promotionId: string;
  campaignId: string;
  rank?: number;                // Partners, VIP-2024: 10

  qualifiers: {
    matchMode: "any" | "all";
    customerGroupIds: string[];     // empty = no restriction
    sourceCodes: string[];          // empty = no restriction
    qualifierCouponIds: string[];   // empty = no coupon restriction
  };

  activationCoupons: string[];  // coupon-id values that FIRE the promotion
                                // (separate from qualifiers — e.g. "Employee-40-off")

  schedule?: {                  // schedule option B (VIP-2024)
    startDate: string;          // ISO 8601
    endDate: string;            // ISO 8601
  };
}
```

---

## Mapping: v2 Model → XML Elements

| Model path | SFCC XML element / attribute |
|---|---|
| `campaign.id` | `<campaign campaign-id="...">` |
| `campaign.enabled` | `<campaign><enabled-flag>` |
| `campaign.scope` | `<campaign><campaign-scope><applicable-online/>` |
| `campaign.startDate` | `<campaign><start-date>` |
| `campaign.customerGroups` | `<campaign><customer-groups match-mode="..."><customer-group group-id="...">` |
| `globalSettings.excludedCategoryIds` | `<global-excluded-products><included-products><condition-group><category-condition>` |
| `globalSettings.excludedProductOptionIds` | `<global-excluded-product-options><product-option-id>` |
| `promotion.id` | `<promotion promotion-id="...">` |
| `promotion.lifecycle.enabled` | `<promotion><enabled-flag>` |
| `promotion.lifecycle.archived` | `<promotion><archived-flag>` |
| `promotion.lifecycle.searchable` | `<promotion><searchable-flag>` |
| `promotion.ruleType="product"` | `<product-promotion-rule>` |
| `promotion.ruleType="order"` | `<order-promotion-rule>` |
| `promotion.ruleType="shipping"` | `<shipping-promotion-rule>` |
| `promotion.discountConditionType` | `<discounts condition-type="...">` attribute |
| `promotion.discountTiers[n].threshold` | `<discount><threshold>` |
| `promotion.discountTiers[n].kind="percentage"` | `<discount><percentage>` |
| `promotion.discountTiers[n].kind="amount"` | `<discount><amount>` |
| `promotion.discountTiers[n].kind="free"` | `<discount><free/>` |
| `promotion.qualifyingProducts.conditionGroups[n].priceCondition` | `<qualifying-products><included-products><condition-group><price-condition>` |
| `promotion.qualifyingProducts.conditionGroups[n].categoryCondition` | `<qualifying-products><included-products><condition-group><category-condition>` |
| `promotion.orderRuleOptions.discountOnlyQualifyingProducts` | `<order-promotion-rule><discount-only-qualifying-products>` |
| `promotion.orderRuleOptions.excludeDiscountedProducts` | `<order-promotion-rule><exclude-discounted-products>` |
| `promotion.productRuleOptions.maxApplications` | `<product-promotion-rule><max-applications>` |
| `promotion.shippingRuleOptions.methodIds` | `<shipping-promotion-rule><shipping-methods><method-id>` |
| `promotion.shippingRuleOptions.disableGlobalExcludedProducts` | `<shipping-promotion-rule><disable-global-excluded-products>` |
| `promotion.shippingRuleOptions.upsellThreshold` | `<shipping-promotion-rule><upsell-threshold>` |
| `promotion.customAttributes` | `<custom-attributes><custom-attribute attribute-id="...">` |
| `promotion.calloutMsg` | `<callout-msg xml:lang="x-default">` |
| `assignment.rank` | `<promotion-campaign-assignment><rank>` |
| `assignment.qualifiers.matchMode` | `<qualifiers match-mode="...">` |
| `assignment.activationCoupons` | `<promotion-campaign-assignment><coupons><coupon coupon-id="...">` |
| `assignment.schedule.startDate` | `<promotion-campaign-assignment><schedule><start-date>` |

---

## Model Versioning Policy

- **v1** — current in production. Simple flat schema. `src/schemas/promotion-intent-v1.json`
- **v2** — designed, not yet implemented. Full SFCC fidelity. `schemas/promotion-intent-v2.json`
- Both schemas kept. v2 is additive — a v2 object that uses only v1 fields should be backward-compatible.
- Version is detected by presence of `ruleType` field (v2 only).
