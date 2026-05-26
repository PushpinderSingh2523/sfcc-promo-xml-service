'use strict';

// ─── CANCEL_SESSION command handler ───────────────────────────────────────────
//
// Responsibilities:
//   1. Load session from sessionStore
//   2. Call cancelSession (orchestration) to transition to CANCELLED
//   3. Persist the cancelled session
//   4. Return a completion card showing the cancellation state
//
// Notes:
//   - Calling CANCEL_SESSION on an already-cancelled session is a safe no-op
//   - No XML is generated
//   - Session record is preserved (not deleted) for audit
//
// ──────────────────────────────────────────────────────────────────────────────

const { cancelSession: orchestrateCancelSession } = require('../../../blueprints/session/collectAnswer');
const { buildCompletionPresentation }             = require('../../../presentation/adapters/buildCompletionPresentation');
const { buildCompletionCard }                     = require('../../cards/buildCompletionCard');
const { getSession, saveSession }                 = require('../sessionStore');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Handle the CANCEL_SESSION action.
 *
 * @param {object} options
 * @param {string} options.sessionId    - Session to cancel
 * @param {object} options.blueprint    - Blueprint (needed for completion presentation)
 * @param {string} [options.cancelledAt] - ISO-8601 timestamp override (for testing)
 * @returns {{
 *   session: object,
 *   card:    object,
 * }}
 */
function cancelSession({ sessionId, blueprint, cancelledAt } = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }

  // ── Step 1: Load session ───────────────────────────────────────────────────
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found in store`);
  }

  // ── Step 2: Cancel via orchestration ──────────────────────────────────────
  const cancelledSession = orchestrateCancelSession(session, { cancelledAt });

  // ── Step 3: Persist cancelled session ────────────────────────────────────
  saveSession(cancelledSession);

  // ── Step 4: Build card showing cancelled state ───────────────────────────
  const completionPresentation = buildCompletionPresentation(cancelledSession, blueprint);
  const card = buildCompletionCard(completionPresentation);

  return { session: cancelledSession, card };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { cancelSession };
