# SAS Dynamic Clarification Engine

## Overview

The SAS Dynamic Clarification Engine is a schema-driven, blueprint-driven orchestration system that guarantees every business-relevant editable attribute in a SAS promotion blueprint is discovered, classified, and surfaced as a deterministic clarification question.

It is the answer to the question:

> **"What do I need to ask a business user to safely produce a new season's SAS XML?"**

The engine produces a complete, ordered, de-duplicated list of questions derived entirely from the blueprint record and the registry — with no AI inference, no hardcoded questions, and no conversational branching.

---

## Architecture

```
Summer_SAS.xml (source of truth)
      │
      ▼  extractSASBlueprint
  Blueprint Record
      │
      ├─── campaignSlot
      ├─── promotionSlots[]   (4 in Summer_SAS.xml)
      └─── assignmentSlots[]  (4 in Summer_SAS.xml)
             │
             ▼  classifyEditableFields    ◄── sasEditableFieldRegistry
         ClassifiedFields[]
             │
             ├── groupedFields   (indexed by GROUP_ORDER)
             ├── orderedQuestions (editable fields only, group-ordered)
             └── validationRequirements
                  │
                  ▼  generateClarificationFlow
             ClarificationQuestion[]  (ordered, self-contained)
                  │
                  ▼  buildValidationMetadata
             FieldValidationMetadata[] (declarative rules per question)
```

---

## Component Responsibilities

### 1. `sasEditableFieldRegistry.js`

The canonical contract. Defines every field that could appear in a SAS blueprint — both editable and frozen-but-replay-critical.

**Responsibilities:**
- Define all field metadata (type, group, label, description, question, validation)
- Classify editable vs frozen
- Flag replay-critical fields
- Export `GROUP_ORDER` (canonical question sequence)

**Does NOT:**
- Make decisions based on blueprint content
- Generate dynamic question text
- Perform runtime validation

---

### 2. `classifyEditableFields.js`

The mechanical walker. Traverses every slot in the blueprint and maps each value to its registry entry.

**Responsibilities:**
- Walk `campaignSlot`, `promotionSlots[]`, `assignmentSlots[]`
- For each extracted value, look up its `fieldId` in the registry
- Emit `ClassifiedField` objects with `{ fieldId, slotType, slotIndex, path, currentValue, xmlLang, registryEntry }`
- Organise output into `groupedFields`, `orderedQuestions`, `validationRequirements`
- Preserve source order (slotIndex)

**Does NOT:**
- Generate question text
- Modify the blueprint
- Skip fields that are in the registry and have values
- Add registry metadata beyond what the registry defines

---

### 3. `generateClarificationFlow.js`

The question serialiser. Converts `orderedQuestions` (from classification) into a flat, self-contained array of question objects.

**Responsibilities:**
- Call `classifyEditableFields`
- Convert each editable `ClassifiedField` into a `ClarificationQuestion`
- Include `currentValue` so questions show the prior-season value alongside the question
- Follow `GROUP_ORDER` canonical sequence
- Expose `generateGroupedClarificationFlow` for grouped rendering

**Does NOT:**
- Generate question text (comes from registry)
- Include non-editable fields
- Make network calls or consume AI services
- Modify the blueprint

---

### 4. `buildValidationMetadata.js`

The constraint declarator. Converts registry validation specs into structured rule arrays.

**Responsibilities:**
- Derive `ValidationRule[]` from each field's `validation` spec
- Build human-readable error messages for each rule
- Support string, numeric, enum, array, ISO-8601, and discount-entry field types
- Expose three entrypoints: by fieldId, all editable, or from classified fields

**Does NOT:**
- Perform runtime validation
- Build UI components
- Connect to any external validation service

---

## Editable Field Lifecycle

```
1. Field appears in Summer_SAS.xml
       │
       ▼
2. extractSASBlueprint classifies it (editable vs frozen)
       │
       ▼
3. sasEditableFieldRegistry defines its metadata
       │                   (if not in registry → invisible to engine)
       ▼
4. classifyEditableFields walks blueprint, emits ClassifiedField
       │
       ▼
5. generateClarificationFlow converts to ClarificationQuestion
       │
       ▼
6. buildValidationMetadata produces declarative rules
       │
       ▼
7. Question presented to business user
       │
       ▼
8. New value assigned to editableFields
       │
       ▼
9. assembleBlueprintXML + renderers produce new season XML
       │
       ▼
10. validateBlueprintReplay confirms structural parity
```

---

## Clarification Question Shape

Every question in the clarification flow is a self-contained `ClarificationQuestion` object:

```javascript
{
  fieldId:        'storefront_msg_cart_inclusion',
  group:          'Storefront',
  label:          'Cart Inclusion Message',
  question:       'What message should be shown in the cart when the promotion is applied?',
  required:       false,
  currentValue:   'Extra 25% Off Discount Applied',  // from prior season
  xmlLang:        'x-default',                       // null for non-localized
  slotContext:    { slotType: 'promotion', slotIndex: 1 },
  validation:     { minLength: 1, maxLength: 4000 },
  replayCritical: false,
}
```

`currentValue` always carries the extracted prior-season value — it is never null-coalesced or defaulted. If a field was absent in the prior season, `currentValue` will be `null` or `undefined`.

---

## Deterministic Question Generation

The clarification flow is completely deterministic:

1. **Question text** comes from `registryEntry.question` — a static string in the registry.
2. **Question order** follows `GROUP_ORDER` → slot rank (campaign < promotion < assignment) → `slotIndex` → `fieldId` alphabetical.
3. **Question presence** is determined entirely by whether the field has a non-null value in the blueprint's editable fields.
4. **Question count** is the exact count of editable fields present in the blueprint — no more, no less.

**Proof:** `JSON.stringify(generateClarificationFlow(blueprint)) === JSON.stringify(generateClarificationFlow(blueprint))` is always true.

---

## Question Ordering

Questions are ordered across 12 canonical groups:

```
1.  Campaign     — campaignId
2.  Identity     — promotionId, name (per locale)
3.  Scheduling   — startDate, endDate (per assignment, in source order)
4.  Discounting  — simpleDiscountValue or discountEntries (per promotion)
5.  Coupons      — couponIds (per assignment that has coupons)
6.  Eligibility  — [frozen, tracked but not questioned]
7.  Categories   — [frozen, tracked but not questioned]
8.  Merchandising — includedBadge, includedBadgeSPP (per promotion, per locale)
9.  Storefront   — storefront_msg_cart_inclusion, storefront_msg_cart_exclusion
10. Messaging    — coupon error messages (per promotion)
11. Operational  — [frozen, tracked but not questioned]
12. Localization — [frozen, tracked but not questioned]
```

Groups 6 (Eligibility), 7 (Categories), 11 (Operational), and 12 (Localization) contain only frozen fields in the current implementation and therefore produce no clarification questions. They appear in `groupedFields` for auditing but not in `orderedQuestions`.

---

## Replay-Critical Field Behaviour

Fields marked `replayCritical: true` in the registry fall into two categories:

### Editable + replay-critical
- `campaignId` — changing the campaign ID means all assignment references must be updated atomically
- `promotionId` — changing this means all cross-slot references (assignment `promotion-id`) must also change

For these fields, the `ClarificationQuestion` carries `replayCritical: true`. Future UI layers may use this to surface warnings or require confirmation before accepting the new value.

### Frozen + replay-critical
- `exclusivity`, `rank`, `qualifiersMatchMode`, `maxApplications`, `disableGlobalExcludedProducts`, `includedCategoryIds`, `excludedCategoryIds`, `customerGroupIds`, `thresholdPercentage`, `thresholdValues`, etc.

These appear in `groupedFields` (the full classification output) but are excluded from `orderedQuestions` (no question generated). They exist in the registry to make their frozen nature explicit and auditable.

If any of these values change unexpectedly, `validateBlueprintReplay` will detect the structural difference and set `replaySuccessful: false`.

---

## Localized Field Handling

Fields with `localized: true` generate one `ClassifiedField` per locale per field:

```
promotionSlots[1].editableFields.names:
  [{ xmlLang: 'x-default', value: 'Extra 25% Off' },
   { xmlLang: 'en',        value: 'Extra 25% Off' }]

→ ClassifiedField: { fieldId: 'name', xmlLang: 'x-default', currentValue: 'Extra 25% Off', slotIndex: 1 }
→ ClassifiedField: { fieldId: 'name', xmlLang: 'en',        currentValue: 'Extra 25% Off', slotIndex: 1 }
```

The same expansion applies to all localized custom attributes (`storefront_msg_cart_inclusion`, `includedBadge`, coupon error messages, etc.).

The `xmlLang` field is `null` on non-localized questions.

---

## Operational vs Merchandising Distinctions

### Merchandising fields
Fields in the **Merchandising** group (`includedBadge`, `includedBadgeSPP`) are PDP/PLP badge copy that appears on product pages. They:
- Always have `localized: true`
- Support `{price}` token substitution in their values
- Are optional — not all promotions use badges

### Storefront fields
Fields in the **Storefront** group (`storefront_msg_cart_inclusion`, `storefront_msg_cart_exclusion`) are cart-level messages. They:
- Always have `localized: true`
- Appear in essentially every SAS promotion
- Drive the customer-facing discount acknowledgement copy in the cart

### Operational fields
Fields in the **Operational** group (`rank`, `exclusivity`, `maxApplications`, `disableGlobalExcludedProducts`) are structural:
- All are `editable: false` in the current phase
- All are `replayCritical: true`
- They cannot be changed without structural review — modifying `exclusivity` changes stacking behaviour; modifying `rank` changes evaluation order

---

## Custom Attribute Classification

Custom attributes in the SFCC export are split by `extractSASBlueprint` into:
- `frozenCustomAttributes` — boolean flags, numeric configs, structural settings
- `editableCustomAttributes` — user-facing copy that changes each season

The `classifyEditableFields` engine maps `editableCustomAttributes` by their `attributeId` to registry `fieldId`. This works because the registry uses the exact SFCC `attribute-id` as the `fieldId` for all custom attribute fields.

Frozen custom attributes that have registry entries (e.g. `thresholdPercentage`, `thresholdValues`) are also emitted as `ClassifiedField` objects for replay-critical auditing purposes.

**Any custom attribute with an `attributeId` not found in the registry is silently passed over.** It will not appear in the classification output. This is safe because the registry coverage test (`Summer_SAS.xml coverage — MANDATORY`) enforces that all editable attributes in the real fixture are registered.

---

## Prohibited Behaviors

The following behaviors are explicitly prohibited in all engine components:

| Behavior | Why |
|----------|-----|
| AI-generated question text | Questions come from the registry. Static. Deterministic. |
| Hardcoded conversational branching | No `if (discount === 'summer') ask...` logic exists or is permitted |
| Inference of field values | Absent values stay absent — never substituted with defaults |
| Renderer modification | The clarification engine is read-only relative to renderers |
| Silent editable omission | Every editable field with a value in the blueprint produces a question |
| Blueprint mutation | Classification and question generation never write to the blueprint |
| Non-deterministic ordering | All ordering follows GROUP_ORDER + slot rank + slotIndex |

---

## Example: Summer_SAS.xml Clarification Flow

Running `generateClarificationFlow` on `Summer_SAS.xml` produces (abbreviated):

```
Group: Campaign
  1. campaignId = "2025_SUMMER_SAS"
     "What is the campaign ID for this season?"

Group: Identity
  2. promotionId = "2025-SUMMER-SAS-APPEASEMENT"  [slotIndex: 0]
     "What is the promotion ID for this season?"
  3. name (x-default) = "Promo Applied"            [slotIndex: 0]
     "What is the display name for this promotion?"
  4. promotionId = "2025_SUMMER_SAS"               [slotIndex: 1]
  5. name (x-default) = "Promo Applied"            [slotIndex: 1]
  6. name (en) = "Promo Applied"                   [slotIndex: 1]
  7. promotionId = "2025_Summer_SAS_BB50OFF"       [slotIndex: 2]
  8. name (x-default) = "$50 off $250"             [slotIndex: 2]
  9. promotionId = "2025_Summer_SAS_WebApp"        [slotIndex: 3]
  10. name (x-default) = "You have received 25% off" [slotIndex: 3]

Group: Scheduling
  11. endDate = "2025-07-08T04:00:00.000Z"         [assignment 0]
  12. endDate = "2025-07-08T07:15:00.000Z"         [assignment 1]
  13. endDate = "2025-07-25T04:00:00.000Z"         [assignment 2]
  14. startDate = "2025-07-07T04:00:00.000Z"       [assignment 3]
  15. endDate = "2025-07-29T04:00:00.000Z"         [assignment 3]

Group: Discounting
  16. simpleDiscountValue = 25                      [promo 0]
  17. simpleDiscountValue = 25                      [promo 1]
  18. discountEntries = [{threshold:250, value:50}] [promo 2]

Group: Coupons
  19. couponIds = ["2025-Summer-SAS-CS"]           [assignment 0]
  20. couponIds = ["2025_Summer_SAS_BB"]           [assignment 2]

Group: Merchandising
  21. includedBadge (x-default) = "{price} after extra 25% off" [promo 1]
  22. includedBadgeSPP (x-default) = "{price} after extra 25% off" [promo 1]

Group: Storefront
  23. storefront_msg_cart_inclusion (x-default) = "25% Off Discount Applied"   [promo 0]
  24. storefront_msg_cart_exclusion (x-default) = "Excluded From Promotion"    [promo 0]
  25. storefront_msg_cart_inclusion (x-default) = "Extra 25% Off Discount Applied" [promo 1]
  ...

Group: Messaging
  33. couponErrorMsgNoActivePromotion (x-default) = "This promo code has expired" [promo 0]
  34. couponErrorMsgRedemptionLimitExeeded (x-default) = "This promo code has already been used" [promo 0]
  35. couponErrorMsgNoApplicablePromotion (x-default) = "Promotion requires minimum spend..." [promo 2]
```

---

## Validation Metadata Example

```javascript
const { buildFieldValidationMetadata } = require('./src/blueprints/validation/buildValidationMetadata');

buildFieldValidationMetadata('campaignId');
// {
//   fieldId:  'campaignId',
//   required: true,
//   type:     'string',
//   rules: [
//     { rule: 'required',  message: 'Campaign ID is required' },
//     { rule: 'minLength', value: 1,   message: 'Campaign ID must be at least 1 character long' },
//     { rule: 'maxLength', value: 256, message: 'Campaign ID must not exceed 256 characters' },
//     { rule: 'pattern',   value: '^[A-Za-z0-9_\\-]+$', message: 'Campaign ID contains invalid characters' },
//   ]
// }
```

---

## Test Coverage

| Test file | What it proves |
|-----------|---------------|
| `tests/unit/sasEditableFieldRegistry.test.js` | Registry entry shape, type constraints, group coverage, API methods, specific field assertions, **Summer_SAS.xml coverage (MANDATORY)** |
| `tests/unit/classifyEditableFields.test.js` | Classification accuracy, ordering, multi-slot, localized fields, Summer_SAS.xml full classification |
| `tests/unit/generateClarificationFlow.test.js` | Question ordering, editable-only, question text from registry, no AI inference, Summer_SAS.xml full flow |
| `tests/unit/buildValidationMetadata.test.js` | Rule derivation for all type specs, Summer_SAS.xml full metadata |

The mandatory coverage test in `sasEditableFieldRegistry.test.js`:
- Extracts the real `Summer_SAS.xml` fixture
- Walks every `editableCustomAttributes` entry across all 4 promotions
- Asserts each `attributeId` is present in `REGISTRY_MAP`
- **Fails automatically if any new editable attribute appears without a registry entry**

This test is the `no silent editable omission` guarantee made executable.
