'use strict';

const { buildReviewSummary } = require('../../src/blueprints/session/buildReviewSummary');
const { STATUS }             = require('../../src/blueprints/session/updateBlueprintSession');

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

function makeAnswer(key, value) {
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

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildReviewSummary — input validation', () => {
  test('throws when session is null', () => {
    expect(() => buildReviewSummary(null)).toThrow('session must be a non-null object');
  });

  test('throws when session is not an object', () => {
    expect(() => buildReviewSummary('bad')).toThrow('session must be a non-null object');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('buildReviewSummary — return shape', () => {
  let summary;

  beforeAll(() => {
    summary = buildReviewSummary(makeSession());
  });

  test('returns object with groups, replaySafetyWarnings, sessionStatus, completionPercentage', () => {
    expect(summary).toHaveProperty('groups');
    expect(summary).toHaveProperty('replaySafetyWarnings');
    expect(summary).toHaveProperty('sessionStatus');
    expect(summary).toHaveProperty('completionPercentage');
  });

  test('groups is an array', () => {
    expect(Array.isArray(summary.groups)).toBe(true);
  });

  test('sessionStatus matches session.status', () => {
    expect(summary.sessionStatus).toBe(STATUS.IN_PROGRESS);
  });

  test('completionPercentage matches session.completionPercentage', () => {
    expect(summary.completionPercentage).toBe(0);
  });

  test('replaySafetyWarnings matches session.replaySafetyWarnings', () => {
    expect(summary.replaySafetyWarnings).toEqual([]);
  });
});

// ─── Groups ───────────────────────────────────────────────────────────────────

describe('buildReviewSummary — groups', () => {
  test('only non-empty groups are included', () => {
    const summary = buildReviewSummary(makeSession());
    // Session has one question in Campaign group — only Campaign should appear
    const groupNames = summary.groups.map(g => g.group);
    expect(groupNames).toContain('Campaign');
    // Groups with no questions are omitted
    expect(groupNames).not.toContain('Coupons');
    expect(groupNames).not.toContain('Merchandising');
  });

  test('groups follow GROUP_ORDER', () => {
    const { GROUP_ORDER } = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');
    const q1 = makeQueueItem({ group: 'Discounting', key: 'simpleDiscountValue::promotion::0::_', fieldId: 'simpleDiscountValue' });
    const q2 = makeQueueItem({ group: 'Campaign',    key: 'campaignId::campaign::_::_', fieldId: 'campaignId' });
    const session = makeSession({ questionQueue: [q1, q2] });
    const summary = buildReviewSummary(session);
    const groupNames = summary.groups.map(g => g.group);
    const campaignIdx    = GROUP_ORDER.indexOf('Campaign');
    const discountingIdx = GROUP_ORDER.indexOf('Discounting');
    expect(groupNames.indexOf('Campaign')).toBeLessThan(groupNames.indexOf('Discounting'));
    // Sanity check against GROUP_ORDER
    expect(campaignIdx).toBeLessThan(discountingIdx);
  });

  test('each group entry has { group, fields }', () => {
    const summary = buildReviewSummary(makeSession());
    summary.groups.forEach(g => {
      expect(typeof g.group).toBe('string');
      expect(Array.isArray(g.fields)).toBe(true);
    });
  });
});

// ─── Field entries ────────────────────────────────────────────────────────────

describe('buildReviewSummary — field entries', () => {
  describe('field entry shape', () => {
    test('field entry has all required properties', () => {
      const summary = buildReviewSummary(makeSession());
      const field   = summary.groups[0].fields[0];
      expect(field).toHaveProperty('fieldId');
      expect(field).toHaveProperty('key');
      expect(field).toHaveProperty('label');
      expect(field).toHaveProperty('group');
      expect(field).toHaveProperty('slotContext');
      expect(field).toHaveProperty('xmlLang');
      expect(field).toHaveProperty('required');
      expect(field).toHaveProperty('replayCritical');
      expect(field).toHaveProperty('priorValue');
      expect(field).toHaveProperty('newValue');
      expect(field).toHaveProperty('changed');
      expect(field).toHaveProperty('answered');
      expect(field).toHaveProperty('valid');
      expect(field).toHaveProperty('validationErrors');
    });

    test('slotContext has slotType and slotIndex', () => {
      const summary = buildReviewSummary(makeSession());
      const field   = summary.groups[0].fields[0];
      expect(field.slotContext).toHaveProperty('slotType');
      expect(field.slotContext).toHaveProperty('slotIndex');
    });
  });

  describe('unanswered field', () => {
    let field;
    beforeAll(() => {
      const summary = buildReviewSummary(makeSession({ answers: {} }));
      field = summary.groups[0].fields[0];
    });

    test('answered=false', () => expect(field.answered).toBe(false));
    test('newValue=null', () => expect(field.newValue).toBeNull());
    test('changed=null (not yet answered)', () => expect(field.changed).toBeNull());
    test('valid=true (no validation failure)', () => expect(field.valid).toBe(true));
    test('validationErrors=[]', () => expect(field.validationErrors).toEqual([]));
    test('priorValue is currentValue from queueItem', () => expect(field.priorValue).toBe('2025_SUMMER_SAS'));
  });

  describe('answered field — value changed', () => {
    let field;
    beforeAll(() => {
      const session = makeSession({
        answers: { [CAMPAIGN_KEY]: makeAnswer(CAMPAIGN_KEY, '2026_SUMMER_SAS') },
      });
      const summary = buildReviewSummary(session);
      field = summary.groups[0].fields[0];
    });

    test('answered=true', () => expect(field.answered).toBe(true));
    test('newValue is normalizedValue from answer', () => expect(field.newValue).toBe('2026_SUMMER_SAS'));
    test('changed=true when newValue differs from priorValue', () => expect(field.changed).toBe(true));
    test('priorValue is originalValue from queueItem', () => expect(field.priorValue).toBe('2025_SUMMER_SAS'));
    test('valid=true', () => expect(field.valid).toBe(true));
  });

  describe('answered field — value unchanged', () => {
    let field;
    beforeAll(() => {
      const session = makeSession({
        answers: { [CAMPAIGN_KEY]: makeAnswer(CAMPAIGN_KEY, '2025_SUMMER_SAS') },
      });
      const summary = buildReviewSummary(session);
      field = summary.groups[0].fields[0];
    });

    test('changed=false when newValue equals priorValue', () => expect(field.changed).toBe(false));
    test('answered=true', () => expect(field.answered).toBe(true));
  });

  describe('invalid field', () => {
    let field;
    beforeAll(() => {
      const session = makeSession({
        invalidFields: {
          [CAMPAIGN_KEY]: {
            fieldId: 'campaignId', key: CAMPAIGN_KEY,
            errors: [{ rule: 'required', message: 'Campaign ID is required' }],
            rawValue: '',
          },
        },
      });
      const summary = buildReviewSummary(session);
      field = summary.groups[0].fields[0];
    });

    test('valid=false', () => expect(field.valid).toBe(false));
    test('validationErrors is populated', () => {
      expect(field.validationErrors.length).toBeGreaterThan(0);
      expect(field.validationErrors[0].rule).toBe('required');
    });
    test('answered=false (no valid answer)', () => expect(field.answered).toBe(false));
  });
});

// ─── replaySafetyWarnings passthrough ─────────────────────────────────────────

describe('buildReviewSummary — replaySafetyWarnings passthrough', () => {
  test('warnings from session are passed through unchanged', () => {
    const warning = {
      fieldId: 'campaignId', key: CAMPAIGN_KEY,
      slotContext: { slotType: 'campaign', slotIndex: null },
      severity: 'HIGH', message: 'Changing may affect replay parity',
      priorValue: 'OLD', newValue: 'NEW',
    };
    const session = makeSession({ replaySafetyWarnings: [warning] });
    const summary = buildReviewSummary(session);
    expect(summary.replaySafetyWarnings).toEqual([warning]);
  });
});

// ─── Multiple-group session ────────────────────────────────────────────────────

describe('buildReviewSummary — multiple groups', () => {
  test('two groups produce two group entries', () => {
    const q1 = makeQueueItem();
    const q2 = makeQueueItem({
      key: 'endDate::assignment::0::_', fieldId: 'endDate',
      group: 'Scheduling', label: 'End Date', required: false,
      currentValue: '2025-07-08T04:00:00.000Z',
    });
    const session = makeSession({ questionQueue: [q1, q2] });
    const summary = buildReviewSummary(session);
    expect(summary.groups.length).toBe(2);
    expect(summary.groups[0].group).toBe('Campaign');
    expect(summary.groups[1].group).toBe('Scheduling');
  });

  test('each group contains the correct fields', () => {
    const q1 = makeQueueItem();
    const q2 = makeQueueItem({
      key: 'endDate::assignment::0::_', fieldId: 'endDate',
      group: 'Scheduling', label: 'End Date', required: false, currentValue: null,
    });
    const session = makeSession({ questionQueue: [q1, q2] });
    const summary = buildReviewSummary(session);
    expect(summary.groups[0].fields[0].fieldId).toBe('campaignId');
    expect(summary.groups[1].fields[0].fieldId).toBe('endDate');
  });
});
