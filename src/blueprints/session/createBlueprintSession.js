'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { buildQuestionQueue }             = require('./buildQuestionQueue');
const { updateBlueprintSession, STATUS } = require('./updateBlueprintSession');
const { GROUP_ORDER }                    = require('../fieldRegistry/sasEditableFieldRegistry');
const { buildExpiresAt }                 = require('./sessionExpiry');
const { assertQueueSize }                = require('../../runtime/runtimeLimits');

// ─── Validation ───────────────────────────────────────────────────────────────

function validateBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }
  if (!blueprint.campaignSlot) {
    throw new Error('blueprint.campaignSlot is required');
  }
  if (!Array.isArray(blueprint.promotionSlots) || blueprint.promotionSlots.length === 0) {
    throw new Error('blueprint.promotionSlots must be a non-empty array');
  }
  if (!Array.isArray(blueprint.assignmentSlots) || blueprint.assignmentSlots.length === 0) {
    throw new Error('blueprint.assignmentSlots must be a non-empty array');
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new SAS blueprint clarification session.
 *
 * The session is the canonical conversational transaction state for collecting
 * all editable-field answers needed to produce a new-season SAS XML document.
 *
 * Session creation:
 *   1. Validates the blueprint
 *   2. Builds the question queue (deterministic, GROUP_ORDER-ordered)
 *   3. Initialises groupedProgress from queue totals
 *   4. Sets all fields as unanswered
 *   5. Returns a CREATED session with zero answers
 *
 * The question queue is stored inside the session so it can be resumed
 * without re-parsing the original blueprint.
 *
 * @param {object} blueprint - Canonical SAS blueprint record
 * @param {object} [options]
 * @param {string} [options.sessionId]  - Explicit session ID (default: generated)
 * @param {string} [options.createdAt]  - ISO-8601 timestamp override (for testing)
 * @returns {object} New session in CREATED status
 */
function createBlueprintSession(blueprint, options = {}) {
  validateBlueprint(blueprint);

  const now       = options.createdAt || new Date().toISOString();
  const sessionId = options.sessionId || `session-${now}-${blueprint.blueprintId}`;

  const questionQueue = buildQuestionQueue(blueprint);

  // Guard: queue must not exceed the per-session limit
  assertQueueSize(questionQueue.length);

  // Initialise groupedProgress from queue (no answers yet)
  const groupedProgress = {};
  GROUP_ORDER.forEach(g => {
    groupedProgress[g] = { total: 0, answered: 0, complete: false };
  });
  questionQueue.forEach(q => {
    if (groupedProgress[q.group]) groupedProgress[q.group].total += 1;
  });

  // First unanswered group = first group with questions
  const firstGroupWithQuestions = questionQueue.length > 0 ? questionQueue[0].group : null;

  // expiresAt is always computed from the real wall clock (or an explicit
  // override), NOT from options.createdAt.  A createdAt override is used for
  // deterministic testing of session content; it must not accidentally expire
  // sessions in tests that run long after the fixture timestamp.
  const expiresAt = options.expiresAt !== undefined
    ? options.expiresAt
    : buildExpiresAt(new Date());

  const rawSession = {
    sessionId,
    blueprintId:          blueprint.blueprintId,
    createdAt:            now,
    updatedAt:            now,
    lastInteractionAt:    now,
    expiresAt,
    status:               STATUS.CREATED,
    currentGroup:         firstGroupWithQuestions,
    questionQueue,
    groupedProgress,
    completionPercentage: 0,
    answers:              {},
    unansweredFields:     questionQueue.map(q => q.key),
    invalidFields:        {},
    reviewRequired:       false,
    replaySafetyWarnings: [],
    reviewConfirmedAt:    null,
    generatedPayload:     null,
    submittedTokens:      {},
  };

  // Run through updateBlueprintSession to ensure fully consistent derived state
  return updateBlueprintSession(rawSession, { updatedAt: now });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createBlueprintSession };
