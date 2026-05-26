# Local Runtime Harness

> **Phase 9 — End-to-end SAS conversation testing reference**
>
> Documents the architecture, CLI usage, fixture structure, scripted replay
> protocol, debugging workflow, and deterministic guarantees for
> `src/runtime/localHarness.js`.
>
> **Prohibition**: NO Teams/Copilot integration, NO UI framework, NO AI
> inference, NO blueprint mutation.  All orchestration reuses existing
> `src/blueprints/` and `src/teams/runtime/` layers verbatim.

---

## 1. Purpose

The local runtime harness lets you simulate the complete SAS conversation
lifecycle **in-process, on the command line**, before any Teams or Copilot
Studio integration is involved.  It is the canonical tool for:

- Verifying that a new blueprint XML produces sensible questions
- Confirming that a full answer set survives replay validation
- Debugging validation failures without a live bot session
- Generating reference XML artifacts from fixture answer sets
- Running regression tests against the orchestration layer

---

## 2. Architecture

```
localHarness.js          — CLI entrypoint; arg parsing; mode dispatch
├── interactiveSession.js — readline loop; displays questions; accepts answers
├── scriptedReplay.js     — headless loop; loads fixture; drives full lifecycle
├── harnessDisplay.js     — terminal rendering (stdout only; no colour codes)
└── harnessLogger.js      — NDJSON event log to logs/runtime/<sessionId>.ndjson
```

### Lifecycle (both modes)

```
Blueprint XML
    ↓ extractSASBlueprint()
Blueprint object
    ↓ createBlueprintSession()
Session (CREATED)
    ↓ collectAnswer() × N
Session (IN_PROGRESS → REVIEW_PENDING | COMPLETE)
    ↓ confirmReview()  [if REVIEW_PENDING]
Session (COMPLETE)
    ↓ generateReplaySafeXML()
XML + replay validation result
    ↓ buildXMLArtifact()
Artifact descriptor
```

The harness calls no AI services and makes no network requests.  Every step
is a deterministic pure function from the existing orchestration layer.

---

## 3. CLI usage

### Prerequisites

```bash
cd /path/to/sfcc-promo-xml-service
npm install   # dependencies already present; no new ones added
```

### Interactive mode

Prompts the operator for each answer in turn.

```bash
node src/runtime/localHarness.js \
  --mode interactive \
  --input fixtures/sas-session-inputs/summer-sas-2026.json
```

**Special commands** (type at any answer prompt):

| Command   | Effect |
|-----------|--------|
| `!help`   | Print the command list |
| `!status` | Show progress % and current status |
| `!skip`   | Skip the current field (only allowed for optional fields) |
| `!review` | Jump to the review summary immediately |
| `!cancel` | Cancel the session and exit |
| `!export` | Write the current session state to `logs/runtime/<sessionId>.json` |

After answering all questions the harness automatically advances to the
review summary.  Press **Enter** (or any non-command input) to confirm and
generate XML.

### Scripted replay mode

Drives the full lifecycle headlessly from a pre-built answer fixture.
Exits 0 on success, 1 on any failure.

```bash
node src/runtime/localHarness.js \
  --mode scripted \
  --replay fixtures/sas-conversation-replays/full-summer-sas.json
```

With `--stop-on-error`, the run aborts on the first validation error
(useful for CI gatekeeping):

```bash
node src/runtime/localHarness.js \
  --mode scripted \
  --replay fixtures/sas-conversation-replays/full-summer-sas.json \
  --stop-on-error
```

### All flags

| Flag | Default | Description |
|------|---------|-------------|
| `--mode interactive\|scripted` | `interactive` | Operating mode |
| `--input <path>` | _(none)_ | Session input JSON — required in interactive mode |
| `--replay <path>` | _(none)_ | Replay fixture JSON — required in scripted mode |
| `--session-id <id>` | auto-generated | Override session ID |
| `--stop-on-error` | `false` | Abort scripted replay on first validation error |
| `--silent` | `false` | Suppress NDJSON log file writes |
| `--help` | — | Print usage and exit |

---

## 4. Fixture structure

### Session input fixture

`fixtures/sas-session-inputs/<name>.json`

```jsonc
{
  "_comment":       "Human description",
  "blueprintXmlPath": "tests/fixtures/Summer_SAS.xml",  // relative to project root
  "blueprintId":    "summer-sas-2026",
  "sessionMeta": {
    "label":       "2026 Summer Semi-Annual Sale",
    "description": "Free-form notes for operators"
  }
}
```

`blueprintXmlPath` and `blueprintId` are required.  All other fields are
informational and ignored by the harness.

### Replay fixture

`fixtures/sas-conversation-replays/<name>.json`

```jsonc
{
  "_comment":    "Human description",
  "sessionInput": "fixtures/sas-session-inputs/summer-sas-2026.json",
  "answers": [
    {
      "key":   "campaignId::campaign::_::_",
      "value": "2026_SUMMER_SAS",
      "_note": "Optional human note — ignored by harness"
    },
    {
      "key":   "name::promotion::0::x-default",
      "value": "Promo Applied"
    },
    {
      "key":   "simpleDiscountValue::promotion::0::_",
      "value": 25
    },
    {
      "key":   "discountEntries::promotion::2::_",
      "value": [{ "threshold": 250, "discountValue": 50 }]
    },
    {
      "key":   "couponIds::assignment::0::_",
      "value": ["2026-Summer-SAS-CS"]
    }
    // ... remaining answers
  ]
}
```

**Answer key format:**  `fieldId::slotType::slotIndex::xmlLang`

- `slotIndex` is `_` when null (campaign slot)
- `xmlLang` is `_` when null (non-localised fields)

**Value types:**

| Field type | Value in JSON |
|------------|---------------|
| String fields | `"string value"` |
| Numeric fields | `25` (number, not `"25"`) |
| Array fields (coupons, discount entries) | `[...]` |

---

## 5. Answer key reference — Summer_SAS.xml

The 35 questions produced by `Summer_SAS.xml` in key order:

| # | Key | Group | Replay-critical |
|---|-----|-------|-----------------|
| 0 | `campaignId::campaign::_::_` | Campaign | ✓ |
| 1 | `name::promotion::0::x-default` | Identity | |
| 2 | `name::promotion::0::en` | Identity | |
| 3 | `promotionId::promotion::0::_` | Identity | ✓ |
| 4 | `name::promotion::1::x-default` | Identity | |
| 5 | `name::promotion::1::en` | Identity | |
| 6 | `promotionId::promotion::1::_` | Identity | ✓ |
| 7 | `name::promotion::2::x-default` | Identity | |
| 8 | `promotionId::promotion::2::_` | Identity | ✓ |
| 9 | `name::promotion::3::x-default` | Identity | |
| 10 | `promotionId::promotion::3::_` | Identity | ✓ |
| 11 | `endDate::assignment::0::_` | Scheduling | |
| 12 | `endDate::assignment::1::_` | Scheduling | |
| 13 | `endDate::assignment::2::_` | Scheduling | |
| 14 | `endDate::assignment::3::_` | Scheduling | |
| 15 | `startDate::assignment::3::_` | Scheduling | |
| 16 | `simpleDiscountValue::promotion::0::_` | Discounting | |
| 17 | `simpleDiscountValue::promotion::1::_` | Discounting | |
| 18 | `discountEntries::promotion::2::_` | Discounting | |
| 19 | `discountEntries::promotion::3::_` | Discounting | |
| 20 | `couponIds::assignment::0::_` | Coupons | |
| 21 | `couponIds::assignment::2::_` | Coupons | |
| 22 | `includedBadge::promotion::1::x-default` | Merchandising | |
| 23 | `includedBadgeSPP::promotion::1::x-default` | Merchandising | |
| 24 | `storefront_msg_cart_exclusion::promotion::0::x-default` | Storefront | |
| 25 | `storefront_msg_cart_inclusion::promotion::0::x-default` | Storefront | |
| 26 | `storefront_msg_cart_exclusion::promotion::1::x-default` | Storefront | |
| 27 | `storefront_msg_cart_inclusion::promotion::1::x-default` | Storefront | |
| 28 | `storefront_msg_cart_exclusion::promotion::2::x-default` | Storefront | |
| 29 | `storefront_msg_cart_inclusion::promotion::2::x-default` | Storefront | |
| 30 | `storefront_msg_cart_exclusion::promotion::3::x-default` | Storefront | |
| 31 | `storefront_msg_cart_inclusion::promotion::3::x-default` | Storefront | |
| 32 | `couponErrorMsgNoActivePromotion::promotion::0::x-default` | Messaging | |
| 33 | `couponErrorMsgRedemptionLimitExeeded::promotion::0::x-default` | Messaging | |
| 34 | `couponErrorMsgNoApplicablePromotion::promotion::2::x-default` | Messaging | |

---

## 6. Log format

All events are written to `logs/runtime/<sessionId>.ndjson` as one JSON
object per line.

```jsonc
{ "ts": "2026-05-14T12:00:00.000Z", "sessionId": "scripted-1234", "event": "SESSION_START", "data": { "blueprintId": "summer-sas-2026", "totalQuestions": 35 } }
{ "ts": "...", "sessionId": "...", "event": "QUESTION_PRESENTED", "data": { "key": "campaignId::campaign::_::_" } }
{ "ts": "...", "sessionId": "...", "event": "ANSWER_ACCEPTED",    "data": { "key": "campaignId::campaign::_::_" } }
{ "ts": "...", "sessionId": "...", "event": "ANSWER_REJECTED",    "data": { "key": "...", "errors": ["..."] } }
{ "ts": "...", "sessionId": "...", "event": "STATUS_TRANSITION",  "data": { "to": "COMPLETE" } }
{ "ts": "...", "sessionId": "...", "event": "XML_GENERATED",      "data": { "success": true, "replaySuccessful": true, "timingMs": 120 } }
{ "ts": "...", "sessionId": "...", "event": "ARTIFACT_READY",     "data": { "filename": "SAS_2026_SUMMER_SAS_20260514.xml", "byteSize": 18432 } }
```

**Event types:**

| Event | Meaning |
|-------|---------|
| `SESSION_START` | Blueprint loaded, session created |
| `QUESTION_PRESENTED` | Question dispatched to user/fixture |
| `ANSWER_ACCEPTED` | Answer passed validation |
| `ANSWER_REJECTED` | Answer failed validation; `data.errors` contains messages |
| `STATUS_TRANSITION` | `session.status` changed; `data.to` is the new value |
| `REPLAY_WARNING` | Structural difference found during replay validation |
| `XML_GENERATED` | XML pipeline completed; `data.replaySuccessful` indicates gate result |
| `ARTIFACT_READY` | Final artifact descriptor built |
| `SESSION_CANCELLED` | Operator cancelled |
| `HARNESS_ERROR` | Unexpected internal error (run may continue) |

Parse NDJSON logs with:

```bash
# View all rejected answers
grep '"ANSWER_REJECTED"' logs/runtime/<sessionId>.ndjson | jq '.data'

# View timeline
cat logs/runtime/<sessionId>.ndjson | jq -r '[.ts, .event] | join("  ")'
```

---

## 7. Scripted replay — programmatic API

`runScriptedReplay` can be called directly from test code:

```js
const { runScriptedReplay } = require('./src/runtime/scriptedReplay');

const result = runScriptedReplay(
  'fixtures/sas-conversation-replays/full-summer-sas.json',
  {
    sessionId:   'my-test-session',   // optional override
    silent:      true,                // suppress log files in tests
    stopOnError: false,               // continue on validation errors
  }
);

// result shape:
// {
//   success:          boolean,
//   sessionId:        string,
//   answersSubmitted: number,
//   validationErrors: Array<{ key: string, errors: string[] }>,
//   reviewSummary:    object|null,
//   xmlResult:        object|null,    // from generateReplaySafeXML()
//   artifact:         object|null,    // from buildXMLArtifact()
//   error:            string|null,
//   timingMs:         number,
// }
```

---

## 8. Debugging workflow

### Replay validation fails

1. Run scripted mode and capture the NDJSON log
2. Look for `REPLAY_WARNING` events — each entry has a `data.difference` field
3. Compare the structural difference to the fixture answer for that field
4. Check that replay-critical fields (`replayCritical: true`) have values that
   exactly match the original XML (e.g. IDs must not be reformatted)

### Validation errors on a field

1. Check the `ANSWER_REJECTED` event for the `errors` array
2. Look up the question's `validation` object from
   `session.questionQueue.find(q => q.key === key)`
3. Adjust the fixture value to satisfy `minLength`, `maxLength`, `pattern`,
   `format`, `min`, `max` as appropriate

### Session stuck in `IN_PROGRESS`

All required fields must be answered without validation errors for the session
to advance to `REVIEW_PENDING` or `COMPLETE`.  Run with `--stop-on-error`
to surface the first blocking field immediately.

### Interactive mode — coercion behaviour

The interactive harness coerces stdin strings as follows:

- Fields with `validation.type === 'number'`: parsed via `parseFloat()`
- Fields with `validation.type === 'array'`: if input starts with `[`, parsed
  as JSON; otherwise split on comma (e.g. `CODE1, CODE2` → `['CODE1', 'CODE2']`)
- All other fields: passed as-is

---

## 9. Test coverage

`tests/integration/localHarness.test.js` covers 10 scenarios:

| # | Scenario |
|---|----------|
| 1 | Full happy-path replay — 35 answers, replay passes, artifact generated |
| 2 | Invalid answer does not abort; `validationError` recorded |
| 3 | `--stop-on-error` aborts on first rejected answer |
| 4 | Missing fixture file returns graceful error |
| 5 | Missing blueprint XML path returns graceful error |
| 6 | All 5 replay-critical keys present in fixture |
| 7 | Artifact shape — filename, byteSize, sessionId, blueprintId, generatedAt |
| 8 | Custom `--session-id` propagated to artifact |
| 9 | Campaign ID from fixture appears in generated XML |
| 10 | All four promotion IDs appear in generated XML |

---

## 10. Deterministic guarantees

The harness enforces the same prohibitions as the rest of the service:

- **No AI inference** — all validation is deterministic regex / JSON schema
- **No external API calls** — no network I/O of any kind
- **No blueprint mutation** — `extractSASBlueprint` output is never modified
- **No fixture mutation** — fixture files are read-only; temp files for tests
  are written to `logs/runtime/` and gitignored
- **Reproducible output** — same fixture + same blueprint XML → same XML
  artifact, byte-for-byte (modulo timestamps in `generatedAt`)

---

## 11. Adding a new fixture

1. Obtain the blueprint XML and place it under `tests/fixtures/`
2. Create a session input at `fixtures/sas-session-inputs/<campaign>.json`
3. Run in interactive mode to discover the question keys:
   ```bash
   node src/runtime/localHarness.js \
     --mode interactive \
     --input fixtures/sas-session-inputs/<campaign>.json
   ```
   Use `!export` at question 0 to dump the full question queue as JSON.
4. Build the replay fixture at `fixtures/sas-conversation-replays/<campaign>.json`
   using the key list obtained in step 3
5. Verify with scripted mode:
   ```bash
   node src/runtime/localHarness.js \
     --mode scripted \
     --replay fixtures/sas-conversation-replays/<campaign>.json \
     --stop-on-error
   ```
6. Add a test case to `tests/integration/localHarness.test.js`
