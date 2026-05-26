'use strict';

/**
 * transitionGuard.test.js — Unit tests for Req 4 (Invalid transition protection)
 */

const {
  GUARD_CODES,
  assertCanCollectAnswer,
  assertCanConfirmReview,
  checkCanGenerateXML,
  assertReviewReady,
} = require('../../src/blueprints/session/transitionGuard');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(status, extra = {}) {
  return { status, questionQueue: [], answers: {}, invalidFields: {}, ...extra };
}

function qi(key, required = true) {
  return { key, required, fieldId: key };
}

// ─── assertCanCollectAnswer ───────────────────────────────────────────────────

describe('assertCanCollectAnswer', () => {
  const allowedStatuses = ['CREATED', 'IN_PROGRESS', 'VALIDATION_FAILED', 'REVIEW_PENDING'];
  allowedStatuses.forEach(status => {
    test(`allows status: ${status}`, () => {
      expect(() => assertCanCollectAnswer(makeSession(status))).not.toThrow();
    });
  });

  test('throws ANSWER_ON_COMPLETE for COMPLETE sessions', () => {
    let err;
    try { assertCanCollectAnswer(makeSession('COMPLETE')); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.code).toBe(GUARD_CODES.ANSWER_ON_COMPLETE);
    expect(err.message).toMatch(/COMPLETE/);
  });

  test('throws ANSWER_ON_CANCELLED for CANCELLED sessions', () => {
    let err;
    try { assertCanCollectAnswer(makeSession('CANCELLED')); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.ANSWER_ON_CANCELLED);
  });

  test('throws ANSWER_ON_EXPIRED for EXPIRED sessions', () => {
    const session = makeSession('EXPIRED', { expiresAt: '2020-01-01T00:00:00.000Z' });
    let err;
    try { assertCanCollectAnswer(session); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.ANSWER_ON_EXPIRED);
    expect(err.message).toMatch(/EXPIRED|expired/i);
  });
});

// ─── assertCanConfirmReview ───────────────────────────────────────────────────

describe('assertCanConfirmReview', () => {
  test('allows REVIEW_PENDING', () => {
    expect(() => assertCanConfirmReview(makeSession('REVIEW_PENDING'))).not.toThrow();
  });

  test('throws REVIEW_NOT_PENDING for CREATED', () => {
    let err;
    try { assertCanConfirmReview(makeSession('CREATED')); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.REVIEW_NOT_PENDING);
  });

  test('throws REVIEW_NOT_PENDING for IN_PROGRESS', () => {
    let err;
    try { assertCanConfirmReview(makeSession('IN_PROGRESS')); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.REVIEW_NOT_PENDING);
  });

  test('throws REVIEW_ALREADY_CONFIRMED for COMPLETE with reviewConfirmedAt', () => {
    const session = makeSession('COMPLETE', { reviewConfirmedAt: '2026-01-01T00:00:00.000Z' });
    let err;
    try { assertCanConfirmReview(session); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.REVIEW_ALREADY_CONFIRMED);
    expect(err.message).toMatch(/already been confirmed/i);
  });

  test('throws ANSWER_ON_EXPIRED for EXPIRED sessions', () => {
    const session = makeSession('EXPIRED', { expiresAt: '2020-01-01T00:00:00.000Z' });
    let err;
    try { assertCanConfirmReview(session); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.ANSWER_ON_EXPIRED);
  });
});

// ─── checkCanGenerateXML ──────────────────────────────────────────────────────

describe('checkCanGenerateXML', () => {
  test('returns allowed:true for COMPLETE', () => {
    const r = checkCanGenerateXML(makeSession('COMPLETE'));
    expect(r.allowed).toBe(true);
    expect(r.code).toBeNull();
  });

  const blockedStatuses = ['CREATED', 'IN_PROGRESS', 'VALIDATION_FAILED', 'REVIEW_PENDING', 'CANCELLED', 'EXPIRED'];
  blockedStatuses.forEach(status => {
    test(`returns allowed:false for ${status}`, () => {
      const r = checkCanGenerateXML(makeSession(status));
      expect(r.allowed).toBe(false);
      expect(r.code).toBe(GUARD_CODES.GENERATE_NOT_COMPLETE);
      expect(r.reason).toMatch(status);
    });
  });
});

// ─── assertReviewReady ────────────────────────────────────────────────────────

describe('assertReviewReady', () => {
  test('does not throw when all required fields are answered and no invalids', () => {
    const session = makeSession('REVIEW_PENDING', {
      questionQueue: [qi('k1'), qi('k2', false)],
      answers:       { k1: { normalizedValue: 'v' } },
      invalidFields: {},
    });
    expect(() => assertReviewReady(session)).not.toThrow();
  });

  test('throws PREMATURE_REVIEW when a required field is unanswered', () => {
    const session = makeSession('REVIEW_PENDING', {
      questionQueue: [qi('k1'), qi('k2')],
      answers:       { k1: { normalizedValue: 'v' } },  // k2 missing
      invalidFields: {},
    });
    let err;
    try { assertReviewReady(session); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.PREMATURE_REVIEW);
    expect(err.message).toMatch(/k2/);
  });

  test('throws PREMATURE_REVIEW when invalidFields is non-empty', () => {
    const session = makeSession('REVIEW_PENDING', {
      questionQueue: [qi('k1')],
      answers:       { k1: { normalizedValue: 'v' } },
      invalidFields: { k1: { errors: ['bad'] } },
    });
    let err;
    try { assertReviewReady(session); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.PREMATURE_REVIEW);
  });

  test('does not throw when questionQueue is absent (defensive)', () => {
    const session = { status: 'REVIEW_PENDING', answers: {}, invalidFields: {} };
    expect(() => assertReviewReady(session)).not.toThrow();
  });

  test('optional fields do not block review readiness', () => {
    const session = makeSession('REVIEW_PENDING', {
      questionQueue: [qi('k1', true), qi('k2', false)],
      answers:       { k1: { normalizedValue: 'v' } }, // k2 optional, unanswered — OK
      invalidFields: {},
    });
    expect(() => assertReviewReady(session)).not.toThrow();
  });
});

// ─── GUARD_CODES completeness ─────────────────────────────────────────────────

describe('GUARD_CODES', () => {
  test('is a frozen object', () => {
    expect(() => { GUARD_CODES.NEW_CODE = 'X'; }).toThrow();
  });

  test('contains all expected code constants', () => {
    const expected = [
      'ANSWER_ON_COMPLETE', 'ANSWER_ON_CANCELLED', 'ANSWER_ON_EXPIRED',
      'REVIEW_NOT_PENDING', 'REVIEW_ALREADY_CONFIRMED',
      'GENERATE_NOT_COMPLETE', 'PREMATURE_REVIEW',
    ];
    expected.forEach(c => expect(GUARD_CODES).toHaveProperty(c));
  });
});
