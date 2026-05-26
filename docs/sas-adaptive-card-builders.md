# SAS Adaptive Card Builders

Deterministic Adaptive Card v1.5 builders for the Teams SAS conversation runtime.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Builder Inventory](#builder-inventory)
4. [Presentation Object → Card Contract](#presentation-object--card-contract)
5. [Question Card](#question-card)
6. [Progress Card](#progress-card)
7. [Warning Card](#warning-card)
8. [Review Card](#review-card)
9. [Completion Card](#completion-card)
10. [Adaptive Card Strategy](#adaptive-card-strategy)
11. [Rendering Rules](#rendering-rules)
12. [Prohibited Card-Builder Behaviors](#prohibited-card-builder-behaviors)

---

## Overview

Card builders are **pure functions** that convert presentation objects into Adaptive Card v1.5 payloads.

Each builder:
- Accepts exactly one presentation object (output of a Phase 5 adapter)
- Returns a plain JSON-serializable object (the Adaptive Card)
- Never reads session, blueprint, or orchestration state
- Never calls any orchestration function
- Is deterministic: same presentation → same card, always

---

## Architecture

```
Presentation Adapter Layer (Phase 5)
  │
  │ { type: "question", label, choices, progress, retryMetadata, ... }
  │
  ▼
Adaptive Card Builders (Phase 6)
  │
  ├── buildQuestionCard(questionPresentation)
  │       → Adaptive Card v1.5 with Input.Text or Input.ChoiceSet
  │
  ├── buildProgressCard(progressPresentation)
  │       → Adaptive Card v1.5 with group completion breakdown
  │
  ├── buildWarningCard(warningPresentation)
  │       → Adaptive Card v1.5 with acknowledgement action
  │
  ├── buildReviewCard(reviewPresentation)
  │       → Adaptive Card v1.5 with grouped before/after FactSet
  │
  └── buildCompletionCard(completionPresentation)
          → Adaptive Card v1.5 with artifact download action
  │
  ▼
Teams/Copilot Adaptive Card rendered in channel
```

---

## Builder Inventory

| Builder | Input type | Card purpose |
|---|---|---|
| `buildQuestionCard` | `"question"` | Collect one field answer from the user |
| `buildProgressCard` | `"progress"` | Show group-level completion breakdown |
| `buildWarningCard` | `"warning"` | Surface replay-critical change acknowledgement |
| `buildReviewCard` | `"review"` | Before/after comparison confirmation screen |
| `buildCompletionCard` | `"completion"` | Final session summary + XML download action |

All builders throw when:
- `presentation` is null or not an object
- `presentation.type` does not match the expected type constant

---

## Presentation Object → Card Contract

Builders read **only** from the presentation object. They never access sessions or blueprints.

| What the builder reads | What it NEVER reads |
|---|---|
| `presentation.type` | `session.*` |
| `presentation.label`, `.question` | `blueprint.*` |
| `presentation.choices` | `session.answers` |
| `presentation.validationHints` | `session.questionQueue` |
| `presentation.retryMetadata` | `session.invalidFields` |
| `presentation.progress` | orchestration function results |
| `presentation.groups` | registry |
| `presentation.replayWarnings` | XML content |
| `presentation.changedFields` | — |
| `presentation.payloadReady` | — |

---

## Question Card

### `src/teams/cards/buildQuestionCard.js`

**Input**: `buildQuestionPresentation(nextQuestion, session)` output

**Card body elements (in order)**:

| Element | Condition | Source field |
|---|---|---|
| Retry error banner | `retryMetadata.isRetry === true` | `retryMetadata.validationErrors[]` |
| Group breadcrumb | always | `presentation.group` |
| Field label (+ badges) | always | `label`, `required`, `replayCritical`, `xmlLang` |
| Question prompt | always | `presentation.question` |
| Current value | `currentValue !== null` | `presentation.currentValue` |
| `Input.Text` | `choices === null` | `label` (placeholder) |
| `Input.ChoiceSet` | `choices !== null` | `choices[]` mapped to `{ title, value }` |
| Validation hints | `validationHints.length > 0` | `validationHints[]` |
| Progress footer | always | `progress.completedInGroup / totalInGroup`, `overallPercentage` |

**Actions**: single `Action.Submit` with `data: { action: "SUBMIT_ANSWER", fieldKey: presentation.key }`

### Label badge rules

| Badge | When |
|---|---|
| `⚠ Replay-critical` | `replayCritical === true` |
| `🌐 \`${xmlLang}\`` | `xmlLang !== null` |
| `*(optional)*` | `required === false` |

### Retry pre-fill

When `retryMetadata.isRetry === true`, the input control is pre-filled with `retryMetadata.priorRawValue` so the user can correct rather than retype.

### Example card structure

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    { "type": "TextBlock", "text": "Campaign", "size": "Small", "weight": "Bolder", "color": "Accent" },
    { "type": "TextBlock", "text": "**Campaign ID**  ⚠ *Replay-critical*", "wrap": true },
    { "type": "TextBlock", "text": "What is the Campaign ID for this promotion run?", "wrap": true },
    { "type": "TextBlock", "text": "Current value: **2025_SUMMER_SAS**", "isSubtle": true },
    { "type": "Input.Text", "id": "fieldValue", "placeholder": "Enter Campaign ID..." },
    { "type": "TextBlock", "text": "Progress: 0/1 in group · 0% overall", "isSubtle": true, "separator": true }
  ],
  "actions": [
    { "type": "Action.Submit", "title": "Submit", "data": { "action": "SUBMIT_ANSWER", "fieldKey": "campaignId::campaign::_::_" } }
  ]
}
```

### Retry card structure

```json
{
  "body": [
    {
      "type": "TextBlock",
      "text": "❌ \"bad-date\" is not valid. Value must be a valid ISO-8601 date/time string.",
      "color": "Attention",
      "weight": "Bolder"
    },
    { "type": "TextBlock", "text": "Scheduling" },
    { "type": "TextBlock", "text": "**Start Date (Slot 0)**" },
    { "type": "Input.Text", "id": "fieldValue", "value": "bad-date" },
    { "type": "TextBlock", "text": "ℹ Format: ISO-8601 date/time (e.g. \"2026-06-15T04:00:00.000Z\")", "isSubtle": true }
  ]
}
```

---

## Progress Card

### `src/teams/cards/buildProgressCard.js`

**Input**: `buildProgressPresentation(session)` output

**Card body elements**:

| Element | Source field |
|---|---|
| Header "📊 Session Progress" | static |
| Summary line | `completedQuestions`, `totalQuestions`, `completionPercentage` |
| Status badge | `presentation.status` |
| Group header | static |
| Group rows (one per group with `total > 0`) | `presentation.groups[]` |

**Group row rendering**:

```
✅ Campaign        1/1      ← complete: true
⬜ Identity        2/10     ← complete: false
⬜ Scheduling ◀ current 1/5 ← isCurrent (currentGroup match)
```

**Action**: `Action.Submit` with `data: { action: "SUBMIT_ANSWER" }` — resumes the question flow.

### Example

```json
{
  "body": [
    { "type": "TextBlock", "text": "📊 Session Progress", "weight": "Bolder", "size": "Large" },
    { "type": "TextBlock", "text": "34% complete · 12 of 35 fields answered", "isSubtle": true },
    { "type": "TextBlock", "text": "Status: **IN_PROGRESS**" },
    { "type": "TextBlock", "text": "Group breakdown:", "weight": "Bolder", "separator": true },
    { "type": "ColumnSet", "columns": [
        { "items": [{ "text": "✅ Campaign" }] },
        { "items": [{ "text": "1/1", "horizontalAlignment": "Right" }] }
    ]},
    { "type": "ColumnSet", "columns": [
        { "items": [{ "text": "⬜ Scheduling ◀ current" }] },
        { "items": [{ "text": "1/5", "horizontalAlignment": "Right" }] }
    ]}
  ]
}
```

---

## Warning Card

### `src/teams/cards/buildWarningCard.js`

**Input**: `buildReplayWarningPresentation(warnings)` output

**Card body elements**:

| Element | Condition | Source |
|---|---|---|
| Header "⚠️ Replay Safety Warning" | always | static |
| Warning count subtitle | always | `totalWarnings` |
| Warning container per warning | one per entry | `warnings[]` |
| — Severity + field label | always | `severity`, `fieldId` / `label` |
| — Warning message | always | `warning.message` |
| — Prior/New value FactSet | always | `priorValue`, `newValue` |
| Acknowledgement note | `acknowledgementRequired` | static |

**Actions**:

| Action | Condition |
|---|---|
| "I understand — continue" (positive, CONFIRM_GENERATION) | `acknowledgementRequired === true` |
| "Cancel session" (destructive, CANCEL_SESSION) | always |

### Example

```json
{
  "body": [
    { "type": "TextBlock", "text": "⚠️ Replay Safety Warning", "weight": "Bolder", "color": "Attention" },
    { "type": "TextBlock", "text": "1 replay-critical field changed" },
    {
      "type": "Container", "style": "attention",
      "items": [
        { "type": "TextBlock", "text": "⚠ HIGH — Campaign ID", "weight": "Bolder", "color": "Attention" },
        { "type": "TextBlock", "text": "Changing \"Campaign ID\" may affect replay parity..." },
        { "type": "FactSet", "facts": [
          { "title": "Prior value:", "value": "2025_SUMMER_SAS" },
          { "title": "New value:", "value": "2026_SUMMER_SAS" }
        ]}
      ]
    },
    { "type": "TextBlock", "text": "You must acknowledge these changes before completing." }
  ],
  "actions": [
    { "type": "Action.Submit", "title": "I understand — continue", "style": "positive", "data": { "action": "CONFIRM_GENERATION" } },
    { "type": "Action.Submit", "title": "Cancel session", "style": "destructive", "data": { "action": "CANCEL_SESSION" } }
  ]
}
```

---

## Review Card

### `src/teams/cards/buildReviewCard.js`

**Input**: `buildReviewPresentation(reviewSummary)` output

**Card body elements**:

| Element | Source |
|---|---|
| Header "📋 Review Changes" | static |
| Session metadata | `sessionStatus`, `completionPercentage` |
| Group section per group | `groups[]` |
| — Group heading (separator) | `group.group` |
| — Field row per field | `group.fields[]` |
|   — Label with badges | `label`, `slotContext`, `replayCritical`, `xmlLang`, `changed`, `answered` |
|   — Prior/New FactSet | `priorValue`, `newValue` |
|   — Validation errors | `validationErrors[]` (when `valid === false`) |
| Replay warnings summary | `replayWarnings[]` |
| Confirm action | always |
| Cancel action | always |

### `changed` rendering rules

| `changed` value | `answered` | Badge |
|---|---|---|
| `true` | `true` | `🔄 *Changed*` (bold label) |
| `false` | `true` | *(no badge)* |
| `null` | `false` | `⬜ *Not answered*` |

**Critical**: `changed: null` is the "unanswered" sentinel. It must NOT be coerced to `false`. The card builder preserves the distinction so renderers can show a semantically correct state.

### `unanswered` field display

For `changed: null` fields, the new-value row shows:
```
New value: *(will keep prior value)*
```

This communicates that the unanswered field will fall back to its `currentValue` in the XML output.

### Replay warnings in review card

The replay warnings appear as a dedicated section below all groups. Each warning shows its message in `Attention` color. This is redundant with the warning card shown after `SUBMIT_ANSWER` — it reinforces the changes visible at review time.

### Example (two groups, one changed, one unanswered)

```json
{
  "body": [
    { "type": "TextBlock", "text": "📋 Review Changes" },
    { "type": "TextBlock", "text": "Session REVIEW_PENDING · 34% complete" },
    { "type": "TextBlock", "text": "Campaign", "weight": "Bolder", "separator": true },
    { "type": "TextBlock", "text": "**Campaign ID** ⚠  🔄 *Changed*", "weight": "Bolder" },
    { "type": "FactSet", "facts": [
      { "title": "Prior value:", "value": "2025_SUMMER_SAS" },
      { "title": "New value:", "value": "2026_SUMMER_SAS" }
    ]},
    { "type": "TextBlock", "text": "Scheduling", "weight": "Bolder", "separator": true },
    { "type": "TextBlock", "text": "End Date (Slot 0) ⬜ *Not answered*" },
    { "type": "FactSet", "facts": [
      { "title": "Prior value:", "value": "2025-07-08T04:00:00.000Z" },
      { "title": "New value:", "value": "*(will keep prior value)*" }
    ]}
  ],
  "actions": [
    { "type": "Action.Submit", "title": "Confirm and complete", "style": "positive", "data": { "action": "CONFIRM_GENERATION" } },
    { "type": "Action.Submit", "title": "Cancel session", "style": "destructive", "data": { "action": "CANCEL_SESSION" } }
  ]
}
```

---

## Completion Card

### `src/teams/cards/buildCompletionCard.js`

**Input**: `buildCompletionPresentation(session, blueprint)` output

**Card body elements**:

| Element | Condition | Source |
|---|---|---|
| Header "✅ Session Complete" | `payloadReady === true` | `payloadReady` |
| Header "⏳ Session {status}" | `payloadReady === false` | `status` |
| Metadata FactSet | always | `sessionId`, `blueprintId`, `status`, fields, slots, warnings, payload |
| Changed fields section | `changedFields.length > 0` | `changedFields[]` |
| "No fields changed" note | `changedFields.length === 0` | static |
| Replay warnings note | `replayWarnings.length > 0` | `replayWarnings` |
| "⬇ Generate and download XML" action | `payloadReady === true` | — |
| "View progress breakdown" (ShowCard) | always | — |

### `payloadReady` gate

The "Generate and download XML" action is **only present** when `payloadReady === true`. This prevents the user from attempting XML generation before the session is complete.

Renderers should also check `payloadReady` directly before calling `CONFIRM_GENERATION`.

### Changed fields rendering

Each changed field produces a fact row:

```
Campaign ID:           2025_SUMMER_SAS → 2026_SUMMER_SAS
Promotion ID (Slot 0): OLD_PROMO_0    → NEW_PROMO_0
```

### `warningsAcknowledged` display

| Value | Display |
|---|---|
| `true` | `✅ All acknowledged` |
| `false` | `⚠ Pending acknowledgement` |

### `completionPercentage` note

The percentage may be less than 100 on a COMPLETE session. For Summer_SAS.xml, COMPLETE is reached after 11 required fields are answered out of 35 total → `31%`. This is correct. The card never treats sub-100% as an error.

### Example

```json
{
  "body": [
    { "type": "TextBlock", "text": "✅ Session Complete", "weight": "Bolder", "color": "Good" },
    { "type": "FactSet", "facts": [
      { "title": "Session ID:", "value": "sess-2026-summer-001" },
      { "title": "Blueprint:", "value": "bp-Summer_SAS_2025" },
      { "title": "Status:", "value": "COMPLETE" },
      { "title": "Fields:", "value": "11 of 35 answered (31%)" },
      { "title": "Promotions:", "value": "4 slots" },
      { "title": "Assignments:", "value": "4 slots" },
      { "title": "Warnings:", "value": "✅ All acknowledged" },
      { "title": "Payload:", "value": "✅ Ready for XML generation" }
    ]},
    { "type": "TextBlock", "text": "Changed Fields (1)", "weight": "Bolder", "separator": true },
    { "type": "FactSet", "facts": [
      { "title": "Campaign ID:", "value": "2025_SUMMER_SAS → 2026_SUMMER_SAS" }
    ]}
  ],
  "actions": [
    { "type": "Action.Submit", "title": "⬇ Generate and download XML", "style": "positive", "data": { "action": "CONFIRM_GENERATION" } },
    { "type": "Action.ShowCard", "title": "View progress breakdown", "card": { "..." } }
  ]
}
```

---

## Adaptive Card Strategy

### Version targeting

All builders target **Adaptive Cards v1.5** (`"version": "1.5"`). This is the minimum version supported by Teams as of 2026 and covers all required elements:

- `Input.Text`, `Input.ChoiceSet` (question card)
- `ColumnSet` with stretch/auto widths (progress card)
- `Container` with `style: "attention"` (warning card)
- `FactSet` (review and completion cards)
- `Action.Submit`, `Action.ShowCard` (all cards)

### Schema

All cards include:

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5"
}
```

### Input ID convention

All input controls use `id: "fieldValue"`. When the user submits, Teams includes the input value at the `fieldValue` key in the submission payload alongside the `action.data` object.

### Action data convention

All `Action.Submit` data objects include at minimum:

```json
{ "action": "ACTION_NAME" }
```

Question card submit actions also include:

```json
{ "action": "SUBMIT_ANSWER", "fieldKey": "campaignId::campaign::_::_" }
```

The runtime reads `payload.fieldKey` to route the answer to the correct orchestration key. The Teams renderer never constructs keys.

### Card routing via submit action data

The Copilot Studio flow or Power Automate trigger reads `submitActionData.action` to determine what `handleTeamsAction` call to make:

| `data.action` | `handleTeamsAction` call |
|---|---|
| `"SUBMIT_ANSWER"` | `handleTeamsAction({ action: 'SUBMIT_ANSWER', fieldKey: data.fieldKey, rawAnswer: input.fieldValue, ... })` |
| `"CONFIRM_GENERATION"` | `handleTeamsAction({ action: 'CONFIRM_GENERATION', ... })` |
| `"CANCEL_SESSION"` | `handleTeamsAction({ action: 'CANCEL_SESSION', ... })` |

---

## Rendering Rules

| Rule | Details |
|---|---|
| `changed: null` → "Not answered" | Never coerce to `false` — null and false are semantically distinct |
| `slotIndex: 0` → "(Slot 0)" | Never treat 0 as falsy — render the slot suffix |
| `completionPercentage < 100` on COMPLETE | Not an error — render as-is |
| `replayCritical: true` → `⚠` badge | Always present on replay-critical fields |
| `xmlLang` → locale badge | `🌐 \`${xmlLang}\`` beside the label |
| `required: false` → "(optional)" | Always shown for non-required fields |
| `choices: null` → `Input.Text` | No choice set |
| `choices: []` (empty) → `Input.Text` | Treat empty choices as text input |
| `choices: [...]` → `Input.ChoiceSet` | Rendered as compact choice set |
| `validationErrors[]` on retry | Each error shown in retry banner |
| `priorRawValue` on retry | Pre-fills the input control |

---

## Prohibited Card-Builder Behaviors

| Prohibition | Reason |
|---|---|
| Calling orchestration functions | Card builders are pure presentation consumers |
| Reading session or blueprint directly | All state comes from the presentation object |
| Rewriting label or question text | Registry wording is canonical — render verbatim |
| Constructing answer keys | Keys come from `presentation.key` |
| Reordering groups or fields | Input ordering from buildReviewPresentation is canonical |
| Coercing `changed: null` to `false` | Null means unanswered — distinct from unchanged |
| Treating `slotIndex: 0` as falsy | 0 is a valid slot index |
| Adding AI-generated text | No inference in the card layer |
| Adding hardcoded field names | No field-specific branching |
| Caching cards across presentations | Same presentation → same card (deterministic, no state) |
| Inferring session status from card state | Session state is owned by the orchestrator |
| Making HTTP calls | Card builders are pure synchronous functions |
