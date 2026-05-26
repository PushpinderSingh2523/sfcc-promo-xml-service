# Runtime Production Hardening

**Phase 10 — Production-safety layer for the SFCC Promo XML Service**

This document covers all eight hardening requirements added before Teams/Copilot integration. Every guarantee described here is backed by deterministic, synchronous logic — no external databases, queues, caches, or cloud dependencies.

---

## Contents

1. [Session TTL and Expiration](#1-session-ttl-and-expiration)
2. [Duplicate Action Protection (Idempotency)](#2-duplicate-action-protection-idempotency)
3. [Runtime Payload Limits](#3-runtime-payload-limits)
4. [Invalid Transition Protection](#4-invalid-transition-protection)
5. [Artifact Collision Prevention](#5-artifact-collision-prevention)
6. [Runtime Fault Isolation](#6-runtime-fault-isolation)
7. [Runtime Metrics](#7-runtime-metrics)
8. [Operational Constraints](#8-operational-constraints)
9. [Debugging Guidance](#9-debugging-guidance)

---

## 1. Session TTL and Expiration

### Behavior

Every session carries two expiry-related timestamps:

| Field | Purpose |
|---|---|
| `expiresAt` | ISO-8601 timestamp; when real clock exceeds this, the session is expired |
| `lastInteractionAt` | Updated on every valid `collectAnswer` call; tracks last activity |

The default TTL is **30 minutes** (`LIMITS.DEFAULT_SESSION_TTL_MS = 1_800_000`). `expiresAt` is always computed from the **real clock** (`new Date()`), never from test-supplied timestamps. This prevents test fixtures with historical timestamps from producing pre-expired sessions.

On every successful `collectAnswer`, `touchSession()` refreshes `expiresAt` forward by one full TTL from the current real time. The `now` argument is deliberately omitted so test timestamp overrides cannot push the window into the past.

### Expiry check sequence (in `collectAnswer`)

1. `isSessionExpired(session)` is called first, before any mutation.
2. If expired: `expireSession(session)` stamps `status = 'EXPIRED'`, then throws `{ code: 'SESSION_EXPIRED', expiresAt, session }`.
3. The thrown error carries the expired session object so callers can read it for diagnostics without needing a separate store lookup.

### Expired session guarantees

- **Immutable**: no mutation (answer, confirm, cancel) can succeed.
- **Readable**: `buildReviewSummary`, field inspection, and logging all work on expired sessions.
- **Preserved by recalculation**: `recalculateDerivedState` skips status derivation when `status === 'EXPIRED'` (same as `CANCELLED`).
- **`getNextQuestion` returns `null`** for expired sessions — no question is ever surfaced to an expired user.

### TTL override (for tests and custom deployments)

Pass `expiresAt` directly to `createBlueprintSession`:

```js
createBlueprintSession(blueprint, {
  sessionId: 'my-session',
  expiresAt: '2099-12-31T23:59:59.000Z', // never expires
});
```

---

## 2. Duplicate Action Protection (Idempotency)

### Strategy

Each `collectAnswer` call accepts an optional `idempotencyToken` string. Tokens are stored in `session.submittedTokens` — a plain object keyed by token string, with `{ key, cachedResult }` as value.

### Deduplication rules

| Condition | Outcome |
|---|---|
| No token supplied | Normal processing — no idempotency check |
| Token seen before, same question key | Returns cached `validationResult` + `idempotent: true`; session is **not** re-mutated |
| Token seen before, **different** question key | Token collision is treated as a new submission (no cache hit) |
| New token | Stored after processing completes |

### Return shape

```js
{
  session,           // always the latest session state
  validationResult,  // cached on duplicate, freshly computed on new
  idempotent,        // true only on exact token+key cache hit
}
```

### Replay safety

Scripted replays do not use idempotency tokens by design — the replay is deterministic by construction. Tokens are exclusively for interactive/API callers where network retries may deliver the same payload twice.

---

## 3. Runtime Payload Limits

All limits are centralised in `src/runtime/runtimeLimits.js` and exported as a frozen `LIMITS` object. Every assertion throws a structured error with `code`, `actual`, `limit`, and a human-readable `message` — **no silent truncation ever occurs**.

### Limit table

| Constant | Value | Guard function | Error code |
|---|---|---|---|
| `MAX_ANSWER_LENGTH` | 4,000 chars | `assertAnswerLength(value, fieldId)` | `ANSWER_TOO_LONG` |
| `MAX_XML_BYTES` | 524,288 (512 KB) | `assertXmlSize(xmlString)` | `XML_TOO_LARGE` |
| `MAX_SESSIONS` | 1,000 | `assertSessionCount(count)` | `TOO_MANY_SESSIONS` |
| `MAX_REPLAY_WARNINGS` | 50 | `assertReplayWarnings(count)` | `TOO_MANY_REPLAY_WARNINGS` |
| `MAX_QUESTIONS_PER_SESSION` | 200 | `assertQueueSize(count)` | `QUEUE_TOO_LARGE` |
| `DEFAULT_SESSION_TTL_MS` | 1,800,000 ms (30 min) | — | — |

### Integration points

- `assertAnswerLength` is called inside `collectAnswer` at step 5 (after transition guard, before write).
- `assertXmlSize` is called inside `generateReplaySafeXML` before returning the artifact.
- `assertQueueSize` is called inside `createBlueprintSession` after the question queue is built.

### Error shape

```js
{
  message: 'Answer for field "name" exceeds 4000 characters (got 4001)',
  code:    'ANSWER_TOO_LONG',
  field:   'name',
  actual:  4001,
  limit:   4000,
}
```

---

## 4. Invalid Transition Protection

### Transition matrix

| From status | `collectAnswer` | `confirmReview` | `generateXML` | `cancelSession` |
|---|---|---|---|---|
| `CREATED` | ✅ allowed | ❌ REVIEW_NOT_PENDING | ❌ GENERATE_NOT_COMPLETE | ✅ allowed |
| `IN_PROGRESS` | ✅ allowed | ❌ REVIEW_NOT_PENDING | ❌ GENERATE_NOT_COMPLETE | ✅ allowed |
| `VALIDATION_FAILED` | ✅ allowed | ❌ REVIEW_NOT_PENDING | ❌ GENERATE_NOT_COMPLETE | ✅ allowed |
| `REVIEW_PENDING` | ✅ allowed | ✅ allowed | ❌ GENERATE_NOT_COMPLETE | ✅ allowed |
| `COMPLETE` | ❌ ANSWER_ON_COMPLETE | ❌ REVIEW_ALREADY_CONFIRMED | ✅ allowed | no-op |
| `CANCELLED` | ❌ ANSWER_ON_CANCELLED | ❌ REVIEW_NOT_PENDING | ❌ GENERATE_NOT_COMPLETE | no-op |
| `EXPIRED` | ❌ ANSWER_ON_EXPIRED | ❌ ANSWER_ON_EXPIRED | ❌ GENERATE_NOT_COMPLETE | no-op |

> **Note**: `generateXML` returns a structured failure object (`{ success: false, error }`) rather than throwing — callers can always inspect the result without a try/catch.

### Guard codes (`GUARD_CODES`)

```js
ANSWER_ON_COMPLETE        // collectAnswer on COMPLETE session
ANSWER_ON_CANCELLED       // collectAnswer on CANCELLED session
ANSWER_ON_EXPIRED         // collectAnswer or confirmReview on EXPIRED session
REVIEW_NOT_PENDING        // confirmReview when status is not REVIEW_PENDING
REVIEW_ALREADY_CONFIRMED  // confirmReview on COMPLETE with reviewConfirmedAt set
GENERATE_NOT_COMPLETE     // generateXML when status is not COMPLETE
PREMATURE_REVIEW          // confirmReview when required fields unanswered or invalids exist
```

All guard errors carry `err.code` for programmatic handling and a descriptive `err.message` for logging.

---

## 5. Artifact Collision Prevention

### Filename strategy

Artifact filenames encode three components to guarantee uniqueness:

```
SAS_{campaignId}_{YYYYMMDD}_{sessionSlug}.xml
```

- `campaignId` — normalised to `[A-Z0-9_]` via `safeName()`
- `YYYYMMDD` — derived from `generatedAt` timestamp
- `sessionSlug` — first 16 characters of `safeName(sessionId)`

Example: `SAS_2026_SUMMER_PROMO_20260615_SESS_001.xml`

Two sessions for the same campaign on the same day produce **distinct filenames** because their session IDs differ. This eliminates collisions between concurrent callers without requiring distributed coordination.

### Atomic write guard (`safeArtifactWrite`)

`fs.writeFileSync` is called with `flag: 'wx'` (exclusive create). The OS kernel ensures this is atomic — if the file already exists, the write fails with `ENOENT` code `EEXIST` before any bytes are written. The function additionally pre-checks `fs.existsSync` to return a fast `collision: true` result with a clear message before attempting the write.

### Return shape

```js
{ written: true,  filePath, error: null,      collision: false } // success
{ written: false, filePath, error: '<reason>', collision: true  } // already exists
{ written: false, filePath, error: '<reason>', collision: false } // other fs error
```

**`safeArtifactWrite` never throws** — all errors are surfaced in the return value.

---

## 6. Runtime Fault Isolation

### Principles

1. **One session cannot crash another.** All session operations are pure-function style — they accept a session and return a new session. There is no shared mutable state between sessions.
2. **Logger failures are swallowed.** `harnessLogger` wraps every `fs.appendFileSync` in try/catch. If the log file is unwritable, the event is silently dropped. Orchestration continues unaffected.
3. **Artifact write failures are structured.** `safeArtifactWrite` returns `{ written: false, error }` on any filesystem error — it never propagates the exception.
4. **Malformed replay fixtures return structured errors.** `runScriptedReplay` wraps fixture loading through `isolateFixtureLoad`, which returns `{ data: null, error: '<reason>' }` on any parse or IO failure — the caller receives `{ success: false, error }` and no exception escapes.

### `safeCall` utility

For one-off isolation of synchronous operations:

```js
const { safeCall } = require('./src/runtime/faultIsolation');

const { result, error } = safeCall(() => riskyOperation(input));
if (error) { /* handle without crashing */ }
```

`safeCall` wraps non-Error throws (strings, objects) in a proper `Error` instance so callers always get `error instanceof Error`.

### Isolation taxonomy

| Failure type | Isolation boundary | Surface |
|---|---|---|
| Session logic error | Per-session function call | Thrown Error with `code` |
| Logger write failure | Internal `try/catch` in `harnessLogger` | Silently dropped |
| Artifact write failure | `safeArtifactWrite` return value | `{ written: false, error }` |
| Malformed fixture | `isolateFixtureLoad` return value | `{ data: null, error }` |
| Replay fixture failure | `runScriptedReplay` return value | `{ success: false, error }` |

---

## 7. Runtime Metrics

### Counters

The `src/runtime/runtimeMetrics.js` module exposes an in-memory singleton. All counters reset to zero on `resetMetrics()` (used between tests and on process restart).

| Counter | Incremented by |
|---|---|
| `sessionsStarted` | `recordSessionStart(questionCount)` |
| `sessionsCompleted` | `recordSessionCompleted()` |
| `sessionsCancelled` | `recordSessionCancelled()` |
| `sessionsExpired` | `recordSessionExpired()` |
| `validationFailures` | `recordValidationFailure()` |
| `replayFailures` | `recordReplayFailure()` |
| `totalQuestionCount` | Accumulated by `recordSessionStart` |

### Derived metrics

| Metric | Formula |
|---|---|
| `averageQuestionCount` | `totalQuestionCount / sessionsStarted` (0 if no sessions started), rounded to 1 decimal |

### Snapshot immutability

`getMetrics()` returns a shallow copy (`{ ..._state, averageQuestionCount }`) — mutating the returned object has no effect on internal state.

### Integration with scripted replay

`runScriptedReplay` automatically records:
- `recordSessionStart(questionCount)` at session creation
- `recordValidationFailure()` for each rejected answer
- `recordSessionCompleted()` on success
- `recordReplayFailure()` on XML generation failure

---

## 8. Operational Constraints

- **No external dependencies.** No database, Redis, message queue, or cloud service is required. All state is in-memory within a single process.
- **Synchronous everywhere.** The scripted replay path is fully synchronous — no Promises, async/await, or event loop dependencies. This guarantees deterministic, reproducible test execution.
- **No auth system.** Session ownership is not enforced at this layer. Teams integration (Phase 11+) will add caller identity.
- **Metrics are process-local.** Counters are lost on process restart. For production telemetry, wrap `getMetrics()` in your own export mechanism (e.g., a periodic HTTP push, Prometheus endpoint, or log line).
- **No Teams changes included.** All hardening is confined to `src/runtime/`, `src/blueprints/session/`, and `src/teams/runtime/buildXMLArtifact.js` (filename only). The Teams adapter layer is untouched.

---

## 9. Debugging Guidance

### Session expired unexpectedly

1. Check `session.expiresAt` — compare against `new Date().toISOString()`.
2. If `expiresAt` is in the past, the session was idle beyond the TTL.
3. `err.session` on a `SESSION_EXPIRED` error carries the expired session object — inspect `lastInteractionAt` to find when the last valid answer was recorded.
4. If tests expire prematurely, ensure `createBlueprintSession` is not receiving an `expiresAt` override from a fixture with an old timestamp. Pass `expiresAt: '2099-12-31T23:59:59.000Z'` to disable TTL in test fixtures.

### Guard code errors

All guard errors follow the same pattern:

```js
try {
  collectAnswer(session, key, value);
} catch (err) {
  console.error(err.code);    // e.g. ANSWER_ON_COMPLETE
  console.error(err.message); // human-readable explanation
}
```

Refer to the [transition matrix](#transition-matrix) to determine which operation is allowed in the current session status.

### Artifact collision

If `safeArtifactWrite` returns `collision: true`, two sessions with identical IDs produced artifacts on the same date. Check that `sessionId` values are unique per caller. The session slug (first 16 chars of `safeName(sessionId)`) is included in the filename — if it matches, the session IDs were identical or too similar.

### Replay fixture failures

`runScriptedReplay` returns `{ success: false, error }` — the `error` string describes the root cause:
- `"Malformed fixture JSON: ..."` — fixture file is not valid JSON
- `"Failed to read fixture: ..."` — file not found or unreadable
- `"filePath must be a non-null string"` — null/undefined path passed

### Metrics unexpected values

Call `resetMetrics()` at the start of each test or isolated run to prevent counter accumulation across calls. `getMetrics()` returns a snapshot — call it again after each operation to observe increments.

### NDJSON logs

Each scripted replay writes a `logs/runtime/<sessionId>.ndjson` file (when not in silent mode). Each line is a JSON object with `{ event, sessionId, ts, data }`. Use `jq` to inspect:

```bash
cat logs/runtime/my-session.ndjson | jq 'select(.event == "ANSWER_REJECTED")'
```

Event names: `SESSION_START`, `QUESTION_PRESENTED`, `ANSWER_ACCEPTED`, `ANSWER_REJECTED`, `STATUS_TRANSITION`, `REPLAY_WARNING`, `XML_GENERATED`, `ARTIFACT_READY`, `SESSION_CANCELLED`, `HARNESS_ERROR`.
