# Business Rules
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Source:** Analysis of 6 real SFCC export files + SFCC documentation
**Related:** `reference/xml-structure-analysis.md`, ADR-004, ADR-005

---

## Purpose

Documents the business rules that govern SFCC promotion behavior as observed in
real exported XML files. These rules must be enforced in both the local parser
and the Claude system prompt.

---

## 1. Exclusivity Rules

| Value | Meaning | Observed in |
|---|---|---|
| `class` | Promotion applies only to a specific customer class/group (VIP, loyalty members, partners) | Birthday, THANKS-TEST, Partners-40-off, Welcome |
| `global` | Only one global-exclusivity promotion can apply per order | VJTEMP2023DTM |
| `no` | Non-exclusive — can combine with other promotions | VIP-2024-Free-Two-Day-Shipping |

**Rule:** Exclusivity is set on the `<promotion>` element, not the campaign.
A `class` exclusivity promo does not automatically restrict to a customer group —
customer targeting happens separately via the campaign's `<customer-groups>` or coupon requirement.

---

## 2. Promotion Rule Type Selection

| Rule type | When to use | SFCC XML element |
|---|---|---|
| `product` | Discount on individual product items (percentage or dollar off a product) | `<product-promotion-rule>` |
| `order` | Discount on the order total (percentage or dollar off total cart value) | `<order-promotion-rule>` |
| `shipping` | Free or discounted shipping on a specific method | `<shipping-promotion-rule>` |

**Rule:** Rule type is mutually exclusive — a promotion has exactly one rule element.
**Rule:** The `condition-type` attribute on `<discounts>` must match the rule type:
- product rule → `condition-type="product-amount"`
- order rule → `condition-type="order-total"`
- shipping rule → `condition-type="shipment-total"`

---

## 3. Discount Rules

### 3.1 Percentage off
- Value is a decimal (e.g., `30.0` = 30%)
- Valid range: 0.01–100.0
- Can be tiered (multiple `<discount>` blocks with different thresholds)

### 3.2 Fixed amount off
- Value is a dollar/currency amount (e.g., `50.0` = $50 off)
- Used with `product-promotion-rule` only in observed files
- Threshold defines minimum purchase to trigger

### 3.3 Free shipping
- Represented as `<free/>` self-closing element (not `<percentage>0`)
- Always used with `shipping-promotion-rule`
- Threshold is typically 0.01 (applies to any non-zero shipment) or a minimum amount

### 3.4 Threshold behavior
- `threshold` on `<discount>` = minimum amount/quantity to trigger that tier
- Multiple `<discount>` blocks in one `<discounts>` element = tiered discount
- SFCC applies the highest applicable tier (spend $2000 → 20%, not 10%+20%)
- Threshold 0.01 = effectively no minimum (applies to any transaction)

---

## 4. Qualifying Product Rules

### 4.1 Price condition
Most promos use a price-gate to exclude $0 / sample products:
```xml
<price-condition operator="greater than">
  <price>0.01</price>
</price-condition>
```
This means "any product with a price > $0.01 qualifies."

### 4.2 Category condition
Order-level promos can restrict qualifying products to specific categories:
```xml
<category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
  <category-id>handbags</category-id>
  <category-id>watches</category-id>
</category-condition>
```
Multiple `<category-id>` in one condition = OR (handbags OR watches).
Multiple `<condition-group>` elements = OR between groups.

### 4.3 discount-only-qualifying-products
- `false` (default): discount applies to all eligible items in the cart
- `true` (VJTEMP): when used with category qualifying products on an order rule,
  the discount is scoped ONLY to the qualifying category items, not the whole cart total.
  This is the key mechanism for "10% off handbags and watches when total ≥ $500."

### 4.4 No qualifying-products block
Some promotions omit `<qualifying-products>` entirely (Welcome, Partners).
- For Welcome (shipping): any order qualifies for free shipping
- For Partners (order): the whole order qualifies with excluded categories defined separately

---

## 5. Exclusion Rules

### 5.1 Global exclusions (site-level)
Present in ALL 6 files. Applied to all promotions unless overridden.
- Always-excluded: `Exclusions-Always`, `accessories-seedbox-foundation`, `accessories-masks`
- Always-excluded product options: `monogramming`

### 5.2 Promotion-level exclusions
Partners-40-off defines additional excluded categories at the promotion rule level:
- `Exclusions-privatesale`, `Exclusions-Always`, `Exclusions-Minnie`, `Exclusions-pre-order`, `Exclusions-millers`
- These are in `<excluded-products>` inside `<order-promotion-rule>`, not in `<qualifying-products>`
- The distinction: qualifying products = what CAN be discounted; excluded products = what is specifically blocked

### 5.3 Disable global exclusions
Welcome-free-standard-shipping sets:
```xml
<disable-global-excluded-products>true</disable-global-excluded-products>
```
This means the global exclusions from `<global-promotion-settings>` do NOT apply to this shipping promotion.
Used when a welcome/loyalty shipping benefit should apply regardless of product category.

---

## 6. Coupon / Qualifier Rules

### 6.1 Coupon activation structure
In `<promotion-campaign-assignment>`:

```xml
<qualifiers match-mode="any">
  <customer-groups/>   ← who can participate (empty = anyone)
  <source-codes/>      ← source code restrictions (empty = none)
  <coupons/>           ← coupon qualifiers (empty = none required)
</qualifiers>
<coupons>
  <coupon coupon-id="Employee-40-off"/>   ← the coupon that FIRES the promo
</coupons>
```

The `<coupons>` element OUTSIDE `<qualifiers>` contains the activation coupon.
The `<coupons/>` element INSIDE `<qualifiers>` restricts which coupons make a customer eligible.
These are different mechanisms and must not be confused.

### 6.2 Open promotions (no coupon)
VJTEMP has:
```xml
<qualifiers match-mode="any">
  <customer-groups/>
  <source-codes/>
  <coupons/>
</qualifiers>
<!-- no <coupons> outside qualifiers -->
```
This means anyone can use the promotion within the campaign window, no coupon needed.

### 6.3 Coupon IDs are external
Coupon IDs (e.g., `Employee-40-off`) are managed in SFCC Business Manager → Promotions → Coupons.
The XML only references the coupon ID. The actual coupon (single-use, multi-use, codes) is configured separately.

---

## 7. Scheduling Rules

### 7.1 Three schedule locations
- **Campaign element:** `<campaign><start-date>` / `<end-date>` — controls when entire campaign is active
- **Assignment `<schedule>`:** `<promotion-campaign-assignment><schedule>` — controls when this specific assignment is active
- **No schedule:** Promotion is active whenever campaign is active (Partners)

### 7.2 Timezone convention
All observed dates use UTC ISO 8601: `2024-07-06T04:00:00.000Z`
The service must always generate dates in UTC.

### 7.3 Priority
Assignment-level schedule takes precedence over campaign-level for a specific promotion.
Campaign-level schedule applies to all promotions in the campaign.

---

## 8. Campaign Scope Rules

All observed campaigns use:
```xml
<campaign-scope>
  <applicable-online/>
</campaign-scope>
```
This means the promotion is online-only. An `<applicable-in-store/>` element would enable in-store.

---

## 9. Customer Group Rules

### 9.1 On the campaign element (VJTEMP)
```xml
<customer-groups match-mode="any">
  <customer-group group-id="Everyone"/>
</customer-groups>
```
This makes the campaign eligible for all registered customer groups.

### 9.2 Via exclusivity
`exclusivity=class` means the promo can be combined only with other class-exclusivity promos
(not with global or other class promos from different classes). It does NOT automatically
restrict to a customer group — that restriction requires the coupon mechanism or customer group assignment.

---

## 10. Lifecycle Flag Rules

| Flag | Default in samples | When set differently |
|---|---|---|
| `enabled-flag` | true | VJTEMP: false (disabled promotion) |
| `archived-flag` | false | 2018 promos, Welcome: true (legacy/template) |
| `searchable-flag` | false | Partners, Welcome: true (visible in search refinements) |
| `refinable-flag` | false | All samples: false |
| `prevent-requalifying-flag` | false | All samples: false |
| `prorate-across-eligible-items-flag` | false | All samples: false |

**Rule:** All flags must be present even if false.
Omitting a flag may cause SFCC to use unexpected defaults during import.

---

## 11. Custom Attribute Rules

### 11.1 Core attributes (present in all/most promotions)
| Attribute ID | Type | Observed values |
|---|---|---|
| `gwp` | boolean | false (gift-with-purchase flag; true would indicate GWP promo) |
| `isExcludeTranslate` | boolean | false (translation behavior) |

### 11.2 Extended UI attributes (complex/newer promotions)
| Attribute ID | Type | Observed in |
|---|---|---|
| `enableShowingEmptyThresholdBar` | boolean | VIP-2024, VJTEMP |
| `enableShowingFreeShippingLabel` | boolean | VIP-2024, VJTEMP |
| `hideDisclaimerMessage` | boolean | VIP-2024 |
| `isCouponOnlyActivatesPromotion` | boolean | VIP-2024 |
| `isForcedShowingExcludedMessage` | boolean | VIP-2024, VJTEMP |
| `isShowPrviewOnEmptyCart` | boolean | VIP-2024 |
| `showDisclaimerMessage` | boolean | VIP-2024 |

**Rule:** Custom attributes are emitted in the order they appear in Business Manager.
SFCC preserves them on import/export.

---

## 12. Rank Rules

- `<rank>` appears in `<promotion-campaign-assignment>` for Partners (10) and VIP-2024 (10)
- Lower rank number = higher priority when multiple promotions are active
- VJTEMP has no rank (Business Manager assigns a default)
- Rank affects which promotion wins when multiple are applicable and one must be selected
