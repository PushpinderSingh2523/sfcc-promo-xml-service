# SAS Blueprint JSON Schema

**File:** `src/blueprints/schemas/sasBlueprint.schema.json`  
**Draft:** JSON Schema draft-07  
**Validator:** AJV 8.x (`ajv` + `ajv-formats`, already installed)

---

## Purpose

This schema defines the canonical structure of a **SAS Blueprint record** — the frozen, versioned snapshot extracted from a real SFCC SAS promotion XML export.

A blueprint record is the contract between:
- the **extractor** (produces the record from XML)
- the **clarification flow** (collects editable field values from the user)
- the **renderer** (receives fully-populated renderer inputs)

The schema enforces one non-negotiable architectural invariant: **every field is explicitly either frozen or editable, and the two categories are structurally separated in every object.**

---

## Top-Level Shape

```json
{
  "blueprintId":     "SAS-2025",
  "sourceExport":    "Summer_SAS.xml",
  "extractedAt":     "2025-06-01T00:00:00.000Z",
  "campaignSlot":    { ... },
  "promotionSlots":  [ ... ],
  "assignmentSlots": [ ... ]
}
```

| Field            | Type   | Required | Description                                           |
|------------------|--------|----------|-------------------------------------------------------|
| `blueprintId`    | string | ✓        | Unique version identifier, e.g. `SAS-2025`            |
| `sourceExport`   | string | ✓        | Filename of the SFCC export this was extracted from   |
| `extractedAt`    | string | ✓        | ISO-8601 timestamp of extraction                      |
| `campaignSlot`   | object | ✓        | Extracted `<campaign>` element                        |
| `promotionSlots` | array  | ✓        | Ordered promotion slots (source order preserved)      |
| `assignmentSlots`| array  | ✓        | Ordered assignment slots (source order preserved)     |

---

## Frozen vs Editable — The Core Principle

Every slot object has exactly two children: `frozenStructure` and `editableFields`.

```
slot
 ├── frozenStructure   ← reproduced verbatim each season; never prompted
 └── editableFields    ← populated by clarification flow each season
```

**frozenStructure** contains:
- All XML boolean flags (`enabled-flag`, `archived-flag`, etc.)
- `exclusivity`
- `discountFamily` (which renderer element family to use)
- All product condition structures (category IDs, condition types, operators)
- `disableGlobalExcludedProducts`
- `maxApplications`
- Qualifier match-modes and presence flags
- Customer group IDs
- Schedule presence flags (`hasStartDate`, `hasEndDate`)
- Frozen custom attribute list (flags and boolean configs)

**editableFields** contains:
- `promotionId` (changes every season)
- `names[]` with their text values
- `simpleDiscountValue` or `discountEntries[]` (numeric values only)
- `editableCustomAttributes[]` (user-facing copy strings)
- `couponIds[]` (coupon codes assigned this season)
- `startDate` / `endDate` (schedule dates for this season)

---

## campaignSlot

```json
{
  "frozenStructure": {
    "enabledFlag":   true,
    "campaignScope": { "applicableOnline": true }
  },
  "editableFields": {
    "campaignId": "2025_SUMMER_SAS"
  }
}
```

`campaignId` is editable because it carries the season year. All structural facts (`enabledFlag`, `applicableOnline`) are frozen.

---

## promotionSlots[]

Each entry models one `<promotion>` element from the source export, preserving XML source order.

### promotionSlot.frozenStructure

| Field                          | Type             | Source XML element                          |
|--------------------------------|------------------|---------------------------------------------|
| `enabledFlag`                  | boolean          | `<enabled-flag>`                            |
| `archivedFlag`                 | boolean          | `<archived-flag>`                           |
| `searchableFlag`               | boolean          | `<searchable-flag>`                         |
| `refinableFlag`                | boolean          | `<refinable-flag>`                          |
| `preventRequalifyingFlag`      | boolean          | `<prevent-requalifying-flag>`               |
| `prorateAcrossEligibleItemsFlag` | boolean        | `<prorate-across-eligible-items-flag>`      |
| `exclusivity`                  | `no\|class\|global` | `<exclusivity>`                         |
| `nameLocales`                  | string[]         | xml:lang values of `<name>` elements        |
| `discountFamily`               | `simple\|product-amount` | presence of `<simple-discount>` vs `<discounts>` |
| `simpleDiscountType`           | `percentage\|amount\|null` | child of `<simple-discount>` or null |
| `discountEntryTemplates`       | array or null    | frozen `discountType` per `<discount>` tier |
| `qualifyingProducts`           | object or null   | `<qualifying-products>` structure           |
| `discountedProducts`           | object or null   | `<discounted-products>` structure           |
| `disableGlobalExcludedProducts`| boolean or null  | `<disable-global-excluded-products>`        |
| `maxApplications`              | integer or null  | `<max-applications>`                        |
| `frozenCustomAttributes`       | array            | non-editable `<custom-attribute>` elements  |

### promotionSlot.editableFields

| Field                     | Type             | Description                                   |
|---------------------------|------------------|-----------------------------------------------|
| `promotionId`             | string           | Season-specific promotion ID                  |
| `names`                   | array            | `{ xmlLang, value }` per locale               |
| `simpleDiscountValue`     | number or null   | For `simple` family; null for `product-amount`|
| `discountEntries`         | array or null    | `{ threshold, discountValue }` per tier; null for `simple` |
| `editableCustomAttributes`| array            | User-facing copy attributes                   |

---

## Discount Family Details

### `discountFamily: "simple"`

Source: `<simple-discount><percentage>25.0</percentage></simple-discount>`

```json
"frozenStructure": {
  "discountFamily": "simple",
  "simpleDiscountType": "percentage",
  "discountEntryTemplates": null
},
"editableFields": {
  "simpleDiscountValue": 25.0,
  "discountEntries": null
}
```

### `discountFamily: "product-amount"`

Source: `<discounts condition-type="product-amount"><discount><threshold>250.0</threshold><amount>50.0</amount></discount></discounts>`

```json
"frozenStructure": {
  "discountFamily": "product-amount",
  "simpleDiscountType": null,
  "discountEntryTemplates": [
    { "discountType": "amount" }
  ]
},
"editableFields": {
  "simpleDiscountValue": null,
  "discountEntries": [
    { "threshold": 250.0, "discountValue": 50.0 }
  ]
}
```

The `discountType` per tier is frozen because it determines the XML element (`<amount>` vs `<percentage>`). The numeric values are editable.

---

## Product Condition Structures

Both `qualifyingProducts` and `discountedProducts` use the same structure:

```json
{
  "includedProducts": {
    "conditionGroups": [
      {
        "condition": {
          "type": "category",
          "catalogId": "siteCatalog_ToryUS",
          "operator": "is equal",
          "categoryIds": ["sale-view-all"]
        }
      }
    ]
  },
  "excludedProducts": {
    "conditionGroups": [
      {
        "condition": {
          "type": "category",
          "catalogId": "siteCatalog_ToryUS",
          "operator": "is equal",
          "categoryIds": ["Exclusions-Always", "2025-Summer-SAS-Bounceback-Exclusions"]
        }
      }
    ]
  }
}
```

For price-gated conditions:

```json
{
  "condition": {
    "type": "price",
    "operator": "greater than",
    "price": 0.01
  }
}
```

All product condition fields are frozen. Category IDs are not changed between seasons.

---

## Custom Attribute Value Types

Two value types are defined:

| `valueType` | Source XML                                        | Example                    |
|-------------|---------------------------------------------------|----------------------------|
| `text`      | `<custom-attribute>false</custom-attribute>`      | `"value": "false"`         |
| `nested`    | `<custom-attribute><value>25</value></custom-attribute>` | `"value": "25"` |

---

## assignmentSlots[]

Each entry models one `<promotion-campaign-assignment>` from the source export.

### assignmentSlot.frozenStructure

| Field           | Type             | Source XML element                        |
|-----------------|------------------|-------------------------------------------|
| `qualifiers`    | object           | `<qualifiers>` element                    |
| `qualifiers.matchMode` | `any\|all` | `match-mode` attribute                |
| `qualifiers.hasCustomerGroups` | boolean | presence of `<customer-groups/>` in qualifiers |
| `qualifiers.hasSourceCodes`    | boolean | presence of `<source-codes/>` in qualifiers    |
| `qualifiers.hasCoupons`        | boolean | presence of `<coupons/>` in qualifiers         |
| `customerGroups` | object or null  | `<customer-groups>` block outside qualifiers  |
| `customerGroups.matchMode` | `any\|all` | `match-mode` attribute                |
| `customerGroups.groupIds`  | string[]   | `<customer-group group-id="..."/>`        |
| `rank`          | integer          | `<rank>`                                  |
| `hasStartDate`  | boolean          | whether `<start-date>` exists             |
| `hasEndDate`    | boolean          | whether `<end-date>` exists               |

### assignmentSlot.editableFields

| Field        | Type             | Description                                 |
|--------------|------------------|---------------------------------------------|
| `promotionId`| string           | Updated to match new season promotion ID    |
| `campaignId` | string           | Updated to match new season campaign ID     |
| `couponIds`  | string[] or null | New season coupon codes; null if no coupons |
| `startDate`  | string or null   | ISO-8601; null if `hasStartDate=false`      |
| `endDate`    | string or null   | ISO-8601; null if `hasEndDate=false`        |

---

## Schema Constraints

The schema uses `"additionalProperties": false` at every level. This means:

- Unknown fields added to any object cause validation failure
- The schema serves as an exact specification, not a loose container
- Every field is explicitly declared with its type

All numeric discount and threshold values are modelled as `number` (not string). The extractor parses string values from XML into numbers; the schema validates the result.

---

## $defs Reference

Reusable sub-schemas defined in `$defs`:

| Name                          | Used by                                 |
|-------------------------------|-----------------------------------------|
| `categoryCondition`           | conditionGroup                          |
| `priceCondition`              | conditionGroup                          |
| `conditionGroup`              | productConditionBlock                   |
| `productConditionBlock`       | qualifyingProductsBlock, discountedProductsBlock |
| `qualifyingProductsBlock`     | promotionSlotFrozenStructure            |
| `discountedProductsBlock`     | promotionSlotFrozenStructure            |
| `frozenCustomAttribute`       | promotionSlotFrozenStructure            |
| `editableCustomAttribute`     | promotionSlotEditableFields             |
| `nameEntry`                   | promotionSlotEditableFields             |
| `discountEntryTemplate`       | promotionSlotFrozenStructure            |
| `discountEntryValues`         | promotionSlotEditableFields             |
| `promotionSlotFrozenStructure`| promotionSlots[] items                  |
| `promotionSlotEditableFields` | promotionSlots[] items                  |
| `assignmentSlotFrozenStructure` | assignmentSlots[] items               |
| `assignmentSlotEditableFields`  | assignmentSlots[] items               |
