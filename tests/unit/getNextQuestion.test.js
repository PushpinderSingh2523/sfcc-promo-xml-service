'use strict';

const { getNextQuestion, getRemainingQuestions } = require('../../src/blueprints/session/getNextQuestion');
const { STATUS }                                 = require('../../src/blueprints/session/updateBlueprintSession');

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

const Q_CAMPAIGN   = makeQueueItem();
const Q_PROMO      = makeQueueItem({
  key: 'promotionId::promotion::0::_', fieldId: 'promotionId',
  group: 'Identity', label: 'Promotion ID', required: true, currentValue: 'PROMO_A',
});
const Q_END_DATE   = makeQueueItem({
  key: 'endDate::assignment::0::_', fieldId: 'endDate',
  group: 'Scheduling', label: 'End Date', required: false, currentValue: '2025-07-08T04:00:00.000Z',
});

function makeAnswer(key, value) {
  return {
    fieldId: key.split('::')[0], key, slotType: key.split('::')[1],
    slotIndex: null, xmlLang: null, normalizedValue: value, answeredAt: '2026-01-01T00:01:00.000Z',
  };
}

function makeSession(overrides = {}) {
  return {
    sessionId:     'test-session',
    blueprintId:   'test-bp',
    status:        STATUS.IN_PROGRESS,
    questionQueue: [Q_CAMPAIGN, Q_PROMO, Q_END_DATE],
    answers:       {},
    invalidFields: {},
    ...overrides,
  };
}

// ─── getNextQuestion ──────────────────────────────────────────────────────────

describe('getNextQuestion', () => {
  describe('input validation', () => {
    test('throws when session is null', () => {
      expect(() => getNextQuestion(null)).toThrow('session must be a non-null object');
    });

    test('throws when session is a string', () => {
      expect(() => getNextQuestion('bad')).toThrow('session must be a non-null object');
    });
  });

  describe('terminal statuses', () => {
    test('returns null for CANCELLED session', () => {
      expect(getNextQuestion(makeSession({ status: STATUS.CANCELLED }))).toBeNull();
    });

    test('returns null for COMPLETE session', () => {
      expect(getNextQuestion(makeSession({ status: STATUS.COMPLETE }))).toBeNull();
    });
  });

  describe('unanswered fields — normal progression', () => {
    test('returns first unanswered question when nothing answered', () => {
      const session = makeSession({ answers: {}, invalidFields: {} });
      const next    = getNextQuestion(session);
      expect(next).not.toBeNull();
      expect(next.key).toBe(Q_CAMPAIGN.key);
    });

    test('returns second question when first is answered', () => {
      const session = makeSession({
        answers: { [Q_CAMPAIGN.key]: makeAnswer(Q_CAMPAIGN.key, '2026_SUMMER_SAS') },
      });
      const next = getNextQuestion(session);
      expect(next.key).toBe(Q_PROMO.key);
    });

    test('returns third question when first two answered', () => {
      const session = makeSession({
        answers: {
          [Q_CAMPAIGN.key]: makeAnswer(Q_CAMPAIGN.key, '2026_SUMMER_SAS'),
          [Q_PROMO.key]:    makeAnswer(Q_PROMO.key,    '2026_PROMO'),
        },
      });
      const next = getNextQuestion(session);
      expect(next.key).toBe(Q_END_DATE.key);
    });

    test('returns null when all questions answered', () => {
      const session = makeSession({
        answers: {
          [Q_CAMPAIGN.key]:  makeAnswer(Q_CAMPAIGN.key,  '2026_SUMMER_SAS'),
          [Q_PROMO.key]:     makeAnswer(Q_PROMO.key,     '2026_PROMO'),
          [Q_END_DATE.key]:  makeAnswer(Q_END_DATE.key,  '2026-07-08T04:00:00.000Z'),
        },
      });
      expect(getNextQuestion(session)).toBeNull();
    });

    test('unanswered question has isRetry=false', () => {
      const next = getNextQuestion(makeSession());
      expect(next.isRetry).toBe(false);
    });

    test('unanswered question has empty validationErrors', () => {
      const next = getNextQuestion(makeSession());
      expect(next.validationErrors).toEqual([]);
    });

    test('unanswered question has undefined priorRawValue', () => {
      const next = getNextQuestion(makeSession());
      expect(next.priorRawValue).toBeUndefined();
    });
  });

  describe('invalid fields — priority over unanswered', () => {
    test('returns invalid field before any unanswered field', () => {
      // Q_PROMO is invalid, Q_CAMPAIGN is unanswered
      const session = makeSession({
        answers: {},
        invalidFields: {
          [Q_PROMO.key]: { fieldId: 'promotionId', key: Q_PROMO.key, errors: [{ rule: 'required', message: 'required' }], rawValue: '' },
        },
      });
      const next = getNextQuestion(session);
      // Invalid Q_PROMO is returned first, even though Q_CAMPAIGN is earlier in queue
      expect(next.key).toBe(Q_PROMO.key);
    });

    test('invalid question has isRetry=true', () => {
      const session = makeSession({
        invalidFields: {
          [Q_CAMPAIGN.key]: { fieldId: 'campaignId', key: Q_CAMPAIGN.key, errors: [{ rule: 'required', message: 'req' }], rawValue: '' },
        },
      });
      expect(getNextQuestion(session).isRetry).toBe(true);
    });

    test('invalid question includes validationErrors', () => {
      const errors = [{ rule: 'required', message: 'Campaign ID is required' }];
      const session = makeSession({
        invalidFields: {
          [Q_CAMPAIGN.key]: { fieldId: 'campaignId', key: Q_CAMPAIGN.key, errors, rawValue: '' },
        },
      });
      const next = getNextQuestion(session);
      expect(next.validationErrors).toEqual(errors);
    });

    test('invalid question includes priorRawValue', () => {
      const session = makeSession({
        invalidFields: {
          [Q_CAMPAIGN.key]: { fieldId: 'campaignId', key: Q_CAMPAIGN.key, errors: [], rawValue: 'bad_value' },
        },
      });
      expect(getNextQuestion(session).priorRawValue).toBe('bad_value');
    });

    test('invalid question is returned in queue order when multiple are invalid', () => {
      const session = makeSession({
        invalidFields: {
          [Q_PROMO.key]:    { fieldId: 'promotionId', key: Q_PROMO.key,    errors: [], rawValue: 'x' },
          [Q_CAMPAIGN.key]: { fieldId: 'campaignId',  key: Q_CAMPAIGN.key, errors: [], rawValue: 'y' },
        },
      });
      // Q_CAMPAIGN is earlier in queue → returned first
      const next = getNextQuestion(session);
      expect(next.key).toBe(Q_CAMPAIGN.key);
    });
  });

  describe('next question retains all QueueItem fields', () => {
    test('returned object spreads all original queueItem fields', () => {
      const next = getNextQuestion(makeSession());
      expect(next.fieldId).toBe(Q_CAMPAIGN.fieldId);
      expect(next.label).toBe(Q_CAMPAIGN.label);
      expect(next.question).toBe(Q_CAMPAIGN.question);
      expect(next.required).toBe(Q_CAMPAIGN.required);
      expect(next.group).toBe(Q_CAMPAIGN.group);
    });
  });
});

// ─── getRemainingQuestions ────────────────────────────────────────────────────

describe('getRemainingQuestions', () => {
  describe('input validation', () => {
    test('throws when session is null', () => {
      expect(() => getRemainingQuestions(null)).toThrow('session must be a non-null object');
    });
  });

  describe('terminal statuses', () => {
    test('returns [] for CANCELLED session', () => {
      expect(getRemainingQuestions(makeSession({ status: STATUS.CANCELLED }))).toEqual([]);
    });

    test('returns [] for COMPLETE session', () => {
      expect(getRemainingQuestions(makeSession({ status: STATUS.COMPLETE }))).toEqual([]);
    });
  });

  describe('ordering', () => {
    test('returns all three questions when nothing answered', () => {
      const remaining = getRemainingQuestions(makeSession({ answers: {}, invalidFields: {} }));
      expect(remaining).toHaveLength(3);
    });

    test('invalid fields come first, then unanswered', () => {
      // Q_END_DATE is invalid, Q_CAMPAIGN and Q_PROMO are unanswered
      const session = makeSession({
        answers: {},
        invalidFields: {
          [Q_END_DATE.key]: { fieldId: 'endDate', key: Q_END_DATE.key, errors: [], rawValue: 'bad' },
        },
      });
      const remaining = getRemainingQuestions(session);
      expect(remaining[0].key).toBe(Q_END_DATE.key);     // invalid first
      expect(remaining[0].isRetry).toBe(true);
      expect(remaining[1].isRetry).toBe(false);          // unanswered next
      expect(remaining[2].isRetry).toBe(false);
    });

    test('invalid field does not also appear in unanswered section', () => {
      const session = makeSession({
        answers: {},
        invalidFields: {
          [Q_CAMPAIGN.key]: { fieldId: 'campaignId', key: Q_CAMPAIGN.key, errors: [], rawValue: '' },
        },
      });
      const remaining = getRemainingQuestions(session);
      const keys = remaining.map(r => r.key);
      // Q_CAMPAIGN should appear exactly once (in the invalid section)
      expect(keys.filter(k => k === Q_CAMPAIGN.key)).toHaveLength(1);
    });

    test('answered and valid fields do not appear in remaining', () => {
      const session = makeSession({
        answers: { [Q_CAMPAIGN.key]: makeAnswer(Q_CAMPAIGN.key, '2026_SUMMER_SAS') },
        invalidFields: {},
      });
      const remaining = getRemainingQuestions(session);
      expect(remaining.find(r => r.key === Q_CAMPAIGN.key)).toBeUndefined();
      expect(remaining).toHaveLength(2); // Q_PROMO and Q_END_DATE
    });

    test('returns empty array when all questions answered validly', () => {
      const session = makeSession({
        answers: {
          [Q_CAMPAIGN.key]:  makeAnswer(Q_CAMPAIGN.key,  '2026_SUMMER_SAS'),
          [Q_PROMO.key]:     makeAnswer(Q_PROMO.key,     '2026_PROMO'),
          [Q_END_DATE.key]:  makeAnswer(Q_END_DATE.key,  '2026-07-08T04:00:00.000Z'),
        },
        invalidFields: {},
      });
      expect(getRemainingQuestions(session)).toHaveLength(0);
    });
  });
});
