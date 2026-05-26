'use strict';

const {
  buildQuestionPresentation,
  _internals: { buildValidationHints, buildProgressContext },
} = require('../../src/presentation/adapters/buildQuestionPresentation');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNextQuestion(overrides = {}) {
  return {
    key:          'campaignId::campaign::_::_',
    fieldId:      'campaignId',
    slotType:     'campaign',
    slotIndex:    null,
    xmlLang:      null,
    group:        'Campaign',
    label:        'Campaign ID',
    question:     'What is the campaign ID for the new season?',
    required:     true,
    currentValue: '2025_SUMMER_SAS',
    validation:   { minLength: 1, maxLength: 100 },
    replayCritical: false,
    isRetry:        false,
    validationErrors: [],
    priorRawValue: undefined,
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    sessionId:            'test-session',
    status:               'IN_PROGRESS',
    completionPercentage: 40,
    currentGroup:         'Campaign',
    groupedProgress: {
      Campaign:    { total: 1, answered: 0, complete: false },
      Identity:    { total: 4, answered: 2, complete: false },
      Scheduling:  { total: 0, answered: 0, complete: false },
      Discounting: { total: 0, answered: 0, complete: false },
      Coupons:     { total: 0, answered: 0, complete: false },
      Eligibility: { total: 0, answered: 0, complete: false },
      Categories:  { total: 0, answered: 0, complete: false },
      Merchandising: { total: 0, answered: 0, complete: false },
      Storefront:  { total: 0, answered: 0, complete: false },
      Messaging:   { total: 0, answered: 0, complete: false },
      Operational: { total: 0, answered: 0, complete: false },
      Localization: { total: 0, answered: 0, complete: false },
    },
    answers: {},
    invalidFields: {},
    questionQueue: [],
    ...overrides,
  };
}

// ─── buildValidationHints ─────────────────────────────────────────────────────

describe('buildValidationHints', () => {
  test('null spec → empty array', () => {
    expect(buildValidationHints(null)).toEqual([]);
  });

  test('undefined spec → empty array', () => {
    expect(buildValidationHints(undefined)).toEqual([]);
  });

  test('minLength → hint', () => {
    const hints = buildValidationHints({ minLength: 3 });
    expect(hints.some(h => h.includes('3'))).toBe(true);
    expect(hints.some(h => h.toLowerCase().includes('minimum'))).toBe(true);
  });

  test('maxLength → hint', () => {
    const hints = buildValidationHints({ maxLength: 100 });
    expect(hints.some(h => h.includes('100'))).toBe(true);
    expect(hints.some(h => h.toLowerCase().includes('maximum'))).toBe(true);
  });

  test('iso8601 format → format hint', () => {
    const hints = buildValidationHints({ format: 'iso8601' });
    expect(hints.some(h => h.includes('ISO-8601'))).toBe(true);
  });

  test('min → min value hint', () => {
    const hints = buildValidationHints({ min: 0 });
    expect(hints.some(h => h.includes('0'))).toBe(true);
  });

  test('max → max value hint', () => {
    const hints = buildValidationHints({ max: 100 });
    expect(hints.some(h => h.includes('100'))).toBe(true);
  });

  test('type integer → whole number hint', () => {
    const hints = buildValidationHints({ type: 'integer' });
    expect(hints.some(h => h.toLowerCase().includes('whole'))).toBe(true);
  });

  test('minItems → item count hint', () => {
    const hints = buildValidationHints({ minItems: 1 });
    expect(hints.some(h => h.includes('1'))).toBe(true);
    expect(hints.some(h => h.toLowerCase().includes('item'))).toBe(true);
  });

  test('pattern → format hint', () => {
    const hints = buildValidationHints({ pattern: '^\\S+$' });
    expect(hints.length).toBeGreaterThan(0);
  });

  test('multiple spec properties → multiple hints', () => {
    const hints = buildValidationHints({ minLength: 1, maxLength: 100, format: 'iso8601' });
    expect(hints.length).toBeGreaterThanOrEqual(3);
  });

  test('returns plain string array', () => {
    const hints = buildValidationHints({ minLength: 1 });
    hints.forEach(h => expect(typeof h).toBe('string'));
  });
});

// ─── buildProgressContext ─────────────────────────────────────────────────────

describe('buildProgressContext', () => {
  test('returns currentGroup from question group', () => {
    const ctx = buildProgressContext(makeNextQuestion(), makeSession());
    expect(ctx.currentGroup).toBe('Campaign');
  });

  test('completedInGroup from groupedProgress', () => {
    const ctx = buildProgressContext(makeNextQuestion({ group: 'Identity' }), makeSession());
    expect(ctx.completedInGroup).toBe(2);
    expect(ctx.totalInGroup).toBe(4);
  });

  test('overallPercentage from session.completionPercentage', () => {
    const ctx = buildProgressContext(makeNextQuestion(), makeSession({ completionPercentage: 60 }));
    expect(ctx.overallPercentage).toBe(60);
  });

  test('group not in groupedProgress → completedInGroup=0, totalInGroup=0', () => {
    const ctx = buildProgressContext(makeNextQuestion({ group: 'UnknownGroup' }), makeSession());
    expect(ctx.completedInGroup).toBe(0);
    expect(ctx.totalInGroup).toBe(0);
  });
});

// ─── buildQuestionPresentation — input validation ─────────────────────────────

describe('buildQuestionPresentation — input validation', () => {
  test('throws when nextQuestion is null', () => {
    expect(() => buildQuestionPresentation(null, makeSession()))
      .toThrow('nextQuestion must be a non-null object');
  });

  test('throws when session is null', () => {
    expect(() => buildQuestionPresentation(makeNextQuestion(), null))
      .toThrow('session must be a non-null object');
  });

  test('throws when nextQuestion is a string', () => {
    expect(() => buildQuestionPresentation('bad', makeSession()))
      .toThrow('nextQuestion must be a non-null object');
  });
});

// ─── buildQuestionPresentation — return shape ─────────────────────────────────

describe('buildQuestionPresentation — return shape', () => {
  let presentation;

  beforeAll(() => {
    presentation = buildQuestionPresentation(makeNextQuestion(), makeSession());
  });

  test('type is "question"', () => {
    expect(presentation.type).toBe('question');
  });

  test('all required fields present', () => {
    expect(presentation).toHaveProperty('type');
    expect(presentation).toHaveProperty('key');
    expect(presentation).toHaveProperty('group');
    expect(presentation).toHaveProperty('label');
    expect(presentation).toHaveProperty('question');
    expect(presentation).toHaveProperty('required');
    expect(presentation).toHaveProperty('currentValue');
    expect(presentation).toHaveProperty('replayCritical');
    expect(presentation).toHaveProperty('xmlLang');
    expect(presentation).toHaveProperty('slotContext');
    expect(presentation).toHaveProperty('progress');
    expect(presentation).toHaveProperty('choices');
    expect(presentation).toHaveProperty('validationHints');
    expect(presentation).toHaveProperty('retryMetadata');
  });

  test('slotContext has slotType and slotIndex', () => {
    expect(presentation.slotContext).toHaveProperty('slotType');
    expect(presentation.slotContext).toHaveProperty('slotIndex');
  });

  test('progress has all four fields', () => {
    expect(presentation.progress).toHaveProperty('currentGroup');
    expect(presentation.progress).toHaveProperty('completedInGroup');
    expect(presentation.progress).toHaveProperty('totalInGroup');
    expect(presentation.progress).toHaveProperty('overallPercentage');
  });

  test('retryMetadata has isRetry, validationErrors, priorRawValue', () => {
    expect(presentation.retryMetadata).toHaveProperty('isRetry');
    expect(presentation.retryMetadata).toHaveProperty('validationErrors');
    expect(presentation.retryMetadata).toHaveProperty('priorRawValue');
  });
});

// ─── Field value preservation ─────────────────────────────────────────────────

describe('buildQuestionPresentation — field value preservation', () => {
  test('label is verbatim from queueItem', () => {
    const q = makeNextQuestion({ label: 'Exact Label Text' });
    expect(buildQuestionPresentation(q, makeSession()).label).toBe('Exact Label Text');
  });

  test('question text is verbatim from queueItem', () => {
    const q = makeNextQuestion({ question: 'Exact question text?' });
    expect(buildQuestionPresentation(q, makeSession()).question).toBe('Exact question text?');
  });

  test('required flag preserved', () => {
    expect(buildQuestionPresentation(makeNextQuestion({ required: true }), makeSession()).required).toBe(true);
    expect(buildQuestionPresentation(makeNextQuestion({ required: false }), makeSession()).required).toBe(false);
  });

  test('replayCritical flag preserved', () => {
    const pTrue  = buildQuestionPresentation(makeNextQuestion({ replayCritical: true }),  makeSession());
    const pFalse = buildQuestionPresentation(makeNextQuestion({ replayCritical: false }), makeSession());
    expect(pTrue.replayCritical).toBe(true);
    expect(pFalse.replayCritical).toBe(false);
  });

  test('currentValue preserved', () => {
    const q = makeNextQuestion({ currentValue: '2025_SUMMER_SAS' });
    expect(buildQuestionPresentation(q, makeSession()).currentValue).toBe('2025_SUMMER_SAS');
  });

  test('currentValue null when undefined', () => {
    const q = makeNextQuestion();
    delete q.currentValue;
    expect(buildQuestionPresentation(q, makeSession()).currentValue).toBeNull();
  });

  test('xmlLang preserved for localized field', () => {
    const q = makeNextQuestion({ xmlLang: 'x-default' });
    expect(buildQuestionPresentation(q, makeSession()).xmlLang).toBe('x-default');
  });

  test('xmlLang null for non-localized field', () => {
    expect(buildQuestionPresentation(makeNextQuestion({ xmlLang: null }), makeSession()).xmlLang).toBeNull();
  });

  test('slotIndex 0 preserved (not treated as falsy)', () => {
    const q = makeNextQuestion({ slotIndex: 0 });
    expect(buildQuestionPresentation(q, makeSession()).slotContext.slotIndex).toBe(0);
  });
});

// ─── Choices ──────────────────────────────────────────────────────────────────

describe('buildQuestionPresentation — choices (enum)', () => {
  test('choices extracted from validation.enum', () => {
    const q = makeNextQuestion({
      validation: { enum: ['no-overlap', 'class', 'global'] },
    });
    const p = buildQuestionPresentation(q, makeSession());
    expect(p.choices).toEqual(['no-overlap', 'class', 'global']);
  });

  test('choices is null for non-enum fields', () => {
    const p = buildQuestionPresentation(makeNextQuestion({ validation: { minLength: 1 } }), makeSession());
    expect(p.choices).toBeNull();
  });

  test('choices is null when validation is null', () => {
    const p = buildQuestionPresentation(makeNextQuestion({ validation: null }), makeSession());
    expect(p.choices).toBeNull();
  });

  test('enum choices are in same order as registry', () => {
    const q = makeNextQuestion({ validation: { enum: ['b', 'a', 'c'] } });
    expect(buildQuestionPresentation(q, makeSession()).choices).toEqual(['b', 'a', 'c']);
  });
});

// ─── Retry metadata ───────────────────────────────────────────────────────────

describe('buildQuestionPresentation — retryMetadata', () => {
  test('isRetry=false on first attempt', () => {
    const p = buildQuestionPresentation(makeNextQuestion({ isRetry: false }), makeSession());
    expect(p.retryMetadata.isRetry).toBe(false);
  });

  test('isRetry=true on retry', () => {
    const q = makeNextQuestion({
      isRetry: true,
      validationErrors: [{ rule: 'required', message: 'Campaign ID is required' }],
      priorRawValue: '',
    });
    const p = buildQuestionPresentation(q, makeSession());
    expect(p.retryMetadata.isRetry).toBe(true);
    expect(p.retryMetadata.validationErrors).toHaveLength(1);
    expect(p.retryMetadata.validationErrors[0].rule).toBe('required');
    expect(p.retryMetadata.priorRawValue).toBe('');
  });

  test('priorRawValue null when not set', () => {
    const p = buildQuestionPresentation(makeNextQuestion(), makeSession());
    expect(p.retryMetadata.priorRawValue).toBeNull();
  });

  test('validationErrors empty array on non-retry', () => {
    const p = buildQuestionPresentation(makeNextQuestion(), makeSession());
    expect(p.retryMetadata.validationErrors).toEqual([]);
  });
});

// ─── Mutation safety ──────────────────────────────────────────────────────────

describe('buildQuestionPresentation — mutation safety', () => {
  test('does NOT mutate the input nextQuestion', () => {
    const q        = makeNextQuestion();
    const snapshot = JSON.stringify(q);
    buildQuestionPresentation(q, makeSession());
    expect(JSON.stringify(q)).toBe(snapshot);
  });

  test('does NOT mutate the input session', () => {
    const s        = makeSession();
    const snapshot = JSON.stringify(s);
    buildQuestionPresentation(makeNextQuestion(), s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  test('choices array is a copy — mutating output does not affect input', () => {
    const q = makeNextQuestion({ validation: { enum: ['a', 'b', 'c'] } });
    const p = buildQuestionPresentation(q, makeSession());
    p.choices.push('d');
    // Re-build should still produce 3 choices
    expect(buildQuestionPresentation(q, makeSession()).choices).toHaveLength(3);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildQuestionPresentation — determinism', () => {
  test('same inputs produce identical output', () => {
    const q = makeNextQuestion();
    const s = makeSession();
    const p1 = buildQuestionPresentation(q, s);
    const p2 = buildQuestionPresentation(q, s);
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
  });
});
