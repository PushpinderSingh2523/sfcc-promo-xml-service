# SAS Editable Field Registry

## Overview

The SAS Editable Field Registry (`src/blueprints/fieldRegistry/sasEditableFieldRegistry.js`) is the canonical source of truth for every business-relevant field in a SAS blueprint record.

It is the contract between:
- the blueprint extraction pipeline (which decides what to capture)
- the clarification engine (which decides what questions to ask)
- the renderer layer (which decides how to write fields to XML)
- the validation metadata system (which declares constraints)

**If a field is not in the registry, it cannot be clarified, validated, or tracked.**

---

## Architecture

```
Summer_SAS.xml
      │
      ▼  extractSASBlueprint
  Blueprint Record
      │
      ▼  classifyEditableFields    ◄── consults REGISTRY
  Classified Fields
      │
      ▼  generateClarificationFlow ◄── consults REGISTRY for questions
  Clarification Questions
      │
      ▼  buildValidationMetadata   ◄── consults REGISTRY for rules
  Validation Metadata
```

The registry sits upstream of every business interaction. No question text, validation rule, or field classification exists outside of it.

---

## Registry Entry Shape

Every registry entry has exactly these fields:

| Field | Type | Description |
|-------|------|-------------|
| `fieldId` | `string` | Unique identifier. For custom attributes, matches the SFCC `attribute-id` exactly. For slot fields, matches the blueprint key name. |
| `editable` | `boolean` | `true` = changes every season. `false` = frozen; tracked for replay-critical awareness only. |
| `required` | `boolean` | When editable, `true` means absence is a hard validation error. |
| `group` | `string` | One of the canonical GROUP_ORDER values. |
| `type` | `string` | `string` \| `number` \| `boolean` \| `iso8601` \| `enum` \| `stringArray` \| `discountEntryArray` |
| `label` | `string` | Human-readable display label. |
| `description` | `string` | Detailed description of field purpose and rendering rules. |
| `question` | `string \| null` | Deterministic clarification question. `null` for non-editable fields. |
| `validation` | `object \| null` | Declarative validation specification. See [Validation Rules](#validation-rules). |
| `multiValue` | `boolean` | `true` if the field holds an ordered array. |
| `localized` | `boolean` | `true` if the field carries an `xml:lang` attribute. |
| `rendererOwner` | `string` | Which renderer module writes this field to XML. |
| `replayCritical` | `boolean` | `true` if mutation would break replay parity or require architectural escalation. |

---

## Field Groups

Groups are ordered canonically for clarification question sequencing. The ordering is:

| Position | Group | Rationale |
|----------|-------|-----------|
| 1 | **Campaign** | Establishes the top-level identifier everything references |
| 2 | **Identity** | Promotion ID and display names — establishes what we're promoting |
| 3 | **Scheduling** | When the promotion runs — needed early for date dependencies |
| 4 | **Discounting** | The core business value of the promotion |
| 5 | **Coupons** | Coupon codes that gate access to the discount |
| 6 | **Eligibility** | Who can access the promotion (qualifier/customer group structure) |
| 7 | **Categories** | Which products are included or excluded |
| 8 | **Merchandising** | PLP/SPP badge copy |
| 9 | **Storefront** | Cart inclusion/exclusion messages |
| 10 | **Messaging** | Coupon error messages |
| 11 | **Operational** | Rank, exclusivity, max-applications (structural) |
| 12 | **Localization** | Locale variant metadata |

---

## Editable vs Frozen Classification

### Editable fields (`editable: true`)

These fields change between SAS seasons and must be clarified each time a new blueprint is built:

| FieldId | Group | Type | Localized |
|---------|-------|------|-----------|
| `campaignId` | Campaign | string | No |
| `promotionId` | Identity | string | No |
| `name` | Identity | string | Yes |
| `startDate` | Scheduling | iso8601 | No |
| `endDate` | Scheduling | iso8601 | No |
| `simpleDiscountValue` | Discounting | number | No |
| `discountEntries` | Discounting | discountEntryArray | No |
| `couponIds` | Coupons | stringArray | No |
| `includedBadge` | Merchandising | string | Yes |
| `includedBadgeSPP` | Merchandising | string | Yes |
| `storefront_msg_cart_inclusion` | Storefront | string | Yes |
| `storefront_msg_cart_exclusion` | Storefront | string | Yes |
| `couponErrorMsgNoActivePromotion` | Messaging | string | Yes |
| `couponErrorMsgRedemptionLimitExeeded` | Messaging | string | Yes |
| `couponErrorMsgNoApplicablePromotion` | Messaging | string | Yes |
| `couponErrorMsgNoApplicablePromo` | Messaging | string | Yes |

> **Note on `couponErrorMsgRedemptionLimitExeeded`**: The `fieldId` contains a deliberate typo (`Exeeded` instead of `Exceeded`) that exactly matches the SFCC platform `attribute-id`. Do not correct it.

### Frozen replay-critical fields (`editable: false`, `replayCritical: true`)

These fields are frozen in the blueprint but are tracked because changing them would break replay parity or require escalated review:

| FieldId | Group | Why replay-critical |
|---------|-------|-------------------|
| `campaignId` | Campaign | All assignment references must match |
| `promotionId` | Identity | All cross-slot references must match |
| `qualifiersMatchMode` | Eligibility | Changes who qualifies for the promotion |
| `hasCustomerGroups` | Eligibility | Structural presence flag in `<qualifiers>` |
| `hasSourceCodes` | Eligibility | Structural presence flag in `<qualifiers>` |
| `hasCoupons` | Eligibility | Structural presence flag in `<qualifiers>` |
| `customerGroupIds` | Eligibility | Determines which customer segments can access the promotion |
| `includedCategoryIds` | Categories | Defines which products are eligible |
| `excludedCategoryIds` | Categories | Defines which products are excluded |
| `rank` | Operational | Controls promotion stack evaluation order |
| `exclusivity` | Operational | Controls promotion stacking behaviour |
| `maxApplications` | Operational | Limits per-order application count |
| `disableGlobalExcludedProducts` | Operational | Overrides global exclusion rules |
| `thresholdPercentage` | Discounting | Frozen WebApp configuration |
| `thresholdValues` | Discounting | Frozen WebApp configuration |

---

## Localized Fields

Fields with `localized: true` carry an `xml:lang` attribute and may be provided in multiple locales. In Summer_SAS.xml the default locale is `x-default` with an optional `en` variant.

The classification engine emits one `ClassifiedField` entry per locale per field. For example, a promotion with two name locales produces two classified `name` entries:
- `{ fieldId: 'name', xmlLang: 'x-default', currentValue: 'Extra 25% Off' }`
- `{ fieldId: 'name', xmlLang: 'en', currentValue: 'Extra 25% Off' }`

---

## Validation Rules

The `validation` object in each registry entry uses a declarative spec language interpreted by `buildValidationMetadata.js`:

```javascript
// String field example
{ minLength: 1, maxLength: 256, pattern: '^[A-Za-z0-9_\\-]+$' }

// Number field example
{ type: 'number', min: 0.01, max: 999999 }

// Integer field example
{ type: 'integer', min: 0 }

// ISO-8601 field example
{ format: 'iso8601', required: false }

// Enum field example
{ enum: ['any', 'all'] }

// String array field example
{ type: 'array', minItems: 1, items: { type: 'string', minLength: 1, maxLength: 256 } }

// Discount entry array example
{ type: 'array', minItems: 1, items: { threshold: { min: 0.01 }, discountValue: { min: 0.01 } } }
```

Non-editable fields have `validation: null`.

---

## API Reference

### `getField(fieldId)`

Returns the registry entry for a given `fieldId`, or `undefined` if not found. O(1) via `REGISTRY_MAP`.

```javascript
const { getField } = require('./src/blueprints/fieldRegistry/sasEditableFieldRegistry');
const entry = getField('campaignId');
// entry.group     → 'Campaign'
// entry.editable  → true
// entry.question  → 'What is the campaign ID for this season?'
```

### `getGroup(groupName)`

Returns all registry entries belonging to a specific group.

```javascript
const { getGroup } = require('./src/blueprints/fieldRegistry/sasEditableFieldRegistry');
const messagingFields = getGroup('Messaging');
```

### `getEditableFields()`

Returns all registry entries where `editable === true`. Used by the classification and question engines.

### `getReplayCriticalFields()`

Returns all registry entries where `replayCritical === true`. Used for escalation and safety audits.

### `getAllFieldIds()`

Returns the ordered list of all `fieldId` strings in the registry.

### Constants

| Export | Description |
|--------|-------------|
| `REGISTRY` | Full array of all registry entries |
| `REGISTRY_MAP` | `Map<fieldId, entry>` for O(1) lookup |
| `GROUP_ORDER` | Canonical group ordering array |

---

## Summer_SAS.xml Field Coverage

Every editable `attribute-id` found in `Summer_SAS.xml` has a registry entry. The test `"Every editable field extracted from Summer_SAS.xml must exist in the registry"` in `tests/unit/sasEditableFieldRegistry.test.js` enforces this automatically.

If a new editable attribute appears in a future export, this test WILL FAIL until the registry is updated. This is intentional — it makes invisible fields visible.

---

## Prohibited Behaviors

- **No AI inference** — the registry is the only source of question text
- **No default values** — absent fields are omitted in classification, not filled
- **No hardcoded question branching** — the group ordering in `GROUP_ORDER` is the only branching
- **No renderer modification** — the registry references renderers by name but never calls them
- **No silent omission** — any field in the registry with `editable: true` that exists in the blueprint will appear in the clarification flow
