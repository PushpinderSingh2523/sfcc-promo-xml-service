# XML Capability Matrix
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Source:** Analysis of 6 real SFCC export files

---

## Full Capability Matrix

| Capability | Birthday | THANKS | Partners | VIP-Ship | VJTEMP | Welcome-Ship | v1 Supports | v2 Target |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Document shape** | | | | | | | | |
| Standalone (no campaign) | ✅ | ✅ | — | — | — | ✅ | partial | ✅ |
| Campaign block | — | — | ✅ | ✅ | ✅ | — | ❌ | ✅ |
| Campaign assignment | — | — | ✅ | ✅ | ✅ | — | ❌ | ✅ |
| **Promotion rule type** | | | | | | | | |
| product-promotion-rule | ✅ | ✅ | — | — | — | — | ❌ wrong el | ✅ |
| order-promotion-rule | — | — | ✅ | — | ✅ | — | ❌ wrong el | ✅ |
| shipping-promotion-rule | — | — | — | ✅ | — | ✅ | ❌ wrong el | ✅ |
| **Discount type** | | | | | | | | |
| percentage | — | ✅ 30% | ✅ 40% | — | ✅ tiered | — | ✅ | ✅ |
| amount (fixed $ off) | ✅ $50 | — | — | — | — | — | ⚠️ wrong tag | ✅ |
| free (shipping) | — | — | — | ✅ | — | ✅ | ⚠️ wrong el | ✅ |
| **Tiered discounts** | | | | | | | | |
| Single tier | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Multi-tier (2+ thresholds) | — | — | — | — | ✅ | — | ❌ | ✅ |
| **discountConditionType** | | | | | | | | |
| product-amount | ✅ | ✅ | — | — | — | — | ❌ missing | ✅ |
| order-total | — | — | ✅ | — | ✅ | — | ❌ missing | ✅ |
| shipment-total | — | — | — | ✅ | — | ✅ | ❌ missing | ✅ |
| **Qualifying products** | | | | | | | | |
| price-condition (>0.01) | ✅ | ✅ | — | ✅ | — | — | ❌ wrong struct | ✅ |
| category-condition | — | — | — | — | ✅ | — | ❌ | ✅ |
| No qualifying-products block | — | — | ✅ | — | — | ✅ | N/A | ✅ |
| discount-only-qualifying=true | — | — | — | — | ✅ | — | ❌ | ✅ |
| discount-only-qualifying=false | — | — | ✅ | — | — | — | ❌ | ✅ |
| **Exclusion logic** | | | | | | | | |
| Global exclusions block | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Promotion-level exclusions | — | — | ✅ 5 cats | — | — | — | ❌ | ✅ |
| disable-global-excluded-products | — | — | — | — | — | ✅ | ❌ | ✅ |
| Global excluded product options | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Customer targeting** | | | | | | | | |
| exclusivity: class | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| exclusivity: no | — | — | — | ✅ | — | — | ✅ | ✅ |
| exclusivity: global | — | — | — | — | ✅ | — | ✅ | ✅ |
| Customer group on campaign | — | — | — | — | ✅ Everyone | — | ❌ | ✅ |
| **Coupon / qualifier** | | | | | | | | |
| Coupon-activated | — | — | ✅ | ✅ | — | — | ❌ wrong loc | ✅ |
| Open (no coupon required) | ✅ | ✅ | — | — | ✅ | ✅ | partial | ✅ |
| **Schedule** | | | | | | | | |
| Schedule on campaign element | — | — | — | — | ✅ | — | ❌ | ✅ |
| Schedule on assignment | — | — | — | ✅ | — | — | ❌ | ✅ |
| No schedule (always-on) | ✅ | ✅ | ✅ | — | — | ✅ | N/A | ✅ |
| **Shipping** | | | | | | | | |
| Single shipping method | — | — | — | ✅ twoday | — | — | ❌ | ✅ |
| Multiple shipping methods | — | — | — | — | — | ✅ 3 methods | ❌ | ✅ |
| upsell-threshold | — | — | — | — | — | ✅ | ❌ | ✅ |
| **Lifecycle flags** | | | | | | | | |
| enabled-flag as element | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ uses attr | ✅ |
| archived-flag | ✅ true | ✅ true | ✅ false | ✅ false | ✅ false | ✅ true | ❌ | ✅ |
| searchable-flag | ✅ false | ✅ false | ✅ true | ✅ false | ✅ false | ✅ true | ❌ | ✅ |
| prevent-requalifying-flag | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| prorate-across-eligible-items-flag | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| enabled=false (disabled promo) | — | — | — | — | ✅ | — | N/A | ✅ |
| **Promotion constraints** | | | | | | | | |
| max-applications | ✅ (1) | — | — | — | — | — | ❌ | ✅ |
| exclude-discounted-products | — | — | ✅ false | — | ✅ false | — | ❌ | ✅ |
| **Campaign assignment** | | | | | | | | |
| rank | — | — | ✅ 10 | ✅ 10 | — | — | ❌ | ✅ |
| qualifiers block | — | — | ✅ | ✅ | ✅ | — | ❌ | ✅ |
| **Custom attributes** | | | | | | | | |
| Core (gwp, isExcludeTranslate) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Extended UI attrs (9 types) | — | — | — | ✅ | ✅ | — | ❌ | ✅ |
| **Callout message** | ✅ | — | — | ✅ | — | — | ❌ | ✅ |
| **Localized name** (xml:lang) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Feature present and correct |
| ❌ | Feature not implemented |
| ⚠️ | Partially implemented but incorrect |
| — | Not applicable for this file |
| partial | Works for simple cases only |
| N/A | Not applicable |
