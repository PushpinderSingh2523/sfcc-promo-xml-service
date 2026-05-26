# SAS Presentation Adapter Layer

Deterministic, stateless transformers that convert session orchestration objects into presentation-safe structures for conversational channel rendering.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Adapter Inventory](#adapter-inventory)
4. [Presentation Boundaries](#presentation-boundaries)
5. [Orchestration Separation](#orchestration-separation)
6. [Schema Contracts](#schema-contracts)
7. [Adapter Details](#adapter-details)
8. [Grouped Presentation Behavior](#grouped-presentation-behavior)
9. [Replay Warning Presentation](#replay-warning-presentation)
10. [Progress Rendering](#progress-rendering)
11. [Review Rendering](#review-rendering)
12. [Localization Handling](#localization-handling)
13. [Prohibited Behaviors](#prohibited-behaviors)
14. [Future Rendering Stack](#future-rendering-stack)

---

## Overview

The Presentation Adapter Layer is a **thin, stateless transformation layer** between the Session Orchestration engine and future Teams/Copilot rendering surfaces.

Each adapter is a **pure function**:
- No side effects
- No state mutation
- No network calls
- No business logic
- No validation logic
- No AI inference

The adapters produce **presentation-safe objects** — plain JavaScript objects that can be serialized to JSON, stored, transmitted, and consumed by any renderer (Teams Adaptive Cards, Copilot Studio, REST API, CLI, etc.).

---

## Architecture

```
Session Orchestrator
  │
  │  session object (answers, questionQueue, status, groupedProgress, ...)
  │
  ▼
Presentation Adapter Layer
  │
  ├── buildQuestionPresentation(nextQuestion, session)
  │       → { type: "question", label, question, choices, progress, retryMetadata, ... }
  │
  ├── buildProgressPresentation(session)
  │       → { type: "progress", completedQuestions, groups[], ... }
  │
  ├── buildReplayWarningPresentation(warnings[])
  │       → { type: "warning", warnings[], acknowledgementRequired, ... }
  │
  ├── buildReviewPresentation(reviewSummary)
  │       → { type: "review", groups[], replayWarnings[], ... }
  │
  └── buildCompletionPresentation(session, blueprint)
          → { type: "completion", changedFields[], payloadReady, ... }
  │
  ▼
[Future] Teams Renderer Layer
  │
  ├── Teams Adaptive Cards
  ├── Copilot Studio Actions
  └── REST API Responses
```

### Invariant

> The presentation layer **cannot** alter what the orchestrator computed. It may only reshape the output for display.

---

## Adapter Inventory

| Adapter | Input | Output type | Purpose |
|---|---|---|---|
| `buildQuestionPresentation` | `NextQuestion`, `session` | `"question"` | Present one clarification question |
| `buildProgressPresentation` | `session` | `"progress"` | Show session progress snapshot |
| `buildReplayWarningPresentation` | `warnings[]` | `"warning"` | Surface replay-critical change warnings |
| `buildReviewPresentation` | `reviewSummary` | `"review"` | Show grouped before/after comparison |
| `buildCompletionPresentation` | `session`, `blueprint` | `"completion"` | Summarise finished orchestration |

---

## Presentation Boundaries

The presentation layer begins where orchestration ends:

| Concern                       | Owned by          |
|-------------------------------|-------------------|
| Question ordering             | Orchestration     |
| Answer validation             | Orchestration     |
| Session status transitions    | Orchestration     |
| Replay warning generation     | Orchestration     |
| Review confirmation           | Orchestration     |
| Renderer payload building     | Orchestration     |
| XML generation                | Renderer          |
| Display label and wording     | Registry          |
| **Visual grouping of fields** | **Presentation**  |
| **Progress bar values**       | **Presentation**  |
| **Choice extraction (enum)**  | **Presentation**  |
| **Validation hint text**      | **Presentation**  |
| **Retry context exposure**    | **Presentation**  |
| **Change detection display**  | **Presentation**  |

The presentation layer **reads** from orchestration state. It never writes back.

---

## Orchestration Separation

### What the presentation layer receives

All adapters receive plain objects — they do not import or call any orchestration functions at runtime:

```js
// ✅ Correct: adapter takes completed orchestration output
const nextQuestion = getNextQuestion(session);        // orchestration
const progress     = buildProgressPresentation(session); // presentation

// ❌ Wrong: adapter should never call orchestration functions itself
```

### Immutability guarantee

Every adapter:
1. Receives an input object
2. Returns a new object
3. Never modifies the input

```js
const session  = createBlueprintSession(blueprint);
const snapshot = JSON.stringify(session);

buildProgressPresentation(session);  // adapter runs

JSON.stringify(session) === snapshot;  // always true — session unchanged
```

---

## Schema Contracts

Each adapter output is governed by a JSON Schema (Draft-07) in `src/presentation/schemas/`:

| Adapter                       | Schema file                              |
|-------------------------------|------------------------------------------|
| `buildQuestionPresentation`   | `questionPresentation.schema.json`       |
| `buildProgressPresentation`   | `progressPresentation.schema.json`       |
| `buildReplayWarningPresentation` | `warningPresentation.schema.json`     |
| `buildReviewPresentation`     | `reviewPresentation.schema.json`         |
| `buildCompletionPresentation` | `completionPresentation.schema.json`     |

All schemas use `"additionalProperties": false` — no undocumented properties can appear. This makes the presentation contract stable for consuming renderers.

### Type discriminator

Every presentation object has a `type` string constant that renderers can use for routing:

```
"question"   → render a clarification prompt
"progress"   → render a progress indicator
"warning"    → render replay safety acknowledgement
"review"     → render the before/after comparison screen
"completion" → render the completion summary
```

---

## Adapter Details

### buildQuestionPresentation(nextQuestion, session)

Converts a `NextQuestion` (from `getNextQuestion`) + session into a display-ready question card.

**Key fields produced:**

| Field | Source | Notes |
|---|---|---|
| `label` | `nextQuestion.label` | Registry wording — verbatim |
| `question` | `nextQuestion.question` | Registry wording — verbatim |
| `currentValue` | `nextQuestion.currentValue` | Prior-season value for comparison |
| `replayCritical` | `nextQuestion.replayCritical` | Flag for visual warning indicator |
| `xmlLang` | `nextQuestion.xmlLang` | Locale tag for localized field badge |
| `choices` | `validation.enum` | Populated for enum fields; null otherwise |
| `validationHints` | `validation.*` | Format guidance derived from spec |
| `progress.overallPercentage` | `session.completionPercentage` | For progress bar |
| `progress.completedInGroup` | `session.groupedProgress[group]` | For group-level progress |
| `retryMetadata.isRetry` | `nextQuestion.isRetry` | For retry banner display |
| `retryMetadata.validationErrors` | `nextQuestion.validationErrors` | For inline error display |

**Validation hints derived from spec:**

| Spec property | Hint text |
|---|---|
| `minLength` | `"Minimum N character(s)"` |
| `maxLength` | `"Maximum N characters"` |
| `format: "iso8601"` | `'Format: ISO-8601 date/time (e.g. "2026-06-15T04:00:00.000Z")'` |
| `min` | `"Minimum value: N"` |
| `max` | `"Maximum value: N"` |
| `type: "integer"` | `"Must be a whole number"` |
| `minItems` | `"Minimum N item(s)"` |
| `pattern` | `"Value must match the required format"` |

---

### buildProgressPresentation(session)

Converts a session into a snapshot of overall and per-group progress.

**Groups follow `GROUP_ORDER` exactly.** Groups with `total === 0` are omitted.

**`completedQuestions`** counts validly answered fields only (excludes `invalidFields` entries).

**Note:** `completionPercentage` may be less than 100 on a `COMPLETE` session — because optional fields are not required for completion. Example: Summer_SAS.xml reaches `COMPLETE` with 11/35 fields answered → `completionPercentage = 31`.

---

### buildReplayWarningPresentation(warnings)

Converts the `session.replaySafetyWarnings` array into a presentation container.

**Source ordering is preserved.** The orchestrator already emits warnings in queue order — the presentation layer does not re-sort.

All individual warnings have `acknowledgementRequired: true`. The container-level `acknowledgementRequired` is `true` when `totalWarnings > 0`.

**The presentation layer does NOT track acknowledgement state.** That is owned by `session.reviewConfirmedAt`.

---

### buildReviewPresentation(reviewSummary)

Converts the result of `buildReviewSummary(session)` into a display-ready review screen.

**Group ordering is preserved** from the input (which already follows `GROUP_ORDER`). The adapter does not re-sort.

**`changed: null`** (unanswered field) is preserved exactly — it is NOT coerced to `false`. Renderers can use this to show an "unanswered" badge distinct from "unchanged".

**Replay warnings** are converted via `buildReplayWarningPresentation` and embedded in `replayWarnings[]`.

---

### buildCompletionPresentation(session, blueprint)

Converts a completed session and blueprint into a final summary.

**`payloadReady`** is `true` only when `session.status === 'COMPLETE'`. This is the signal that `buildRendererPayloads` can be called.

**`changedFields`** lists all answered fields whose `normalizedValue` differs from `currentValue`. This is computed from the session's `answers` map — it is NOT derived from `replaySafetyWarnings` (which only covers `replayCritical` fields). Changed non-critical fields also appear in `changedFields`.

**`warningsAcknowledged`** reflects:
```
warningsAcknowledged = !reviewRequired || !!reviewConfirmedAt
```

---

## Grouped Presentation Behavior

All group-aware adapters follow `GROUP_ORDER`:

```
Campaign → Identity → Scheduling → Discounting → Coupons →
Eligibility → Categories → Merchandising → Storefront →
Messaging → Operational → Localization
```

Groups with no questions in the current blueprint are omitted. This keeps the UI clean — no empty sections.

Within each group, field ordering is preserved from the orchestration layer's `questionQueue` (which is `GROUP_ORDER → slot rank → slotIndex → fieldId`).

---

## Replay Warning Presentation

Replay warnings are generated by the orchestrator when a `replayCritical` field's answer differs from its `currentValue`. The presentation layer exposes them without modification.

### Visual flow

```
Answering Phase:
  User answers campaignId with '2026_SUMMER_SAS'
  Orchestrator: replaySafetyWarnings gains one HIGH entry

Progress card shows:
  "⚠ Replay-critical field changed: Campaign ID
   Prior value: 2025_SUMMER_SAS → New value: 2026_SUMMER_SAS"

Review/Confirmation screen shows:
  WARNING (HIGH): Changing "Campaign ID" may affect replay parity.
  [Acknowledge] button  ← Teams renderer will wire this to confirmReview()

Completion screen shows:
  warningsAcknowledged: true  ← after confirmReview() called
```

### Warning presentation object shape

```json
{
  "type": "warning",
  "warnings": [{
    "severity": "HIGH",
    "fieldId": "campaignId",
    "key": "campaignId::campaign::_::_",
    "slotContext": { "slotType": "campaign", "slotIndex": null },
    "message": "Changing \"Campaign ID\" may affect replay parity. Prior value: \"2025_SUMMER_SAS\". New value: \"2026_SUMMER_SAS\".",
    "priorValue": "2025_SUMMER_SAS",
    "newValue": "2026_SUMMER_SAS",
    "acknowledgementRequired": true
  }],
  "totalWarnings": 1,
  "acknowledgementRequired": true
}
```

---

## Progress Rendering

Progress is exposed at two levels:

### Overall progress

```json
{
  "type": "progress",
  "currentGroup": "Discounting",
  "completedQuestions": 12,
  "totalQuestions": 35,
  "remainingQuestions": 23,
  "completionPercentage": 34,
  "status": "IN_PROGRESS",
  "groups": [...]
}
```

### Per-group progress

```json
{
  "groups": [
    { "group": "Campaign",    "total": 1, "answered": 1, "complete": true  },
    { "group": "Identity",    "total": 10, "answered": 10, "complete": true },
    { "group": "Scheduling",  "total": 5, "answered": 1,  "complete": false },
    { "group": "Discounting", "total": 4, "answered": 0,  "complete": false }
  ]
}
```

Only groups with `total > 0` appear. The Teams renderer can use `complete: true` to show a checkmark and `answered/total` for a fractional progress bar within each group.

---

## Review Rendering

The review presentation is the **before/after comparison screen** — the future Teams business confirmation surface.

### Example review group

```json
{
  "type": "review",
  "sessionStatus": "REVIEW_PENDING",
  "completionPercentage": 34,
  "groups": [
    {
      "group": "Campaign",
      "fields": [{
        "fieldId": "campaignId",
        "label": "Campaign ID",
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
      "group": "Scheduling",
      "fields": [{
        "fieldId": "endDate",
        "label": "End Date",
        "priorValue": "2025-07-08T04:00:00.000Z",
        "newValue": null,
        "changed": null,
        "answered": false,
        "valid": true
      }]
    }
  ],
  "replayWarnings": [...],
  "reviewRequired": true
}
```

**`changed: null`** → field not yet answered (distinct from `false` = answered unchanged)

---

## Localization Handling

Localized fields (e.g. `name`, `storefront_msg_*`) produce one question per locale. The presentation layer preserves the `xmlLang` value exactly:

```json
{
  "type": "question",
  "fieldId": "name",
  "key": "name::promotion::0::x-default",
  "label": "Promotion Name",
  "xmlLang": "x-default",
  "slotContext": { "slotType": "promotion", "slotIndex": 0 }
}
```

The Teams renderer can use `xmlLang` to:
- Show a locale badge (e.g. "x-default", "en")
- Group localized variants visually
- Route to locale-specific input controls

The presentation adapter **never combines** localized variants — each locale is its own question card.

---

## Prohibited Behaviors

The following are permanently prohibited in the presentation adapter layer:

| Prohibition | Reason |
|---|---|
| Rewriting question text | Registry wording is canonical |
| Rewriting label text | Registry wording is canonical |
| Reordering questions | Orchestration ordering is canonical |
| Reordering groups | GROUP_ORDER from registry is canonical |
| Mutating session state | Presentation is read-only |
| Mutating blueprint | Blueprint is read-only |
| Calling `collectAnswer` | Presentation does not change state |
| Calling `updateBlueprintSession` | Presentation does not change state |
| Inferring answers | No AI, no defaults |
| Adding conversational filler | No hardcoded UX copy |
| Tracking review confirmation | Orchestration owns `reviewConfirmedAt` |
| Generating XML | Renderer layer concern |
| Calling external services | Adapters are pure functions |
| Non-deterministic output | Same input → same output, always |

---

## Future Rendering Stack

The current phase delivers presentation objects only. The full stack will be:

```
Session Orchestrator       ← Phase 4 (complete)
  ↓ orchestration state
Presentation Adapter Layer ← Phase 5 (complete)
  ↓ presentation objects
Teams Renderer Layer        ← Future Phase 6
  ↓
  ├── Adaptive Cards v1.5   ← question, progress, review cards
  ├── Copilot Studio        ← action binding to collectAnswer / confirmReview
  └── Power Automate Flow   ← automated clarification flow trigger
  ↓
XML Generation Layer       ← Existing renderer (assembleBlueprintXML)
```

The presentation objects are the **stable contract** between the deterministic orchestration layer and any future rendering surface. Changing a Teams card template never requires modifying the orchestration or the adapters.
