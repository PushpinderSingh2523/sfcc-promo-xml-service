'use strict';

// ─── Teams Session HTTP Routes ─────────────────────────────────────────────────
//
// All session lifecycle endpoints for the Teams / Copilot Studio adapter.
//
// Endpoints:
//   POST /session/start         — start a new SAS session (xml required)
//   POST /session/answer        — submit one field answer
//   POST /session/review        — request review card (no-mutation)
//   POST /session/confirm       — confirm review + generate XML
//   POST /session/cancel        — cancel an active session
//   GET  /session/:id/status    — read session state + resumability
//
// All POST endpoints:
//   - Accept: application/json only
//   - Return: Copilot Studio compatible envelope (wrapForCopilot)
//   - HTTP 200 on success, 400 on business error, 404 on not-found
//
// All routes preserve runtime safety guarantees:
//   - TTL enforcement (SESSION_EXPIRED errors surface as 400)
//   - Transition guards (ANSWER_ON_COMPLETE etc. surface as 400)
//   - Idempotency tokens (duplicate submissions return cached result)
//   - Payload limits (ANSWER_TOO_LONG surfaces as 400)
//
// ──────────────────────────────────────────────────────────────────────────────

const express = require('express');

const { normalizePayload }       = require('../adapters/payloadNormalizer');
const { dispatchAction }         = require('../adapters/actionAdapter');
const { buildHttpResponse }      = require('../adapters/responseAdapter');
const { wrapForCopilot }         = require('../copilot/copilotEnvelope');
const {
  checkResumable,
  generateResumeToken,
}                                = require('../copilot/sessionResume');
const { getSession }             = require('../runtime/sessionStore');
const { buildExpiredSessionCard }   = require('../cards/buildExpiredSessionCard');
const { buildValidationErrorCard }  = require('../cards/buildValidationErrorCard');

const router = express.Router();

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Execute a normalized action, wrap the result, and send the HTTP response.
 *
 * @param {object}   normalizedPayload - Output of normalizePayload()
 * @param {object}   res              - Express response object
 * @param {object}   [options]
 * @param {boolean}  [options.isIdempotent=false]
 */
function executeAndRespond(normalizedPayload, res, options = {}) {
  const actionResult = dispatchAction(normalizedPayload);
  const httpResponse = buildHttpResponse(actionResult, options);

  // Fetch session status for copilot envelope status field
  const sid      = httpResponse.sessionId;
  let   status   = null;
  if (sid) {
    try {
      const session = getSession(sid);
      if (session) status = session.status;
    } catch (_) { /* swallow — status defaults to null → 'in_progress' */ }
  }

  const envelope   = wrapForCopilot(httpResponse, status);
  const httpStatus = httpResponse.success ? 200 : 400;

  return res.status(httpStatus).json(envelope);
}

// ─── POST /session/start ──────────────────────────────────────────────────────

/**
 * Start a new SAS configuration session.
 *
 * Body:
 *   { xml: string, sessionId?: string, createdAt?: string }
 *
 * Returns: Copilot envelope with first-question card.
 */
router.post('/start', (req, res) => {
  const normalized = normalizePayload({
    ...req.body,
    action: 'START_SAS_SESSION',
  });
  return executeAndRespond(normalized, res);
});

// ─── POST /session/answer ─────────────────────────────────────────────────────

/**
 * Submit a single field answer.
 *
 * Body:
 *   {
 *     sessionId: string,
 *     fieldKey: string,
 *     rawAnswer: * | fieldValue: *,   // fieldValue accepted for Copilot Studio
 *     idempotencyToken?: string,
 *   }
 *
 * Returns: Copilot envelope with next card (question | review-warning | completion).
 */
router.post('/answer', (req, res) => {
  const normalized = normalizePayload({
    ...req.body,
    action: 'SUBMIT_ANSWER',
  });
  return executeAndRespond(normalized, res);
});

// ─── POST /session/review ─────────────────────────────────────────────────────

/**
 * Request the current review card (does not change session state).
 *
 * Body:
 *   { sessionId: string }
 *
 * Returns: Copilot envelope with review card.
 */
router.post('/review', (req, res) => {
  const normalized = normalizePayload({
    ...req.body,
    action: 'REQUEST_REVIEW',
  });
  return executeAndRespond(normalized, res);
});

// ─── POST /session/confirm ────────────────────────────────────────────────────

/**
 * Confirm review and generate the XML artifact.
 *
 * Body:
 *   { sessionId: string, confirmedAt?: string }
 *
 * Returns: Copilot envelope with completion card + artifact (when successful).
 */
router.post('/confirm', (req, res) => {
  const normalized = normalizePayload({
    ...req.body,
    action: 'CONFIRM_GENERATION',
  });
  return executeAndRespond(normalized, res);
});

// ─── POST /session/cancel ─────────────────────────────────────────────────────

/**
 * Cancel an active session.
 *
 * Body:
 *   { sessionId: string, cancelledAt?: string }
 *
 * Returns: Copilot envelope with cancellation card.
 */
router.post('/cancel', (req, res) => {
  const normalized = normalizePayload({
    ...req.body,
    action: 'CANCEL_SESSION',
  });
  return executeAndRespond(normalized, res);
});

// ─── GET /session/:id/status ──────────────────────────────────────────────────

/**
 * Read the current state of a session.
 *
 * Returns:
 *   {
 *     version:      '1.0',
 *     status:       lowercase session status string,
 *     sessionId:    string,
 *     session:      { sessionId, blueprintId, status, expiresAt, ... } | null,
 *     resumable:    boolean,
 *     resumeToken:  string | null,
 *     card:         Adaptive Card | null (expired or validation-error card),
 *     error:        string | null,
 *   }
 */
router.get('/:id/status', (req, res) => {
  const sessionId = req.params.id;

  // ── Load session ──────────────────────────────────────────────────────────
  let session;
  try {
    session = getSession(sessionId);
  } catch (err) {
    return res.status(400).json(_statusError(sessionId, err.message));
  }

  if (!session) {
    return res.status(404).json(_statusError(sessionId, `Session "${sessionId}" not found`));
  }

  // ── Resumability ──────────────────────────────────────────────────────────
  const { resumable, reason } = checkResumable(sessionId);
  const resumeToken = resumable ? generateResumeToken(sessionId) : null;

  // ── Contextual card ───────────────────────────────────────────────────────
  let card = null;

  if (session.status === 'EXPIRED') {
    card = buildExpiredSessionCard({
      sessionId:          session.sessionId,
      expiresAt:          session.expiresAt,
      lastInteractionAt:  session.lastInteractionAt,
      answeredFields:     session.answeredFields,
      totalFields:        session.totalFields,
    });
  } else {
    const invalidFields = _flattenInvalidFields(session.invalidFields);
    if (invalidFields.length > 0) {
      card = buildValidationErrorCard({ sessionId: session.sessionId, invalidFields });
    }
  }

  // ── Response ──────────────────────────────────────────────────────────────
  return res.status(200).json({
    version: '1.0',
    status:  session.status.toLowerCase(),
    sessionId,
    session: {
      sessionId:            session.sessionId,
      blueprintId:          session.blueprintId,
      status:               session.status,
      expiresAt:            session.expiresAt      || null,
      lastInteractionAt:    session.lastInteractionAt || null,
      completionPercentage: session.completionPercentage ?? null,
      answeredFields:       session.answeredFields  ?? null,
      totalFields:          session.totalFields     ?? null,
      invalidFieldCount:    _flattenInvalidFields(session.invalidFields).length,
    },
    resumable,
    resumeToken,
    card,
    error: (!resumable && reason) ? reason : null,
  });
});

// ─── Private helpers ──────────────────────────────────────────────────────────

function _statusError(sessionId, error) {
  return {
    version:     '1.0',
    status:      'error',
    sessionId,
    session:     null,
    resumable:   false,
    resumeToken: null,
    card:        null,
    error,
  };
}

function _flattenInvalidFields(invalidFieldsObj) {
  if (!invalidFieldsObj || typeof invalidFieldsObj !== 'object') return [];
  return Object.entries(invalidFieldsObj).map(([key, f]) => ({
    key:     key,
    fieldId: f.fieldId || key,
    label:   f.label   || f.fieldId || key,
    errors:  f.errors  || [],
  }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = router;
