# SAS Session Orchestrator

Deterministic session state engine for collecting, validating, and tracking all editable-field answers needed to produce a new-season SAS XML document from a prior-season SAS blueprint.

---

## Table of Contents

1. [Overview](#overview)
2. [Session Lifecycle](#session-lifecycle)
3. [Session Shape](#session-shape)
4. [Answer Key Format](#answer-key-format)
5. [Status Transitions](#status-transitions)
6. [Question Queue](#question-queue)
7. [Answer Lifecycle](#answer-lifecycle)
8. [Answer Validation](#answer-validation)
9. [Grouped Progress Tracking](#grouped-progress-tracking)
10. [Replay Safety Warnings](#replay-safety-warnings)
11. [Review / Confirmation Architecture](#review--confirmation-architecture)
12. [Renderer Handoff Architecture](#renderer-handoff-architecture)
13. [Resumability Guarantees](#resumability-guarantees)
14. [Deterministic State Transitions](#deterministic-state-transitions)
15. [Public API Reference](#public-api-reference)
16. [Prohibited Behaviors](#prohibited-behaviors)
17. [Real Examples from Summer_SAS.xml](#real-examples-from-summer_sasxml)

---

## Overview

The SAS Session Orchestrator is a **pure, registry-driven state machine** for the SAS Blueprint clarification workflow. It receives a parsed blueprint (prior-season structured data), orchestrates a deterministic question-answer flow over all editable fields, validates each answer against registry rules, tracks session progress, and produces a renderer-ready payload when complete.

**The orchestrator does NOT:**
- Render XML
- Mutate blueprints
- Call external services
- Apply AI inference
- Add hidden defaults for unanswered fields

**The orchestrator does:**
- Build a canonical, ordered question queue from the blueprint
- Present questions one at a time (or in bulk) through `getNextQuestion`
- Validate and normalize each answer against registry-defined rules
- Recalculate all derived session state after every answer
- Emit replay-safety warnings for replayCritical field changes
- Block completion until all required fields are answered (and review confirmed if needed)
- Produce final `{ campaignSlot, promotionSlots, assignmentSlots }` payloads for `assembleBlueprintXML`

### Architecture Diagram

```
extractSASBlueprint(xml)
         │
         ▼
  createBlueprintSession(blueprint)
         │ builds questionQueue via generateClarificationFlow
         │
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                    Session State Machine                      │
  │                                                               │
  │  getNextQuestion(session) ◄─────────────────────────┐       │
  │         │                                             │       │
  │         ▼                                             │       │
  │  collectAnswer(session, key, rawAnswer)               │       │
  │         │ validateSessionAnswer → normalizeAnswer     │       │
  │         │ updateBlueprintSession → recalculate state  │       │
  │         └─────────────────────────────────────────────┘       │
  │                                                               │
  │  isSessionComplete(session)  ←── check at any time           │
  │  buildReviewSummary(session) ←── review at any time          │
  │                                                               │
  │  confirmReview(session)  [when REVIEW_PENDING]                │
  └─────────────────────────────────────────────────────────────┘
         │
         ▼
  buildRendererPayloads(session, blueprint)
         │
         ▼
  assembleBlueprintXML(payload)  → new-season XML
```

---

## Session Lifecycle

A session transitions through well-defined statuses:

```
  createBlueprintSession
         │
         ▼
      CREATED  ──────────────────────────────────► CANCELLED
         │                                               ▲
         │ first answer collected                        │ (any status)
         ▼                                               │
    IN_PROGRESS ─────────────────────────────────────────┤
         │                                               │
         │ invalid answer collected                      │
         ▼                                               │
  VALIDATION_FAILED ◄──────────────────────────────────┘
         │                                               │
         │ valid corrected answer                        │
         ▼                                               │
    IN_PROGRESS (resumes)                                │
         │                                               │
         │ all required answered + replayCritical changed│
         ▼                                               │
   REVIEW_PENDING ─────────────────────────────────────┘
         │
         │ confirmReview()
         ▼
      COMPLETE ←── (also reached when all required answered + no warnings)
```

**Key rules:**
- CANCELLED is a terminal state — no further answers accepted
- COMPLETE is reached when: all required fields answered validly AND (reviewRequired=false OR reviewConfirmedAt is set)
- VALIDATION_FAILED is set when ANY `invalidFields` entry exists
- REVIEW_PENDING takes priority over COMPLETE when replay-critical fields changed

---

## Session Shape

```typescript
interface Session {
  sessionId:             string;                  // Unique session identifier
  blueprintId:           string;                  // Source blueprint ID
  createdAt:             string;                  // ISO-8601 creation timestamp
  updatedAt:             string;                  // ISO-8601 last-update timestamp
  status:                SessionStatus;           // Current status (see STATUS constants)
  currentGroup:          string | null;           // Group of next unanswered question
  questionQueue:         QueueItem[];             // Ordered, immutable question list
  groupedProgress:       GroupedProgress;         // Per-group answered/total counts
  completionPercentage:  number;                  // 0–100 integer
  answers:               AnswerMap;               // key → AnswerRecord for valid answers
  unansweredFields:      string[];                // Keys of unanswered or invalid fields
  invalidFields:         InvalidFieldMap;         // key → InvalidRecord for failed answers
  reviewRequired:        boolean;                 // True when replayCritical field changed
  replaySafetyWarnings:  ReplaySafetyWarning[];   // Warnings for changed critical fields
  reviewConfirmedAt:     string | null;           // ISO-8601 when review was confirmed
  generatedPayload:      object | null;           // Populated after render (external)
}
```

### AnswerRecord

```typescript
interface AnswerRecord {
  fieldId:        string;         // Registry field ID
  key:            string;         // Stable answer key
  slotType:       string;         // 'campaign' | 'promotion' | 'assignment'
  slotIndex:      number | null;  // Slot position (null for campaign)
  xmlLang:        string | null;  // Locale tag (null for non-localized)
  normalizedValue: any;           // Validated, normalized value
  answeredAt:     string;         // ISO-8601 timestamp
}
```

### InvalidRecord

```typescript
interface InvalidRecord {
  fieldId:     string;
  key:         string;
  errors:      ValidationError[];   // [{ rule, message }]
  rawValue:    any;                 // The rejected raw value
  attemptedAt: string;              // ISO-8601 timestamp
}
```

---

## Answer Key Format

Every answer slot is identified by a **stable, deterministic key** composed of four dimensions:

```
${fieldId}::${slotType}::${slotIndex ?? '_'}::${xmlLang ?? '_'}
```

| Dimension  | Values                         | Notes                          |
|------------|--------------------------------|--------------------------------|
| `fieldId`  | Registry field ID              | e.g. `campaignId`, `name`      |
| `slotType` | `campaign`, `promotion`, `assignment` | Derived from slot type   |
| `slotIndex`| Integer or `_`                 | `_` for campaign (singleton)   |
| `xmlLang`  | Locale tag or `_`              | `_` for non-localized fields   |

**Examples:**

| Field                  | Key                                          |
|------------------------|----------------------------------------------|
| Campaign ID            | `campaignId::campaign::_::_`                 |
| Promotion ID, slot 2   | `promotionId::promotion::2::_`               |
| Name, slot 1, en       | `name::promotion::1::en`                     |
| End Date, assignment 3 | `endDate::assignment::3::_`                  |
| Cart inclusion msg, slot 0, x-default | `storefront_msg_cart_inclusion::promotion::0::x-default` |

**IMPORTANT: slotIndex `0` is preserved** — it is NOT treated as falsy. Only `null` and `undefined` become `_`.

---

## Status Transitions

Status is recalculated deterministically after every state change by `recalculateDerivedState`. The priority order:

```
1. CANCELLED        — if status was explicitly set CANCELLED (preserved forever)
2. VALIDATION_FAILED — if any invalidFields entry exists
3. REVIEW_PENDING   — if all required answered + replaySafetyWarnings + not confirmed
4. COMPLETE         — if all required answered (no warnings, or warnings confirmed)
5. IN_PROGRESS      — if some answers exist but not all required
6. CREATED          — if no answers yet
```

This priority order is **strictly applied** on every call to `updateBlueprintSession`. There is no way to manually override the calculated status except by explicitly passing `status: STATUS.CANCELLED` in the changes object.

---

## Question Queue

The question queue is the session's **source of truth** for all question ordering, answer key enumeration, and progress tracking.

### Building

```js
const queue = buildQuestionQueue(blueprint);
// Built once at session creation via generateClarificationFlow(blueprint)
// Stored immutably in session.questionQueue
```

### QueueItem Shape

```typescript
interface QueueItem {
  key:            string;         // Stable answer key (4-part format)
  fieldId:        string;         // Registry field ID
  slotType:       string;         // 'campaign' | 'promotion' | 'assignment'
  slotIndex:      number | null;  // Slot position
  xmlLang:        string | null;  // Locale tag
  group:          string;         // One of GROUP_ORDER
  label:          string;         // Human-readable label from registry
  question:       string;         // Question text from registry
  required:       boolean;        // Whether field must be answered for completion
  currentValue:   any;            // Prior-season value (blueprint source)
  validation:     object | null;  // Registry validation spec
  replayCritical: boolean;        // Whether change triggers replay warning
}
```

### Ordering

Queue items follow `GROUP_ORDER → slot rank → slotIndex → fieldId`:

```
GROUP_ORDER = [
  'Campaign', 'Identity', 'Scheduling', 'Discounting', 'Coupons',
  'Eligibility', 'Categories', 'Merchandising', 'Storefront',
  'Messaging', 'Operational', 'Localization'
]
```

For Summer_SAS.xml, this produces 35 questions:
- 1 Campaign question (campaignId)
- 10 Identity questions (4 promotionIds + names per locale)
- 5 Scheduling questions (endDates + startDate)
- 4 Discounting questions (simpleDiscountValues + discountEntries)
- 2 Coupon questions (couponIds)
- 2 Merchandising questions (includedBadge, includedBadgeSPP)
- 8 Storefront questions (storefront_msg_* per slot)
- 3 Messaging questions (couponError* messages)

### Question Selection — `getNextQuestion`

```
Priority 1: INVALID fields — re-ask in queue order (isRetry=true)
Priority 2: UNANSWERED fields — in queue order (isRetry=false)
Priority 3: null — when COMPLETE or CANCELLED or nothing left
```

An invalid field is **always surfaced before any unanswered field**, regardless of queue position. This ensures validation failures are corrected immediately.

---

## Answer Lifecycle

### Collecting an Answer

```js
const { session: updated, validationResult } = collectAnswer(session, key, rawAnswer);
```

**Lifecycle steps:**

1. Locate the `QueueItem` for `key` in `session.questionQueue`
2. Validate the raw answer: `validateSessionAnswer(queueItem, rawAnswer)`
3a. **Valid answer:**
    - Store in `session.answers[key]` with `normalizedValue`
    - Remove from `session.invalidFields[key]` (clears previous failure)
4b. **Invalid answer:**
    - Store in `session.invalidFields[key]` with `errors` and `rawValue`
    - Remove from `session.answers[key]` (clears previous valid answer)
5. Call `updateBlueprintSession` to recalculate all derived state
6. Return `{ session, validationResult }`

**Guarantees:**
- Does NOT mutate the input session
- Returns a new object every call
- Deterministic: same inputs → same output

### Prohibited on COMPLETE/CANCELLED Sessions

```js
collectAnswer(completedSession, key, value) // throws: Cannot collect answers on a COMPLETE session
collectAnswer(cancelledSession, key, value) // throws: Cannot collect answers on a CANCELLED session
```

---

## Answer Validation

Every answer is validated through `validateSessionAnswer(queueItem, rawAnswer)`.

### Normalization (always applied before validation)

| Input type            | Normalization applied                                    |
|-----------------------|----------------------------------------------------------|
| String                | Trim outer whitespace; normalize `\r\n` → `\n`           |
| Numeric string        | Parse to `number` for `number`-type fields               |
| `"true"` / `"false"` | Parse to `boolean` for `boolean`-type fields             |
| JSON array string     | `JSON.parse()` for `stringArray` and `discountEntryArray`|
| Array items (string)  | Trim individual string items in arrays                   |
| Numeric strings in objects | Parse `threshold` and `discountValue` to numbers   |

**NOT allowed as normalization:**
- Converting comma-separated strings to arrays (natural language)
- Inferring missing values
- Applying hidden defaults

### Type Inference

Field type is inferred from `queueItem` metadata (registry type is not stored directly on QueueItem):

| Heuristic                          | Inferred type       |
|------------------------------------|---------------------|
| `fieldId === 'couponIds'`          | `stringArray`        |
| `fieldId === 'discountEntries'`    | `discountEntryArray` |
| `fieldId === 'simpleDiscountValue'`| `number`             |
| `validation.format === 'iso8601'`  | `iso8601`            |
| `validation.enum` is array         | `enum`               |
| `validation.type === 'array'`      | `stringArray`        |
| *(default)*                        | `string`             |

### Validation Rule Order

1. **Normalize** raw value
2. **Required check** — if required and empty (null/undefined/empty string/empty array): fail
3. **Optional + empty** — if optional and empty: pass with `normalizedValue: null`
4. **Type mismatch** — if normalized value has wrong type: fail
5. **Declarative rules** — minLength, maxLength, pattern, format, enum, min, max, integer, minItems, items

---

## Grouped Progress Tracking

After every state change, `groupedProgress` is recalculated for all 12 groups:

```typescript
interface GroupProgress {
  total:    number;   // Total questions in this group for this blueprint
  answered: number;   // Validly answered questions (not in invalidFields)
  complete: boolean;  // true when total > 0 && answered === total
}
```

`completionPercentage` is computed as:

```
completionPercentage = Math.round((validAnswerCount / totalQuestions) * 100)
```

Where `validAnswerCount = Object.keys(answers).filter(k => !invalidFields[k]).length`.

**Note:** A session can be `COMPLETE` (all required fields answered) while `completionPercentage < 100` — because optional fields are not required for completion. In Summer_SAS.xml with 35 total questions and 11 required, answering only required fields yields `completionPercentage = 31%` while `status = COMPLETE`.

---

## Replay Safety Warnings

Replay-critical fields are those whose mutation could break re-execution of prior-season promotion logic. When a replayCritical field is answered with a value different from its `currentValue`, a warning is generated.

### Warning Shape

```typescript
interface ReplaySafetyWarning {
  fieldId:     string;           // Registry field ID
  key:         string;           // Answer key
  slotContext: {
    slotType:  string;
    slotIndex: number | null;
  };
  severity:    'HIGH';           // Always HIGH
  message:     string;           // Human-readable description with prior and new values
  priorValue:  any;              // Value from currentValue (prior season)
  newValue:    any;              // Newly answered normalizedValue
}
```

### replayCritical Fields (from Summer_SAS.xml registry)

The following editable fields are flagged `replayCritical: true`:
- `campaignId`
- `promotionId`

When their values change, `reviewRequired = true` and the session enters `REVIEW_PENDING` status after all required fields are answered.

---

## Review / Confirmation Architecture

When `reviewRequired = true`, the session cannot automatically complete — it enters `REVIEW_PENDING` and waits for explicit confirmation.

### REVIEW_PENDING trigger conditions (all must be true)

1. All required fields are answered validly
2. No invalid fields remain
3. At least one replayCritical field has a changed value
4. `reviewConfirmedAt` is null

### Confirming the Review

```js
const confirmedSession = confirmReview(session, { confirmedAt: '2026-01-01T00:05:00.000Z' });
// confirmedSession.status === STATUS.COMPLETE
// confirmedSession.reviewConfirmedAt === '2026-01-01T00:05:00.000Z'
```

`confirmReview` throws if the session is not in `REVIEW_PENDING` status.

### Typical REVIEW_PENDING flow (Summer_SAS.xml example)

```
User answers campaignId with '2026_SUMMER_SAS' (prior: '2025_SUMMER_SAS')
  → replaySafetyWarnings gains one HIGH warning
  → after all required answered: status = REVIEW_PENDING

UI shows: "You changed the Campaign ID from '2025_SUMMER_SAS' to '2026_SUMMER_SAS'.
           This may affect replay parity. Please confirm to proceed."

User confirms → confirmReview(session)
  → status = COMPLETE
  → renderer payload can now be built
```

---

## Renderer Handoff Architecture

When a session is COMPLETE (or at any non-CANCELLED status), `buildRendererPayloads` produces a renderer-ready payload:

```js
const payload = buildRendererPayloads(session, blueprint);
// payload = { campaignSlot, promotionSlots[], assignmentSlots[] }
```

### Campaign payload

```js
{
  frozenStructure: { ...origCampaign.frozenStructure },   // shallow copy, unchanged
  editableFields: {
    campaignId: answers['campaignId::campaign::_::_']?.normalizedValue
                ?? origCampaign.editableFields.campaignId,
  },
}
```

### Promotion payload (per slot)

```js
{
  slotIndex: slot.slotIndex,
  frozenStructure: { ...fs, frozenCustomAttributes: [...] },
  editableFields: {
    promotionId,                  // from answers or original
    names: locales.map(locale => ({   // one entry per locale from frozenStructure.nameLocales
      xmlLang: locale,
      value: answers[`name::promotion::${i}::${locale}`]?.normalizedValue
             ?? originalNameForLocale,
    })),
    simpleDiscountValue,          // from answers or original
    discountEntries,              // from answers or original
    editableCustomAttributes: attrs.map(attr => ({  // per-attribute answered value
      ...attr,
      value: answers[attrKey]?.normalizedValue ?? attr.value,
    })),
  },
}
```

### Assignment payload — cross-reference logic

**Assignment `promotionId` and `campaignId` are NOT independently asked** — they are derived from promotion and campaign answers:

```js
// Build: original promotionId → new promotionId map
const promoIdMap = {};
blueprint.promotionSlots.forEach((slot, i) => {
  promoIdMap[slot.editableFields.promotionId] =
    answers[`promotionId::promotion::${i}::_`]?.normalizedValue
    ?? slot.editableFields.promotionId;
});

// Each assignment: look up via original promotionId
const updatedPromotionId = promoIdMap[assignment.editableFields.promotionId]
                           ?? assignment.editableFields.promotionId;
```

This ensures promotion ID renames propagate automatically to all assignments — no separate question asked, no manual cross-reference required.

---

## Resumability Guarantees

Sessions are **plain serializable objects** — they can be persisted to any store, restored via JSON parse, and the orchestration picks up exactly where it left off.

### What is preserved across save/restore

| Property             | Preserved? | Notes                                |
|----------------------|------------|--------------------------------------|
| `questionQueue`      | ✅          | Full queue with currentValues         |
| `answers`            | ✅          | All normalizedValues                  |
| `invalidFields`      | ✅          | All errors and rawValues              |
| `reviewConfirmedAt`  | ✅          | Confirmation timestamp                |
| `groupedProgress`    | ✅ (derived)| Recalculated but consistent           |
| `status`             | ✅ (derived)| Recalculated from raw data            |

### Restore pattern

```js
// Save
const serialized = JSON.stringify(session);
await store.put(sessionId, serialized);

// Restore
const raw = await store.get(sessionId);
const session = JSON.parse(raw);

// Continue — no re-parsing of blueprint needed
const nextQuestion = getNextQuestion(session);
```

The `questionQueue` is embedded in the session, so the original blueprint is NOT needed to resume answering questions. It IS needed only when building the final renderer payload.

---

## Deterministic State Transitions

Every state transition is deterministic:

- **Same input → same output** for all functions
- **`recalculateDerivedState`** computes all derived fields from raw data — no external state
- **`buildAnswerKey`** produces the same key for the same four-tuple on every call
- **`buildQuestionQueue`** produces the same ordered queue for the same blueprint
- **`buildRendererPayloads`** produces the same payload for the same session + blueprint

### Single recalculation path

All state changes flow through `updateBlueprintSession(session, changes)`:

```
caller supplies raw changes
       │
       ▼
 { ...session, ...changes }
       │
       ▼
 recalculateDerivedState(merged)
       │
       ▼
 new session with all derived fields fresh
```

No function bypasses `recalculateDerivedState`. No derived field is ever stale.

---

## Public API Reference

### `createBlueprintSession(blueprint, options?)`

Creates a new session in `CREATED` status.

```js
const session = createBlueprintSession(blueprint, {
  sessionId: 'optional-id',    // default: generated from timestamp + blueprintId
  createdAt: '...',            // ISO-8601 override (for testing)
});
```

Throws if `blueprint.campaignSlot` missing, `promotionSlots` empty, or `assignmentSlots` empty.

---

### `collectAnswer(session, key, rawAnswer, options?)`

Validate and collect one answer. Returns `{ session, validationResult }`.

```js
const { session: updated, validationResult } = collectAnswer(
  session,
  'campaignId::campaign::_::_',
  '2026_SUMMER_SAS',
  { answeredAt: '...' }   // ISO-8601 override (for testing)
);
```

Throws if session is CANCELLED or COMPLETE.

---

### `getNextQuestion(session)`

Returns the next question to present, or `null`.

```js
const question = getNextQuestion(session);
if (question === null) { /* complete or cancelled */ }
if (question.isRetry) { /* re-asking due to validation failure */ }
```

Priority: invalid fields first, then unanswered, in queue order.

---

### `getRemainingQuestions(session)`

Returns all remaining questions (invalid first, then unanswered).

```js
const remaining = getRemainingQuestions(session);
// remaining[0].isRetry may be true (invalid field at top)
```

---

### `isSessionComplete(session)`

Check completion status with blocker list.

```js
const { complete, reason, blockers } = isSessionComplete(session);
// complete: boolean
// reason: human-readable string
// blockers: string[] — empty when complete
```

---

### `getSessionProgress(session)`

Snapshot of progress counters.

```js
const { totalQuestions, answeredQuestions, invalidQuestions,
        requiredUnanswered, completionPercentage, status } = getSessionProgress(session);
```

---

### `buildReviewSummary(session)`

Human-readable review summary grouped by GROUP_ORDER.

```js
const { groups, replaySafetyWarnings, sessionStatus, completionPercentage }
  = buildReviewSummary(session);

// groups: Array<{ group: string, fields: FieldSummary[] }>
// Each FieldSummary: { fieldId, key, label, group, slotContext, xmlLang,
//                      required, replayCritical, priorValue, newValue,
//                      changed (null if unanswered), answered, valid, validationErrors }
```

Empty groups are omitted. Groups follow `GROUP_ORDER`.

---

### `confirmReview(session, options?)`

Confirm the replay-safety review. Transitions `REVIEW_PENDING → COMPLETE`.

```js
const confirmed = confirmReview(session, { confirmedAt: '...' });
```

Throws if session is not `REVIEW_PENDING`.

---

### `cancelSession(session, options?)`

Cancel the session. Terminal operation.

```js
const cancelled = cancelSession(session, { cancelledAt: '...' });
// Already-cancelled session → no-op (returns same session)
```

---

### `buildRendererPayloads(session, blueprint)`

Build the renderer-ready slot payloads.

```js
const { campaignSlot, promotionSlots, assignmentSlots }
  = buildRendererPayloads(session, blueprint);
```

Throws if session is CANCELLED. Falls back to blueprint original values for unanswered fields.

---

### `buildAnswerKey(fieldId, slotType, slotIndex, xmlLang)`

Build a stable answer key.

```js
buildAnswerKey('campaignId', 'campaign', null, null)
// → 'campaignId::campaign::_::_'

buildAnswerKey('name', 'promotion', 0, 'x-default')
// → 'name::promotion::0::x-default'
```

---

### `STATUS`

Frozen constants for all six session statuses.

```js
const { STATUS } = require('./updateBlueprintSession');
STATUS.CREATED          // 'CREATED'
STATUS.IN_PROGRESS      // 'IN_PROGRESS'
STATUS.VALIDATION_FAILED // 'VALIDATION_FAILED'
STATUS.REVIEW_PENDING   // 'REVIEW_PENDING'
STATUS.COMPLETE         // 'COMPLETE'
STATUS.CANCELLED        // 'CANCELLED'
```

---

## Prohibited Behaviors

The following behaviors are permanently prohibited across the entire session orchestration system:

| Prohibition                              | Why                                                          |
|------------------------------------------|--------------------------------------------------------------|
| AI inference for missing answers         | Answers must come from human input only                       |
| Hardcoded question text or branching     | All questions come from the registry; no conditional logic    |
| Default values for unanswered fields     | `buildRendererPayloads` falls back to blueprint originals     |
| Mutating the input session               | Every function returns a new object                          |
| Mutating the blueprint                   | Blueprint is read-only source of truth                       |
| Comma-splitting strings to arrays        | JSON parse only — natural language prohibited                 |
| Skipping registry-defined editable fields| All fields from `getEditableFields()` must appear in queue   |
| Renderer modification                    | `assembleBlueprintXML` is never touched by the session layer  |
| Non-deterministic ordering               | Queue order is GROUP_ORDER → slot rank → slotIndex → fieldId |
| Overriding CANCELLED status              | CANCELLED is terminal and cannot be reversed                  |

---

## Real Examples from Summer_SAS.xml

### Complete session trace

```
Session created — 35 questions, status CREATED

Q1 (Campaign):    campaignId  → '2026_SUMMER_SAS'  [prior: '2025_SUMMER_SAS']
                                 ⚠ REPLAY WARNING: campaignId changed
                                 status → IN_PROGRESS

Q2 (Identity):    name [slot 0, x-default] → 'Promo Applied'  [same]
Q3 (Identity):    name [slot 0, en] → 'Promo Applied'  [same]
Q4 (Identity):    promotionId [slot 0] → '2025-SUMMER-SAS-APPEASEMENT'  [same]
Q5 (Identity):    name [slot 1, x-default] → 'Promo Applied'  [same]
Q6 (Identity):    name [slot 1, en] → 'Promo Applied'  [same]
Q7 (Identity):    promotionId [slot 1] → '2025_SUMMER_SAS'  [same]
Q8 (Identity):    name [slot 2, x-default] → '$50 off $250'  [same]
Q9 (Identity):    promotionId [slot 2] → '2025_Summer_SAS_BB50OFF'  [same]
Q10 (Identity):   name [slot 3, x-default] → 'You have received 25% off'  [same]
Q11 (Identity):   promotionId [slot 3] → '2025_Summer_SAS_WebApp'  [same]
                                 all required answered
                                 status → REVIEW_PENDING (replay warning exists)

User confirms review → confirmReview()
                                 status → COMPLETE

buildRendererPayloads() called:
  campaignSlot.editableFields.campaignId  → '2026_SUMMER_SAS'
  promotionSlots[0].editableFields.promotionId → '2025-SUMMER-SAS-APPEASEMENT'
  assignmentSlots[0].editableFields.promotionId → '2025-SUMMER-SAS-APPEASEMENT'  (cross-ref)
  assignmentSlots[0].editableFields.campaignId  → '2026_SUMMER_SAS'              (cross-ref)
```

### Review summary excerpt

```json
{
  "groups": [
    {
      "group": "Campaign",
      "fields": [{
        "fieldId": "campaignId",
        "key": "campaignId::campaign::_::_",
        "priorValue": "2025_SUMMER_SAS",
        "newValue": "2026_SUMMER_SAS",
        "changed": true,
        "answered": true,
        "valid": true,
        "replayCritical": true,
        "validationErrors": []
      }]
    },
    {
      "group": "Identity",
      "fields": [
        { "fieldId": "name", "changed": false, "answered": true, "replayCritical": false },
        { "fieldId": "promotionId", "changed": false, "answered": true, "replayCritical": true }
      ]
    }
  ],
  "replaySafetyWarnings": [{
    "fieldId": "campaignId",
    "severity": "HIGH",
    "priorValue": "2025_SUMMER_SAS",
    "newValue": "2026_SUMMER_SAS",
    "message": "Changing \"Campaign ID\" may affect replay parity..."
  }],
  "sessionStatus": "REVIEW_PENDING",
  "completionPercentage": 31
}
```

### Replay-safe (no-change) flow

When all answers match `currentValue`:

```
All 11 required answered with currentValues
  → replaySafetyWarnings = []
  → reviewRequired = false
  → status = COMPLETE (no review step needed)
  → completionPercentage = 31  (11/35 questions answered — optional fields not required)
```

---

*Phase 4 complete. See also: [sas-editable-field-registry.md](./sas-editable-field-registry.md), [sas-dynamic-clarification-engine.md](./sas-dynamic-clarification-engine.md), [sas-blueprint-replay-validation.md](./sas-blueprint-replay-validation.md)*
