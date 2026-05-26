# Teams + Copilot Studio Integration

**Phase 11 — HTTP adapter layer for the SFCC Promo XML Service**

This document describes the architecture, request lifecycle, card strategy, and operational constraints for the Teams / Copilot Studio integration layer built on top of the deterministic SAS orchestration engine.

---

## Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Request / Response Lifecycle](#2-request--response-lifecycle)
3. [HTTP Endpoints](#3-http-endpoints)
4. [Teams Action Flow](#4-teams-action-flow)
5. [Copilot Studio Mapping](#5-copilot-studio-mapping)
6. [Adaptive Card Strategy](#6-adaptive-card-strategy)
7. [Resumability Behavior](#7-resumability-behavior)
8. [Download Flow](#8-download-flow)
9. [Operational Constraints](#9-operational-constraints)
10. [Prohibited Behaviors](#10-prohibited-behaviors)

---

## 1. Architecture Overview

```
Teams / Copilot Studio
        │
        │  HTTP (JSON only, no HTML)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Teams Adapter Layer  (/teams)                                  │
│                                                                 │
│  teamsServer.js    — Content-Type guard, 404, error handler     │
│  sessionRoutes.js  — 6 endpoints (start/answer/review/         │
│                      confirm/cancel/status)                     │
│  payloadNormalizer — Copilot Studio + Bot Framework format →   │
│                      canonical action payload                   │
│  actionAdapter     — inject blueprint from blueprintStore,     │
│                      route to runtime                           │
│  responseAdapter   — runtime result → HTTP body shape          │
│  copilotEnvelope   — HTTP body → Copilot Studio envelope       │
│  sessionResume     — resumeToken generation + validation        │
└─────────────────────────────────────────────────────────────────┘
        │
        │  direct function call (no HTTP hop)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Runtime Layer (existing, unmodified)                           │
│                                                                 │
│  handleTeamsAction — action routing                             │
│  Command handlers  — startSASSession / submitAnswer /          │
│                      requestReview / confirmGeneration /        │
│                      cancelSession                              │
│  sessionStore      — in-memory session persistence             │
│  blueprintStore    — in-memory blueprint persistence           │
│  (all Phase 9–10 guards active: TTL, limits, transitions,      │
│   idempotency, fault isolation, metrics)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Directory structure

```
src/teams/
  server/
    teamsServer.js          — Express router factory (createTeamsRouter)
  routes/
    sessionRoutes.js        — 6 HTTP route handlers
  adapters/
    payloadNormalizer.js    — multi-format → canonical payload
    actionAdapter.js        — canonical payload → runtime dispatch
    responseAdapter.js      — runtime result → HTTP body
    blueprintStore.js       — in-memory blueprint persistence by sessionId
  copilot/
    copilotEnvelope.js      — Copilot Studio response envelope
    sessionResume.js        — resume token generation + validation
  cards/
    buildWelcomeCard.js         — session-start banner card
    buildQuestionCard.js        — single-question input card (existing)
    buildProgressCard.js        — grouped progress breakdown card (existing)
    buildWarningCard.js         — replay-warning acknowledgement card (existing)
    buildReviewCard.js          — before/after field comparison card (existing)
    buildCompletionCard.js      — session completion + download action (existing)
    buildExpiredSessionCard.js  — TTL-expired notification card
    buildValidationErrorCard.js — multi-field validation error summary card
  runtime/                  — existing (unchanged)
    handleTeamsAction.js
    sessionStore.js
    buildXMLArtifact.js
    generateReplaySafeXML.js
    commands/
```

---

## 2. Request / Response Lifecycle

### POST request (e.g. /teams/session/answer)

```
1. Express receives POST body (application/json enforced)
2. teamsServer Content-Type guard validates header → 415 if wrong
3. sessionRoutes handler:
   a. normalizePayload({ ...req.body, action: 'SUBMIT_ANSWER' })
      - Unwraps Bot Framework activity if { type: 'message', value: {...} }
      - Maps fieldValue → rawAnswer (Copilot Studio alias)
      - Maps conversationId → sessionId (fallback)
   b. dispatchAction(normalizedPayload)
      - For START_SAS_SESSION: calls startSASSession directly, saves blueprint
      - For SUBMIT_ANSWER/CONFIRM/CANCEL: loads blueprint from blueprintStore,
        injects into handleTeamsAction payload
      - For REQUEST_REVIEW: no blueprint injection needed
   c. handleTeamsAction routes to command handler
   d. Command handler applies all runtime guards:
      - isSessionExpired → SESSION_EXPIRED
      - assertCanCollectAnswer → ANSWER_ON_COMPLETE / _CANCELLED / _EXPIRED
      - idempotency token check → cached result if duplicate
      - assertAnswerLength → ANSWER_TOO_LONG
      - collectAnswer → validation → recalculate → persist
   e. Command handler builds presentation → Adaptive Card
4. buildHttpResponse(actionResult) — normalizes artifact fields
5. getSession(sid) → derive sessionStatus for copilot envelope
6. wrapForCopilot(httpResponse, sessionStatus) → Copilot envelope
7. res.status(200|400).json(envelope)
```

### GET /session/:id/status

```
1. Express receives GET /teams/session/{id}/status
2. getSession(id) from sessionStore
3. checkResumable(id) → { resumable, reason, session }
4. If EXPIRED → buildExpiredSessionCard(...)
5. If invalidFields > 0 → buildValidationErrorCard(...)
6. res.status(200|404).json({
     version, status, sessionId, session, resumable, resumeToken, card, error
   })
```

---

## 3. HTTP Endpoints

All endpoints are mounted under `/teams/session`.

| Method | Path | Action | Blueprint required | Card returned |
|---|---|---|---|---|
| POST | `/session/start` | START_SAS_SESSION | Extracted from xml body | Question (first) |
| POST | `/session/answer` | SUBMIT_ANSWER | From blueprintStore | Question / Warning / Completion |
| POST | `/session/review` | REQUEST_REVIEW | — | Review (before/after) |
| POST | `/session/confirm` | CONFIRM_GENERATION | From blueprintStore | Completion + artifact |
| POST | `/session/cancel` | CANCEL_SESSION | From blueprintStore | Completion (cancelled) |
| GET | `/:id/status` | — | — | Expired / Validation error |

### POST /session/start

**Request:**
```json
{
  "xml": "<promotions>...</promotions>",
  "sessionId": "my-session-001"
}
```

**Response (200):**
```json
{
  "version": "1.0",
  "status": "in_progress",
  "action": "START_SAS_SESSION",
  "sessionId": "my-session-001",
  "resumeToken": "my-session-001",
  "card": { "$schema": "...", "type": "AdaptiveCard", "version": "1.5", ... },
  "artifact": null,
  "error": null,
  "metadata": { "isIdempotent": false, "actionSuccess": true, "sessionStatus": "CREATED", "envelopeVersion": "1.0" }
}
```

### POST /session/answer

**Request (direct API format):**
```json
{ "sessionId": "my-session-001", "fieldKey": "name::singleton::_::_", "rawAnswer": "Summer 2026 SAS" }
```

**Request (Copilot Studio format — `fieldValue` alias):**
```json
{ "sessionId": "my-session-001", "fieldKey": "name::singleton::_::_", "fieldValue": "Summer 2026 SAS" }
```

**Request (Bot Framework activity wrapper):**
```json
{
  "type": "message",
  "value": { "sessionId": "my-session-001", "fieldKey": "name::singleton::_::_", "rawAnswer": "Summer 2026 SAS" }
}
```

All three formats produce identical processing. The route injects `action: 'SUBMIT_ANSWER'` before normalization.

### GET /session/:id/status

**Response (200, active session):**
```json
{
  "version": "1.0",
  "status": "in_progress",
  "sessionId": "my-session-001",
  "session": {
    "sessionId": "my-session-001",
    "blueprintId": "bp-my-session-001",
    "status": "IN_PROGRESS",
    "expiresAt": "2026-05-14T11:00:00.000Z",
    "lastInteractionAt": "2026-05-14T10:32:14.000Z",
    "completionPercentage": 40,
    "answeredFields": 14,
    "totalFields": 35,
    "invalidFieldCount": 0
  },
  "resumable": true,
  "resumeToken": "my-session-001",
  "card": null,
  "error": null
}
```

---

## 4. Teams Action Flow

```
User: "Create a new SAS promo"
  → Copilot Studio triggers action
    → POST /teams/session/start  { xml: "...", sessionId: "conv-xyz" }
      → Response: question card (field 1 of 35)

User fills card, clicks Submit
  → Copilot Studio sends Action.Submit
    → POST /teams/session/answer  { sessionId: "conv-xyz", fieldKey: "...", fieldValue: "..." }
      → Response: next question card (or warning / completion)

  ... (repeat for each field) ...

Last field answered (no replay-critical changes)
  → Session becomes COMPLETE
  → Response: completion card with "Generate XML" button

User clicks "Generate and download XML"
  → POST /teams/session/confirm  { sessionId: "conv-xyz" }
    → Response: completion card + artifact { filename, byteSize, xmlContent }

  [If replay-critical fields were changed]
  → Session becomes REVIEW_PENDING
  → Response: replay-warning card
  → User clicks "Acknowledge and confirm"
    → POST /teams/session/confirm  { sessionId: "conv-xyz" }
      → confirmReview → COMPLETE → generate XML → Response: artifact
```

### Action.Submit data contract

Each Adaptive Card's submit action includes stable routing data:

| Card | data.action | Additional data |
|---|---|---|
| Question | `SUBMIT_ANSWER` | `fieldKey: string` |
| Warning | `CONFIRM_GENERATION` | — |
| Review | `CONFIRM_GENERATION` | — |
| Completion (ready) | `CONFIRM_GENERATION` | — |
| Welcome | `REQUEST_REVIEW` | `sessionId: string` |
| Expired | `START_NEW_SESSION` | — |
| Validation error | `REQUEST_REVIEW` | `sessionId: string` |

`START_NEW_SESSION` is not a runtime action — it signals to the Copilot topic that the user wants to start over.

---

## 5. Copilot Studio Mapping

### Copilot Studio topic variable mapping

| Envelope field | Copilot Studio variable |
|---|---|
| `status` | `Topic.SessionStatus` |
| `sessionId` | `Topic.SessionId` |
| `resumeToken` | `Topic.ResumeToken` |
| `artifact.filename` | `Topic.ArtifactFilename` |
| `artifact.xmlContent` | `Topic.ArtifactXml` |
| `artifact.byteSize` | `Topic.ArtifactBytes` |
| `error` | `Topic.LastError` |
| `metadata.actionSuccess` | `Topic.ActionOk` |

### Status values for Copilot Studio topic conditions

| `status` value | Session STATUS | Meaning |
|---|---|---|
| `in_progress` | CREATED / IN_PROGRESS / VALIDATION_FAILED / REVIEW_PENDING | Session active |
| `complete` | COMPLETE | XML ready |
| `cancelled` | CANCELLED | Session cancelled |
| `expired` | EXPIRED | TTL exceeded |
| `error` | any | Action failed (check `error` field) |

### Copilot Studio input normalization

Copilot Studio's Power Automate connector sends `fieldValue` in form submissions. The payload normalizer transparently aliases it:

```
fieldValue → rawAnswer
conversationId → sessionId (if sessionId absent)
```

No changes to the Copilot Studio connector configuration are required.

---

## 6. Adaptive Card Strategy

All cards are Adaptive Card schema v1.5 compliant. Cards are built by deterministic builder functions — same input always produces the same card (no `Date.now()` or random values inside card builders).

### Card inventory

| Builder | Purpose | Triggered by |
|---|---|---|
| `buildWelcomeCard` | Session preamble, BEGIN button | Session start confirmation |
| `buildQuestionCard` | Single-field input (text or choice set) | After answer / session start |
| `buildProgressCard` | Group-by-group completion breakdown | Explicit progress requests |
| `buildWarningCard` | Replay-critical field acknowledgement | After replay-critical field change |
| `buildReviewCard` | Before/after comparison for all fields | REQUEST_REVIEW |
| `buildCompletionCard` | Session complete, Generate XML button | COMPLETE status |
| `buildExpiredSessionCard` | TTL exceeded notification | GET /status on EXPIRED |
| `buildValidationErrorCard` | Multi-field validation error list | GET /status with invalid fields |

### Stable action IDs

All `Action.Submit` entries carry a stable `data.action` string so Copilot Studio topic conditions can branch on it reliably. These strings are never dynamically generated.

### Replay-critical field visibility

Every question card marks replay-critical fields with an explicit **⚠ Replay-critical** badge inline in the field label. This is rendered as markdown in the `TextBlock` so it appears in all Teams clients including mobile. The warning card that appears after a replay-critical field is changed always shows the prior and new values side-by-side.

---

## 7. Resumability Behavior

### What "resumable" means

A session is resumable when:
1. It exists in the in-memory session store
2. Its status is one of: `CREATED`, `IN_PROGRESS`, `VALIDATION_FAILED`, `REVIEW_PENDING`

Terminal statuses (`COMPLETE`, `CANCELLED`, `EXPIRED`) are not resumable.

### Resume token

The current resume token is the `sessionId` itself. The `sessionResume` module treats it as opaque to ensure callers don't depend on the format. When an auth layer is added, this will become a signed JWT without any API changes.

### Resume flow

```
1. Previous Teams conversation provides resumeToken (from prior response)
2. GET /teams/session/{resumeToken}/status
   → Response: { resumable: true, resumeToken, session: { status, expiresAt, ... } }
3. User is shown the current session state
4. POST /teams/session/answer with resumeToken as sessionId
   → Session continues from where it left off
```

### TTL behavior

Sessions expire 30 minutes after the last valid `collectAnswer` call. The TTL is always computed from the real clock:
- `expiresAt` is set to `now + 30min` at session creation
- `expiresAt` is refreshed to `now + 30min` on every successful answer
- No test timestamp or fixture timestamp affects expiry for interactive sessions

---

## 8. Download Flow

### Current implementation (Phase 11)

The XML artifact is returned inline in the `/confirm` response body under `artifact.xmlContent`. This is intentional for the current phase — no file server, SharePoint adapter, or Azure Blob Storage connector exists yet.

```json
{
  "artifact": {
    "filename":    "SAS_2026_SUMMER_PROMO_20260615_MY_SESSION_.xml",
    "byteSize":    18432,
    "generatedAt": "2026-06-15T14:23:01.000Z",
    "sessionId":   "my-session-001",
    "blueprintId": "bp-my-session-001",
    "xmlContent":  "<?xml version=\"1.0\" encoding=\"UTF-8\"?>..."
  }
}
```

Copilot Studio maps `artifact.xmlContent` to a flow variable and can write it to SharePoint, send it as an email attachment, or display it in a Teams message.

### Filename collision prevention

Filenames encode: `SAS_{campaignId}_{YYYYMMDD}_{sessionSlug}.xml`

- `campaignId` — normalized to `[A-Z0-9_]`
- Date — from `generatedAt` timestamp
- `sessionSlug` — first 16 chars of the normalized `sessionId`

Two sessions for the same campaign on the same date produce distinct filenames because their session IDs differ.

### Guards on the download path

- **Expired sessions** — artifact: null (generation blocked, cannot reach COMPLETE)
- **Cancelled sessions** — artifact: null (generation blocked at COMPLETE guard)
- **Non-COMPLETE sessions** — artifact: null (confirmGeneration returns xmlBlocked: true)
- **Replay validation failure** — artifact: null (blocking warning card returned instead)

---

## 9. Operational Constraints

- **No Bot Framework SDK** — The adapter is plain Express + supertest. Bot Framework integration is a future phase.
- **No Azure deployment** — No Azure Cognitive Services, Azure Functions, or ACA. Everything runs in the same Node.js process.
- **No auth layer** — No identity check on incoming requests. Resume tokens are plain session IDs. Auth will be added as a separate phase.
- **No Teams business logic** — The adapter layer contains zero business rules. All promotion logic lives in the runtime/orchestration layer.
- **In-memory only** — Both `sessionStore` and `blueprintStore` are `Map`-backed in-memory stores. All state is lost on process restart. A database adapter is a future phase.
- **Synchronous everywhere** — The Teams adapter, routing layer, and all command handlers are synchronous. No Promises, async/await, or event loop dependencies in the session lifecycle.
- **JSON only** — All endpoints reject non-`application/json` Content-Type with HTTP 415. No HTML or form encoding is accepted.
- **Max blueprint size** — Blueprints are stored in `blueprintStore` by session ID. A single Summer SAS blueprint is ~10 KB in memory. With 1,000 concurrent sessions (`LIMITS.MAX_SESSIONS`), blueprint store overhead is ~10 MB.

---

## 10. Prohibited Behaviors

The Teams adapter layer must never:

| Prohibited | Reason |
|---|---|
| Mutate session state directly (bypassing orchestration) | Breaks TTL tracking, idempotency, and transition guards |
| Bypass `collectAnswer` to apply field values | Bypasses validation, payload limits, and guard codes |
| Call `generateReplaySafeXML` without a COMPLETE session | Bypasses the replay validation gate |
| Truncate oversized answers instead of rejecting them | Violates the payload limits contract |
| Apply AI inference or heuristic field mapping | No AI logic at the adapter layer |
| Hardcode session state into card payloads | Cards must derive entirely from presentation objects |
| Generate dynamic `data.action` values in card builders | Action IDs must be stable for Copilot Studio topic conditions |
| Read or write to the filesystem in route handlers | All persistence through sessionStore / blueprintStore |
| Expose internal error stack traces in HTTP responses | Errors surface as structured `error` strings only |
