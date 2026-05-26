'use strict';

const {
  updateBlueprintSession,
  STATUS,
  _internals: { recalculateDerivedState, valuesEqual },
} = require('../../src/blueprints/session/updateBlueprintSession');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal QueueItem suitable for testing recalculateDerivedState.
 */
function makeQueueItem(overrides = {}) {
  return {
    key:            'campaignId::campaign::_::_',
    fieldId:        'campaignId',
    slotType:       'campaign',
    slotIndex:      null,
    xmlLang:        null,
    group:          'Campaign',
    label:          'Campaign ID',
    question:       'What is the campaign ID?',
    required:       true,
    currentValue:   '2025_SUMMER_SAS',
    validation:     { minLength: 1, maxLength: 100 },
    replayCritical: false,
    ...overrides,
  };
}

/**
 * Build a minimal raw session for recalculateDerivedState tests.
 */
function makeRawSession(overrides = {}) {
  return {
    sessionId:            'test-session',
    blueprintId:          'test-bp',
    createdAt:            '2026-01-01T00:00:00.000Z',
    updatedAt:            '2026-01-01T00:00:00.000Z',
    status:               STATUS.CREATED,
    currentGroup:         null,
    questionQueue:        [makeQueueItem()],
    groupedProgress:      {},
    completionPercentage: 0,
    answers:              {},
    unansweredFields:     ['campaignId::campaign::_::_'],
    invalidFields:        {},
    reviewRequired:       false,
    replaySafetyWarnings: [],
    reviewConfirmedAt:    null,
    generatedPayload:     null,
    ...overrides,
  };
}

/** Build a valid answer record for the campaignId key. */
function makeAnswer(key = 'campaignId::campaign::_::_', normalizedValue = '2026_SUMMER_SAS') {
  return {
    fieldId:         key.split('::')[0],
    key,
    slotType:        key.split('::')[1],
    slotIndex:       null,
    xmlLang:         null,
    normalizedValue,
    answeredAt:      '2026-01-01T00:01:00.000Z',
  };
}

// ─── STATUS ───────────────────────────────────────────────────────────────────

describe('STATUS', () => {
  test('contains all six expected values', () => {
    expect(STATUS.CREATED).toBe('CREATED');
    expect(STATUS.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(STATUS.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(STATUS.REVIEW_PENDING).toBe('REVIEW_PENDING');
    expect(STATUS.COMPLETE).toBe('COMPLETE');
    expect(STATUS.CANCELLED).toBe('CANCELLED');
  });

  test('is frozen — cannot be mutated', () => {
    expect(() => { STATUS.CREATED = 'OTHER'; }).toThrow();
  });
});

// ─── valuesEqual ──────────────────────────────────────────────────────────────

describe('valuesEqual', () => {
  test('identical strings are equal', () => {
    expect(valuesEqual('abc', 'abc')).toBe(true);
  });

  test('different strings are not equal', () => {
    expect(valuesEqual('abc', 'def')).toBe(false);
  });

  test('null and null are equal', () => {
    expect(valuesEqual(null, null)).toBe(true);
  });

  test('null and undefined are not equal', () => {
    expect(valuesEqual(null, undefined)).toBe(false);
  });

  test('same number equal', () => {
    expect(valuesEqual(42, 42)).toBe(true);
  });

  test('structurally equal arrays are equal', () => {
    expect(valuesEqual([1, 2], [1, 2])).toBe(true);
  });

  test('arrays with different order are not equal', () => {
    expect(valuesEqual([1, 2], [2, 1])).toBe(false);
  });

  test('same object reference is equal (short-circuit)', () => {
    const obj = { a: 1 };
    expect(valuesEqual(obj, obj)).toBe(true);
  });

  test('structurally equal objects are equal', () => {
    expect(valuesEqual({ a: 1 }, { a: 1 })).toBe(true);
  });
});

// ─── recalculateDerivedState ──────────────────────────────────────────────────

describe('recalculateDerivedState', () => {
  describe('status transitions', () => {
    test('no answers → CREATED', () => {
      const session = makeRawSession({ answers: {}, status: STATUS.CREATED });
      const result  = recalculateDerivedState(session);
      expect(result.status).toBe(STATUS.CREATED);
    });

    test('optional field answered → IN_PROGRESS', () => {
      const optionalItem = makeQueueItem({ required: false });
      const session = makeRawSession({
        status: STATUS.CREATED,
        questionQueue: [optionalItem],
        answers: { [optionalItem.key]: makeAnswer(optionalItem.key) },
      });
      const result = recalculateDerivedState(session);
      expect(result.status).toBe(STATUS.COMPLETE); // only field is optional and answered
    });

    test('required field answered → COMPLETE (single required question)', () => {
      const session = makeRawSession({
        status: STATUS.IN_PROGRESS,
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = recalculateDerivedState(session);
      expect(result.status).toBe(STATUS.COMPLETE);
    });

    test('any invalid field → VALIDATION_FAILED', () => {
      const session = makeRawSession({
        status: STATUS.IN_PROGRESS,
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
        invalidFields: { 'campaignId::campaign::_::_': { errors: ['bad'], rawValue: 'x' } },
      });
      const result = recalculateDerivedState(session);
      expect(result.status).toBe(STATUS.VALIDATION_FAILED);
    });

    test('CANCELLED status is preserved regardless of answers', () => {
      const session = makeRawSession({
        status: STATUS.CANCELLED,
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = recalculateDerivedState(session);
      expect(result.status).toBe(STATUS.CANCELLED);
    });

    test('required met + replayCritical changed + not confirmed → REVIEW_PENDING', () => {
      const replayItem = makeQueueItem({ replayCritical: true, currentValue: 'OLD_ID' });
      const session = makeRawSession({
        status: STATUS.IN_PROGRESS,
        questionQueue: [replayItem],
        answers: { [replayItem.key]: makeAnswer(replayItem.key, 'NEW_ID') },
        reviewConfirmedAt: null,
      });
      const result = recalculateDerivedState(session);
      expect(result.status).toBe(STATUS.REVIEW_PENDING);
    });

    test('required met + replayCritical changed + confirmed → COMPLETE', () => {
      const replayItem = makeQueueItem({ replayCritical: true, currentValue: 'OLD_ID' });
      const session = makeRawSession({
        status: STATUS.IN_PROGRESS,
        questionQueue: [replayItem],
        answers: { [replayItem.key]: makeAnswer(replayItem.key, 'NEW_ID') },
        reviewConfirmedAt: '2026-01-01T00:02:00.000Z',
      });
      const result = recalculateDerivedState(session);
      expect(result.status).toBe(STATUS.COMPLETE);
    });

    test('required met + replayCritical unchanged → COMPLETE (no warnings)', () => {
      const replayItem = makeQueueItem({ replayCritical: true, currentValue: '2025_SUMMER_SAS' });
      const session = makeRawSession({
        status: STATUS.IN_PROGRESS,
        questionQueue: [replayItem],
        answers: { [replayItem.key]: makeAnswer(replayItem.key, '2025_SUMMER_SAS') },
      });
      const result = recalculateDerivedState(session);
      expect(result.status).toBe(STATUS.COMPLETE);
      expect(result.replaySafetyWarnings).toHaveLength(0);
    });
  });

  describe('groupedProgress', () => {
    test('calculates answered count per group', () => {
      const session = makeRawSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = recalculateDerivedState(session);
      expect(result.groupedProgress['Campaign'].total).toBe(1);
      expect(result.groupedProgress['Campaign'].answered).toBe(1);
      expect(result.groupedProgress['Campaign'].complete).toBe(true);
    });

    test('unanswered group not marked complete', () => {
      const session = makeRawSession({ answers: {} });
      const result  = recalculateDerivedState(session);
      expect(result.groupedProgress['Campaign'].total).toBe(1);
      expect(result.groupedProgress['Campaign'].answered).toBe(0);
      expect(result.groupedProgress['Campaign'].complete).toBe(false);
    });

    test('invalid answer does not count as answered in group', () => {
      const session = makeRawSession({
        answers:       { 'campaignId::campaign::_::_': makeAnswer() },
        invalidFields: { 'campaignId::campaign::_::_': { errors: ['bad'], rawValue: '' } },
      });
      const result = recalculateDerivedState(session);
      expect(result.groupedProgress['Campaign'].answered).toBe(0);
      expect(result.groupedProgress['Campaign'].complete).toBe(false);
    });
  });

  describe('completionPercentage', () => {
    test('0% when no answers', () => {
      const result = recalculateDerivedState(makeRawSession({ answers: {} }));
      expect(result.completionPercentage).toBe(0);
    });

    test('100% when all answered (single required question)', () => {
      const session = makeRawSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = recalculateDerivedState(session);
      expect(result.completionPercentage).toBe(100);
    });

    test('50% when one of two answered', () => {
      const q1 = makeQueueItem({ key: 'campaignId::campaign::_::_' });
      const q2 = makeQueueItem({ key: 'promotionId::promotion::0::_', fieldId: 'promotionId', group: 'Identity' });
      const session = makeRawSession({
        questionQueue: [q1, q2],
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = recalculateDerivedState(session);
      expect(result.completionPercentage).toBe(50);
    });
  });

  describe('unansweredFields', () => {
    test('all keys when nothing answered', () => {
      const result = recalculateDerivedState(makeRawSession({ answers: {} }));
      expect(result.unansweredFields).toContain('campaignId::campaign::_::_');
    });

    test('empty when all answered validly', () => {
      const session = makeRawSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = recalculateDerivedState(session);
      expect(result.unansweredFields).toHaveLength(0);
    });

    test('invalidFields are included in unansweredFields', () => {
      const session = makeRawSession({
        answers:       { 'campaignId::campaign::_::_': makeAnswer() },
        invalidFields: { 'campaignId::campaign::_::_': { errors: ['bad'], rawValue: '' } },
      });
      const result = recalculateDerivedState(session);
      expect(result.unansweredFields).toContain('campaignId::campaign::_::_');
    });
  });

  describe('replaySafetyWarnings', () => {
    test('no warnings when non-replay-critical field changes', () => {
      const session = makeRawSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer('campaignId::campaign::_::_', 'NEW_CAMPAIGN') },
      });
      const result = recalculateDerivedState(session);
      expect(result.replaySafetyWarnings).toHaveLength(0);
    });

    test('warning generated when replay-critical field changes', () => {
      const criticalItem = makeQueueItem({ replayCritical: true, currentValue: 'OLD_CAMPAIGN' });
      const session = makeRawSession({
        questionQueue: [criticalItem],
        answers: { [criticalItem.key]: makeAnswer(criticalItem.key, 'NEW_CAMPAIGN') },
      });
      const result = recalculateDerivedState(session);
      expect(result.replaySafetyWarnings).toHaveLength(1);
      expect(result.replaySafetyWarnings[0].severity).toBe('HIGH');
      expect(result.replaySafetyWarnings[0].fieldId).toBe('campaignId');
      expect(result.replaySafetyWarnings[0].priorValue).toBe('OLD_CAMPAIGN');
      expect(result.replaySafetyWarnings[0].newValue).toBe('NEW_CAMPAIGN');
    });

    test('no warning when replay-critical value is unchanged', () => {
      const criticalItem = makeQueueItem({ replayCritical: true, currentValue: '2025_SUMMER_SAS' });
      const session = makeRawSession({
        questionQueue: [criticalItem],
        answers: { [criticalItem.key]: makeAnswer(criticalItem.key, '2025_SUMMER_SAS') },
      });
      const result = recalculateDerivedState(session);
      expect(result.replaySafetyWarnings).toHaveLength(0);
    });

    test('reviewRequired = true when warnings exist', () => {
      const criticalItem = makeQueueItem({ replayCritical: true, currentValue: 'OLD' });
      const session = makeRawSession({
        questionQueue: [criticalItem],
        answers: { [criticalItem.key]: makeAnswer(criticalItem.key, 'NEW') },
      });
      const result = recalculateDerivedState(session);
      expect(result.reviewRequired).toBe(true);
    });

    test('reviewRequired = false when no warnings exist', () => {
      const session = makeRawSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = recalculateDerivedState(session);
      expect(result.reviewRequired).toBe(false);
    });
  });

  describe('currentGroup', () => {
    test('currentGroup is the group of first unanswered question', () => {
      const result = recalculateDerivedState(makeRawSession({ answers: {} }));
      expect(result.currentGroup).toBe('Campaign');
    });

    test('currentGroup is null when all answered', () => {
      const session = makeRawSession({
        answers: { 'campaignId::campaign::_::_': makeAnswer() },
      });
      const result = recalculateDerivedState(session);
      expect(result.currentGroup).toBeNull();
    });
  });
});

// ─── updateBlueprintSession ───────────────────────────────────────────────────

describe('updateBlueprintSession', () => {
  test('throws when session is null', () => {
    expect(() => updateBlueprintSession(null)).toThrow('session must be a non-null object');
  });

  test('throws when session is not an object', () => {
    expect(() => updateBlueprintSession('string')).toThrow('session must be a non-null object');
  });

  test('does not mutate the input session', () => {
    const session  = makeRawSession({ answers: {} });
    const snapshot = JSON.stringify(session);
    updateBlueprintSession(session, {
      answers: { 'campaignId::campaign::_::_': makeAnswer() },
    });
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  test('returns a new object different from the input', () => {
    const session = makeRawSession();
    const result  = updateBlueprintSession(session, {});
    expect(result).not.toBe(session);
  });

  test('merges changes into the new session', () => {
    const session = makeRawSession({ answers: {} });
    const result  = updateBlueprintSession(session, {
      answers: { 'campaignId::campaign::_::_': makeAnswer() },
    });
    expect(result.answers['campaignId::campaign::_::_']).toBeDefined();
  });

  test('sets updatedAt from changes if provided', () => {
    const session = makeRawSession();
    const result  = updateBlueprintSession(session, { updatedAt: '2026-06-01T00:00:00.000Z' });
    expect(result.updatedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  test('recalculates all derived state after merge', () => {
    const session = makeRawSession({ answers: {} });
    expect(session.completionPercentage).toBe(0);
    const result = updateBlueprintSession(session, {
      answers: { 'campaignId::campaign::_::_': makeAnswer() },
    });
    expect(result.completionPercentage).toBe(100);
    expect(result.status).toBe(STATUS.COMPLETE);
  });

  test('CANCELLED status passed in changes is preserved', () => {
    const session = makeRawSession();
    const result  = updateBlueprintSession(session, { status: STATUS.CANCELLED });
    expect(result.status).toBe(STATUS.CANCELLED);
  });
});
