# SAS Blueprint Replay Validation

## Overview

Blueprint Replay Validation is the deterministic proof that the SAS Blueprint Architecture can reproduce the original SFCC enterprise export byte-for-byte in structural terms.

The replay pipeline performs a complete round-trip:

```
Original SFCC XML
      │
      ▼  extractSASBlueprint
  Blueprint Record
      │
      ▼  assembleBlueprintXML
  Reconstructed XML
      │
      ▼  compareXMLStructures
  Structural Parity Result
```

A `replaySuccessful: true` result from `Summer_SAS.xml` means:

> "The extractor + renderers + assembler reproduce the original document structure without any structural drift."

This is not a cosmetic check. It is the end-to-end correctness proof that the architecture is safe for production use.

---

## Architecture

### Components

| File | Role |
|------|------|
| `src/blueprints/extractors/extractSASBlueprint.js` | Parses the original XML into a blueprint record |
| `src/renderers/renderCampaign.js` | Renders the `<campaign>` element |
| `src/renderers/renderBlueprintPromotion.js` | Renders each `<promotion>` element |
| `src/renderers/renderPromotionAssignment.js` | Renders each `<promotion-campaign-assignment>` element |
| `src/blueprints/assembleBlueprintXML.js` | Assembles all renderer outputs into a complete XML document |
| `src/blueprints/utils/compareXMLStructures.js` | Structurally compares two XML documents |
| `src/blueprints/validateBlueprintReplay.js` | Orchestrates the full round-trip |

### Data Flow

```
validateBlueprintReplay(originalXml)
  │
  ├─ extractSASBlueprint(originalXml)
  │     └─ Returns:  { blueprintId, campaignSlot, promotionSlots[], assignmentSlots[] }
  │
  ├─ assembleBlueprintXML(blueprint)
  │     ├─ renderCampaign(blueprint.campaignSlot)
  │     ├─ GLOBAL_PROMOTION_SETTINGS  (static verbatim block)
  │     ├─ renderBlueprintPromotion(slot)  × N
  │     └─ renderPromotionAssignment(slot) × N
  │
  └─ compareXMLStructures(originalXml, replayedXml)
        └─ Returns: { equal, differences[] }
```

---

## Structural Comparison Rules

`compareXMLStructures` applies strict XML semantics during comparison:

### What is allowed (treated as equivalent)

| Normalization | Rationale |
|--------------|-----------|
| Insignificant whitespace (whitespace-only text nodes) | XML spec: whitespace between tags is non-significant |
| Self-closing `<foo/>` vs explicit-empty `<foo></foo>` | Both produce `{}` in xmlbuilder2 object form |
| Line ending differences (CRLF vs LF) | OS-level variation, not structural |
| Attribute insertion ordering within an element | XML spec: attribute order is not significant |

### What is NOT allowed (flagged as structural differences)

| Change | Example |
|--------|---------|
| Element addition | Replayed output contains a new element absent from original |
| Element removal | Original element is missing from replayed output |
| Text content change | `<enabled-flag>true</enabled-flag>` → `<enabled-flag>false</enabled-flag>` |
| Attribute value change | `promotion-id="A"` → `promotion-id="B"` |
| Attribute addition or removal | New or deleted attribute on any element |
| Element reordering | `<a/><b/>` → `<b/><a/>` |
| Hierarchy change | Nesting levels differ |
| Sibling count change | 4 promotions vs 3 promotions |

---

## Renderer Orchestration

### `assembleBlueprintXML` — Canonical Section Order

The assembler produces sections in the exact order required by the SFCC Business Manager canonical export structure:

```
1. <?xml version="1.0" encoding="UTF-8"?>
2. <promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
3.     <campaign ...>                         ← renderCampaign
4.     <global-promotion-settings>            ← static verbatim block
5.     <promotion ...> × N                   ← renderBlueprintPromotion (in source order)
6.     <promotion-campaign-assignment ...> × N ← renderPromotionAssignment (in source order)
7. </promotions>
```

Sections are joined with `\n\n` (one blank line between sections), matching the original export spacing.

### Assembler Guarantees

The assembler is a **mechanical concatenator only**. It:

- Does NOT mutate renderer outputs
- Does NOT inject additional nodes
- Does NOT reorder outputs from their source order
- Does NOT modify whitespace inside renderer outputs
- Does NOT call any renderer more than once per slot
- Does NOT add attributes, comments, or processing instructions

---

## `renderBlueprintPromotion` — Canonical Element Order

Inside `<product-promotion-rule>`, elements appear in this canonical order:

```
1. <qualifying-products>         — if frozenStructure.qualifyingProducts is non-null
2. <discounted-products>         — if frozenStructure.discountedProducts is non-null
3. <disable-global-excluded-products>true</disable-global-excluded-products>
                                 — if frozenStructure.disableGlobalExcludedProducts is true
4a. <discounts condition-type="product-amount">  — if discountFamily === "product-amount"
4b. <simple-discount>            — if discountFamily === "simple"
5. <max-applications>            — if frozenStructure.maxApplications is non-null
```

### Custom Attribute Ordering

SFCC Business Manager exports custom attributes in **alphabetical order by `attribute-id`**. The blueprint extractor splits attributes into frozen and editable partitions, breaking source order. The renderer reconstructs alphabetical order by merging both partitions and sorting before output:

```javascript
const allAttrs = [...frozenAttrs, ...editableAttrs]
  .sort((a, b) => a.attributeId.localeCompare(b.attributeId));
```

This is a documented SFCC-specific assumption. Any future export that violates alphabetical ordering will be detected by the replay comparator.

---

## `renderPromotionAssignment` — Canonical Element Order

Inside `<promotion-campaign-assignment>`:

```
1. <qualifiers match-mode="...">
       <customer-groups/>    — if frozenStructure.qualifiers.hasCustomerGroups
       <source-codes/>       — if frozenStructure.qualifiers.hasSourceCodes
       <coupons/>            — if frozenStructure.qualifiers.hasCoupons
   </qualifiers>
2. <coupons>                 — if editableFields.couponIds is non-null
       <coupon coupon-id="..."/>  × N
3. <customer-groups match-mode="...">  — if frozenStructure.customerGroups is non-null
       <customer-group group-id="..."/> × N
4. <rank>N</rank>
5. <schedule>                — if frozenStructure.hasStartDate or hasEndDate
       <start-date>...</start-date>  — if hasStartDate
       <end-date>...</end-date>      — if hasEndDate
   </schedule>
```

---

## Number Formatting

SFCC Business Manager always exports numeric values with at least one decimal place:

```
25   → "25.0"
250  → "250.0"
0.01 → "0.01"   (already has decimals, unchanged)
```

All renderers use `formatNumber(n)` to enforce this convention, which prevents structural differences from numeric string comparison.

---

## Global Promotion Settings

The `<global-promotion-settings>` block is static boilerplate present in all SAS exports. It is:

- Reproduced verbatim as the `GLOBAL_PROMOTION_SETTINGS` constant in `assembleBlueprintXML.js`
- Never parameterised — the extractor validates its exact structure as a fingerprint
- Any deviation in the original XML from the canonical fingerprint causes extraction to fail (not silently pass)

The fingerprint validates:
1. Three `<category-condition>` entries with `catalog-id="siteCatalog_ToryUS"`:
   - `Exclusions-Always`
   - `accessories-seedbox-foundation`
   - `accessories-masks`
2. One `<product-option-id>monogramming</product-option-id>` entry

---

## Failure Handling

`validateBlueprintReplay` never throws. All failure modes return a structured result:

```javascript
// Extraction failure
{
  replaySuccessful: false,
  structuralDifferences: [{
    path:     '/[extraction]',
    original: 'extraction succeeded',
    replayed: 'extraction failed: <error message>',
  }],
  warnings: [],
}

// Assembly failure
{
  replaySuccessful: false,
  structuralDifferences: [{
    path:     '/[assembly]',
    original: 'assembly succeeded',
    replayed: 'assembly failed: <error message>',
  }],
  warnings: [],
}

// Structural differences found
{
  replaySuccessful: false,
  structuralDifferences: [
    { path: '/promotions/promotion[2]/enabled-flag/#text', original: 'true', replayed: 'false' },
    ...
  ],
  warnings: [],
}
```

---

## Debugging Structural Differences

When a replay fails, the `structuralDifferences` array provides XPath-like paths to the exact divergence.

### Path format

```
/promotions                                         ← root element
/promotions/campaign                                ← direct child
/promotions/campaign/@campaign-id                   ← attribute
/promotions/campaign/enabled-flag/#text             ← text content
/promotions/promotion[0]/custom-attributes/custom-attribute[3]/@attribute-id
                                                    ← array index + nested attribute
/promotions/promotion[1]/product-promotion-rule/[element-order]
                                                    ← element ordering problem
```

### Common causes and fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `attribute-id` diff in custom-attributes | Sorting logic broken | Verify `localCompare` alphabetical sort in `renderCustomAttributes` |
| `#text` diff on numeric field | `formatNumber` not applied | Ensure all discount/threshold values go through `formatNumber` |
| `[element-order]` diff | Wrong element sequence in renderer | Check canonical element order against SFCC BM export |
| `null` on replayed side | Element present in original, omitted in replay | Check presence flag handling in renderer |
| `null` on original side | Extra element injected by renderer | Renderer is producing output that shouldn't exist |
| Array length diff | Source-order not preserved, or slot count mismatch | Check that `blueprint.promotionSlots` length matches original |

---

## Prohibited Behaviors

The following behaviors are explicitly prohibited in all replay components:

- **No inference** — the renderer must only use values that were explicitly extracted
- **No defaults** — absent values are omitted, not substituted with defaults
- **No XML mutation** — renderers do not modify their input objects
- **No heuristic repair** — if a field is structurally incorrect, the replay fails, not silently corrects
- **No re-ordering** — promotion and assignment slots are rendered in blueprint source order
- **No extra elements** — renderers produce only elements that correspond to data in the slot

---

## Test Coverage

| Test file | What it proves |
|-----------|---------------|
| `tests/unit/renderCampaign.test.js` | Campaign renderer produces correct XML for all flag combinations |
| `tests/unit/renderPromotionAssignment.test.js` | Assignment renderer handles all qualifier/coupon/schedule patterns |
| `tests/unit/assembleBlueprintXML.test.js` | Assembler produces correct section order, does not mutate data, is deterministic |
| `tests/unit/compareXMLStructures.test.js` | Comparator correctly identifies structural differences and equivalences |
| `tests/integration/sasReplayValidation.test.js` | **Full round-trip against real `Summer_SAS.xml` — the acceptance gate** |

---

## API Reference

### `validateBlueprintReplay(originalXml, options?)`

```javascript
const { validateBlueprintReplay } = require('./src/blueprints/validateBlueprintReplay');

const result = validateBlueprintReplay(originalXml, {
  blueprintId:  'summer-sas-2025',    // optional, used for extracted blueprint record
  sourceExport: 'Summer_SAS.xml',     // optional, for audit trail
  extractedAt:  '2025-06-01T00:00:00.000Z', // optional, defaults to fixed sentinel date
});

// result:
// {
//   replaySuccessful:     boolean,
//   structuralDifferences: Array<{ path: string, original: any, replayed: any }>,
//   warnings:             string[],
// }
```

**Throws:** `Error` when `originalXml` is not a non-empty string.

**Returns:** Always a `ReplayResult` object. Never throws for extraction, assembly, or comparison failures — those surface as `replaySuccessful: false` with structured entries in `structuralDifferences`.

---

### `compareXMLStructures(originalXml, replayedXml)`

```javascript
const { compareXMLStructures } = require('./src/blueprints/utils/compareXMLStructures');

const result = compareXMLStructures(xml1, xml2);

// result:
// {
//   equal:       boolean,
//   differences: Array<{ path: string, original: any, replayed: any }>,
// }
```

**Throws:** `Error` when either input is not a non-empty string, or when either input is not valid XML.

---

### `assembleBlueprintXML(blueprint)`

```javascript
const { assembleBlueprintXML } = require('./src/blueprints/assembleBlueprintXML');

const xml = assembleBlueprintXML(blueprint);
// Returns: complete XML document string, ending with '\n'
```

**Throws:** `Error` when `blueprint` is not a valid object, or when any required slot array is absent or empty.
