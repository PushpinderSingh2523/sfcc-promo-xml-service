'use strict';

// ─── REQUEST_REVIEW command handler ───────────────────────────────────────────
//
// Responsibilities:
//   1. Load session from sessionStore
//   2. Build review summary via buildReviewSummary (orchestration)
//   3. Build review presentation via buildReviewPresentation (presentation adapter)
//   4. Build review card via buildReviewCard
//   5. Return { session, card }
//
// This command does NOT change session state.
// It presents the current before/after state for user confirmation.
//
// Available at any session status — useful for mid-session review snapshots.
//
// ──────────────────────────────────────────────────────────────────────────────

const { buildReviewSummary }      = require('../../../blueprints/session/buildReviewSummary');
const { buildReviewPresentation } = require('../../../presentation/adapters/buildReviewPresentation');
const { buildReviewCard }         = require('../../cards/buildReviewCard');
const { getSession }              = require('../sessionStore');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Handle the REQUEST_REVIEW action.
 *
 * @param {object} options
 * @param {string} options.sessionId - Session to review
 * @returns {{
 *   session: object,
 *   card:    object,
 * }}
 */
function requestReview({ sessionId } = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }

  // ── Step 1: Load current session ───────────────────────────────────────────
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found in store`);
  }

  // ── Step 2: Build review summary (orchestration) ───────────────────────────
  const reviewSummary = buildReviewSummary(session);

  // ── Step 3: Build presentation object ──────────────────────────────────────
  const presentation = buildReviewPresentation(reviewSummary);

  // ── Step 4: Build Adaptive Card ────────────────────────────────────────────
  const card = buildReviewCard(presentation);

  return { session, card };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { requestReview };
