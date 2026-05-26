'use strict';

const { isSessionComplete, getSessionProgress } = require('../../src/blueprints/session/isSessionComplete');
const { STATUS }                                = require('../../src/blueprints/session/updateBlueprintSession');

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
    validation:   null,
    replayCritical: false,
    ...overrides,
  };
}

function makeAnswer(key = 'campaignId::campaign::_::_', value = '2026_SUMMER_SAS') {
  return {
    fieldId: key.split('::')[0], key, slotType: key.split('::')[1],
    slotIndex: null, xmlLang: null, normalizedValue: value, answeredAt: '2026-01-01T00:01:00.000Z',
  };
}

function makeSession(overrides = {}) {
  const qi = makeQueueItem();
  return {
    sessionId:            'test-session',
    blueprintId:          'test-bp',
    createdAt:            '2026-01-01T00:00:00.000Z',
    updatedAt:            '2026-01-01T00:00:00.000Z',
    status:               STATUS.IN_PROGRESS,
    currentGroup:         'Campaign',
    questionQueue:        [qi],
    groupedProgress:      {},
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

// ─── isSessionComplete ────────────────────────────────────────────────────────

describe('isSessionComplete', () => {
  describe('input validation', () => {
    test('throws when session is null', () => {
      expect(() => isSessionComplete(null)).toThrow('session must be a non-null object');
    });

    test('throws when session is a string', () => {
      expect(() => isSessionComplete('bad')).toThrow('session must be a non-null object');
    });
  });

  describe('shortcut for COMPLETE status', () => {
    test('COMPLETE session → complete=true immediately', () => {
      const result = isSessionComplete(makeSession({ status: STATUS.COMPLETE }));
      expect(result.complete).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });
  });

  describe('CANCELLED session', () => {
    test('CANCELLED → complete=false', () => {
      const result = isSessionComplete(makeSession({ status: STATUS.CANCELLED }));
      expect(result.complete).toBe(false);
    });

    test('CANCELLED → blockers contains cancellation message', () => {
      const result = isSessionComplete(makeSession({ status: STATUS.CANCELLED }));
      expect(result.blockers.some(b => b.toLowerCase().includes('cancel'))).toBe(true);
    });
  });

  describe('required field unanswered', () => {
    test('required field not answered → complete=false', () => {
      const result = isSessionComplete(makeSession({ answers: {} }));
      expect(result.complete).toBe(false);
    });

    test('required field not answered → blocker names the key', () => {
      const result = isSessionComplete(makeSession({ answers: {} }));
      expect(result.blockers.some(b => b.includes('campaignId::campaign::_::_'))).toBe(true);
    });

    test('multiple unanswered required fields → single blocker with count', () => {
      const q1 = makeQueueItem();
      const q2 = makeQueueItem({ key: 'promotionId::promotion::0::_', fieldId: 'promotionId', group: 'Identity' });
      const session = makeSession({ questionQueue: [q1, q2], answers: {} });
      const result  = isSessionComplete(session);
      expect(result.blockers.some(b => b.includes('2 required'))).toBe(true);
    });

    test('all required answered → no required blocker', () => {
      const session = makeSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = isSessionComplete(session);
      expect(result.blockers.some(b => b.includes('required'))).toBe(false);
    });
  });

  describe('invalid fields', () => {
    test('invalid field → complete=false', () => {
      const session = makeSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
        invalidFields: { 'campaignId::campaign::_::_': { errors: [{ rule: 'minLength', message: 'err' }] } },
      });
      const result = isSessionComplete(session);
      expect(result.complete).toBe(false);
    });

    test('invalid field → blocker names the key', () => {
      const session = makeSession({
        invalidFields: { 'campaignId::campaign::_::_': { errors: [{ rule: 'required', message: 'err' }] } },
      });
      const result = isSessionComplete(session);
      expect(result.blockers.some(b => b.includes('campaignId::campaign::_::_'))).toBe(true);
    });
  });

  describe('review confirmation', () => {
    test('reviewRequired=true + no reviewConfirmedAt → blocker', () => {
      const session = makeSession({
        answers:         { 'campaignId::campaign::_::_': makeAnswer() },
        reviewRequired:  true,
        reviewConfirmedAt: null,
      });
      const result = isSessionComplete(session);
      expect(result.complete).toBe(false);
      expect(result.blockers.some(b => b.toLowerCase().includes('review'))).toBe(true);
    });

    test('reviewRequired=true + reviewConfirmedAt set → no review blocker', () => {
      const session = makeSession({
        answers:           { 'campaignId::campaign::_::_': makeAnswer() },
        reviewRequired:    true,
        reviewConfirmedAt: '2026-01-01T00:05:00.000Z',
      });
      const result = isSessionComplete(session);
      expect(result.complete).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    test('reviewRequired=false → no review blocker', () => {
      const session = makeSession({
        answers:          { 'campaignId::campaign::_::_': makeAnswer() },
        reviewRequired:   false,
        reviewConfirmedAt: null,
      });
      const result = isSessionComplete(session);
      expect(result.complete).toBe(true);
    });
  });

  describe('fully complete session', () => {
    test('all conditions met → complete=true', () => {
      const session = makeSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = isSessionComplete(session);
      expect(result.complete).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    test('complete result has descriptive reason string', () => {
      const session = makeSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = isSessionComplete(session);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe('multiple blockers', () => {
    test('unanswered + review pending → two blockers', () => {
      const session = makeSession({
        answers:          {},
        reviewRequired:   true,
        reviewConfirmedAt: null,
      });
      const result = isSessionComplete(session);
      expect(result.blockers.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ─── getSessionProgress ───────────────────────────────────────────────────────

describe('getSessionProgress', () => {
  describe('input validation', () => {
    test('throws when session is null', () => {
      expect(() => getSessionProgress(null)).toThrow('session must be a non-null object');
    });
  });

  describe('return shape', () => {
    test('returns all expected fields', () => {
      const result = getSessionProgress(makeSession());
      expect(result).toHaveProperty('totalQuestions');
      expect(result).toHaveProperty('answeredQuestions');
      expect(result).toHaveProperty('invalidQuestions');
      expect(result).toHaveProperty('requiredUnanswered');
      expect(result).toHaveProperty('completionPercentage');
      expect(result).toHaveProperty('status');
    });
  });

  describe('counts', () => {
    test('totalQuestions matches questionQueue length', () => {
      const result = getSessionProgress(makeSession());
      expect(result.totalQuestions).toBe(1);
    });

    test('answeredQuestions = 0 when nothing answered', () => {
      const result = getSessionProgress(makeSession({ answers: {} }));
      expect(result.answeredQuestions).toBe(0);
    });

    test('answeredQuestions counts valid answers only (excludes invalid)', () => {
      const session = makeSession({
        answers:       { 'campaignId::campaign::_::_': makeAnswer() },
        invalidFields: { 'campaignId::campaign::_::_': { errors: [] } },
      });
      const result = getSessionProgress(session);
      expect(result.answeredQuestions).toBe(0);
    });

    test('answeredQuestions = 1 when one valid answer', () => {
      const session = makeSession({
        answers:       { 'campaignId::campaign::_::_': makeAnswer() },
        invalidFields: {},
      });
      const result = getSessionProgress(session);
      expect(result.answeredQuestions).toBe(1);
    });

    test('invalidQuestions counts invalidFields entries', () => {
      const session = makeSession({
        invalidFields: { 'campaignId::campaign::_::_': { errors: [] } },
      });
      const result = getSessionProgress(session);
      expect(result.invalidQuestions).toBe(1);
    });

    test('requiredUnanswered counts required fields without valid answers', () => {
      const result = getSessionProgress(makeSession({ answers: {} }));
      expect(result.requiredUnanswered).toBe(1); // campaignId is required
    });

    test('requiredUnanswered = 0 when all required answered validly', () => {
      const session = makeSession({
        answers:       { 'campaignId::campaign::_::_': makeAnswer() },
        invalidFields: {},
      });
      const result = getSessionProgress(session);
      expect(result.requiredUnanswered).toBe(0);
    });

    test('status reflects session.status', () => {
      const result = getSessionProgress(makeSession({ status: STATUS.IN_PROGRESS }));
      expect(result.status).toBe(STATUS.IN_PROGRESS);
    });

    test('completionPercentage reflects session.completionPercentage', () => {
      const result = getSessionProgress(makeSession({ completionPercentage: 50 }));
      expect(result.completionPercentage).toBe(50);
    });
  });
});
