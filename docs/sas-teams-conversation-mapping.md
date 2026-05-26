# SAS Teams Conversation Mapping

How presentation adapter objects map to Microsoft Teams Adaptive Cards and Copilot Studio conversation turns.

---

## Table of Contents

1. [Overview](#overview)
2. [Presentation Object → Teams Card Mapping](#presentation-object--teams-card-mapping)
3. [Conversation Turn Architecture](#conversation-turn-architecture)
4. [Question Turn Flow](#question-turn-flow)
5. [Grouped Question Examples](#grouped-question-examples)
6. [Progress Turn Flow](#progress-turn-flow)
7. [Replay Warning Turn Flow](#replay-warning-turn-flow)
8. [Review Confirmation Turn Flow](#review-confirmation-turn-flow)
9. [Completion Turn Flow](#completion-turn-flow)
10. [Localization Turn Handling](#localization-turn-handling)
11. [Retry Turn Flow](#retry-turn-flow)
12. [Full Summer_SAS.xml Conversation Walkthrough](#full-summer_sasxml-conversation-walkthrough)
13. [Teams Rendering Strategy](#teams-rendering-strategy)
14. [Orchestration Separation in Teams Context](#orchestration-separation-in-teams-context)
15. [Prohibited Teams-Side Behaviors](#prohibited-teams-side-behaviors)

---

## Overview

The Teams renderer layer (Phase 6, future) will consume **presentation objects** produced by the Phase 5 adapter layer and render them as Microsoft Teams Adaptive Cards.

```
User message in Teams
  ↓
Copilot Studio Action
  ↓ calls
Session Orchestrator (collectAnswer / confirmReview)
  ↓ returns updated session
Presentation Adapter Layer (Phase 5 — complete)
  ↓ buildQuestionPresentation / buildProgressPresentation / etc.
Presentation Object (plain JSON)
  ↓
Teams Renderer Layer (Phase 6 — future)
  ↓
Adaptive Card v1.5 rendered in Teams channel
```

The adapter layer is the **stable contract**. Every example in this document uses real presentation object shapes — the Teams renderer only reads them, never produces them.

---

## Presentation Object → Teams Card Mapping

| Presentation `type` | Teams surface | Card purpose |
|---|---|---|
| `"question"` | Adaptive Card with text input or choice set | Collect one field answer from the user |
| `"progress"` | Adaptive Card with fact set + progress bars | Show overall and per-group completion status |
| `"warning"` | Adaptive Card with warning container | Present replay-critical change acknowledgement |
| `"review"` | Adaptive Card with grouped fact set | Before/after comparison for user confirmation |
| `"completion"` | Adaptive Card with summary fact set | Final orchestration summary; signal to trigger XML generation |

All cards are routed by reading `presentation.type` — no other dispatch logic is needed.

---

## Conversation Turn Architecture

Each Copilot Studio turn follows this pattern:

```
1. Copilot receives user message (or start trigger)
2. Copilot calls Power Automate flow
3. Flow calls collectAnswer() on current session state (if answering)
4. Flow calls getNextQuestion(session)
5. Flow calls buildQuestionPresentation(nextQuestion, session)
6. Flow returns presentation object to Copilot
7. Copilot passes object to Teams Renderer (Phase 6)
8. Renderer produces and sends Adaptive Card
9. User responds → loop back to step 2
```

When session reaches `COMPLETE`:

```
5b. Flow calls buildCompletionPresentation(session, blueprint)
6b. Flow returns completion presentation object
7b. Renderer sends completion Adaptive Card
8b. Renderer triggers buildRendererPayloads() → XML generation
```

---

## Question Turn Flow

### Presentation object produced

```json
{
  "type": "question",
  "key": "campaignId::campaign::_::_",
  "fieldId": "campaignId",
  "group": "Campaign",
  "label": "Campaign ID",
  "question": "What is the Campaign ID for this promotion run?",
  "required": true,
  "currentValue": "2025_SUMMER_SAS",
  "replayCritical": true,
  "xmlLang": null,
  "slotContext": { "slotType": "campaign", "slotIndex": null },
  "progress": {
    "currentGroup": "Campaign",
    "completedInGroup": 0,
    "totalInGroup": 1,
    "overallPercentage": 0
  },
  "choices": null,
  "validationHints": [],
  "retryMetadata": {
    "isRetry": false,
    "validationErrors": [],
    "priorRawValue": null
  }
}
```

### Teams Adaptive Card mapping

| Presentation field | Adaptive Card element |
|---|---|
| `label` | `TextBlock` — bold heading |
| `question` | `TextBlock` — body prompt |
| `currentValue` | `TextBlock` — "Current value: 2025_SUMMER_SAS" (styled as secondary) |
| `replayCritical: true` | WarningIcon badge — "⚠ Replay-critical field" |
| `choices: null` | `Input.Text` with placeholder |
| `choices: [...]` | `Input.ChoiceSet` with radio options |
| `validationHints[]` | `TextBlock` per hint (e.g. "Minimum 3 characters") |
| `progress.overallPercentage` | `ProgressBar` in card footer |
| `retryMetadata.isRetry: true` | Error banner at top of card |
| `retryMetadata.validationErrors[]` | Error `TextBlock` per error |

### Submit action

The card submit action calls `collectAnswer(session, key, userInput)` via the Power Automate flow. The `key` field from the presentation object is passed verbatim as the answer key — the renderer never constructs keys.

---

## Grouped Question Examples

Questions are organized into 12 canonical groups. The Teams renderer uses `presentation.group` and `presentation.progress.currentGroup` to show group context.

### Campaign group — single field

```
┌─────────────────────────────────────────────┐
│ 📋 Campaign                   [0% complete] │
├─────────────────────────────────────────────┤
│ Campaign ID ⚠ Replay-critical               │
│                                             │
│ What is the Campaign ID for this promotion  │
│ run?                                        │
│                                             │
│ Current value: 2025_SUMMER_SAS              │
│                                             │
│ ┌─────────────────────────────────────┐     │
│ │ Enter campaign ID...                │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ [Submit]                                    │
└─────────────────────────────────────────────┘
```

### Identity group — enum field (promotionClass)

Presentation object for an enum field:

```json
{
  "type": "question",
  "key": "promotionClass::promotion::0::_",
  "fieldId": "promotionClass",
  "group": "Identity",
  "label": "Promotion Class",
  "question": "What is the promotion class for promotion slot 0?",
  "required": true,
  "currentValue": "PRODUCT",
  "replayCritical": false,
  "xmlLang": null,
  "slotContext": { "slotType": "promotion", "slotIndex": 0 },
  "progress": {
    "currentGroup": "Identity",
    "completedInGroup": 1,
    "totalInGroup": 10,
    "overallPercentage": 3
  },
  "choices": ["PRODUCT", "ORDER", "SHIPPING"],
  "validationHints": [],
  "retryMetadata": { "isRetry": false, "validationErrors": [], "priorRawValue": null }
}
```

Teams card:

```
┌─────────────────────────────────────────────┐
│ 🏷 Identity                   [3% complete] │
│    Field 2 of 10 in this group              │
├─────────────────────────────────────────────┤
│ Promotion Class (Slot 0)                    │
│                                             │
│ What is the promotion class for promotion   │
│ slot 0?                                     │
│                                             │
│ Current value: PRODUCT                      │
│                                             │
│ ○ PRODUCT                                   │
│ ○ ORDER                                     │
│ ○ SHIPPING                                  │
│                                             │
│ [Submit]                                    │
└─────────────────────────────────────────────┘
```

### Discounting group — numeric field with validation hints

```json
{
  "type": "question",
  "key": "percentage::promotion::0::_",
  "fieldId": "percentage",
  "group": "Discounting",
  "label": "Discount Percentage",
  "question": "What discount percentage applies to promotion slot 0?",
  "required": false,
  "currentValue": 25,
  "replayCritical": false,
  "xmlLang": null,
  "slotContext": { "slotType": "promotion", "slotIndex": 0 },
  "choices": null,
  "validationHints": [
    "Minimum value: 0",
    "Maximum value: 100",
    "Must be a whole number"
  ],
  "retryMetadata": { "isRetry": false, "validationErrors": [], "priorRawValue": null }
}
```

Teams card:

```
┌─────────────────────────────────────────────┐
│ 💰 Discounting               [34% complete] │
├─────────────────────────────────────────────┤
│ Discount Percentage (Slot 0)    [Optional]  │
│                                             │
│ What discount percentage applies to         │
│ promotion slot 0?                           │
│                                             │
│ Current value: 25                           │
│                                             │
│ ┌─────────────────────────────────────┐     │
│ │ Enter percentage...                 │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ ℹ Minimum value: 0                          │
│ ℹ Maximum value: 100                        │
│ ℹ Must be a whole number                    │
│                                             │
│ [Submit]   [Skip — keep current value]      │
└─────────────────────────────────────────────┘
```

The "Skip" button submits `null` (which maps to `currentValue` unchanged in the orchestrator for optional fields).

---

## Progress Turn Flow

The progress presentation is sent after each group completion or on explicit user request.

### Presentation object

```json
{
  "type": "progress",
  "currentGroup": "Scheduling",
  "completedQuestions": 12,
  "totalQuestions": 35,
  "remainingQuestions": 23,
  "completionPercentage": 34,
  "status": "IN_PROGRESS",
  "groups": [
    { "group": "Campaign",    "total": 1,  "answered": 1,  "complete": true  },
    { "group": "Identity",    "total": 10, "answered": 10, "complete": true  },
    { "group": "Scheduling",  "total": 5,  "answered": 1,  "complete": false },
    { "group": "Discounting", "total": 4,  "answered": 0,  "complete": false },
    { "group": "Coupons",     "total": 4,  "answered": 0,  "complete": false },
    { "group": "Eligibility", "total": 4,  "answered": 0,  "complete": false },
    { "group": "Operational", "total": 7,  "answered": 0,  "complete": false }
  ]
}
```

### Teams Adaptive Card mapping

| Presentation field | Card element |
|---|---|
| `currentGroup` | Header: "Currently answering: Scheduling" |
| `completedQuestions / totalQuestions` | "12 of 35 fields answered" |
| `completionPercentage` | `ProgressBar` value |
| `groups[].complete: true` | ✅ checkmark beside group name |
| `groups[].complete: false` | ⬜ partial bar beside group name |
| `groups[].answered / .total` | "1/5" fraction beside group |

Teams card:

```
┌─────────────────────────────────────────────┐
│ 📊 Session Progress                         │
│    34% complete · 12 of 35 fields           │
│    ████████░░░░░░░░░░░░░░░                  │
├─────────────────────────────────────────────┤
│ ✅ Campaign        1/1                       │
│ ✅ Identity       10/10                      │
│ ⬜ Scheduling      1/5  ◀ current           │
│ ⬜ Discounting     0/4                       │
│ ⬜ Coupons         0/4                       │
│ ⬜ Eligibility     0/4                       │
│ ⬜ Operational     0/7                       │
├─────────────────────────────────────────────┤
│ [Continue answering]                        │
└─────────────────────────────────────────────┘
```

---

## Replay Warning Turn Flow

A replay warning is surfaced when a `replayCritical` field is answered with a value different from `currentValue`. The orchestrator transitions to `REVIEW_PENDING` and emits warnings via `session.replaySafetyWarnings`.

### Presentation object

```json
{
  "type": "warning",
  "warnings": [
    {
      "severity": "HIGH",
      "fieldId": "campaignId",
      "key": "campaignId::campaign::_::_",
      "slotContext": { "slotType": "campaign", "slotIndex": null },
      "message": "Changing \"Campaign ID\" may affect replay parity. Prior value: \"2025_SUMMER_SAS\". New value: \"2026_SUMMER_SAS\".",
      "priorValue": "2025_SUMMER_SAS",
      "newValue": "2026_SUMMER_SAS",
      "acknowledgementRequired": true
    }
  ],
  "totalWarnings": 1,
  "acknowledgementRequired": true
}
```

### Teams Adaptive Card mapping

```
┌─────────────────────────────────────────────┐
│ ⚠️  Replay Safety Warning                   │
│    1 replay-critical field changed          │
├─────────────────────────────────────────────┤
│ ⚠ HIGH — Campaign ID                        │
│                                             │
│ Changing "Campaign ID" may affect replay    │
│ parity.                                     │
│                                             │
│ Prior value:  2025_SUMMER_SAS               │
│ New value:    2026_SUMMER_SAS               │
├─────────────────────────────────────────────┤
│ You must acknowledge this change before     │
│ completing the session.                     │
│                                             │
│ [I understand — continue]                   │
│ [Cancel session]                            │
└─────────────────────────────────────────────┘
```

The [I understand — continue] button calls `confirmReview(session)` via the Power Automate flow, which transitions the session from `REVIEW_PENDING` to `COMPLETE`.

### Multiple warnings

When both `campaignId` and `promotionId` are changed:

```json
{
  "type": "warning",
  "warnings": [
    {
      "severity": "HIGH",
      "fieldId": "campaignId",
      "key": "campaignId::campaign::_::_",
      "slotContext": { "slotType": "campaign", "slotIndex": null },
      "message": "Changing \"Campaign ID\" may affect replay parity. Prior value: \"2025_SUMMER_SAS\". New value: \"2026_SUMMER_SAS\".",
      "priorValue": "2025_SUMMER_SAS",
      "newValue": "2026_SUMMER_SAS",
      "acknowledgementRequired": true
    },
    {
      "severity": "HIGH",
      "fieldId": "promotionId",
      "key": "promotionId::promotion::0::_",
      "slotContext": { "slotType": "promotion", "slotIndex": 0 },
      "message": "Changing \"Promotion ID\" may affect replay parity. Prior value: \"2025_SUMMER_SAS_PROMO_0\". New value: \"2026_SUMMER_SAS_PROMO_0\".",
      "priorValue": "2025_SUMMER_SAS_PROMO_0",
      "newValue": "2026_SUMMER_SAS_PROMO_0",
      "acknowledgementRequired": true
    }
  ],
  "totalWarnings": 2,
  "acknowledgementRequired": true
}
```

Teams card renders both warnings in source order (campaignId first, then promotionId). The renderer does **not** re-sort — source ordering from the orchestrator is canonical.

---

## Review Confirmation Turn Flow

After all required questions are answered and warnings exist, the orchestrator transitions to `REVIEW_PENDING`. The full before/after comparison is rendered before the user can confirm.

### Presentation object (excerpt)

```json
{
  "type": "review",
  "sessionStatus": "REVIEW_PENDING",
  "completionPercentage": 34,
  "groups": [
    {
      "group": "Campaign",
      "fields": [
        {
          "fieldId": "campaignId",
          "key": "campaignId::campaign::_::_",
          "label": "Campaign ID",
          "xmlLang": null,
          "slotContext": { "slotType": "campaign", "slotIndex": null },
          "required": true,
          "replayCritical": true,
          "priorValue": "2025_SUMMER_SAS",
          "newValue": "2026_SUMMER_SAS",
          "changed": true,
          "answered": true,
          "valid": true,
          "validationErrors": []
        }
      ]
    },
    {
      "group": "Scheduling",
      "fields": [
        {
          "fieldId": "endDate",
          "key": "endDate::promotion::0::_",
          "label": "End Date",
          "xmlLang": null,
          "slotContext": { "slotType": "promotion", "slotIndex": 0 },
          "required": false,
          "replayCritical": false,
          "priorValue": "2025-07-08T04:00:00.000Z",
          "newValue": null,
          "changed": null,
          "answered": false,
          "valid": true,
          "validationErrors": []
        }
      ]
    }
  ],
  "replayWarnings": [
    {
      "severity": "HIGH",
      "fieldId": "campaignId",
      "key": "campaignId::campaign::_::_",
      "slotContext": { "slotType": "campaign", "slotIndex": null },
      "message": "Changing \"Campaign ID\" may affect replay parity. Prior value: \"2025_SUMMER_SAS\". New value: \"2026_SUMMER_SAS\".",
      "priorValue": "2025_SUMMER_SAS",
      "newValue": "2026_SUMMER_SAS",
      "acknowledgementRequired": true
    }
  ],
  "reviewRequired": true
}
```

### Teams Adaptive Card mapping

| Field state | Badge / styling |
|---|---|
| `changed: true` | 🔄 "Changed" badge, highlighted row |
| `changed: false` | — "Unchanged" (no badge) |
| `changed: null` | ⬜ "Not answered" badge (not `false` — the orchestrator sentinel is preserved) |
| `replayCritical: true` | ⚠ icon beside field label |
| `valid: false` | ❌ icon + `validationErrors[]` shown inline |

Teams card:

```
┌─────────────────────────────────────────────┐
│ 📋 Review Changes                           │
│    Session REVIEW_PENDING · 34% complete    │
├─────────────────────────────────────────────┤
│ Campaign                                    │
│ ─────────────────────────────────────────── │
│ Campaign ID ⚠ 🔄 Changed                   │
│   Prior:  2025_SUMMER_SAS                   │
│   New:    2026_SUMMER_SAS                   │
├─────────────────────────────────────────────┤
│ Scheduling                                  │
│ ─────────────────────────────────────────── │
│ End Date ⬜ Not answered                    │
│   Prior:  2025-07-08T04:00:00.000Z          │
│   New:    (will keep prior value)           │
├─────────────────────────────────────────────┤
│ ⚠ Replay Warning: Campaign ID change may   │
│   affect replay parity.                     │
├─────────────────────────────────────────────┤
│ [Confirm and complete]                      │
│ [Cancel session]                            │
└─────────────────────────────────────────────┘
```

**`changed: null` rendering rule**: The renderer must distinguish `null` (unanswered) from `false` (answered, same value). They have different UX implications — `null` fields are effectively "pass-through" to the prior XML value; `false` fields are consciously confirmed unchanged.

---

## Completion Turn Flow

When session status is `COMPLETE` and `payloadReady: true`, the renderer sends the completion card and triggers XML generation.

### Presentation object

```json
{
  "type": "completion",
  "sessionId": "sess-2026-summer-001",
  "blueprintId": "Summer_SAS_2025",
  "status": "COMPLETE",
  "completionPercentage": 31,
  "promotionCount": 4,
  "assignmentCount": 4,
  "answeredFields": 11,
  "totalFields": 35,
  "payloadReady": true,
  "warningsAcknowledged": true,
  "replayWarnings": [],
  "changedFields": [
    {
      "fieldId": "campaignId",
      "key": "campaignId::campaign::_::_",
      "label": "Campaign ID",
      "slotContext": { "slotType": "campaign", "slotIndex": null },
      "priorValue": "2025_SUMMER_SAS",
      "newValue": "2026_SUMMER_SAS"
    }
  ]
}
```

### Teams Adaptive Card mapping

```
┌─────────────────────────────────────────────┐
│ ✅ Session Complete                         │
├─────────────────────────────────────────────┤
│ Session ID:   sess-2026-summer-001          │
│ Blueprint:    Summer_SAS_2025               │
│ Status:       COMPLETE                      │
│ Fields:       11 of 35 answered (31%)       │
│ Promotions:   4 slots                       │
│ Assignments:  4 slots                       │
│ Warnings:     ✅ All acknowledged           │
├─────────────────────────────────────────────┤
│ Changed Fields (1)                          │
│ ─────────────────────────────────────────── │
│ Campaign ID                                 │
│   2025_SUMMER_SAS → 2026_SUMMER_SAS         │
├─────────────────────────────────────────────┤
│ 🔄 Generating XML payload...               │
└─────────────────────────────────────────────┘
```

The `payloadReady: true` flag is the Teams renderer's signal to call `buildRendererPayloads(session, blueprint)` and initiate the XML generation pipeline. The renderer reads `payloadReady` — it never inspects `session.status` directly.

**`completionPercentage` note**: The value may be less than 100 on a `COMPLETE` session. For Summer_SAS.xml, `COMPLETE` is reached after 11 required fields are answered out of 35 total → `completionPercentage = 31`. This is correct and expected; the renderer must not treat sub-100% as an error.

---

## Localization Turn Handling

Localized fields (e.g. `name`, `details`, `calloutMsg` with multiple XML language variants) produce one question per locale. Each is its own conversation turn.

### Example — Promotion Name, x-default locale

```json
{
  "type": "question",
  "key": "name::promotion::0::x-default",
  "fieldId": "name",
  "group": "Messaging",
  "label": "Promotion Name",
  "question": "What is the promotion name for slot 0 (x-default locale)?",
  "required": false,
  "currentValue": "Summer Super Savings",
  "replayCritical": false,
  "xmlLang": "x-default",
  "slotContext": { "slotType": "promotion", "slotIndex": 0 },
  "choices": null,
  "validationHints": [],
  "retryMetadata": { "isRetry": false, "validationErrors": [], "priorRawValue": null }
}
```

### Example — Promotion Name, en locale (next turn)

```json
{
  "type": "question",
  "key": "name::promotion::0::en",
  "fieldId": "name",
  "group": "Messaging",
  "label": "Promotion Name",
  "question": "What is the promotion name for slot 0 (en locale)?",
  "required": false,
  "currentValue": "Summer Super Savings",
  "replayCritical": false,
  "xmlLang": "en",
  "slotContext": { "slotType": "promotion", "slotIndex": 0 },
  "choices": null,
  "validationHints": [],
  "retryMetadata": { "isRetry": false, "validationErrors": [], "priorRawValue": null }
}
```

### Locale badge rendering

The renderer uses `xmlLang` to render a locale badge in the card header:

```
┌─────────────────────────────────────────────┐
│ 💬 Messaging                [Optional]      │
├─────────────────────────────────────────────┤
│ Promotion Name (Slot 0)   🌐 x-default      │
│                                             │
│ What is the promotion name for slot 0       │
│ (x-default locale)?                         │
│                                             │
│ Current value: Summer Super Savings         │
│                                             │
│ ┌─────────────────────────────────────┐     │
│ │ Enter promotion name...             │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ [Submit]   [Skip — keep current value]      │
└─────────────────────────────────────────────┘
```

**The presentation adapter never combines locale variants.** Each locale is its own turn, its own answer key, its own card. The renderer must never group or merge them.

---

## Retry Turn Flow

When a user submits an invalid value, the orchestrator records it in `invalidFields` and returns it as the next question with `isRetry: true`.

### Presentation object on retry

```json
{
  "type": "question",
  "key": "startDate::promotion::0::_",
  "fieldId": "startDate",
  "group": "Scheduling",
  "label": "Start Date",
  "question": "What is the start date for promotion slot 0?",
  "required": true,
  "currentValue": "2025-06-15T04:00:00.000Z",
  "replayCritical": false,
  "xmlLang": null,
  "slotContext": { "slotType": "promotion", "slotIndex": 0 },
  "choices": null,
  "validationHints": [
    "Format: ISO-8601 date/time (e.g. \"2026-06-15T04:00:00.000Z\")"
  ],
  "retryMetadata": {
    "isRetry": true,
    "validationErrors": [
      { "rule": "format", "message": "Value must be a valid ISO-8601 date/time string." }
    ],
    "priorRawValue": "June 15 2026"
  }
}
```

### Teams card on retry

```
┌─────────────────────────────────────────────┐
│ ❌ Invalid answer — please try again        │
│    "June 15 2026" is not a valid value.     │
│    Value must be a valid ISO-8601           │
│    date/time string.                        │
├─────────────────────────────────────────────┤
│ Start Date (Slot 0)                         │
│                                             │
│ What is the start date for promotion        │
│ slot 0?                                     │
│                                             │
│ Current value: 2025-06-15T04:00:00.000Z     │
│                                             │
│ ┌─────────────────────────────────────┐     │
│ │ 2026-06-15T04:00:00.000Z            │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ ℹ Format: ISO-8601 date/time                │
│   (e.g. "2026-06-15T04:00:00.000Z")         │
│                                             │
│ [Submit]                                    │
└─────────────────────────────────────────────┘
```

The renderer pre-populates the input with `retryMetadata.priorRawValue` as a convenience — the user can edit rather than retype. This is the only case where the renderer pre-fills an input field.

---

## Full Summer_SAS.xml Conversation Walkthrough

A complete session for Summer_SAS.xml (35 questions, 11 required) with one replay-critical field change.

### Turn 1 — Session start

**Trigger**: User sends "Start SAS update for Summer campaign"

**Flow**:
```
createBlueprintSession(blueprint)
→ getNextQuestion(session)       → campaignId (required, replayCritical)
→ buildQuestionPresentation(...)
→ send question card
```

**Card**: Campaign ID question with `⚠ Replay-critical` badge.

---

### Turn 2 — Campaign ID answered (changed)

**User input**: `2026_SUMMER_SAS`

**Flow**:
```
collectAnswer(session, 'campaignId::campaign::_::_', '2026_SUMMER_SAS')
→ session.replaySafetyWarnings gains 1 HIGH entry
→ session.status = IN_PROGRESS (not REVIEW_PENDING yet — required fields remain)
→ getNextQuestion(session)      → promotionId::promotion::0::_ (required, replayCritical)
→ buildQuestionPresentation(...)
→ send question card
```

**Card**: Promotion ID question for slot 0.

---

### Turns 3–11 — Remaining required fields

Each turn answers one required field. At Turn 11 (final required field):

```
collectAnswer(session, lastRequiredKey, value)
→ session.status = REVIEW_PENDING  (replaySafetyWarnings.length > 0)
→ getNextQuestion(session) returns null
→ buildReplayWarningPresentation(session.replaySafetyWarnings)
→ send warning card
```

---

### Turn 12 — Replay warning acknowledgement

**User action**: Clicks [I understand — continue]

**Flow**:
```
confirmReview(session)
→ session.status = COMPLETE
→ session.reviewConfirmedAt = now
→ buildCompletionPresentation(session, blueprint)
→ send completion card
→ trigger buildRendererPayloads() → XML generation
```

**Card**: Completion summary with `payloadReady: true`, 1 changed field (Campaign ID).

---

### Optional fields session (no replay warnings)

If the user answers all optional fields with `currentValues` (i.e. no changes to replayCritical fields):

```
Turn 11 (last required field):
  collectAnswer(session, lastRequiredKey, currentValue)
  → session.status = COMPLETE  (no warnings → no REVIEW_PENDING)
  → buildCompletionPresentation(session, blueprint)
  → send completion card immediately
```

No warning card or review confirmation turn is needed. The `REVIEW_PENDING` state is only entered when `session.replaySafetyWarnings.length > 0`.

---

## Teams Rendering Strategy

### Card versioning

All cards target **Adaptive Cards v1.5** (Teams minimum supported version as of 2026). Version pinning prevents unexpected layout changes from framework updates.

### State management

The Teams renderer is **stateless**. Session state is owned entirely by the orchestration layer. The Copilot Studio action stores the session object (serialized JSON) in a Power Automate flow variable between turns. The renderer reads from presentation objects only.

```
[Turn N]
  Copilot reads session JSON from flow variable
  Calls collectAnswer → receives new session JSON
  Stores new session JSON in flow variable
  Calls buildQuestionPresentation → receives presentation object
  Renders card
```

### Card routing

```js
// Teams renderer dispatch (Phase 6 pseudocode)
switch (presentation.type) {
  case 'question':    return renderQuestionCard(presentation);
  case 'progress':    return renderProgressCard(presentation);
  case 'warning':     return renderWarningCard(presentation);
  case 'review':      return renderReviewCard(presentation);
  case 'completion':  return renderCompletionCard(presentation);
}
```

No other properties are inspected for routing. `type` is the sole discriminator.

### Action binding

| User action | Copilot Studio call |
|---|---|
| Submit answer | `collectAnswer(session, presentation.key, userInput)` |
| Skip (optional field) | `collectAnswer(session, presentation.key, null)` |
| Acknowledge warning | `confirmReview(session)` |
| Cancel session | `cancelSession(session)` |
| Request progress | `buildProgressPresentation(session)` |

The `presentation.key` value is passed verbatim to `collectAnswer`. The Teams renderer never constructs or transforms answer keys.

---

## Orchestration Separation in Teams Context

### What Teams reads (presentation layer)

```
presentation.type          → card routing
presentation.key           → answer key (passed verbatim to collectAnswer)
presentation.label         → card heading
presentation.question      → card body
presentation.choices       → choice set items (or null → text input)
presentation.validationHints → hint text blocks
presentation.retryMetadata  → error banner + pre-fill
presentation.xmlLang        → locale badge
presentation.progress       → progress bar values
presentation.groups         → group progress entries
presentation.changedFields  → completion summary rows
presentation.payloadReady   → signal to trigger XML generation
```

### What Teams never touches

```
session.answers            ← orchestration internal
session.questionQueue      ← orchestration internal
session.invalidFields      ← orchestration internal
session.replaySafetyWarnings ← orchestration internal (only read by adapters)
session.reviewConfirmedAt  ← orchestration internal
blueprint.*                ← renderer concern, not Teams conversation concern
```

The Teams renderer never reads session or blueprint objects directly. It reads presentation objects only.

---

## Prohibited Teams-Side Behaviors

| Prohibition | Reason |
|---|---|
| Constructing answer keys in the renderer | Keys come from `presentation.key` verbatim |
| Re-sorting groups in the card | `GROUP_ORDER` is canonical from orchestration |
| Coercing `changed: null` to `false` | Null means unanswered — semantically distinct from unchanged |
| Treating `completionPercentage < 100` as error | COMPLETE sessions legitimately have sub-100% for optional fields |
| Reading `session.status` directly | Use `presentation.payloadReady` and `presentation.status` instead |
| Generating validation error text | Validation errors come from `retryMetadata.validationErrors[]` verbatim |
| Rewriting label or question text | Registry wording is canonical — render verbatim |
| Combining locale variants into one card | Each xmlLang is its own independent question turn |
| Adding AI-generated field suggestions | No inference in the rendering layer |
| Calling `buildRendererPayloads` before `payloadReady: true` | XML generation is only safe on COMPLETE sessions |
| Skipping the warning card when `reviewRequired: true` | All replay warnings must be surfaced before completion |
| Caching presentation objects across sessions | Adapters are called fresh each turn; no stale state |
