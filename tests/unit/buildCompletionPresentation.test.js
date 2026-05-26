'use strict';

const { buildCompletionPresentation } = require('../../src/presentation/adapters/buildCompletionPresentation');
const { STATUS }                      = require('../../src/blueprints/session/updateBlueprintSession');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueueItem(overrides = {}) {
  return {
    key:          'campaignId::campaign::_::_',
    fieldId:      'campaignId',
    slotType:     'campaign',
    slotIndex:    null,
    label:        'Campaign ID',
    currentValue: '2025_SUMMER_SAS',
    required:     true,
    replayCritical: false,
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    sessionId:            'test-session-001',
    blueprintId:          'test-bp-001',
    status:               STATUS.COMPLETE,
    completionPercentage: 100,
    questionQueue:        [makeQueueItem()],
    answers: {
      'campaignId::campaign::_::_': {
        fieldId: 'campaignId', key: 'campaignId::campaign::_::_',
        normalizedValue: '2026_SUMMER_SAS', answeredAt: '2026-01-01T00:01:00.000Z',
      },
    },
    invalidFields:        {},
    reviewRequired:       false,
    replaySafetyWarnings: [],
    reviewConfirmedAt:    null,
    ...overrides,
  };
}

function makeBlueprint(overrides = {}) {
  return {
    blueprintId:    'test-bp-001',
    promotionSlots: [{ slotIndex: 0 }, { slotIndex: 1 }],
    assignmentSlots: [{ slotIndex: 0 }, { slotIndex: 1 }],
    campaignSlot:   { frozenStructure: {}, editableFields: { campaignId: '2025_SUMMER_SAS' } },
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildCompletionPresentation — input validation', () => {
  test('throws when session is null', () => {
    expect(() => buildCompletionPresentation(null, makeBlueprint()))
      .toThrow('session must be a non-null object');
  });

  test('throws when blueprint is null', () => {
    expect(() => buildCompletionPresentation(makeSession(), null))
      .toThrow('blueprint must be a non-null object');
  });

  test('throws when session is a string', () => {
    expect(() => buildCompletionPresentation('bad', makeBlueprint()))
      .toThrow('session must be a non-null object');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('buildCompletionPresentation — return shape', () => {
  let presentation;

  beforeAll(() => {
    presentation = buildCompletionPresentation(makeSession(), makeBlueprint());
  });

  test('type is "completion"', () => {
    expect(presentation.type).toBe('completion');
  });

  test('has all required top-level fields', () => {
    const required = [
      'type', 'sessionId', 'blueprintId', 'status', 'completionPercentage',
      'promotionCount', 'assignmentCount', 'answeredFields', 'totalFields',
      'payloadReady', 'warningsAcknowledged', 'replayWarnings', 'changedFields',
    ];
    required.forEach(f => expect(presentation).toHaveProperty(f));
  });

  test('replayWarnings is an array', () => {
    expect(Array.isArray(presentation.replayWarnings)).toBe(true);
  });

  test('changedFields is an array', () => {
    expect(Array.isArray(presentation.changedFields)).toBe(true);
  });
});

// ─── Session metadata ─────────────────────────────────────────────────────────

describe('buildCompletionPresentation — session metadata', () => {
  test('sessionId from session', () => {
    const p = buildCompletionPresentation(makeSession({ sessionId: 'sess-xyz' }), makeBlueprint());
    expect(p.sessionId).toBe('sess-xyz');
  });

  test('blueprintId from session', () => {
    const p = buildCompletionPresentation(makeSession({ blueprintId: 'bp-xyz' }), makeBlueprint());
    expect(p.blueprintId).toBe('bp-xyz');
  });

  test('status from session', () => {
    expect(buildCompletionPresentation(makeSession({ status: STATUS.COMPLETE }), makeBlueprint()).status)
      .toBe(STATUS.COMPLETE);
  });

  test('completionPercentage from session', () => {
    expect(buildCompletionPresentation(makeSession({ completionPercentage: 57 }), makeBlueprint()).completionPercentage)
      .toBe(57);
  });
});

// ─── Blueprint counts ─────────────────────────────────────────────────────────

describe('buildCompletionPresentation — blueprint counts', () => {
  test('promotionCount from blueprint.promotionSlots.length', () => {
    const p = buildCompletionPresentation(makeSession(), makeBlueprint());
    expect(p.promotionCount).toBe(2);
  });

  test('assignmentCount from blueprint.assignmentSlots.length', () => {
    const p = buildCompletionPresentation(makeSession(), makeBlueprint());
    expect(p.assignmentCount).toBe(2);
  });

  test('promotionCount 4 for Summer_SAS.xml-like blueprint', () => {
    const bp = makeBlueprint({
      promotionSlots:  [0, 1, 2, 3].map(i => ({ slotIndex: i })),
      assignmentSlots: [0, 1, 2, 3].map(i => ({ slotIndex: i })),
    });
    const p = buildCompletionPresentation(makeSession(), bp);
    expect(p.promotionCount).toBe(4);
    expect(p.assignmentCount).toBe(4);
  });
});

// ─── Field counts ─────────────────────────────────────────────────────────────

describe('buildCompletionPresentation — field counts', () => {
  test('answeredFields counts valid answers only', () => {
    const p = buildCompletionPresentation(makeSession(), makeBlueprint());
    expect(p.answeredFields).toBe(1);
  });

  test('answeredFields excludes invalid answers', () => {
    const session = makeSession({
      invalidFields: { 'campaignId::campaign::_::_': { errors: [] } },
    });
    const p = buildCompletionPresentation(session, makeBlueprint());
    expect(p.answeredFields).toBe(0);
  });

  test('totalFields = questionQueue.length', () => {
    const p = buildCompletionPresentation(makeSession(), makeBlueprint());
    expect(p.totalFields).toBe(1);
  });
});

// ─── payloadReady ─────────────────────────────────────────────────────────────

describe('buildCompletionPresentation — payloadReady', () => {
  test('payloadReady=true when status is COMPLETE', () => {
    expect(buildCompletionPresentation(makeSession({ status: STATUS.COMPLETE }), makeBlueprint()).payloadReady)
      .toBe(true);
  });

  test('payloadReady=false when status is IN_PROGRESS', () => {
    expect(buildCompletionPresentation(makeSession({ status: STATUS.IN_PROGRESS }), makeBlueprint()).payloadReady)
      .toBe(false);
  });

  test('payloadReady=false when status is REVIEW_PENDING', () => {
    expect(buildCompletionPresentation(makeSession({ status: STATUS.REVIEW_PENDING }), makeBlueprint()).payloadReady)
      .toBe(false);
  });
});

// ─── warningsAcknowledged ─────────────────────────────────────────────────────

describe('buildCompletionPresentation — warningsAcknowledged', () => {
  test('true when reviewRequired=false (nothing to acknowledge)', () => {
    const p = buildCompletionPresentation(makeSession({ reviewRequired: false }), makeBlueprint());
    expect(p.warningsAcknowledged).toBe(true);
  });

  test('false when reviewRequired=true and reviewConfirmedAt=null', () => {
    const session = makeSession({ reviewRequired: true, reviewConfirmedAt: null });
    const p = buildCompletionPresentation(session, makeBlueprint());
    expect(p.warningsAcknowledged).toBe(false);
  });

  test('true when reviewRequired=true and reviewConfirmedAt is set', () => {
    const session = makeSession({ reviewRequired: true, reviewConfirmedAt: '2026-01-01T01:00:00.000Z' });
    const p = buildCompletionPresentation(session, makeBlueprint());
    expect(p.warningsAcknowledged).toBe(true);
  });
});

// ─── changedFields ────────────────────────────────────────────────────────────

describe('buildCompletionPresentation — changedFields', () => {
  test('field with changed value appears in changedFields', () => {
    // campaignId was '2025_SUMMER_SAS' → answered as '2026_SUMMER_SAS'
    const p = buildCompletionPresentation(makeSession(), makeBlueprint());
    expect(p.changedFields).toHaveLength(1);
    expect(p.changedFields[0].fieldId).toBe('campaignId');
    expect(p.changedFields[0].priorValue).toBe('2025_SUMMER_SAS');
    expect(p.changedFields[0].newValue).toBe('2026_SUMMER_SAS');
  });

  test('field with same value does NOT appear in changedFields', () => {
    const session = makeSession({
      questionQueue: [makeQueueItem({ currentValue: '2025_SUMMER_SAS' })],
      answers: {
        'campaignId::campaign::_::_': {
          fieldId: 'campaignId', key: 'campaignId::campaign::_::_',
          normalizedValue: '2025_SUMMER_SAS',  // same as currentValue
          answeredAt: '2026-01-01T00:01:00.000Z',
        },
      },
    });
    const p = buildCompletionPresentation(session, makeBlueprint());
    expect(p.changedFields).toHaveLength(0);
  });

  test('unanswered field does NOT appear in changedFields', () => {
    const session = makeSession({ answers: {} });
    const p = buildCompletionPresentation(session, makeBlueprint());
    expect(p.changedFields).toHaveLength(0);
  });

  test('invalid answer does NOT appear in changedFields', () => {
    const session = makeSession({
      invalidFields: { 'campaignId::campaign::_::_': { errors: [] } },
    });
    const p = buildCompletionPresentation(session, makeBlueprint());
    expect(p.changedFields).toHaveLength(0);
  });

  test('changedField entry has required shape', () => {
    const p = buildCompletionPresentation(makeSession(), makeBlueprint());
    const cf = p.changedFields[0];
    expect(cf).toHaveProperty('fieldId');
    expect(cf).toHaveProperty('key');
    expect(cf).toHaveProperty('label');
    expect(cf).toHaveProperty('slotContext');
    expect(cf).toHaveProperty('priorValue');
    expect(cf).toHaveProperty('newValue');
  });

  test('changedField slotContext has slotType and slotIndex', () => {
    const p = buildCompletionPresentation(makeSession(), makeBlueprint());
    const sc = p.changedFields[0].slotContext;
    expect(sc).toHaveProperty('slotType');
    expect(sc).toHaveProperty('slotIndex');
  });

  test('multiple changed fields all appear', () => {
    const q1 = makeQueueItem({ currentValue: 'OLD' });
    const q2 = makeQueueItem({
      key: 'promotionId::promotion::0::_', fieldId: 'promotionId',
      slotType: 'promotion', slotIndex: 0, label: 'Promotion ID',
      currentValue: 'OLD_PROMO',
    });
    const session = makeSession({
      questionQueue: [q1, q2],
      answers: {
        'campaignId::campaign::_::_':  { fieldId: 'campaignId',  key: 'campaignId::campaign::_::_',  normalizedValue: 'NEW', answeredAt: '2026-01-01T00:01:00.000Z' },
        'promotionId::promotion::0::_': { fieldId: 'promotionId', key: 'promotionId::promotion::0::_', normalizedValue: 'NEW_PROMO', answeredAt: '2026-01-01T00:01:00.000Z' },
      },
    });
    const p = buildCompletionPresentation(session, makeBlueprint());
    expect(p.changedFields).toHaveLength(2);
  });
});

// ─── Replay warnings passthrough ──────────────────────────────────────────────

describe('buildCompletionPresentation — replay warnings passthrough', () => {
  test('no warnings → replayWarnings empty', () => {
    const p = buildCompletionPresentation(makeSession({ replaySafetyWarnings: [] }), makeBlueprint());
    expect(p.replayWarnings).toHaveLength(0);
  });

  test('warnings passed through with acknowledgementRequired=true', () => {
    const session = makeSession({
      replaySafetyWarnings: [{
        fieldId: 'campaignId', key: 'campaignId::campaign::_::_',
        slotContext: { slotType: 'campaign', slotIndex: null },
        severity: 'HIGH',
        message: 'May affect replay.',
        priorValue: '2025_SUMMER_SAS', newValue: '2026_SUMMER_SAS',
      }],
    });
    const p = buildCompletionPresentation(session, makeBlueprint());
    expect(p.replayWarnings).toHaveLength(1);
    expect(p.replayWarnings[0].severity).toBe('HIGH');
    expect(p.replayWarnings[0].acknowledgementRequired).toBe(true);
  });
});

// ─── Mutation safety ──────────────────────────────────────────────────────────

describe('buildCompletionPresentation — mutation safety', () => {
  test('does NOT mutate the session', () => {
    const session  = makeSession();
    const snapshot = JSON.stringify(session);
    buildCompletionPresentation(session, makeBlueprint());
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  test('does NOT mutate the blueprint', () => {
    const bp       = makeBlueprint();
    const snapshot = JSON.stringify(bp);
    buildCompletionPresentation(makeSession(), bp);
    expect(JSON.stringify(bp)).toBe(snapshot);
  });

  test('presentation layer NEVER modifies orchestration state', () => {
    const session  = Object.freeze(makeSession());
    expect(() => buildCompletionPresentation(session, makeBlueprint())).not.toThrow();
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildCompletionPresentation — determinism', () => {
  test('same inputs produce identical output', () => {
    const session  = makeSession();
    const blueprint = makeBlueprint();
    expect(JSON.stringify(buildCompletionPresentation(session, blueprint)))
      .toBe(JSON.stringify(buildCompletionPresentation(session, blueprint)));
  });
});

// ─── Summer_SAS.xml integration ───────────────────────────────────────────────

describe('buildCompletionPresentation — Summer_SAS.xml', () => {
  const path = require('path');
  const fs   = require('fs');
  const { extractSASBlueprint }    = require('../../src/blueprints/extractors/extractSASBlueprint');
  const { createBlueprintSession } = require('../../src/blueprints/session/createBlueprintSession');
  const { collectAnswer }          = require('../../src/blueprints/session/collectAnswer');
  const { getNextQuestion }        = require('../../src/blueprints/session/getNextQuestion');

  let blueprint, session;

  beforeAll(() => {
    const xml = fs.readFileSync(path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8');
    blueprint = extractSASBlueprint(xml);
    let s = createBlueprintSession(blueprint, { sessionId: 'comp-test', createdAt: '2026-01-01T00:00:00.000Z' });
    // Answer all questions with currentValues (same → no changes)
    let next = getNextQuestion(s);
    while (next) {
      const raw = next.currentValue !== undefined ? next.currentValue : null;
      const { session: updated } = collectAnswer(s, next.key, raw);
      s    = updated;
      next = getNextQuestion(s);
    }
    session = s;
  });

  test('type is "completion"', () => {
    expect(buildCompletionPresentation(session, blueprint).type).toBe('completion');
  });

  test('payloadReady is true', () => {
    expect(buildCompletionPresentation(session, blueprint).payloadReady).toBe(true);
  });

  test('promotionCount is 4', () => {
    expect(buildCompletionPresentation(session, blueprint).promotionCount).toBe(4);
  });

  test('assignmentCount is 4', () => {
    expect(buildCompletionPresentation(session, blueprint).assignmentCount).toBe(4);
  });

  test('warningsAcknowledged is true (no replay warnings)', () => {
    expect(buildCompletionPresentation(session, blueprint).warningsAcknowledged).toBe(true);
  });

  test('changedFields is empty (all answered with currentValues)', () => {
    expect(buildCompletionPresentation(session, blueprint).changedFields).toHaveLength(0);
  });

  test('does not throw', () => {
    expect(() => buildCompletionPresentation(session, blueprint)).not.toThrow();
  });
});
