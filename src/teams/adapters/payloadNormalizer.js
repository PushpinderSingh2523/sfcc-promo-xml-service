'use strict';

// ─── Teams / Copilot Studio Payload Normalizer ────────────────────────────────
//
// Converts incoming HTTP bodies from any supported format into the canonical
// Teams action payload shape consumed by dispatchAction().
//
// Supported input formats:
//
//   1. Direct API format (automated tests, direct API callers):
//      { action, sessionId, xml, fieldKey, rawAnswer, idempotencyToken, ... }
//
//   2. Copilot Studio / PVA Action.Submit format:
//      { action, sessionId, fieldKey, fieldValue }  ← fieldValue → rawAnswer
//
//   3. Bot Framework activity wrapper (for future Bot Framework integration):
//      { type: "message" | "invoke", value: { action, sessionId, ... } }
//
// The normalizer is purely a data mapper:
//   - It never validates business rules
//   - It never loads sessions or blueprints
//   - It never throws (returns _normalizeError on bad input)
//
// Output shape (canonical):
// {
//   action:           string|null,
//   sessionId:        string|null,
//   xml:              string|null,
//   fieldKey:         string|null,
//   rawAnswer:        *,
//   idempotencyToken: string|null,
//   confirmedAt:      string|null,
//   cancelledAt:      string|null,
//   createdAt:        string|null,
//   _normalizeError:  string|null,
// }
//
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Normalize an incoming payload to canonical Teams action format.
 *
 * @param {*} raw - The raw request body (any type)
 * @returns {object} Canonical payload
 */
function normalizePayload(raw) {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return _blank({ _normalizeError: 'payload must be a non-null object' });
  }

  // ── Unwrap Bot Framework activity wrapper ──────────────────────────────────
  // { type: "message"|"invoke", value: { ... } }
  const isActivity = (raw.type === 'message' || raw.type === 'invoke')
    && raw.value && typeof raw.value === 'object';
  const body = isActivity ? raw.value : raw;

  // ── action — check unwrapped body first, then fall back to outer body
  // This covers the case where a route injects action: 'SUBMIT_ANSWER' at the
  // outer level while the Bot Framework wraps the user payload in body.value.
  const action = (typeof body.action === 'string' && body.action.trim())
    ? body.action.trim()
    : (isActivity && typeof raw.action === 'string' && raw.action.trim())
    ? raw.action.trim()
    : null;

  // ── sessionId — accept sessionId or conversationId (Copilot Studio fallback)
  const sessionId = (typeof body.sessionId === 'string' && body.sessionId.trim())
    ? body.sessionId.trim()
    : (typeof body.conversationId === 'string' && body.conversationId.trim())
    ? body.conversationId.trim()
    : null;

  // ── rawAnswer — accept rawAnswer or fieldValue (Copilot Studio uses fieldValue)
  let rawAnswer;
  if (body.rawAnswer !== undefined) {
    rawAnswer = body.rawAnswer;
  } else if (body.fieldValue !== undefined) {
    rawAnswer = body.fieldValue;
  } else {
    rawAnswer = null;
  }

  // ── xml — must be a string (for START_SAS_SESSION)
  const xml = (typeof body.xml === 'string' && body.xml.trim())
    ? body.xml
    : null;

  // ── fieldKey — question key for SUBMIT_ANSWER
  const fieldKey = (typeof body.fieldKey === 'string' && body.fieldKey.trim())
    ? body.fieldKey.trim()
    : null;

  // ── idempotencyToken — optional deduplication key
  const idempotencyToken = (typeof body.idempotencyToken === 'string' && body.idempotencyToken.trim())
    ? body.idempotencyToken.trim()
    : null;

  // ── timestamps ─────────────────────────────────────────────────────────────
  const confirmedAt = (typeof body.confirmedAt === 'string') ? body.confirmedAt : null;
  const cancelledAt = (typeof body.cancelledAt === 'string') ? body.cancelledAt : null;
  const createdAt   = (typeof body.createdAt   === 'string') ? body.createdAt   : null;

  return {
    action,
    sessionId,
    xml,
    fieldKey,
    rawAnswer,
    idempotencyToken,
    confirmedAt,
    cancelledAt,
    createdAt,
    _normalizeError: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _blank(overrides) {
  return {
    action:           null,
    sessionId:        null,
    xml:              null,
    fieldKey:         null,
    rawAnswer:        null,
    idempotencyToken: null,
    confirmedAt:      null,
    cancelledAt:      null,
    createdAt:        null,
    _normalizeError:  null,
    ...overrides,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { normalizePayload };
