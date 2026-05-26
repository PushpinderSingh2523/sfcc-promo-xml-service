'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { STATUS } = require('./updateBlueprintSession');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Determine the next question to present in a clarification session.
 *
 * Question selection priority (deterministic):
 *
 *   1. INVALID fields first — re-ask, in original queue order.
 *      This ensures that a validation failure is surfaced immediately
 *      rather than being buried by advancing to the next question.
 *
 *   2. UNANSWERED fields — in original queue order (GROUP_ORDER → slotIndex → fieldId).
 *
 *   3. null — when no more questions remain (session complete or cancelled).
 *
 * The returned NextQuestion object includes:
 *   - all QueueItem fields (key, fieldId, group, question, etc.)
 *   - validationErrors: error array when the field is being re-asked due to failure
 *   - priorRawValue: the previously-attempted invalid value (only on invalid re-asks)
 *   - isRetry: true when re-asking due to a previous validation failure
 *
 * @param {object} session
 * @returns {object|null} NextQuestion object, or null if no question remains
 */
function getNextQuestion(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  if (
    session.status === STATUS.CANCELLED ||
    session.status === STATUS.COMPLETE  ||
    session.status === STATUS.EXPIRED
  ) {
    return null;
  }

  const { questionQueue, answers, invalidFields } = session;

  // ── Priority 1: invalid fields (re-ask in queue order) ──────────────────
  const invalidItem = questionQueue.find(q => invalidFields[q.key]);
  if (invalidItem) {
    const failure = invalidFields[invalidItem.key];
    return {
      ...invalidItem,
      isRetry:          true,
      validationErrors: failure.errors,
      priorRawValue:    failure.rawValue,
    };
  }

  // ── Priority 2: unanswered fields (queue order) ──────────────────────────
  const unansweredItem = questionQueue.find(q => !answers[q.key]);
  if (unansweredItem) {
    return {
      ...unansweredItem,
      isRetry:          false,
      validationErrors: [],
      priorRawValue:    undefined,
    };
  }

  // ── All fields answered and valid ────────────────────────────────────────
  return null;
}

/**
 * Return all remaining questions (invalid first, then unanswered) in order.
 *
 * Useful for progress displays and bulk-answer flows.
 *
 * @param {object} session
 * @returns {object[]} Array of NextQuestion objects
 */
function getRemainingQuestions(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  if (
    session.status === STATUS.CANCELLED ||
    session.status === STATUS.COMPLETE  ||
    session.status === STATUS.EXPIRED
  ) {
    return [];
  }

  const { questionQueue, answers, invalidFields } = session;
  const result = [];

  // Invalid fields first
  questionQueue
    .filter(q => invalidFields[q.key])
    .forEach(q => {
      const failure = invalidFields[q.key];
      result.push({
        ...q,
        isRetry:          true,
        validationErrors: failure.errors,
        priorRawValue:    failure.rawValue,
      });
    });

  // Unanswered fields
  questionQueue
    .filter(q => !answers[q.key] && !invalidFields[q.key])
    .forEach(q => {
      result.push({
        ...q,
        isRetry:          false,
        validationErrors: [],
        priorRawValue:    undefined,
      });
    });

  return result;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { getNextQuestion, getRemainingQuestions };
