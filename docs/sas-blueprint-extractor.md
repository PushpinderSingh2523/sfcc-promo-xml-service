# SAS Blueprint Extractor

**File:** `src/blueprints/extractors/extractSASBlueprint.js`  
**Validator:** `src/blueprints/validators/validateBlueprintCompatibility.js`  
**Schema:** `src/blueprints/schemas/sasBlueprint.schema.json`  
**Tests:** `tests/unit/extractSASBlueprint.test.js`, `tests/unit/validateBlueprintCompatibility.test.js`

---

## What This Is

The SAS Blueprint Extractor is the **foundation of the Blueprint Promotion Architecture**. It reads a real SFCC SAS promotion XML export and produces a canonical, versioned blueprint record.

This blueprint record is the single source of truth for the entire SAS orchestration flow:

```
real XML export
      ↓
  extractor
      ↓
blueprint record
   ↙        ↘
frozen      editable
structure   fields
   ↓           ↓
renderer    clarification
  (no       flow (asks
  change)   user each
            season)
```

If this extractor is wrong, every downstream behavior becomes unreliable. Therefore: **extraction is mechanical, strict, and deterministic.**

---

## Extraction Principles

### 1. If a node exists → extract it

Every element present in the source XML is captured in the blueprint. Nothing is silently dropped.

### 2. If a node is absent → its blueprint field is null

Absent optional nodes (like `<qualifying-products>`, `<max-applications>`, `<start-date>`) produce `null` in the blueprint. This `null` is meaningful: it tells the renderer and clarification flow that the element was not in the source export and must not be added.

### 3. No defaults are added

The extractor never synthesizes values. If `<max-applications>` is absent, `maxApplications` is `null` — not `1`, not `0`. Absence itself is structural data.

### 4. Source order is always preserved

`promotionSlots[]` and `assignmentSlots[]` are populated in the exact order the elements appear in the source XML. The `slotIndex` field matches the array position. Order is never sorted, shuffled, or rearranged.

### 5. No XML mutation

The extractor reads; it never writes. The source XML string is never modified.

### 6. No heuristic inference

Classification (e.g. discount family, condition type) is determined solely by which elements are present in the XML. There is no scoring, matching, or ambiguity resolution.

---

## Extraction Flow

```
1.  Receive xmlString + options
2.  Validate: xmlString must be non-empty string
3.  Parse XML with xmlbuilder2 convert({ format: 'object' })
4.  Locate root <promotions> element
5.  Validate XML namespace (must be SFCC promotion namespace)
6.  Validate <global-promotion-settings> against frozen fingerprint
    → HALT if mismatch (see §Global Settings Validation)
7.  Extract <campaign> → campaignSlot
8.  Extract all <promotion> elements in source order → promotionSlots[]
    For each promotion:
      a. Extract flags (6 boolean flags, all frozen)
      b. Extract exclusivity (frozen)
      c. Extract name elements → nameLocales (frozen) + names (editable)
      d. Extract custom-attributes → frozenCustomAttributes + editableCustomAttributes
      e. Classify discount family (simple or product-amount)
      f. Extract discount fields (frozen type + editable values)
      g. Extract qualifying-products or null
      h. Extract discounted-products or null
      i. Extract disableGlobalExcludedProducts or null
      j. Extract maxApplications or null
9.  Extract all <promotion-campaign-assignment> elements → assignmentSlots[]
    For each assignment:
      a. Extract qualifiers structure (matchMode + presence flags, all frozen)
      b. Extract customer-groups block or null (frozen)
      c. Extract rank (frozen)
      d. Extract coupon IDs or null (editable)
      e. Extract schedule presence flags (frozen) + date values (editable)
10. Assemble and return blueprint record
```

---

## Global Settings Validation

The `<global-promotion-settings>` element is identical across all real SFCC SAS exports. It contains the three always-excluded categories and the monogramming product option.

The extractor compares the parsed settings against a **frozen fingerprint constant** using deep equality:

```javascript
const FROZEN_GLOBAL_SETTINGS_FINGERPRINT = {
  'global-excluded-products': {
    'included-products': {
      'condition-group': [
        { 'category-condition': { '@catalog-id': 'siteCatalog_ToryUS', '@operator': 'is equal', 'category-id': 'Exclusions-Always' } },
        { 'category-condition': { '@catalog-id': 'siteCatalog_ToryUS', '@operator': 'is equal', 'category-id': 'accessories-seedbox-foundation' } },
        { 'category-condition': { '@catalog-id': 'siteCatalog_ToryUS', '@operator': 'is equal', 'category-id': 'accessories-masks' } },
      ],
    },
  },
  'global-excluded-product-options': {
    'product-option-id': 'monogramming',
  },
};
```

**If the settings in the export do not match this fingerprint exactly:**

```
EXTRACTION HALTED: <global-promotion-settings> does not match the canonical
frozen fingerprint. The structure has changed and requires manual review before
a new blueprint can be extracted.
```

Extraction stops entirely. The calling code receives an error. A human must review whether the structural change is intentional before a new blueprint can be created.

This is intentional strictness: the global settings are the one element that must never silently drift.

---

## Discount Family Classification

The extractor reads `<product-promotion-rule>` and determines which discount element family is present:

| XML present                               | Blueprint `discountFamily` | Frozen field           | Editable field            |
|-------------------------------------------|----------------------------|------------------------|---------------------------|
| `<simple-discount><percentage>N</percentage>` | `"simple"`             | `simpleDiscountType: "percentage"` | `simpleDiscountValue: N` |
| `<simple-discount><amount>N</amount>`     | `"simple"`                 | `simpleDiscountType: "amount"` | `simpleDiscountValue: N` |
| `<discounts condition-type="product-amount">` | `"product-amount"`     | `discountEntryTemplates: [{discountType}]` | `discountEntries: [{threshold, discountValue}]` |

The choice of family is frozen because it determines which XML elements the renderer emits. Changing `simple` to `product-amount` is a breaking architectural change.

For `product-amount`, each `<discount>` tier produces one entry in `discountEntryTemplates` (frozen `discountType`) and one entry in `discountEntries` (editable `threshold` + `discountValue`). They are paired 1:1 by index.

---

## Custom Attribute Classification

Custom attributes are partitioned into frozen or editable using `EDITABLE_CUSTOM_ATTR_IDS`:

```javascript
const EDITABLE_CUSTOM_ATTR_IDS = new Set([
  'storefront_msg_cart_inclusion',
  'storefront_msg_cart_exclusion',
  'includedBadge',
  'includedBadgeSPP',
  'couponErrorMsgNoActivePromotion',
  'couponErrorMsgRedemptionLimitExeeded',
  'couponErrorMsgNoApplicablePromotion',
  'couponErrorMsgNoApplicablePromo',
]);
```

**Rule:** If the `attribute-id` is in this set → `editableCustomAttributes`. Otherwise → `frozenCustomAttributes`.

There is no heuristic detection. The set is the complete, explicitly-defined list. Any attribute-id not in the set is frozen, regardless of its content.

**Value types:**
- `text`: attribute has direct text content (the `#` field in xmlbuilder2 object format)
- `nested`: attribute contains a `<value>` child element (the `value` field in xmlbuilder2 object format)

Source order within each partition is preserved.

---

## Product Condition Extraction

### Condition Block Structure

```
<included-products>
  <condition-group>
    <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
      <category-id>sale-view-all</category-id>
    </category-condition>
  </condition-group>
</included-products>
```

Becomes:

```json
{
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
}
```

### Multiple Category IDs in One Condition Group

```xml
<condition-group>
  <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
    <category-id>Exclusions-Always</category-id>
    <category-id>accessories-seedbox-foundation</category-id>
    <category-id>Exclusions-Welcome-Offer</category-id>
  </category-condition>
</condition-group>
```

Becomes:

```json
{
  "condition": {
    "type": "category",
    "catalogId": "siteCatalog_ToryUS",
    "operator": "is equal",
    "categoryIds": ["Exclusions-Always", "accessories-seedbox-foundation", "Exclusions-Welcome-Offer"]
  }
}
```

### Multiple Condition Groups (e.g. global-promotion-settings)

```xml
<condition-group>
  <category-condition ...><category-id>Exclusions-Always</category-id></category-condition>
</condition-group>
<condition-group>
  <category-condition ...><category-id>accessories-seedbox-foundation</category-id></category-condition>
</condition-group>
```

Becomes an array of two `conditionGroups`, each with one `categoryIds` entry. Source order is preserved.

---

## Assignment Extraction

### Qualifiers Structure

```xml
<qualifiers match-mode="any">
  <customer-groups/>
  <source-codes/>
  <coupons/>
</qualifiers>
```

Becomes (frozen):
```json
{
  "qualifiers": {
    "matchMode": "any",
    "hasCustomerGroups": true,
    "hasSourceCodes": true,
    "hasCoupons": true
  }
}
```

The presence or absence of each qualifier sub-element is frozen. If `<coupons/>` is in the qualifiers block, `hasCoupons: true`. If it is absent, `hasCoupons: false`.

### Customer Groups (outside qualifiers)

```xml
<customer-groups match-mode="any">
  <customer-group group-id="Everyone-webapp-except-employees"/>
</customer-groups>
```

Becomes (frozen):
```json
{
  "customerGroups": {
    "matchMode": "any",
    "groupIds": ["Everyone-webapp-except-employees"]
  }
}
```

If this block is absent from the assignment, `customerGroups: null`.

### Schedule

```xml
<schedule>
  <start-date>2025-07-07T04:00:00.000Z</start-date>
  <end-date>2025-07-29T04:00:00.000Z</end-date>
</schedule>
```

Becomes:
- Frozen: `hasStartDate: true`, `hasEndDate: true`
- Editable: `startDate: "2025-07-07T04:00:00.000Z"`, `endDate: "2025-07-29T04:00:00.000Z"`

If only `<end-date>` is present: `hasStartDate: false`, `startDate: null`, `hasEndDate: true`, `endDate: "..."`.

If `<schedule>` is absent entirely: both presence flags are `false`, both date values are `null`.

---

## Promotion Slot Examples (from Summer_SAS.xml)

### Slot 0: 2025-SUMMER-SAS-APPEASEMENT

**Discount family:** `simple`  
**Product rule structure:** `discountedProducts` only (no `qualifyingProducts`)  
**Notable:** Two name locales (`x-default`, `en`); multiple exclusion category IDs in one condition-group

```json
{
  "slotIndex": 0,
  "frozenStructure": {
    "enabledFlag": true,
    "archivedFlag": false,
    "searchableFlag": false,
    "refinableFlag": false,
    "preventRequalifyingFlag": false,
    "prorateAcrossEligibleItemsFlag": false,
    "exclusivity": "class",
    "nameLocales": ["x-default", "en"],
    "discountFamily": "simple",
    "simpleDiscountType": "percentage",
    "discountEntryTemplates": null,
    "qualifyingProducts": null,
    "discountedProducts": {
      "includedProducts": {
        "conditionGroups": [{
          "condition": { "type": "category", "catalogId": "siteCatalog_ToryUS", "operator": "is equal", "categoryIds": ["sale-view-all"] }
        }]
      },
      "excludedProducts": {
        "conditionGroups": [{
          "condition": { "type": "category", "catalogId": "siteCatalog_ToryUS", "operator": "is equal",
            "categoryIds": ["Exclusions-Always", "accessories-seedbox-foundation", "Exclusions-Welcome-Offer"] }
        }]
      }
    },
    "disableGlobalExcludedProducts": null,
    "maxApplications": null,
    "frozenCustomAttributes": [ ... ]
  },
  "editableFields": {
    "promotionId": "2025-SUMMER-SAS-APPEASEMENT",
    "names": [
      { "xmlLang": "x-default", "value": "Promo Applied" },
      { "xmlLang": "en", "value": "Promo Applied" }
    ],
    "simpleDiscountValue": 25.0,
    "discountEntries": null,
    "editableCustomAttributes": [
      { "attributeId": "couponErrorMsgNoActivePromotion", "xmlLang": "x-default", "valueType": "text", "value": "This promo code has expired" },
      { "attributeId": "couponErrorMsgRedemptionLimitExeeded", "xmlLang": "x-default", "valueType": "text", "value": "This promo code has already been used" },
      { "attributeId": "storefront_msg_cart_exclusion", "xmlLang": "x-default", "valueType": "text", "value": "Excluded From Promotion" },
      { "attributeId": "storefront_msg_cart_inclusion", "xmlLang": "x-default", "valueType": "text", "value": "25% Off Discount Applied" }
    ]
  }
}
```

### Slot 2: 2025_Summer_SAS_BB50OFF

**Discount family:** `product-amount`  
**Product rule structure:** Both `qualifyingProducts` (price gate) and `discountedProducts` (price gate + exclusions)  
**Notable:** `disableGlobalExcludedProducts: true`, `maxApplications: 1`

```json
{
  "slotIndex": 2,
  "frozenStructure": {
    "discountFamily": "product-amount",
    "simpleDiscountType": null,
    "discountEntryTemplates": [{ "discountType": "amount" }],
    "qualifyingProducts": {
      "includedProducts": {
        "conditionGroups": [{
          "condition": { "type": "price", "operator": "greater than", "price": 0.01 }
        }]
      },
      "excludedProducts": null
    },
    "discountedProducts": {
      "includedProducts": {
        "conditionGroups": [{
          "condition": { "type": "price", "operator": "greater than", "price": 0.01 }
        }]
      },
      "excludedProducts": {
        "conditionGroups": [{
          "condition": { "type": "category", "catalogId": "siteCatalog_ToryUS", "operator": "is equal",
            "categoryIds": ["Exclusions-Always", "2025-Summer-SAS-Bounceback-Exclusions"] }
        }]
      }
    },
    "disableGlobalExcludedProducts": true,
    "maxApplications": 1
  },
  "editableFields": {
    "promotionId": "2025_Summer_SAS_BB50OFF",
    "simpleDiscountValue": null,
    "discountEntries": [{ "threshold": 250.0, "discountValue": 50.0 }]
  }
}
```

---

## Assignment Slot Examples (from Summer_SAS.xml)

### Assignment 0: APPEASEMENT assignment

**match-mode:** `any`  
**Has coupons block:** Yes (outside qualifiers)  
**Has customer-groups block:** No (outside qualifiers)  
**Schedule:** end-date only

```json
{
  "slotIndex": 0,
  "frozenStructure": {
    "qualifiers": { "matchMode": "any", "hasCustomerGroups": true, "hasSourceCodes": true, "hasCoupons": true },
    "customerGroups": null,
    "rank": 10,
    "hasStartDate": false,
    "hasEndDate": true
  },
  "editableFields": {
    "promotionId": "2025-SUMMER-SAS-APPEASEMENT",
    "campaignId": "2025_SUMMER_SAS",
    "couponIds": ["2025-Summer-SAS-CS"],
    "startDate": null,
    "endDate": "2025-07-08T04:00:00.000Z"
  }
}
```

### Assignment 3: WebApp assignment

**match-mode:** `all`  
**Has customer-groups block:** Yes (outside qualifiers)  
**Schedule:** both start-date and end-date

```json
{
  "slotIndex": 3,
  "frozenStructure": {
    "qualifiers": { "matchMode": "all", "hasCustomerGroups": true, "hasSourceCodes": true, "hasCoupons": true },
    "customerGroups": { "matchMode": "any", "groupIds": ["Webapp-users"] },
    "rank": 10,
    "hasStartDate": true,
    "hasEndDate": true
  },
  "editableFields": {
    "promotionId": "2025_Summer_SAS_WebApp",
    "campaignId": "2025_SUMMER_SAS",
    "couponIds": null,
    "startDate": "2025-07-07T04:00:00.000Z",
    "endDate": "2025-07-29T04:00:00.000Z"
  }
}
```

---

## Compatibility Validation

After extracting a new blueprint, compare it against the previous version:

```javascript
const { validateBlueprintCompatibility } = require('./validators/validateBlueprintCompatibility');

const result = validateBlueprintCompatibility(previousBlueprint, newBlueprint);
// result = { compatible: boolean, breakingChanges: [], warnings: [] }
```

### Breaking Changes (halt and alert)

| Change detected                          | Why it breaks                                              |
|------------------------------------------|------------------------------------------------------------|
| Promotion slot count changed             | Campaign structure changed                                 |
| Assignment slot count changed            | Campaign structure changed                                 |
| `discountFamily` changed                 | Different renderer XML elements; incompatible output       |
| Discount entry count changed             | Number of tiers changed; renderer loop differs             |
| Discount entry type changed              | `<amount>` vs `<percentage>` node choice changed           |
| Frozen flag changed (any of 6)           | XML output differs from last season                        |
| `exclusivity` changed                    | Promotion class behavior changed                           |
| `qualifyingProducts` structure changed   | Product eligibility logic changed                          |
| `discountedProducts` structure changed   | Product targeting changed                                  |
| `disableGlobalExcludedProducts` changed  | Global exclusion override changed                          |
| `maxApplications` changed               | Application limit changed                                  |
| Qualifier `matchMode` changed            | Campaign qualifier behavior changed                        |
| Qualifier presence flag changed          | A qualifier block appeared or disappeared                  |
| `customerGroups` block presence changed  | Customer targeting structure changed                       |
| `customerGroups.matchMode` changed       | Customer group logic changed                               |
| `hasStartDate` or `hasEndDate` changed   | Schedule element structure changed                         |

### Warnings (review recommended but not blocking)

| Change detected                          | Why it's a warning                                         |
|------------------------------------------|------------------------------------------------------------|
| `nameLocales` changed                    | New or removed locale; review copy completeness            |
| Frozen custom attribute count changed    | New or removed config flag; review intent                  |
| Frozen custom attribute value changed    | Config flag value changed; review if intentional           |
| `customerGroups.groupIds` changed        | Customer group membership changed; review if intentional   |
| `rank` changed                           | Campaign rank changed; review priority intent              |
| Campaign `enabledFlag` changed           | Campaign enable state changed; review                      |
| Campaign `applicableOnline` changed      | Channel scope changed; review                              |

---

## Prohibited Behaviors

The extractor explicitly prohibits:

| Prohibited behavior               | Why                                                       |
|-----------------------------------|-----------------------------------------------------------|
| Adding default values             | Absence is structural data                                |
| Normalizing category IDs          | Category IDs are frozen verbatim                          |
| Reordering condition-groups       | Source order is structural data                           |
| Merging condition-groups          | Each group is a distinct condition                        |
| Inferring discount family         | Family is determined by element presence, not content     |
| Repairing XML structure           | Broken XML must halt extraction                           |
| Modifying the source XML string   | Extractor is read-only                                    |
| Bypassing global settings check   | Settings mismatch is a hard error                         |
| Calling any renderer              | Extractor has no knowledge of renderer internals          |
| Adding XML elements not in source | Blueprint reflects source; it adds nothing                |

---

## Structural Guarantees

1. **Same XML input always produces byte-identical JSON output** (given the same `extractedAt` timestamp option). Extraction is purely functional with no side effects.

2. **Null presence is always meaningful.** A `null` field means the element was absent from the source XML. A missing field (not present at all) means the field is not applicable to that slot's configuration.

3. **promotionSlots[i].slotIndex === i** always. Same for assignmentSlots.

4. **frozenStructure never contains any field from editableFields** and vice versa. The partition is enforced by the object structure — there is no overlap.

5. **All numeric values in the blueprint are JS numbers, never strings.** XML text content is parsed via `parseFloat()` before storage.

6. **Discount family classification is based solely on element presence**, not on attribute values or content inspection.

---

## Blueprint Versioning Strategy

Each extraction creates a new, immutable blueprint version:

```
SAS-2024  ←  extracted from Summer_SAS_2024.xml  (retained)
SAS-2025  ←  extracted from Summer_SAS_2025.xml  (retained)
```

- Versions are never overwritten
- The most recent version is the default for the next season's clarification flow
- A prior version can be explicitly selected (e.g. "use the 2024 structure")
- Re-extraction from the same file produces the same blueprint (determinism guarantee)
- The compatibility validator is run automatically when a new blueprint is extracted; breaking changes surface before the blueprint is stored

---

## Extraction Lifecycle

```
1.  New SAS XML export arrives
2.  extractSASBlueprint(xmlString, { blueprintId, sourceExport }) called
3.  Global settings validated against canonical fingerprint
    → If mismatch: halt; alert; require manual review
4.  Blueprint record produced
5.  validateBlueprintCompatibility(previousVersion, newBlueprint) called
    → If breakingChanges.length > 0: alert; block storage; require review
    → If warnings.length > 0: surface warnings; allow storage after acknowledgment
    → If compatible: store new blueprint version immediately
6.  New blueprint is active for the next clarification flow run
```

---

## API

### `extractSASBlueprint(xmlString, options?)`

```javascript
const { extractSASBlueprint } = require('./src/blueprints/extractors/extractSASBlueprint');

const blueprint = extractSASBlueprint(xmlString, {
  blueprintId:  'SAS-2025',          // optional; defaults to timestamp-based ID
  sourceExport: 'Summer_SAS.xml',    // optional; defaults to 'unknown'
  extractedAt:  '2025-06-01T...',    // optional; defaults to new Date().toISOString()
});
```

**Returns:** canonical blueprint object  
**Throws:** `Error` with descriptive message on any structural or parse failure

### `validateBlueprintCompatibility(previousBlueprint, nextBlueprint)`

```javascript
const { validateBlueprintCompatibility } = require('./src/blueprints/validators/validateBlueprintCompatibility');

const result = validateBlueprintCompatibility(previousBlueprint, nextBlueprint);
// {
//   compatible:     boolean,
//   breakingChanges: string[],
//   warnings:       string[]
// }
```

**Returns:** CompatibilityResult  
**Throws:** `Error` if either argument is not a non-null object  
**Does not mutate** either blueprint argument
