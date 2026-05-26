# SAS Teams Runtime Layer

Deterministic execution bridge between the session orchestration platform and conversational Teams/Copilot delivery.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Runtime Sequence Diagram](#runtime-sequence-diagram)
4. [Session Persistence](#session-persistence)
5. [Action Routing](#action-routing)
6. [Action Payload Shapes](#action-payload-shapes)
7. [Response Shape](#response-shape)
8. [Command Handlers](#command-handlers)
9. [XML Generation Lifecycle](#xml-generation-lifecycle)
10. [Replay Validation Before Delivery](#replay-validation-before-delivery)
11. [Replay Failure Handling](#replay-failure-handling)
12. [Resumability Behavior](#resumability-behavior)
13. [Teams Prototype Constraints](#teams-prototype-constraints)
14. [Orchestration Separation](#orchestration-separation)
15. [Prohibited Behaviors](#prohibited-behaviors)
16. [Full SAS Walkthrough](#full-sas-walkthrough)

---

## Overview

The Teams Runtime Layer is a **thin, deterministic execution bridge**. It:

- receives Teams/Copilot action payloads
- routes to orchestration command handlers
- invokes presentation adapters (read-only)
- invokes Adaptive Card builders
- persists session state between turns
- generates replay-validated XML artifacts

It does **not**:
- implement AI inference
- implement freeform natural-language interpretation
- contain business logic or validation logic
- mutate session state directly
- upload artifacts to any storage system

---

## Architecture

```
Teams/Copilot Action Payload
  │
  ▼
handleTeamsAction(payload)          ← src/teams/runtime/handleTeamsAction.js
  │  routes by payload.action
  │
  ├── START_SAS_SESSION   → startSASSession.js
  ├── SUBMIT_ANSWER       → submitAnswer.js
  ├── REQUEST_REVIEW      → requestReview.js
  ├── CONFIRM_GENERATION  → confirmGeneration.js
  └── CANCEL_SESSION      → cancelSession.js
         │
         │  each command handler:
         │
         ├── calls Session Orchestrator
         │     (collectAnswer / confirmReview / cancelSession)
         │
         ├── calls Presentation Adapter
         │     (buildQuestionPresentation / buildProgressPresentation / etc.)
         │
         ├── calls Adaptive Card Builder
         │     (buildQuestionCard / buildReviewCard / etc.)
         │
         └── calls sessionStore (saveSession / getSession)
              │
              ▼
         { success, action, sessionId, card, artifact, error }
              │
              ▼
         Teams/Copilot Adaptive Card rendered to user
```

---

## Runtime Sequence Diagram

### Full SAS session with replay warnings

```
User                  Teams/Copilot        Runtime Router       Orchestrator      Store
 │                         │                    │                    │               │
 │── "Run SAS Promotion" ──▶│                   │                    │               │
 │                         │── START_SAS_SESSION▶│                   │               │
 │                         │                    │── extractBlueprint▶│               │
 │                         │                    │── createSession ──▶│               │
 │                         │                    │── saveSession ────────────────────▶│
 │                         │                    │── getNextQuestion ▶│               │
 │                         │                    │── buildQuestionPresentation        │
 │                         │                    │── buildQuestionCard                │
 │                         │◀─── Question Card ─│                    │               │
 │◀────── [Campaign ID?] ──│                    │                    │               │
 │                         │                    │                    │               │
 │── "2026_SUMMER_SAS" ────▶│                   │                    │               │
 │                         │── SUBMIT_ANSWER ───▶│                   │               │
 │                         │                    │── getSession ────────────────────▶│
 │                         │                    │── collectAnswer ──▶│               │
 │                         │                    │── saveSession ────────────────────▶│
 │                         │                    │── getNextQuestion ▶│               │
 │                         │                    │── buildQuestionCard                │
 │                         │◀─── Question Card ─│                    │               │
 │◀─── [Promotion ID?] ────│                    │                    │               │
 │                         │                    │                    │               │
 │  ... (N answer turns) ...│                   │                    │               │
 │                         │                    │                    │               │
 │                         │── SUBMIT_ANSWER ───▶│  (final required) │               │
 │                         │                    │── collectAnswer ──▶│               │
 │                         │                    │  session → REVIEW_PENDING          │
 │                         │                    │── saveSession ────────────────────▶│
 │                         │                    │── buildWarningCard                 │
 │                         │◀─── Warning Card ──│                    │               │
 │◀── [⚠ Acknowledge?] ────│                    │                    │               │
 │                         │                    │                    │               │
 │── "I understand" ───────▶│                   │                    │               │
 │                         │── CONFIRM_GENERATION▶│                  │               │
 │                         │                    │── getSession ────────────────────▶│
 │                         │                    │── confirmReview ──▶│               │
 │                         │                    │  session → COMPLETE               │
 │                         │                    │── saveSession ────────────────────▶│
 │                         │                    │── generateReplaySafeXML           │
 │                         │                    │── buildXMLArtifact                │
 │                         │                    │── buildCompletionCard             │
 │                         │◀─ Completion Card ─│                    │               │
 │◀── [✅ + Download XML] ─│                    │                    │               │
```

---

## Session Persistence

### `src/teams/runtime/sessionStore.js`

In-memory, Map-based persistence for the prototype phase.

| Operation | Behavior |
|---|---|
| `saveSession(session)` | Deep-copies the session into the store (keyed by `sessionId`) |
| `getSession(sessionId)` | Returns a deep copy; `null` if not found |
| `deleteSession(sessionId)` | Removes the entry; returns `true` if found |
| `listSessions()` | Returns all sessions in insertion order (deep copies) |
| `_reset()` | Clears all sessions — for test isolation only |

### Deep copy guarantee

Both `saveSession` and `getSession` deep-copy via `JSON.parse(JSON.stringify(...))`. This means:

- External mutations to the passed session do **not** affect the store
- External mutations to the retrieved session do **not** affect the store
- The same deterministic JSON contract as the orchestration layer

### Resumability

Sessions are plain JSON-serializable objects. The store can be swapped for any key-value store (Redis, Cosmos DB, Azure Table Storage) without changing the session shape. The JSON round-trip must always produce an identical session.

```js
const session    = getSession(sessionId);
const serialized = JSON.stringify(session);
const resumed    = JSON.parse(serialized);
// resumed is structurally identical to session
```

---

## Action Routing

`handleTeamsAction(payload)` dispatches on `payload.action`:

```js
switch (payload.action) {
  case 'START_SAS_SESSION':   return startSASSession(payload);
  case 'SUBMIT_ANSWER':       return submitAnswer(payload);
  case 'REQUEST_REVIEW':      return requestReview(payload);
  case 'CONFIRM_GENERATION':  return confirmGeneration(payload);
  case 'CANCEL_SESSION':      return cancelSession(payload);
  default:                    return errorResponse('Unsupported action');
}
```

All exceptions from command handlers are caught and returned as `{ success: false, error: message }`. No exceptions propagate to the Teams/Copilot layer.

---

## Action Payload Shapes

### START_SAS_SESSION

```json
{
  "action": "START_SAS_SESSION",
  "xml": "<promotions xmlns=...>...</promotions>",
  "sessionId": "sess-2026-summer-001",
  "createdAt": "2026-06-15T04:00:00.000Z"
}
```

| Field | Required | Notes |
|---|---|---|
| `action` | ✅ | Always `"START_SAS_SESSION"` |
| `xml` | ✅ | Raw SAS blueprint XML content |
| `sessionId` | Optional | Auto-generated if omitted |
| `createdAt` | Optional | ISO-8601 override for testing |

---

### SUBMIT_ANSWER

```json
{
  "action": "SUBMIT_ANSWER",
  "sessionId": "sess-2026-summer-001",
  "blueprint": { "...": "..." },
  "fieldKey": "campaignId::campaign::_::_",
  "rawAnswer": "2026_SUMMER_SAS",
  "answeredAt": "2026-06-15T04:01:00.000Z"
}
```

| Field | Required | Notes |
|---|---|---|
| `sessionId` | ✅ | Must exist in session store |
| `blueprint` | ✅ | Original extracted blueprint |
| `fieldKey` | ✅ | From `presentation.key` — verbatim |
| `rawAnswer` | ✅ | User's raw input; `null` for skip |
| `answeredAt` | Optional | ISO-8601 override for testing |

---

### REQUEST_REVIEW

```json
{
  "action": "REQUEST_REVIEW",
  "sessionId": "sess-2026-summer-001"
}
```

Reads the session — does **not** change state. Available at any session status.

---

### CONFIRM_GENERATION

```json
{
  "action": "CONFIRM_GENERATION",
  "sessionId": "sess-2026-summer-001",
  "blueprint": { "...": "..." },
  "confirmedAt": "2026-06-15T05:00:00.000Z"
}
```

If session is `REVIEW_PENDING`: confirms review → transitions to `COMPLETE`.
If session is `COMPLETE`: proceeds directly to XML generation.

---

### CANCEL_SESSION

```json
{
  "action": "CANCEL_SESSION",
  "sessionId": "sess-2026-summer-001",
  "blueprint": { "...": "..." },
  "cancelledAt": "2026-06-15T05:30:00.000Z"
}
```

Idempotent — cancelling an already-cancelled session is a no-op.

---

## Response Shape

All responses conform to:

```json
{
  "success":   true,
  "action":    "SUBMIT_ANSWER",
  "sessionId": "sess-2026-summer-001",
  "card":      { "$schema": "...", "type": "AdaptiveCard", "version": "1.5", "body": [...], "actions": [...] },
  "artifact":  null,
  "error":     null
}
```

| Field | Type | Notes |
|---|---|---|
| `success` | `boolean` | `true` when handler completed without error |
| `action` | `string` | Echoed from payload |
| `sessionId` | `string\|null` | The affected session ID |
| `card` | `object\|null` | Adaptive Card v1.5 payload |
| `artifact` | `object\|null` | XML artifact (only from CONFIRM_GENERATION when generation succeeds) |
| `error` | `string\|null` | Error description when `success: false` |

### Artifact shape

```json
{
  "filename":    "SAS_2026_SUMMER_SAS_20260615.xml",
  "xmlContent":  "<?xml version=\"1.0\"...>",
  "sessionId":   "sess-2026-summer-001",
  "blueprintId": "bp-Summer_SAS_2025",
  "generatedAt": "2026-06-15T05:00:00.000Z",
  "byteSize":    14782
}
```

---

## Command Handlers

### `startSASSession`

```
input:  { xml, sessionId?, createdAt? }
  ↓ extractSASBlueprint(xml)
  ↓ createBlueprintSession(blueprint)
  ↓ saveSession(session)
  ↓ getNextQuestion(session)
  ↓ buildQuestionPresentation(nextQuestion, session)
  ↓ buildQuestionCard(presentation)
output: { session, blueprint, card }
```

### `submitAnswer`

```
input:  { sessionId, blueprint, fieldKey, rawAnswer }
  ↓ getSession(sessionId)
  ↓ collectAnswer(session, fieldKey, rawAnswer)   ← orchestration
  ↓ saveSession(updatedSession)
  ↓ buildNextCard(updatedSession, blueprint)
      REVIEW_PENDING → buildWarningCard
      COMPLETE       → buildCompletionCard
      otherwise      → buildQuestionCard (next/retry question)
output: { session, validationResult, card }
```

### `requestReview`

```
input:  { sessionId }
  ↓ getSession(sessionId)
  ↓ buildReviewSummary(session)                   ← orchestration
  ↓ buildReviewPresentation(reviewSummary)        ← adapter
  ↓ buildReviewCard(presentation)                 ← card builder
output: { session, card }
```

Does NOT modify session state.

### `confirmGeneration`

```
input:  { sessionId, blueprint, confirmedAt? }
  ↓ getSession(sessionId)
  ↓ [if REVIEW_PENDING] confirmReview(session)    ← orchestration
  ↓ saveSession(updatedSession)
  ↓ generateReplaySafeXML(session, blueprint)
      [if !success] → buildWarningCard (XML blocked)
      [if success]  → buildXMLArtifact(xmlContent, ...)
  ↓ buildCompletionCard(completionPresentation)
output: { session, artifact, card, xmlBlocked }
```

### `cancelSession`

```
input:  { sessionId, blueprint, cancelledAt? }
  ↓ getSession(sessionId)
  ↓ cancelSession(session)                        ← orchestration
  ↓ saveSession(cancelledSession)
  ↓ buildCompletionCard(completionPresentation)
output: { session, card }
```

---

## XML Generation Lifecycle

```
CONFIRM_GENERATION received
  │
  ├─ session.status === REVIEW_PENDING?
  │     → confirmReview(session) → session.status = COMPLETE
  │
  ├─ session.status !== COMPLETE?
  │     → return blocked card, xmlBlocked: true
  │
  ├─ buildRendererPayloads(session, blueprint)
  │     → merged campaignSlot, promotionSlots, assignmentSlots
  │
  ├─ assembleBlueprintXML(renderBlueprint)
  │     → complete XML document string
  │
  ├─ validateBlueprintReplay(generatedXml)
  │     → extractSASBlueprint(generatedXml)
  │     → assembleBlueprintXML(extractedBlueprint)
  │     → compareXMLStructures(generatedXml, re-assembled)
  │
  ├─ replayResult.replaySuccessful === false?
  │     → return blocking warning card, xmlBlocked: true
  │     → XML NOT delivered
  │
  └─ buildXMLArtifact({ xmlContent, campaignId, sessionId, blueprintId })
        → { filename, xmlContent, byteSize, generatedAt, ... }
        → return { artifact, card, xmlBlocked: false }
```

---

## Replay Validation Before Delivery

Replay validation is **mandatory** before XML delivery. It proves the generated XML is structurally self-consistent via a round-trip:

```
generatedXml
  ↓ extractSASBlueprint(generatedXml)     — extract blueprint from output
  ↓ assembleBlueprintXML(blueprint)       — re-assemble from extracted blueprint
  ↓ compareXMLStructures(generated, re-assembled)
      → equal: true  → XML is sound; deliver artifact
      → equal: false → structural drift detected; BLOCK delivery
```

This proves:
1. The generated XML is parseable by the extraction pipeline
2. The generated XML round-trips deterministically
3. No structural drift was introduced by the session's answered values

---

## Replay Failure Handling

When `replayResult.replaySuccessful === false`:

```json
{
  "success":    true,
  "action":     "CONFIRM_GENERATION",
  "sessionId":  "sess-2026-summer-001",
  "card": {
    "type": "AdaptiveCard",
    "body": [
      { "type": "TextBlock", "text": "⚠️ Replay Safety Warning", "color": "Attention" },
      { "type": "TextBlock", "text": "XML replay validation failed — XML delivery blocked." }
    ],
    "actions": [
      { "type": "Action.Submit", "title": "Cancel session", "data": { "action": "CANCEL_SESSION" } }
    ]
  },
  "artifact":   null,
  "xmlBlocked": true,
  "error":      null
}
```

The `xmlBlocked: true` field is the delivery gate signal. The Teams renderer must check this flag before attempting to use the artifact.

---

## Resumability Behavior

Sessions persist as plain JSON between Teams turns. The session is designed to resume from any point:

```
Turn 1:  START_SAS_SESSION   → session created (CREATED)
Turn 2:  SUBMIT_ANSWER       → session updated (IN_PROGRESS)
Turn N:  SUBMIT_ANSWER       → session updated (IN_PROGRESS or REVIEW_PENDING)
Turn N+1: CONFIRM_GENERATION → session updated (COMPLETE) + artifact returned
```

Session can resume after:
- Process restart (if store is serialized externally)
- Bot timeout
- User session expiry (within session TTL)

The session object is the complete state machine — no external context needed.

### JSON round-trip contract

```js
const session    = getSession(sessionId);
const resumed    = JSON.parse(JSON.stringify(session));
// getNextQuestion(resumed) produces the same result as getNextQuestion(session)
```

---

## Teams Prototype Constraints

| Constraint | Reason |
|---|---|
| Blueprint hardcoded to latest SAS XML | Avoids blueprint selection UI complexity in Phase 6 |
| Session store in-memory only | No Redis/DB dependency for prototype validation |
| `blueprint` object passed with each action | Stateless blueprint reference — avoids storing large blueprint in session |
| `_reset()` exported | Test isolation — not callable in production code paths |

These constraints are explicitly scoped to Phase 6. Phase 7 will introduce:
- Blueprint selection UI
- External session persistence (Redis or Cosmos DB)
- WebDAV / SharePoint upload flow

---

## Orchestration Separation

### What the Teams runtime does

```
Teams runtime reads:
  payload.sessionId      → routes to session store
  payload.blueprint      → passed to orchestration and presentation adapters
  payload.fieldKey       → passed verbatim to collectAnswer
  payload.rawAnswer      → passed verbatim to collectAnswer
  response.session       → persisted to store
  presentation.key       → embedded in card submit action.data.fieldKey
  presentation.payloadReady → gates XML generation
```

### What the Teams runtime never does

```
Teams runtime NEVER:
  reads session.questionQueue directly
  reads session.answers directly
  reads session.replaySafetyWarnings directly
  computes session.status
  validates field values
  modifies session properties
  calls orchestration functions from card builders
  constructs answer keys
  makes decisions based on field names
```

---

## Prohibited Behaviors

| Prohibition | Reason |
|---|---|
| Directly mutating session objects | All mutations go through orchestration APIs |
| Calling `collectAnswer` from card builders | Card builders are pure presentation consumers |
| Reordering or filtering question queue | Orchestration ordering is canonical |
| Constructing answer keys in the router | Keys come from `presentation.key` verbatim |
| Business logic inside command handlers | Business logic belongs in orchestration |
| Delivering XML before replay validation | Structural integrity not guaranteed |
| Catching and suppressing replay failures | Replay failure must surface to the user |
| AI inference in any Teams layer | All decisions are deterministic |
| Natural-language interpretation | All inputs are structured action payloads |
| Session mutation from card builders | Card builders are read-only consumers |
| Skipping `confirmReview` when `reviewRequired` | Orchestration owns review state transitions |

---

## Full SAS Walkthrough

### Summer_SAS.xml (35 questions, 11 required, 4 promotion slots)

#### Action sequence (campaign ID changed → replay warning path)

| Turn | Action | `rawAnswer` | Session status after | Card type |
|---|---|---|---|---|
| 1 | START_SAS_SESSION | — | CREATED | question |
| 2 | SUBMIT_ANSWER (campaignId) | `"2026_SUMMER_SAS"` | IN_PROGRESS | question |
| 3 | SUBMIT_ANSWER (promotionId slot 0) | `"2026_SAS_PROMO_0"` | IN_PROGRESS | question |
| 4–11 | SUBMIT_ANSWER (remaining required) | currentValue | REVIEW_PENDING | warning |
| 12 | CONFIRM_GENERATION | — | COMPLETE | completion + artifact |

#### Action sequence (all answers = currentValues → no replay warnings)

| Turn | Action | Session status after | Card type |
|---|---|---|---|
| 1 | START_SAS_SESSION | CREATED | question |
| 2–12 | SUBMIT_ANSWER (11 required fields) | COMPLETE | question → completion |
| 13 | CONFIRM_GENERATION | COMPLETE | completion + artifact |

#### Artifact example

```
Filename:   SAS_2026_SUMMER_SAS_20260615.xml
ByteSize:   14,782 bytes
SessionId:  sess-2026-summer-001
Blueprint:  Summer_SAS_2025
Generated:  2026-06-15T05:00:00.000Z
```
