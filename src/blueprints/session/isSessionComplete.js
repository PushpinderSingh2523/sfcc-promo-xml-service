'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { STATUS } = require('./updateBlueprintSession');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Determine whether a session has satisfied all completion conditions.
 *
 * Completion conditions (all must be true):
 *   1. No required fields are unanswered
 *   2. No fields are in an invalid state
 *   3. If reviewRequired is true, reviewConfirmedAt must be set
 *
 * A CANCELLED session is never complete.
 *
 * @param {object} session
 * @returns {{ complete: boolean, reason: string, blockers: string[] }}
 *   complete  — true when the session satisfies all completion conditions
 *   reason    — human-readable summary
 *   blockers  — list of specific reasons why completion is blocked (empty when complete)
 */
function isSessionComplete(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  // Shortcut: already COMPLETE
  if (session.status === STATUS.COMPLETE) {
    return { complete: true, reason: 'Session is COMPLETE', blockers: [] };
  }

  // Cancelled sessions can never complete
  if (session.status === STATUS.CANCELLED) {
    return { complete: false, reason: 'Session has been CANCELLED', blockers: ['Session is cancelled'] };
  }

  const blockers = [];

  // ── Check 1: required fields unanswered ───────────────────────────────────
  const requiredUnanswered = session.questionQueue.filter(q =>
    q.required && !session.answers[q.key]
  );
  if (requiredUnanswered.length > 0) {
    blockers.push(
      `${requiredUnanswered.length} required field${requiredUnanswered.length === 1 ? '' : 's'} not yet answered: ` +
      requiredUnanswered.map(q => q.key).join(', ')
    );
  }

  // ── Check 2: invalid fields ───────────────────────────────────────────────
  const invalidCount = Object.keys(session.invalidFields).length;
  if (invalidCount > 0) {
    blockers.push(
      `${invalidCount} field${invalidCount === 1 ? '' : 's'} failed validation: ` +
      Object.keys(session.invalidFields).join(', ')
    );
  }

  // ── Check 3: review confirmation pending ─────────────────────────────────
  if (session.reviewRequired && !session.reviewConfirmedAt) {
    blockers.push('Replay-safety review has not been confirmed');
  }

  if (blockers.length === 0) {
    return { complete: true, reason: 'All completion conditions met', blockers: [] };
  }

  return {
    complete: false,
    reason:   `Session not complete: ${blockers.length} blocker${blockers.length === 1 ? '' : 's'} remain`,
    blockers,
  };
}

/**
 * Return a progress snapshot of the session.
 *
 * @param {object} session
 * @returns {{
 *   totalQuestions:     number,
 *   answeredQuestions:  number,
 *   invalidQuestions:   number,
 *   requiredUnanswered: number,
 *   completionPercentage: number,
 *   status:             string,
 * }}
 */
function getSessionProgress(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  const totalQuestions     = session.questionQueue.length;
  const answeredQuestions  = Object.keys(session.answers).filter(k => !session.invalidFields[k]).length;
  const invalidQuestions   = Object.keys(session.invalidFields).length;
  const requiredUnanswered = session.questionQueue.filter(q =>
    q.required && (!session.answers[q.key] || session.invalidFields[q.key])
  ).length;

  return {
    totalQuestions,
    answeredQuestions,
    invalidQuestions,
    requiredUnanswered,
    completionPercentage: session.completionPercentage,
    status: session.status,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { isSessionComplete, getSessionProgress };
