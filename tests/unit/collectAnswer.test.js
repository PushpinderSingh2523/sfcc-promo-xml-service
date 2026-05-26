'use strict';

const { collectAnswer, confirmReview, cancelSession } = require('../../src/blueprints/session/collectAnswer');
const { STATUS }                                      = require('../../src/blueprints/session/updateBlueprintSession');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueueItem(overrides = {}) {
  return {
    key:          'campaignId::campaign::_::_',
    fieldId:      'campaignId',
    slotType:     'campaign',
    slotIndex:    null,
    xmlLang:      null,
    group:        'Campaign',
    label:        'Campaign ID',
    question:     'What is the campaign ID?',
    required:     true,
    currentValue: '2025_SUMMER_SAS',
    validation:   { minLength: 1, maxLength: 100 },
    replayCritical: false,
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  const qi = makeQueueItem();
  return {
    sessionId:            'test-session',
    blueprintId:          'test-bp',
    createdAt:            '2026-01-01T00:00:00.000Z',
    updatedAt:            '2026-01-01T00:00:00.000Z',
    status:               STATUS.CREATED,
    currentGroup:         'Campaign',
    questionQueue:        [qi],
    groupedProgress:      { Campaign: { total: 1, answered: 0, complete: false } },
    completionPercentage: 0,
    answers:              {},
    unansweredFields:     [qi.key],
    invalidFields:        {},
    reviewRequired:       false,
    replaySafetyWarnings: [],
    reviewConfirmedAt:    null,
    generatedPayload:     null,
    ...overrides,
  };
}

const CAMPAIGN_KEY = 'campaignId::campaign::_::_';

// ─── collectAnswer — input validation ─────────────────────────────────────────

describe('collectAnswer — input validation', () => {
  test('throws when session is null', () => {
    expect(() => collectAnswer(null, CAMPAIGN_KEY, 'value')).toThrow('session must be a non-null object');
  });

  test('throws when key is empty string', () => {
    expect(() => collectAnswer(makeSession(), '', 'value')).toThrow('key must be a non-empty string');
  });

  test('throws when key is null', () => {
    expect(() => collectAnswer(makeSession(), null, 'value')).toThrow('key must be a non-empty string');
  });

  test('throws on CANCELLED session', () => {
    const session = makeSession({ status: STATUS.CANCELLED });
    expect(() => collectAnswer(session, CAMPAIGN_KEY, 'value'))
      .toThrow('Cannot collect answers on a CANCELLED session');
  });

  test('throws on COMPLETE session', () => {
    const session = makeSession({ status: STATUS.COMPLETE });
    expect(() => collectAnswer(session, CAMPAIGN_KEY, 'value'))
      .toThrow('Cannot collect answers on a COMPLETE session');
  });

  test('throws when key is not in question queue', () => {
    expect(() => collectAnswer(makeSession(), 'unknown::field::_::_', 'value'))
      .toThrow('Answer key "unknown::field::_::_" not found in session question queue');
  });
});

// ─── collectAnswer — valid answer ─────────────────────────────────────────────

describe('collectAnswer — valid answer', () => {
  let result;

  beforeAll(() => {
    result = collectAnswer(
      makeSession(),
      CAMPAIGN_KEY,
      '2026_SUMMER_SAS',
      { answeredAt: '2026-01-01T00:01:00.000Z' }
    );
  });

  test('returns { session, validationResult }', () => {
    expect(result).toHaveProperty('session');
    expect(result).toHaveProperty('validationResult');
  });

  test('validationResult.valid is true', () => {
    expect(result.validationResult.valid).toBe(true);
  });

  test('answer is stored in session.answers', () => {
    expect(result.session.answers[CAMPAIGN_KEY]).toBeDefined();
    expect(result.session.answers[CAMPAIGN_KEY].normalizedValue).toBe('2026_SUMMER_SAS');
  });

  test('answer record has correct shape', () => {
    const ans = result.session.answers[CAMPAIGN_KEY];
    expect(ans.fieldId).toBe('campaignId');
    expect(ans.key).toBe(CAMPAIGN_KEY);
    expect(ans.slotType).toBe('campaign');
    expect(ans.answeredAt).toBe('2026-01-01T00:01:00.000Z');
  });

  test('key is removed from invalidFields', () => {
    expect(result.session.invalidFields[CAMPAIGN_KEY]).toBeUndefined();
  });

  test('session transitions to COMPLETE (only required question answered)', () => {
    expect(result.session.status).toBe(STATUS.COMPLETE);
  });

  test('does not mutate the input session', () => {
    const session  = makeSession();
    const snapshot = JSON.stringify(session);
    collectAnswer(session, CAMPAIGN_KEY, '2026_SUMMER_SAS');
    expect(JSON.stringify(session)).toBe(snapshot);
  });
});

// ─── collectAnswer — invalid answer ───────────────────────────────────────────

describe('collectAnswer — invalid answer', () => {
  let result;

  beforeAll(() => {
    result = collectAnswer(makeSession(), CAMPAIGN_KEY, '', { answeredAt: '2026-01-01T00:01:00.000Z' });
  });

  test('validationResult.valid is false', () => {
    expect(result.validationResult.valid).toBe(false);
  });

  test('key is stored in invalidFields', () => {
    expect(result.session.invalidFields[CAMPAIGN_KEY]).toBeDefined();
    expect(result.session.invalidFields[CAMPAIGN_KEY].errors.length).toBeGreaterThan(0);
    expect(result.session.invalidFields[CAMPAIGN_KEY].rawValue).toBe('');
    expect(result.session.invalidFields[CAMPAIGN_KEY].attemptedAt).toBe('2026-01-01T00:01:00.000Z');
  });

  test('key is absent from answers', () => {
    expect(result.session.answers[CAMPAIGN_KEY]).toBeUndefined();
  });

  test('status is VALIDATION_FAILED', () => {
    expect(result.session.status).toBe(STATUS.VALIDATION_FAILED);
  });
});

// ─── collectAnswer — retry after failure ──────────────────────────────────────

describe('collectAnswer — retry clears previous invalid entry', () => {
  test('valid answer after invalid clears invalidFields entry', () => {
    // First: invalid answer
    const { session: failedSession } = collectAnswer(makeSession(), CAMPAIGN_KEY, '');
    expect(failedSession.invalidFields[CAMPAIGN_KEY]).toBeDefined();

    // Retry with valid answer
    const { session: retrySession } = collectAnswer(failedSession, CAMPAIGN_KEY, '2026_SUMMER_SAS');
    expect(retrySession.invalidFields[CAMPAIGN_KEY]).toBeUndefined();
    expect(retrySession.answers[CAMPAIGN_KEY].normalizedValue).toBe('2026_SUMMER_SAS');
  });

  test('invalid answer after valid clears the valid answer', () => {
    // Use a two-question session so the first valid answer does not complete the session
    const q1 = makeQueueItem();
    const q2 = makeQueueItem({
      key: 'promotionId::promotion::0::_', fieldId: 'promotionId',
      group: 'Identity', required: true, currentValue: 'TEST_PROMO',
    });
    const twoQSession = makeSession({ questionQueue: [q1, q2] });

    const { session: validSession } = collectAnswer(twoQSession, CAMPAIGN_KEY, '2026_SUMMER_SAS');
    expect(validSession.answers[CAMPAIGN_KEY]).toBeDefined();
    expect(validSession.status).toBe(STATUS.IN_PROGRESS);  // not complete yet

    const { session: failedSession } = collectAnswer(validSession, CAMPAIGN_KEY, '');
    expect(failedSession.answers[CAMPAIGN_KEY]).toBeUndefined();
    expect(failedSession.invalidFields[CAMPAIGN_KEY]).toBeDefined();
  });
});

// ─── collectAnswer — status progression ──────────────────────────────────────

describe('collectAnswer — status progression with multiple questions', () => {
  function makeTwoQuestionSession() {
    const q1 = makeQueueItem(); // required
    const q2 = makeQueueItem({
      key: 'promotionId::promotion::0::_',
      fieldId: 'promotionId',
      group: 'Identity',
      required: true,
      currentValue: 'TEST_PROMO',
    });
    return makeSession({ questionQueue: [q1, q2], status: STATUS.CREATED });
  }

  test('answering first of two required questions → IN_PROGRESS', () => {
    const session = makeTwoQuestionSession();
    const { session: s } = collectAnswer(session, CAMPAIGN_KEY, '2026_SUMMER_SAS');
    expect(s.status).toBe(STATUS.IN_PROGRESS);
  });

  test('answering all required questions → COMPLETE', () => {
    const session = makeTwoQuestionSession();
    const { session: s1 } = collectAnswer(session, CAMPAIGN_KEY, '2026_SUMMER_SAS');
    const { session: s2 } = collectAnswer(s1, 'promotionId::promotion::0::_', '2026_PROMO');
    expect(s2.status).toBe(STATUS.COMPLETE);
  });
});

// ─── confirmReview ────────────────────────────────────────────────────────────

describe('confirmReview', () => {
  function makeReviewPendingSession() {
    // Replay-critical field answered with changed value
    const qi = makeQueueItem({ replayCritical: true, currentValue: '2025_SUMMER_SAS' });
    const base = makeSession({ questionQueue: [qi] });
    const { session } = collectAnswer(base, CAMPAIGN_KEY, '2026_SUMMER_SAS');
    // Status should be REVIEW_PENDING (required met + replay warning)
    return session;
  }

  test('throws when session is not in REVIEW_PENDING status', () => {
    const session = makeSession({ status: STATUS.IN_PROGRESS });
    expect(() => confirmReview(session))
      .toThrow('confirmReview requires REVIEW_PENDING status');
  });

  test('transitions REVIEW_PENDING → COMPLETE', () => {
    const session = makeReviewPendingSession();
    expect(session.status).toBe(STATUS.REVIEW_PENDING);

    const confirmed = confirmReview(session, { confirmedAt: '2026-01-01T00:05:00.000Z' });
    expect(confirmed.status).toBe(STATUS.COMPLETE);
  });

  test('sets reviewConfirmedAt', () => {
    const session   = makeReviewPendingSession();
    const confirmed = confirmReview(session, { confirmedAt: '2026-01-01T00:05:00.000Z' });
    expect(confirmed.reviewConfirmedAt).toBe('2026-01-01T00:05:00.000Z');
  });

  test('does not mutate the input session', () => {
    const session  = makeReviewPendingSession();
    const snapshot = JSON.stringify(session);
    confirmReview(session, { confirmedAt: '2026-01-01T00:05:00.000Z' });
    expect(JSON.stringify(session)).toBe(snapshot);
  });
});

// ─── cancelSession ────────────────────────────────────────────────────────────

describe('cancelSession', () => {
  test('throws when session is null', () => {
    expect(() => cancelSession(null)).toThrow('session must be a non-null object');
  });

  test('transitions any status → CANCELLED', () => {
    const session   = makeSession({ status: STATUS.IN_PROGRESS });
    const cancelled = cancelSession(session, { cancelledAt: '2026-01-01T00:10:00.000Z' });
    expect(cancelled.status).toBe(STATUS.CANCELLED);
  });

  test('already CANCELLED → no-op (returns same session)', () => {
    const session   = makeSession({ status: STATUS.CANCELLED });
    const result    = cancelSession(session);
    expect(result).toBe(session);
  });

  test('does not mutate the input session', () => {
    const session  = makeSession({ status: STATUS.IN_PROGRESS });
    const snapshot = JSON.stringify(session);
    cancelSession(session);
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  test('cancelled session blocks further answers', () => {
    const session   = makeSession();
    const cancelled = cancelSession(session);
    expect(() => collectAnswer(cancelled, CAMPAIGN_KEY, '2026_SUMMER_SAS'))
      .toThrow('Cannot collect answers on a CANCELLED session');
  });
});
