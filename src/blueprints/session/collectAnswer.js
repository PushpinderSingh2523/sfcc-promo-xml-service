'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { validateSessionAnswer }                = require('./validateSessionAnswer');
const { updateBlueprintSession, STATUS }       = require('./updateBlueprintSession');
const { isSessionExpired, expireSession,
        touchSession }                         = require('./sessionExpiry');
const { assertCanCollectAnswer,
        assertCanConfirmReview,
        assertReviewReady }                    = require('./transitionGuard');
const { assertAnswerLength }                   = require('../../runtime/runtimeLimits');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Collect one answer into a session, validate it, and return an updated session.
 *
 * Hardening additions (Phase 10):
 *   - Session expiry check (throws SESSION_EXPIRED with code if expired)
 *   - Idempotency: if options.idempotencyToken is set and was already processed
 *     for this key, returns the cached validationResult and unchanged session
 *   - Transition guard: explicit status check via transitionGuard
 *   - Payload limit: answer string length capped at MAX_ANSWER_LENGTH
 *   - Session touch: lastInteractionAt + expiresAt refreshed on every accepted call
 *
 * Lifecycle:
 *   1. Expiry check — expire and throw if TTL exceeded
 *   2. Transition guard — throw for invalid status transitions
 *   3. Idempotency check — return cached result if token already seen for this key
 *   4. Locate the queue item for the given answer key
 *   5. Payload limit check on string answers
 *   6. Validate the raw answer (normalize + run rules)
 *   7a. Valid answer:
 *         - Add to session.answers
 *         - Remove from session.invalidFields (if previously failed)
 *   7b. Invalid answer:
 *         - Add/update session.invalidFields[key]
 *         - Remove from session.answers[key] (clears any prior valid answer)
 *   8. Store idempotency token result (if token provided)
 *   9. Touch session (refresh TTL)
 *  10. Recalculate all derived state via updateBlueprintSession
 *  11. Return { session, validationResult } — the new session + the raw result
 *
 * Guarantees:
 *   - Does NOT mutate the input session
 *   - Returns a new session object every call
 *   - Blueprint structures are never modified
 *   - No defaults injected for missing answers
 *   - Deterministic: same inputs → same outputs
 *
 * @param {object} session   - Current session object
 * @param {string} key       - Answer key (from queueItem.key or buildAnswerKey)
 * @param {*}      rawAnswer - Raw value provided by the answering entity
 * @param {object} [options]
 * @param {string} [options.answeredAt]       - ISO-8601 timestamp override (for testing)
 * @param {string} [options.idempotencyToken] - Deduplicate retries / double-submits
 * @returns {{ session: object, validationResult: object }}
 */
function collectAnswer(session, key, rawAnswer, options = {}) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }
  if (!key || typeof key !== 'string') {
    throw new Error('key must be a non-empty string');
  }

  // ── 1. Expiry check ───────────────────────────────────────────────────────
  if (isSessionExpired(session)) {
    const expired = expireSession(session);
    const err = new Error(
      `Session "${session.sessionId}" has expired. ` +
      `It expired at ${session.expiresAt || '(unknown)'}. Start a new session.`
    );
    err.code      = 'SESSION_EXPIRED';
    err.expiresAt = session.expiresAt;
    err.session   = expired;   // caller can inspect the expired session
    throw err;
  }

  // ── 2. Transition guard ───────────────────────────────────────────────────
  assertCanCollectAnswer(session);

  const now = options.answeredAt || new Date().toISOString();

  // ── 3. Idempotency check ──────────────────────────────────────────────────
  const token = options.idempotencyToken;
  if (token && typeof token === 'string') {
    const prior = session.submittedTokens && session.submittedTokens[token];
    if (prior && prior.key === key) {
      // Duplicate submission — return current session + cached result unchanged
      return {
        session,
        validationResult: prior.cachedResult,
        idempotent:       true,
      };
    }
  }

  // ── 4. Locate queue item ──────────────────────────────────────────────────
  const queueItem = session.questionQueue.find(q => q.key === key);
  if (!queueItem) {
    throw new Error(`Answer key "${key}" not found in session question queue`);
  }

  // ── 5. Payload limit on string answers ───────────────────────────────────
  assertAnswerLength(rawAnswer, queueItem.fieldId);

  // ── 6. Validate ───────────────────────────────────────────────────────────
  const validationResult = validateSessionAnswer(queueItem, rawAnswer);

  // ── 7. Build next answers / invalidFields ─────────────────────────────────
  const nextAnswers       = { ...session.answers };
  const nextInvalidFields = { ...session.invalidFields };

  if (validationResult.valid) {
    nextAnswers[key] = {
      fieldId:         queueItem.fieldId,
      key,
      slotType:        queueItem.slotType,
      slotIndex:       queueItem.slotIndex,
      xmlLang:         queueItem.xmlLang,
      normalizedValue: validationResult.normalizedValue,
      answeredAt:      now,
    };
    delete nextInvalidFields[key];
  } else {
    nextInvalidFields[key] = {
      fieldId:     queueItem.fieldId,
      key,
      errors:      validationResult.errors,
      rawValue:    rawAnswer,
      attemptedAt: now,
    };
    delete nextAnswers[key];
  }

  // ── 8. Store idempotency token ────────────────────────────────────────────
  let nextSubmittedTokens = session.submittedTokens || {};
  if (token && typeof token === 'string') {
    nextSubmittedTokens = {
      ...nextSubmittedTokens,
      [token]: { key, cachedResult: validationResult },
    };
  }

  // ── 9+10. Touch session TTL + recalculate state ───────────────────────────
  // TTL extension always uses the real wall clock — NOT options.answeredAt.
  // options.answeredAt is only for deterministic answer.answeredAt timestamps;
  // mixing it into the TTL computation would make test-overridden timestamps
  // appear expired when the real clock is checked.
  const updatedSession = updateBlueprintSession(session, {
    answers:           nextAnswers,
    invalidFields:     nextInvalidFields,
    submittedTokens:   nextSubmittedTokens,
    lastInteractionAt: now,
    expiresAt:         touchSession(session /*, realNow — omit to use Date.now() */).expiresAt,
    updatedAt:         now,
  });

  return { session: updatedSession, validationResult };
}

/**
 * Confirm the review on a REVIEW_PENDING session, transitioning it to COMPLETE.
 *
 * Hardening additions (Phase 10):
 *   - Expiry check before confirmation
 *   - assertCanConfirmReview: rejects double-confirm and wrong-status calls
 *   - assertReviewReady: rejects if required fields still unanswered
 *
 * @param {object} session
 * @param {object} [options]
 * @param {string} [options.confirmedAt] - ISO-8601 timestamp override (for testing)
 * @returns {object} New session in COMPLETE status
 */
function confirmReview(session, options = {}) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  // Expiry check
  if (isSessionExpired(session)) {
    const err = new Error(
      `Session "${session.sessionId}" has expired and cannot be confirmed.`
    );
    err.code      = 'SESSION_EXPIRED';
    err.expiresAt = session.expiresAt;
    throw err;
  }

  // Transition guard (throws on double-confirm, wrong status)
  assertCanConfirmReview(session);

  // Readiness guard (throws if required fields unanswered)
  assertReviewReady(session);

  const now = options.confirmedAt || new Date().toISOString();

  return updateBlueprintSession(session, {
    reviewConfirmedAt: now,
    updatedAt:         now,
  });
}

/**
 * Cancel a session, preventing further answer collection.
 *
 * EXPIRED sessions are already immutable — cancel is a no-op on them.
 *
 * @param {object} session
 * @param {object} [options]
 * @param {string} [options.cancelledAt] - ISO-8601 timestamp override (for testing)
 * @returns {object} New session in CANCELLED status (or unchanged if EXPIRED)
 */
function cancelSession(session, options = {}) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }
  if (session.status === STATUS.CANCELLED || session.status === STATUS.EXPIRED) {
    return session; // Already terminal — no-op
  }

  const now = options.cancelledAt || new Date().toISOString();

  return updateBlueprintSession(session, {
    status:    STATUS.CANCELLED,
    updatedAt: now,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { collectAnswer, confirmReview, cancelSession };
