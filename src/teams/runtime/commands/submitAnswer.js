'use strict';

// ─── SUBMIT_ANSWER command handler ────────────────────────────────────────────
//
// Responsibilities:
//   1. Load session from sessionStore
//   2. Load blueprint from caller (passed in options — stateless blueprint ref)
//   3. Call collectAnswer(session, fieldKey, rawAnswer) — orchestration
//   4. Persist the updated session
//   5. Determine the next response card based on updated session status:
//      - VALIDATION_FAILED / IN_PROGRESS → next question card
//      - REVIEW_PENDING                  → warning card
//      - COMPLETE (no warnings)          → completion card
//      - CANCELLED                       → error (should not occur via this path)
//
// Non-negotiables:
//   - Teams layer NEVER directly mutates sessions
//   - All state changes go through collectAnswer (orchestration)
//   - Card builders consume presentation objects only
//
// ──────────────────────────────────────────────────────────────────────────────

const { collectAnswer }              = require('../../../blueprints/session/collectAnswer');
const { getNextQuestion }            = require('../../../blueprints/session/getNextQuestion');
const { buildReviewSummary }         = require('../../../blueprints/session/buildReviewSummary');
const { STATUS }                     = require('../../../blueprints/session/updateBlueprintSession');
const { buildQuestionPresentation }  = require('../../../presentation/adapters/buildQuestionPresentation');
const { buildReplayWarningPresentation } = require('../../../presentation/adapters/buildReplayWarningPresentation');
const { buildReviewPresentation }    = require('../../../presentation/adapters/buildReviewPresentation');
const { buildCompletionPresentation } = require('../../../presentation/adapters/buildCompletionPresentation');
const { buildQuestionCard }          = require('../../cards/buildQuestionCard');
const { buildWarningCard }           = require('../../cards/buildWarningCard');
const { buildReviewCard }            = require('../../cards/buildReviewCard');
const { buildCompletionCard }        = require('../../cards/buildCompletionCard');
const { getSession, saveSession }    = require('../sessionStore');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Handle the SUBMIT_ANSWER action.
 *
 * @param {object} options
 * @param {string} options.sessionId  - Session to update
 * @param {object} options.blueprint  - Blueprint the session was started from
 * @param {string} options.fieldKey   - Answer key (from presentation.key)
 * @param {*}      options.rawAnswer  - Raw answer value from the user
 * @param {string} [options.answeredAt] - ISO-8601 timestamp override (for testing)
 * @returns {{
 *   session:          object,
 *   validationResult: object,
 *   card:             object,
 * }}
 */
function submitAnswer({ sessionId, blueprint, fieldKey, rawAnswer, answeredAt } = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }
  if (!fieldKey || typeof fieldKey !== 'string') {
    throw new Error('fieldKey must be a non-empty string');
  }

  // ── Step 1: Load current session ───────────────────────────────────────────
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found in store`);
  }

  // ── Step 2: Collect answer via orchestration ────────────────────────────────
  const { session: updatedSession, validationResult } = collectAnswer(
    session, fieldKey, rawAnswer, { answeredAt }
  );

  // ── Step 3: Persist updated session ────────────────────────────────────────
  saveSession(updatedSession);

  // ── Step 4: Determine next card based on status ────────────────────────────
  const card = buildNextCard(updatedSession, blueprint);

  return { session: updatedSession, validationResult, card };
}

/**
 * Determine the appropriate response card for the current session state.
 *
 * Priority:
 *   1. If REVIEW_PENDING → warning card (replay warnings need acknowledgement)
 *   2. If COMPLETE       → completion card
 *   3. Otherwise         → next question card (handles VALIDATION_FAILED / IN_PROGRESS)
 *
 * @param {object} session
 * @param {object} blueprint
 * @returns {object} Adaptive Card
 */
function buildNextCard(session, blueprint) {
  if (session.status === STATUS.REVIEW_PENDING) {
    const warningPresentation = buildReplayWarningPresentation(session.replaySafetyWarnings || []);
    return buildWarningCard(warningPresentation);
  }

  if (session.status === STATUS.COMPLETE) {
    const completionPresentation = buildCompletionPresentation(session, blueprint);
    return buildCompletionCard(completionPresentation);
  }

  // VALIDATION_FAILED, IN_PROGRESS, CREATED
  const nextQuestion = getNextQuestion(session);
  if (nextQuestion) {
    const presentation = buildQuestionPresentation(nextQuestion, session);
    return buildQuestionCard(presentation);
  }

  // Fallback: session should not reach here without a question
  // Return a completion card — the orchestrator's COMPLETE transition should have fired
  const completionPresentation = buildCompletionPresentation(session, blueprint);
  return buildCompletionCard(completionPresentation);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { submitAnswer, _internals: { buildNextCard } };
