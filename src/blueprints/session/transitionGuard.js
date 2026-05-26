'use strict';

/**
 * transitionGuard.js
 *
 * Explicit transition matrix for session state operations.
 *
 * Every operation that changes session state must pass through one of the
 * guard functions defined here.  Guards throw descriptive, code-bearing
 * errors for every invalid transition — no silent failures.
 *
 * Transition matrix
 * ─────────────────────────────────────────────────────────────────────────────
 *  Status            collectAnswer  confirmReview  generateXML  cancel  getNext
 * ─────────────────────────────────────────────────────────────────────────────
 *  CREATED             ✓              ✗              ✗           ✓       ✓
 *  IN_PROGRESS         ✓              ✗              ✗           ✓       ✓
 *  VALIDATION_FAILED   ✓              ✗              ✗           ✓       ✓
 *  REVIEW_PENDING      ✓ (re-answer)  ✓              ✗           ✓       ✓
 *  COMPLETE            ✗              ✗              ✓           ✗       ✗ (null)
 *  CANCELLED           ✗              ✗              ✗           ✗ (nop) ✗ (null)
 *  EXPIRED             ✗              ✗              ✗           ✗ (nop) ✗ (null)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Error code constants are exported for `switch` / `instanceof` callers.
 *
 * @module transitionGuard
 */

// ─── Error codes ──────────────────────────────────────────────────────────────

const GUARD_CODES = Object.freeze({
  ANSWER_ON_COMPLETE:          'ANSWER_ON_COMPLETE',
  ANSWER_ON_CANCELLED:         'ANSWER_ON_CANCELLED',
  ANSWER_ON_EXPIRED:           'ANSWER_ON_EXPIRED',
  REVIEW_NOT_PENDING:          'REVIEW_NOT_PENDING',
  REVIEW_ALREADY_CONFIRMED:    'REVIEW_ALREADY_CONFIRMED',
  GENERATE_NOT_COMPLETE:       'GENERATE_NOT_COMPLETE',
  PREMATURE_REVIEW:            'PREMATURE_REVIEW',
});

// ─── Internal ─────────────────────────────────────────────────────────────────

function _guardError(code, message) {
  const err = new Error(message);
  err.code  = code;
  return err;
}

// ─── Guard: collectAnswer ─────────────────────────────────────────────────────

/**
 * Assert that a session is in a state that permits answer collection.
 *
 * Allowed from: CREATED, IN_PROGRESS, VALIDATION_FAILED, REVIEW_PENDING.
 * Blocked from: COMPLETE, CANCELLED, EXPIRED.
 *
 * @param {object} session
 * @throws {Error} with `.code` from GUARD_CODES
 */
function assertCanCollectAnswer(session) {
  const { status } = session;

  if (status === 'COMPLETE') {
    throw _guardError(
      GUARD_CODES.ANSWER_ON_COMPLETE,
      'Cannot collect answers on a COMPLETE session. ' +
      'The session has already been confirmed and XML generated.'
    );
  }
  if (status === 'CANCELLED') {
    throw _guardError(
      GUARD_CODES.ANSWER_ON_CANCELLED,
      'Cannot collect answers on a CANCELLED session. ' +
      'Start a new session to continue.'
    );
  }
  if (status === 'EXPIRED') {
    throw _guardError(
      GUARD_CODES.ANSWER_ON_EXPIRED,
      'Cannot collect answers on an EXPIRED session. ' +
      `The session expired at ${session.expiresAt || '(unknown)'}. ` +
      'Start a new session to continue.'
    );
  }
}

// ─── Guard: confirmReview ─────────────────────────────────────────────────────

/**
 * Assert that a session is in REVIEW_PENDING status and has not already been
 * confirmed.
 *
 * @param {object} session
 * @throws {Error} with `.code` from GUARD_CODES
 */
function assertCanConfirmReview(session) {
  const { status } = session;

  if (status === 'EXPIRED') {
    throw _guardError(
      GUARD_CODES.ANSWER_ON_EXPIRED,
      `Cannot confirm review on an EXPIRED session (expired at ${session.expiresAt || '?'}).`
    );
  }

  if (status !== 'REVIEW_PENDING') {
    // Distinguish double-confirm from wrong-status
    if (status === 'COMPLETE' && session.reviewConfirmedAt) {
      throw _guardError(
        GUARD_CODES.REVIEW_ALREADY_CONFIRMED,
        `Review has already been confirmed (at ${session.reviewConfirmedAt}). ` +
        'Duplicate confirmReview calls are not allowed.'
      );
    }
    throw _guardError(
      GUARD_CODES.REVIEW_NOT_PENDING,
      `confirmReview requires REVIEW_PENDING status; current status is "${status}". ` +
      'All required fields must be answered and at least one replay-critical field ' +
      'must have changed before the review gate activates.'
    );
  }
}

// ─── Guard: generateXML ──────────────────────────────────────────────────────

/**
 * Assert that a session is COMPLETE before XML generation is attempted.
 *
 * This is a soft guard — it returns false rather than throwing, because
 * generateReplaySafeXML already returns a structured failure object.
 *
 * @param {object} session
 * @returns {{ allowed: boolean, code: string|null, reason: string|null }}
 */
function checkCanGenerateXML(session) {
  if (session.status === 'COMPLETE') {
    return { allowed: true, code: null, reason: null };
  }
  return {
    allowed: false,
    code:    GUARD_CODES.GENERATE_NOT_COMPLETE,
    reason:  `XML generation requires COMPLETE session; current status is "${session.status}"`,
  };
}

// ─── Guard: premature review ──────────────────────────────────────────────────

/**
 * Assert that all required fields have been validly answered before the review
 * summary is built for a confirmation request.
 *
 * This does NOT block buildReviewSummary() (which is always readable).
 * It should be called before confirmReview() to catch the case where a
 * caller tries to confirm while required fields remain unanswered.
 *
 * @param {object} session
 * @throws {Error} with code PREMATURE_REVIEW
 */
function assertReviewReady(session) {
  const { questionQueue, answers, invalidFields } = session;
  if (!questionQueue) return; // defensive — no queue means nothing to check

  const unmetRequired = questionQueue.filter(
    q => q.required && (!answers[q.key] || invalidFields[q.key])
  );

  if (unmetRequired.length > 0) {
    const keys = unmetRequired.slice(0, 5).map(q => q.key).join(', ');
    throw _guardError(
      GUARD_CODES.PREMATURE_REVIEW,
      `Cannot confirm review: ${unmetRequired.length} required field(s) are unanswered or invalid. ` +
      `First affected: ${keys}`
    );
  }

  if (Object.keys(invalidFields || {}).length > 0) {
    throw _guardError(
      GUARD_CODES.PREMATURE_REVIEW,
      'Cannot confirm review: session has validation failures. ' +
      'Fix all invalid fields before confirming.'
    );
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  GUARD_CODES,
  assertCanCollectAnswer,
  assertCanConfirmReview,
  checkCanGenerateXML,
  assertReviewReady,
};
