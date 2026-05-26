# SFCC Promotion XML Structure Analysis
# Based on 6 Real SFCC Export Files

**Last Updated:** 2026-05-07
**Source files:** All files in `reference/` directory
**Related:** `reference/xml-capability-matrix.md`, `reference/reusable-xml-blocks.md`, ADR-004

---

## Executive Summary

Six real SFCC promotion XML exports were analyzed. Key findings:

1. **Two document shapes** exist: standalone promotion (no campaign) and full-stack (campaign + promotion + assignment).
2. **Three rule types** cover all promotions: product, order, shipping.
3. **One identical global exclusions block** appears in all 6 files — it should be a site template.
4. **Tiered discounts** (multiple `<discount>` elements) are supported and observed in VJTEMP.
5. **Schedules appear in two locations** (campaign element vs assignment `<schedule>`) — both are valid.
6. **Coupon activation and coupon qualification are different mechanisms** in the assignment block.
7. **The current v1 xmlService is structurally incorrect** for real SFCC import — it uses wrong element names and structure.

---

## File-by-File Analysis

### 1. `2018-April-VIP-Email-Promo-Bday.xml`

**Pattern:** Standalone | **Rule:** Product | **Discount:** Amount off

```
<promotions>
  <global-promotion-settings>         ← site exclusions (constant)
  <promotion promotion-id="...">
    <enabled-flag>true
    <archived-flag>true
    <searchable-flag>false
    <refinable-flag>false
    <prevent-requalifying-flag>false
    <prorate-across-eligible-items-flag>false
    <exclusivity>class
    <name xml:lang="x-default">Birthday
    <callout-msg xml:lang="x-default">  ← legal callout text
    <custom-attributes>
      <custom-attribute attribute-id="gwp">false
      <custom-attribute attribute-id="isExcludeTranslate">false
    <product-promotion-rule>
      <qualifying-products>
        <included-products>
          <condition-group>
            <price-condition operator="greater than">  ← any priced item
              <price>0.01
      <discounts condition-type="product-amount">
        <discount>
          <threshold>50.0        ← must spend ≥ $50
          <amount>50.0           ← $50 off
      <max-applications>1        ← one-time use only
```

**Key observations:**
- `<amount>` (not `<percentage>`) for dollar-off discount
- `<max-applications>1` limits redemption per transaction
- `<callout-msg>` contains full legal text
- `archived-flag=true` (historical/template promo)

---

### 2. `2018-THANKS-TEST.xml`

**Pattern:** Standalone | **Rule:** Product | **Discount:** Percentage

```
<promotions>
  <global-promotion-settings>
  <promotion promotion-id="2018-THANKS-TEST">
    [same lifecycle flags as Birthday]
    <exclusivity>class
    <name xml:lang="x-default">THANKS TEST
    [no callout-msg]
    <custom-attributes> [gwp, isExcludeTranslate]
    <product-promotion-rule>
      <qualifying-products>
        <included-products>
          <condition-group>
            <price-condition operator="greater than">
              <price>0.01
      <discounts condition-type="product-amount">
        <discount>
          <threshold>0.01        ← effectively no minimum
          <percentage>30.0       ← 30% off
      [no max-applications]
```

**Key observations:**
- Simplest possible product promotion structure
- Threshold 0.01 = applies to any transaction
- No callout message, no max-applications

---

### 3. `Partners-40-off.xml`

**Pattern:** Full-stack | **Rule:** Order | **Discount:** Percentage | **Coupon-activated**

```
<promotions>
  <campaign campaign-id="Partners-40-off">
    <enabled-flag>true
    <campaign-scope><applicable-online/>
    [no dates = always-on within campaign window]

  <global-promotion-settings>

  <promotion promotion-id="Partners-40-off">
    <enabled-flag>true
    <archived-flag>false
    <searchable-flag>true         ← visible in search/refinements
    [other flags false]
    <exclusivity>class
    <name>Partners
    <custom-attributes> [gwp only]
    <order-promotion-rule>
      <excluded-products>          ← PROMOTION-level exclusions (not global)
        <included-products>
          <condition-group>
            <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
              <category-id>Exclusions-privatesale
              <category-id>Exclusions-Always
              <category-id>Exclusions-Minnie
              <category-id>Exclusions-pre-order
              <category-id>Exclusions-millers
      <discount-only-qualifying-products>false
      <discounts condition-type="order-total">
        <discount>
          <threshold>0.01
          <percentage>40.0
      <exclude-discounted-products>false

  <promotion-campaign-assignment promotion-id="..." campaign-id="...">
    <qualifiers match-mode="any">
      <customer-groups/>    ← empty = anyone
      <source-codes/>       ← empty = none
      <coupons/>            ← empty = no coupon qualifier
    </qualifiers>
    <coupons>
      <coupon coupon-id="Employee-40-off"/>   ← activation coupon
    </coupons>
    <rank>10
```

**Key observations:**
- `<excluded-products>` inside `<order-promotion-rule>` = promotion-level exclusions
- 5 excluded categories including "Exclusions-Always" (redundant with global, but explicit)
- `<qualifiers>` are empty = anyone can qualify; activation requires specific coupon
- `searchable-flag=true` = appears in storefront promotion list
- Campaign has no schedule = promotion runs indefinitely while campaign is enabled

---

### 4. `VIP-2024-Free-Two-Day-Shipping.xml`

**Pattern:** Full-stack | **Rule:** Shipping | **Discount:** Free | **Coupon-activated** | **Scheduled**

```
<promotions>
  <campaign campaign-id="2024-Free-Two-Day-Shipping">
    <enabled-flag>true
    <campaign-scope><applicable-online/>
    [no dates on campaign element — schedule is on assignment]

  <global-promotion-settings>

  <promotion promotion-id="VIP-2024-Free-Two-Day-Shipping">
    <enabled-flag>true
    <archived-flag>false
    <searchable-flag>false
    [other flags false]
    <exclusivity>no              ← combinable with other promos
    <name>Free 2 Day Shipping
    <callout-msg>Free 2 Day Shipping
    <custom-attributes>
      [9 attributes: gwp, enableShowingEmptyThresholdBar,
       enableShowingFreeShippingLabel, hideDisclaimerMessage,
       isCouponOnlyActivatesPromotion, isExcludeTranslate,
       isForcedShowingExcludedMessage, isShowPrviewOnEmptyCart,
       showDisclaimerMessage]
    <shipping-promotion-rule>
      <qualifying-products>
        <included-products>
          <condition-group>
            <price-condition operator="greater than">
              <price>0.01
      <shipping-methods>
        <method-id>twoday         ← specific shipping method targeted
      <discounts condition-type="shipment-total">
        <discount>
          <threshold>0.01
          <free/>                 ← self-closing free element

  <promotion-campaign-assignment ...>
    <qualifiers match-mode="any">
      <customer-groups/>
      <source-codes/>
      <coupons/>
    </qualifiers>
    <coupons>
      <coupon coupon-id="VIP-2024-Free-Two-Day-Shipping"/>
    </coupons>
    <rank>10
    <schedule>                    ← schedule on ASSIGNMENT (not campaign)
      <start-date>2024-07-06T04:00:00.000Z
      <end-date>2024-09-30T07:30:00.000Z
```

**Key observations:**
- `exclusivity=no` = only occurrence in sample set (combinable)
- `<free/>` is a self-closing element, not `<percentage>0</percentage>`
- Schedule on the assignment `<schedule>` block, not the campaign
- 9 custom attributes — all UI/display behavior flags
- `isCouponOnlyActivatesPromotion=false` despite having a coupon — promo may still show without coupon

---

### 5. `VJTEMP2023DTM.xml`

**Pattern:** Full-stack | **Rule:** Order | **Discount:** Tiered percentage | **Open (no coupon)**

```
<promotions>
  <campaign campaign-id="New Campaign - 9/15/23 5:27:21 am">
    <enabled-flag>true
    <campaign-scope><applicable-online/>
    <start-date>2023-09-15T05:00:00.000Z   ← schedule on CAMPAIGN
    <end-date>2023-09-20T00:00:00.000Z
    <customer-groups match-mode="any">     ← customer groups on CAMPAIGN
      <customer-group group-id="Everyone"/>

  <global-promotion-settings>

  <promotion promotion-id="VJTEMP2023DTM">
    <enabled-flag>false              ← DISABLED promotion
    <archived-flag>false
    [other flags false]
    <exclusivity>global
    <name>VJTEMP2023DTM
    <custom-attributes> [6 attributes]
    <order-promotion-rule>
      <qualifying-products>
        <included-products>
          <condition-group>
            <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
              <category-id>handbags
              <category-id>watches
      <discount-only-qualifying-products>true   ← discount on handbags+watches only
      <discounts condition-type="order-total">
        <discount>                              ← TIER 1
          <threshold>500.0
          <percentage>10.0
        <discount>                              ← TIER 2
          <threshold>2000.0
          <percentage>20.0
      <exclude-discounted-products>false

  <promotion-campaign-assignment ...>
    <qualifiers match-mode="any">
      <customer-groups/>
      <source-codes/>
      <coupons/>
    </qualifiers>
    [no <coupons> outside qualifiers = no activation coupon]
```

**Key observations:**
- **Tiered discounts**: Two `<discount>` blocks in one `<discounts>` — unique in sample set
- `discount-only-qualifying-products=true` + category qualifying = "10%/20% off handbags&watches only"
- Schedule on the `<campaign>` element (not assignment)
- Customer groups on the `<campaign>` element
- `enabled-flag=false` — promotion is disabled
- `exclusivity=global` — only one instance of this exclusivity in sample set
- Campaign name contains timestamp — auto-generated name from Business Manager

---

### 6. `Welcome-free-standard-shipping.xml`

**Pattern:** Standalone | **Rule:** Shipping | **Discount:** Free | **No campaign**

```
<promotions>
  <global-promotion-settings>

  <promotion promotion-id="Welcome-free-standard-shipping">
    <enabled-flag>true
    <archived-flag>true             ← historical/template
    <searchable-flag>true           ← visible in storefront
    [other flags false]
    <exclusivity>class
    <name>Welcome: Free Shipping
    <custom-attributes> [gwp, isExcludeTranslate]
    <shipping-promotion-rule>
      <shipping-methods>
        <method-id>standard-hazmat  ← THREE shipping methods
        <method-id>surepost
        <method-id>standard
      <disable-global-excluded-products>true   ← overrides global exclusions
      <discounts condition-type="shipment-total">
        <discount>
          <threshold>1.0             ← min $1 shipment cost
          <free/>
      <upsell-threshold>0.0          ← storefront progress bar hint
      [NO <qualifying-products> block]
```

**Key observations:**
- No `<qualifying-products>` block at all — shipping promo applies to any order
- Three shipping methods in one promo (standard-hazmat, surepost, standard)
- `disable-global-excluded-products=true` — welcome benefit ignores product exclusions
- `upsell-threshold=0.0` — progress bar element (starts at $0)
- Standalone — no campaign, no assignment

---

## Cross-File Structural Summary

### Element name mapping (correct SFCC vs v1 service misconception)

| Concept | Correct SFCC XML | v1 service emits (WRONG) |
|---|---|---|
| Enabled state | `<enabled-flag>true</enabled-flag>` | `enabled="true"` attribute |
| Rule container (product) | `<product-promotion-rule>` | `<discount>` + `<eligibility>` |
| Rule container (order) | `<order-promotion-rule>` | same wrong pattern |
| Rule container (shipping) | `<shipping-promotion-rule>` | same wrong pattern |
| Discount block | `<discounts condition-type="..."><discount>` | `<discount>` directly |
| Percentage value | `<percentage>30.0</percentage>` | correct ✅ |
| Amount value | `<amount>50.0</amount>` | wrong (uses `<amount-off>`) |
| Free shipping | `<free/>` | `<fixed-price>0</fixed-price>` |
| Qualifying | `<qualifying-products><included-products><condition-group>` | `<qualifying-products><product-id>` (flat, wrong) |
| Condition type | `<discounts condition-type="product-amount">` attr | missing |
| Lifecycle flags | `<enabled-flag>`, `<archived-flag>`, etc. | only `enabled` attr |
