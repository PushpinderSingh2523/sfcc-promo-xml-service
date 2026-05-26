'use strict';

// ─── Teams Action Adapter ──────────────────────────────────────────────────────
//
// Maps a normalized payload to the appropriate runtime command.
//
// Responsibilities:
//   - Inject blueprints from blueprintStore for actions that need them
//   - Route START_SAS_SESSION directly to the command handler (bypassing
//     handleTeamsAction) so the blueprint can be captured and persisted
//   - Forward all other actions through handleTeamsAction unchanged
//
// NO business logic here:
//   - Does not validate session state
//   - Does not modify answers
//   - Does not apply presentation logic
//
// ──────────────────────────────────────────────────────────────────────────────

const { handleTeamsAction }          = require('../runtime/handleTeamsAction');
const { startSASSession }            = require('../runtime/commands/startSASSession');
const { getBlueprint, saveBlueprint } = require('./blueprintStore');

// Actions that need an injected blueprint from the store
const BLUEPRINT_REQUIRED = new Set(['SUBMIT_ANSWER', 'CONFIRM_GENERATION', 'CANCEL_SESSION']);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Dispatch a normalized action payload to the runtime, injecting blueprints.
 *
 * @param {object} normalizedPayload - Output of normalizePayload()
 * @returns {object} Standard Teams response shape
 */
function dispatchAction(normalizedPayload) {
  const { action, sessionId, _normalizeError } = normalizedPayload;

  // Surface normalization errors immediately
  if (_normalizeError) {
    return _error('UNKNOWN', _normalizeError, null);
  }

  if (!action) {
    return _error('UNKNOWN', 'action is required', null);
  }

  // ── START_SAS_SESSION: handled directly to capture blueprint ───────────────
  if (action === 'START_SAS_SESSION') {
    return _handleStart(normalizedPayload);
  }

  // ── Blueprint injection for actions that require it ────────────────────────
  if (BLUEPRINT_REQUIRED.has(action)) {
    if (!sessionId) {
      return _error(action, 'sessionId is required', null);
    }

    let blueprint;
    try {
      blueprint = getBlueprint(sessionId);
    } catch (err) {
      return _error(action, `Blueprint store error: ${err.message}`, sessionId);
    }

    if (!blueprint) {
      return _error(
        action,
        `No blueprint found for session "${sessionId}". The session may have expired or the server was restarted.`,
        sessionId,
      );
    }

    return handleTeamsAction({
      action,
      sessionId,
      blueprint,
      fieldKey:         normalizedPayload.fieldKey,
      rawAnswer:        normalizedPayload.rawAnswer,
      idempotencyToken: normalizedPayload.idempotencyToken,
      confirmedAt:      normalizedPayload.confirmedAt,
      cancelledAt:      normalizedPayload.cancelledAt,
    });
  }

  // ── All other actions (REQUEST_REVIEW) ─────────────────────────────────────
  return handleTeamsAction({
    action,
    sessionId,
    fieldKey:    normalizedPayload.fieldKey,
    rawAnswer:   normalizedPayload.rawAnswer,
    confirmedAt: normalizedPayload.confirmedAt,
    cancelledAt: normalizedPayload.cancelledAt,
  });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Handle START_SAS_SESSION by calling the command directly so the blueprint
 * is available after the call and can be persisted to the blueprint store.
 */
function _handleStart(normalizedPayload) {
  const { xml, sessionId, createdAt } = normalizedPayload;

  if (!xml) {
    return _error('START_SAS_SESSION', 'xml is required for START_SAS_SESSION', null);
  }

  try {
    const result = startSASSession({ xml, sessionId, createdAt });

    // Persist the blueprint so subsequent HTTP requests can inject it
    saveBlueprint(result.session.sessionId, result.blueprint);

    return {
      success:   true,
      action:    'START_SAS_SESSION',
      sessionId: result.session.sessionId,
      card:      result.card,
      artifact:  null,
      error:     null,
    };
  } catch (err) {
    return _error('START_SAS_SESSION', err.message, null);
  }
}

/**
 * Build a uniform error response.
 */
function _error(action, error, sessionId) {
  return { success: false, action, sessionId: sessionId || null, card: null, artifact: null, error };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { dispatchAction };
