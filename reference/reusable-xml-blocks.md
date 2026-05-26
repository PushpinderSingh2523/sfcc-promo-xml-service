# Reusable XML Blocks Catalog
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Related:** `architecture/xml-generation-pipeline.md`, ADR-005

---

## Purpose

Documents every repeating or parameterizable XML pattern found across the 6 reference files.
Each block becomes a builder function in `xmlService.js` (v2).

---

## Block 1 — GlobalPromotionSettings

**Appears in:** All 6 files (byte-for-byte identical structure)
**Builder function:** `buildGlobalSettings(settings)`
**Parameters:** `catalogId`, `excludedCategoryIds[]`, `excludedProductOptionIds[]`

```xml
<global-promotion-settings>
  <global-excluded-products>
    <included-products>
      <!-- One <condition-group> per excluded category -->
      <condition-group>
        <category-condition catalog-id="{catalogId}" operator="is equal">
          <category-id>{categoryId}</category-id>
        </category-condition>
      </condition-group>
    </included-products>
  </global-excluded-products>
  <global-excluded-product-options>
    <!-- One per option -->
    <product-option-id>{optionId}</product-option-id>
  </global-excluded-product-options>
</global-promotion-settings>
```

**Site defaults (Tory Burch US):**
- catalogId: `siteCatalog_ToryUS`
- excludedCategoryIds: `Exclusions-Always`, `accessories-seedbox-foundation`, `accessories-masks`
- excludedProductOptionIds: `monogramming`

---

## Block 2 — Campaign

**Appears in:** Partners-40-off, VIP-2024-Free-Two-Day-Shipping, VJTEMP2023DTM
**Builder function:** `buildCampaign(campaign)`
**Parameters:** `id`, `enabled`, `scope`, `startDate?`, `endDate?`, `customerGroups?`

```xml
<!-- Variant A: no dates, no customer groups -->
<campaign campaign-id="{id}">
  <enabled-flag>{enabled}</enabled-flag>
  <campaign-scope>
    <applicable-online/>
  </campaign-scope>
</campaign>

<!-- Variant B: with dates (VJTEMP) -->
<campaign campaign-id="{id}">
  <enabled-flag>true</enabled-flag>
  <campaign-scope>
    <applicable-online/>
  </campaign-scope>
  <start-date>{startDate}</start-date>
  <end-date>{endDate}</end-date>
  <customer-groups match-mode="{matchMode}">
    <customer-group group-id="{groupId}"/>
  </customer-groups>
</campaign>
```

---

## Block 3 — PromotionLifecycleFlags

**Appears in:** All 6 files (same flags, different values)
**Builder function:** `buildLifecycleFlags(lifecycle)`
**Parameters:** `enabled`, `archived`, `searchable`, `refinable`, `preventRequalifying`, `prorateAcrossEligibleItems`

```xml
<enabled-flag>{enabled}</enabled-flag>
<archived-flag>{archived}</archived-flag>
<searchable-flag>{searchable}</searchable-flag>
<refinable-flag>{refinable}</refinable-flag>
<prevent-requalifying-flag>{preventRequalifying}</prevent-requalifying-flag>
<prorate-across-eligible-items-flag>{prorateAcrossEligibleItems}</prorate-across-eligible-items-flag>
```

---

## Block 4 — PriceGateQualifyingProducts

**Appears in:** Birthday, THANKS-TEST, VIP-2024-Free-Two-Day-Shipping
**Builder function:** `buildPriceConditionQualifyingProducts(operator, minPrice)`
**Common usage:** `operator="greater than"`, `minPrice=0.01`

```xml
<qualifying-products>
  <included-products>
    <condition-group>
      <price-condition operator="{operator}">
        <price>{price}</price>
      </price-condition>
    </condition-group>
  </included-products>
</qualifying-products>
```

---

## Block 5 — CategoryQualifyingProducts

**Appears in:** VJTEMP2023DTM (qualifying), Partners-40-off (exclusions)
**Builder function:** `buildCategoryConditionGroup(catalogId, operator, categoryIds[])`
**Can be used in:** qualifying-products OR excluded-products

```xml
<included-products>
  <condition-group>
    <category-condition catalog-id="{catalogId}" operator="{operator}">
      <category-id>{categoryId1}</category-id>
      <category-id>{categoryId2}</category-id>
      <!-- repeat for each category -->
    </category-condition>
  </condition-group>
</included-products>
```

---

## Block 6 — PromotionLevelExcludedProducts

**Appears in:** Partners-40-off
**Builder function:** `buildPromotionExcludedProducts(conditionGroups[])`
**Location:** Inside `<order-promotion-rule>` before discounts

```xml
<excluded-products>
  <included-products>
    <condition-group>
      <category-condition catalog-id="{catalogId}" operator="{operator}">
        <category-id>{cat1}</category-id>
        <category-id>{cat2}</category-id>
        <!-- multiple categories in one condition = OR -->
      </category-condition>
    </condition-group>
  </included-products>
</excluded-products>
```

---

## Block 7 — SingleTierDiscount

**Appears in:** All files (1 `<discount>` block)
**Builder function:** `buildDiscountTier(threshold, kind, value?)`

```xml
<!-- Percentage -->
<discount>
  <threshold>{threshold}</threshold>
  <percentage>{value}</percentage>
</discount>

<!-- Fixed amount -->
<discount>
  <threshold>{threshold}</threshold>
  <amount>{value}</amount>
</discount>

<!-- Free (shipping) -->
<discount>
  <threshold>{threshold}</threshold>
  <free/>
</discount>
```

---

## Block 8 — TieredDiscounts

**Appears in:** VJTEMP2023DTM (2 tiers)
**Builder function:** `buildDiscountTiers(tiers[])` — calls `buildDiscountTier` per tier
**Parent element:** `<discounts condition-type="{conditionType}">`

```xml
<discounts condition-type="order-total">
  <discount>
    <threshold>500.0</threshold>
    <percentage>10.0</percentage>
  </discount>
  <discount>
    <threshold>2000.0</threshold>
    <percentage>20.0</percentage>
  </discount>
</discounts>
```

---

## Block 9 — ShippingMethods

**Appears in:** VIP-2024 (1 method), Welcome (3 methods)
**Builder function:** `buildShippingMethods(methodIds[])`

```xml
<shipping-methods>
  <method-id>{methodId1}</method-id>
  <method-id>{methodId2}</method-id>
  <!-- repeat for each method -->
</shipping-methods>
```

---

## Block 10 — OpenQualifiersBlock

**Appears in:** All 3 campaign assignments (Partners, VIP-2024, VJTEMP)
**Builder function:** `buildQualifiers(matchMode, customerGroups?, sourceCodes?, coupons?)`
**Note:** All three files use empty children — this is the "no restrictions" open qualifier.

```xml
<qualifiers match-mode="{matchMode}">
  <customer-groups/>   <!-- or: <customer-group group-id="..."/> per group -->
  <source-codes/>      <!-- or: <source-code id="..."/> per code -->
  <coupons/>           <!-- or: <coupon coupon-id="..."/> per qualifier coupon -->
</qualifiers>
```

---

## Block 11 — ActivationCoupons

**Appears in:** Partners-40-off, VIP-2024-Free-Two-Day-Shipping
**Builder function:** `buildActivationCoupons(couponIds[])`
**Location:** In `<promotion-campaign-assignment>` OUTSIDE of `<qualifiers>`

```xml
<coupons>
  <coupon coupon-id="{couponId}"/>
</coupons>
```

---

## Block 12 — AssignmentSchedule

**Appears in:** VIP-2024-Free-Two-Day-Shipping
**Builder function:** `buildAssignmentSchedule(startDate, endDate)`
**Location:** In `<promotion-campaign-assignment>` after coupons/rank

```xml
<schedule>
  <start-date>{startDate}</start-date>
  <end-date>{endDate}</end-date>
</schedule>
```

---

## Block 13 — CustomAttributes

**Appears in:** All 6 files
**Builder function:** `buildCustomAttributes(attributes: Record<string, string|boolean>)`

```xml
<custom-attributes>
  <custom-attribute attribute-id="{key}">{value}</custom-attribute>
  <!-- repeat for each attribute -->
</custom-attributes>
```

**Core attribute set (minimum for all promotions):**
```json
{ "gwp": false, "isExcludeTranslate": false }
```

**Extended attribute set (shipping/complex promos):**
```json
{
  "enableShowingEmptyThresholdBar": false,
  "enableShowingFreeShippingLabel": false,
  "gwp": false,
  "hideDisclaimerMessage": false,
  "isCouponOnlyActivatesPromotion": false,
  "isExcludeTranslate": false,
  "isForcedShowingExcludedMessage": false,
  "isShowPrviewOnEmptyCart": false,
  "showDisclaimerMessage": false
}
```

---

## Builder Assembly Order

For a complete promotion document, blocks are assembled in this order:

```
1. [if campaign]    Block 2  — Campaign
2.                  Block 1  — GlobalPromotionSettings
3.                  <promotion promotion-id="...">
4.                    Block 3  — LifecycleFlags
5.                    <exclusivity>
6.                    <name xml:lang="x-default">
7.                    [optional] <callout-msg xml:lang="x-default">
8.                    Block 13 — CustomAttributes
9.                    <[product|order|shipping]-promotion-rule>
10. [product rule]       Block 4 or 5  — QualifyingProducts
11. [product rule]       Block 7 or 8  — Discounts (with condition-type attr)
12. [product rule]       <max-applications> [optional]
13. [order rule]         Block 6  — PromotionExcludedProducts [optional]
14. [order rule]         Block 4 or 5  — QualifyingProducts [optional]
15. [order rule]         <discount-only-qualifying-products>
16. [order rule]         Block 7 or 8  — Discounts
17. [order rule]         <exclude-discounted-products>
18. [shipping rule]      Block 4  — QualifyingProducts [optional]
19. [shipping rule]      Block 9  — ShippingMethods
20. [shipping rule]      <disable-global-excluded-products> [optional]
21. [shipping rule]      Block 7  — Discounts
22. [shipping rule]      <upsell-threshold> [optional]
23. [if assignment]  Block 10 — Qualifiers
24. [if assignment]  Block 11 — ActivationCoupons [optional]
25. [if assignment]  <rank> [optional]
26. [if assignment]  Block 12 — AssignmentSchedule [optional]
```
