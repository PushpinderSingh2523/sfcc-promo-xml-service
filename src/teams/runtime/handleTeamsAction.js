'use strict';

// ─── Teams Runtime Router ─────────────────────────────────────────────────────
//
// Single entry point for all Teams/Copilot action payloads.
//
// Responsibilities:
//   - Validate the incoming action payload
//   - Route to the appropriate command handler
//   - Invoke presentation adapters and card builders (via command handlers)
//   - Return a uniform Teams response object
//
// Supported actions:
//   START_SAS_SESSION    — start a new SAS blueprint session
//   SUBMIT_ANSWER        — submit one field answer
//   REQUEST_REVIEW       — request the current before/after review card
//   CONFIRM_GENERATION   — confirm review + generate XML artifact
//   CANCEL_SESSION       — cancel the active session
//
// Non-negotiables:
//   - Teams runtime NEVER directly mutates sessions
//   - All orchestration calls go through command handlers
//   - Card builders consume presentation objects only
//   - Errors return success:false with an error string (no exceptions propagate)
//
// Response shape:
//   {
//     success:   boolean,
//     action:    string,
//     sessionId: string | null,
//     card:      object | null,   // Adaptive Card v1.5
//     artifact:  object | null,   // XML artifact (only from CONFIRM_GENERATION)
//     error:     string | null,
//   }
//
// ──────────────────────────────────────────────────────────────────────────────

const { startSASSession }    = require('./commands/startSASSession');
const { submitAnswer }       = require('./commands/submitAnswer');
const { requestReview }      = require('./commands/requestReview');
const { confirmGeneration }  = require('./commands/confirmGeneration');
const { cancelSession }      = require('./commands/cancelSession');

// ─── Supported actions ────────────────────────────────────────────────────────

const ACTIONS = Object.freeze({
  START_SAS_SESSION:   'START_SAS_SESSION',
  SUBMIT_ANSWER:       'SUBMIT_ANSWER',
  REQUEST_REVIEW:      'REQUEST_REVIEW',
  CONFIRM_GENERATION:  'CONFIRM_GENERATION',
  CANCEL_SESSION:      'CANCEL_SESSION',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a uniform error response.
 *
 * @param {string} action
 * @param {string} error
 * @param {string|null} sessionId
 * @returns {object}
 */
function errorResponse(action, error, sessionId = null) {
  return { success: false, action, sessionId, card: null, artifact: null, error };
}

/**
 * Build a uniform success response.
 *
 * @param {string} action
 * @param {string|null} sessionId
 * @param {object} card
 * @param {object|null} artifact
 * @returns {object}
 */
function successResponse(action, sessionId, card, artifact = null) {
  return { success: true, action, sessionId, card, artifact, error: null };
}

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Route an incoming Teams action payload to the appropriate command handler.
 *
 * @param {object} payload
 * @param {string} payload.action      - One of the ACTIONS constants
 * @param {string} [payload.sessionId] - Required for all actions except START_SAS_SESSION
 * @param {object} [payload.blueprint] - Required for SUBMIT_ANSWER, CONFIRM_GENERATION, CANCEL_SESSION
 * @param {string} [payload.xml]       - Required for START_SAS_SESSION
 * @param {string} [payload.fieldKey]  - Required for SUBMIT_ANSWER
 * @param {*}      [payload.rawAnswer] - Required for SUBMIT_ANSWER
 * @returns {object} Teams response object
 */
function handleTeamsAction(payload) {
  if (!payload || typeof payload !== 'object') {
    return errorResponse('UNKNOWN', 'payload must be a non-null object', null);
  }

  const { action } = payload;

  if (!action || typeof action !== 'string') {
    return errorResponse('UNKNOWN', 'payload.action must be a non-empty string', null);
  }

  if (!ACTIONS[action]) {
    return errorResponse(action, `Unsupported action: "${action}"`, payload.sessionId || null);
  }

  // ── Route to command handler ───────────────────────────────────────────────
  try {
    switch (action) {

      case ACTIONS.START_SAS_SESSION: {
        const { xml, sessionId, createdAt } = payload;
        const result = startSASSession({ xml, sessionId, createdAt });
        return successResponse(action, result.session.sessionId, result.card);
      }

      case ACTIONS.SUBMIT_ANSWER: {
        const { sessionId, blueprint, fieldKey, rawAnswer, answeredAt } = payload;
        if (!sessionId) return errorResponse(action, 'payload.sessionId is required', null);
        if (!blueprint) return errorResponse(action, 'payload.blueprint is required', sessionId);
        if (!fieldKey)  return errorResponse(action, 'payload.fieldKey is required', sessionId);
        const result = submitAnswer({ sessionId, blueprint, fieldKey, rawAnswer, answeredAt });
        return successResponse(action, result.session.sessionId, result.card);
      }

      case ACTIONS.REQUEST_REVIEW: {
        const { sessionId } = payload;
        if (!sessionId) return errorResponse(action, 'payload.sessionId is required', null);
        const result = requestReview({ sessionId });
        return successResponse(action, result.session.sessionId, result.card);
      }

      case ACTIONS.CONFIRM_GENERATION: {
        const { sessionId, blueprint, confirmedAt } = payload;
        if (!sessionId) return errorResponse(action, 'payload.sessionId is required', null);
        if (!blueprint) return errorResponse(action, 'payload.blueprint is required', sessionId);
        const result = confirmGeneration({ sessionId, blueprint, confirmedAt });
        return successResponse(action, result.session.sessionId, result.card, result.artifact);
      }

      case ACTIONS.CANCEL_SESSION: {
        const { sessionId, blueprint, cancelledAt } = payload;
        if (!sessionId) return errorResponse(action, 'payload.sessionId is required', null);
        if (!blueprint) return errorResponse(action, 'payload.blueprint is required', sessionId);
        const result = cancelSession({ sessionId, blueprint, cancelledAt });
        return successResponse(action, result.session.sessionId, result.card);
      }

      default:
        // Should not reach here given the ACTIONS guard above
        return errorResponse(action, `Unhandled action: "${action}"`, payload.sessionId || null);
    }

  } catch (err) {
    return errorResponse(action, err.message, payload.sessionId || null);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { handleTeamsAction, ACTIONS };
