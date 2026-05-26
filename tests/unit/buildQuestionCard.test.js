'use strict';

const { buildQuestionCard, _internals } = require('../../src/teams/cards/buildQuestionCard');
const {
  buildRetryBanner, buildInputControl, buildHintBlocks,
  buildCurrentValueBlock, slotLabel, buildProgressFooter,
} = _internals;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePresentation(overrides = {}) {
  return {
    type:           'question',
    key:            'campaignId::campaign::_::_',
    fieldId:        'campaignId',
    group:          'Campaign',
    label:          'Campaign ID',
    question:       'What is the Campaign ID?',
    required:       true,
    currentValue:   '2025_SUMMER_SAS',
    replayCritical: false,
    xmlLang:        null,
    slotContext:    { slotType: 'campaign', slotIndex: null },
    progress:       { currentGroup: 'Campaign', completedInGroup: 0, totalInGroup: 1, overallPercentage: 0 },
    choices:        null,
    validationHints: [],
    retryMetadata:  { isRetry: false, validationErrors: [], priorRawValue: null },
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildQuestionCard — input validation', () => {
  test('throws when presentation is null', () => {
    expect(() => buildQuestionCard(null)).toThrow('presentation must be a non-null object');
  });
  test('throws when type is not "question"', () => {
    expect(() => buildQuestionCard({ type: 'progress' }))
      .toThrow('buildQuestionCard expects type "question"');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('buildQuestionCard — return shape', () => {
  let card;
  beforeAll(() => { card = buildQuestionCard(makePresentation()); });

  test('type is AdaptiveCard', () => {
    expect(card.type).toBe('AdaptiveCard');
  });
  test('version is 1.5', () => {
    expect(card.version).toBe('1.5');
  });
  test('has $schema', () => {
    expect(card.$schema).toBe('http://adaptivecards.io/schemas/adaptive-card.json');
  });
  test('body is an array', () => {
    expect(Array.isArray(card.body)).toBe(true);
  });
  test('actions is an array', () => {
    expect(Array.isArray(card.actions)).toBe(true);
  });
  test('has a Submit action', () => {
    const submit = card.actions.find(a => a.type === 'Action.Submit');
    expect(submit).toBeDefined();
  });
  test('submit action has SUBMIT_ANSWER action in data', () => {
    const submit = card.actions.find(a => a.type === 'Action.Submit');
    expect(submit.data.action).toBe('SUBMIT_ANSWER');
  });
  test('submit action data has fieldKey', () => {
    const submit = card.actions.find(a => a.type === 'Action.Submit');
    expect(submit.data.fieldKey).toBe('campaignId::campaign::_::_');
  });
});

// ─── Group header ─────────────────────────────────────────────────────────────

describe('buildQuestionCard — group header', () => {
  test('body contains group name', () => {
    const card = buildQuestionCard(makePresentation({ group: 'Discounting' }));
    const text = card.body.map(b => b.text || '').join(' ');
    expect(text).toContain('Discounting');
  });
});

// ─── Label and badges ─────────────────────────────────────────────────────────

describe('buildQuestionCard — label and badges', () => {
  test('label appears in a body text block', () => {
    const card = buildQuestionCard(makePresentation({ label: 'Campaign ID' }));
    const hasLabel = card.body.some(b => b.text && b.text.includes('Campaign ID'));
    expect(hasLabel).toBe(true);
  });

  test('replayCritical flag adds warning badge text', () => {
    const card = buildQuestionCard(makePresentation({ replayCritical: true }));
    const hasWarning = card.body.some(b => b.text && b.text.includes('Replay-critical'));
    expect(hasWarning).toBe(true);
  });

  test('xmlLang adds locale badge text', () => {
    const card = buildQuestionCard(makePresentation({ xmlLang: 'x-default' }));
    const hasLocale = card.body.some(b => b.text && b.text.includes('x-default'));
    expect(hasLocale).toBe(true);
  });

  test('optional field shows "(optional)" in label', () => {
    const card = buildQuestionCard(makePresentation({ required: false }));
    const hasOptional = card.body.some(b => b.text && b.text.includes('optional'));
    expect(hasOptional).toBe(true);
  });

  test('required field does not show "(optional)"', () => {
    const card = buildQuestionCard(makePresentation({ required: true }));
    const hasOptional = card.body.some(b => b.text && b.text.includes('optional'));
    expect(hasOptional).toBe(false);
  });
});

// ─── Input controls ───────────────────────────────────────────────────────────

describe('buildQuestionCard — input controls', () => {
  test('text input when choices is null', () => {
    const card = buildQuestionCard(makePresentation({ choices: null }));
    const hasTextInput = card.body.some(b => b.type === 'Input.Text');
    expect(hasTextInput).toBe(true);
  });

  test('choice set when choices is provided', () => {
    const card = buildQuestionCard(makePresentation({ choices: ['PRODUCT', 'ORDER'] }));
    const hasChoiceSet = card.body.some(b => b.type === 'Input.ChoiceSet');
    expect(hasChoiceSet).toBe(true);
  });

  test('choice set has correct choices', () => {
    const card = buildQuestionCard(makePresentation({ choices: ['PRODUCT', 'ORDER', 'SHIPPING'] }));
    const cs = card.body.find(b => b.type === 'Input.ChoiceSet');
    expect(cs.choices).toHaveLength(3);
    expect(cs.choices[0].value).toBe('PRODUCT');
    expect(cs.choices[2].value).toBe('SHIPPING');
  });

  test('input has id "fieldValue"', () => {
    const card = buildQuestionCard(makePresentation());
    const input = card.body.find(b => b.id === 'fieldValue');
    expect(input).toBeDefined();
  });
});

// ─── Current value block ──────────────────────────────────────────────────────

describe('buildQuestionCard — current value', () => {
  test('current value appears in card body', () => {
    const card = buildQuestionCard(makePresentation({ currentValue: '2025_SUMMER_SAS' }));
    const hasValue = card.body.some(b => b.text && b.text.includes('2025_SUMMER_SAS'));
    expect(hasValue).toBe(true);
  });

  test('null currentValue does not add a block', () => {
    expect(buildCurrentValueBlock(null)).toBeNull();
    expect(buildCurrentValueBlock(undefined)).toBeNull();
  });
});

// ─── Validation hints ─────────────────────────────────────────────────────────

describe('buildQuestionCard — validation hints', () => {
  test('hints appear in body', () => {
    const card = buildQuestionCard(makePresentation({
      validationHints: ['Minimum 3 characters', 'Maximum 50 characters'],
    }));
    const hasMin = card.body.some(b => b.text && b.text.includes('Minimum 3 characters'));
    const hasMax = card.body.some(b => b.text && b.text.includes('Maximum 50 characters'));
    expect(hasMin).toBe(true);
    expect(hasMax).toBe(true);
  });

  test('empty hints produce no hint blocks', () => {
    const blocks = buildHintBlocks([]);
    expect(blocks).toHaveLength(0);
  });
});

// ─── Retry banner ─────────────────────────────────────────────────────────────

describe('buildQuestionCard — retry banner', () => {
  test('no retry banner when isRetry is false', () => {
    const card = buildQuestionCard(makePresentation());
    const hasRed = card.body.some(b => b.color === 'Attention' && b.weight === 'Bolder');
    expect(hasRed).toBe(false);
  });

  test('retry banner appears when isRetry is true', () => {
    const card = buildQuestionCard(makePresentation({
      retryMetadata: {
        isRetry: true,
        validationErrors: [{ message: 'Must be a whole number' }],
        priorRawValue: 'bad-value',
      },
    }));
    const banner = card.body.find(b => b.color === 'Attention' && b.weight === 'Bolder');
    expect(banner).toBeDefined();
  });

  test('retry banner contains error message', () => {
    const card = buildQuestionCard(makePresentation({
      retryMetadata: {
        isRetry: true,
        validationErrors: [{ message: 'Must be a whole number' }],
        priorRawValue: null,
      },
    }));
    const banner = card.body.find(b => b.color === 'Attention' && b.weight === 'Bolder');
    expect(banner.text).toContain('Must be a whole number');
  });

  test('buildRetryBanner returns null when isRetry is false', () => {
    expect(buildRetryBanner({ isRetry: false, validationErrors: [], priorRawValue: null })).toBeNull();
  });

  test('retry input pre-fills with priorRawValue', () => {
    const card = buildQuestionCard(makePresentation({
      retryMetadata: { isRetry: true, validationErrors: [], priorRawValue: 'bad-input' },
    }));
    const input = card.body.find(b => b.id === 'fieldValue');
    expect(input.value).toBe('bad-input');
  });
});

// ─── Progress footer ──────────────────────────────────────────────────────────

describe('buildQuestionCard — progress footer', () => {
  test('progress text appears in body', () => {
    const card = buildQuestionCard(makePresentation({
      progress: { currentGroup: 'Campaign', completedInGroup: 1, totalInGroup: 5, overallPercentage: 20 },
    }));
    const hasProgress = card.body.some(b => b.text && b.text.includes('1/5'));
    expect(hasProgress).toBe(true);
  });

  test('overallPercentage appears in body', () => {
    const card = buildQuestionCard(makePresentation({
      progress: { currentGroup: 'Campaign', completedInGroup: 0, totalInGroup: 1, overallPercentage: 43 },
    }));
    const hasPercent = card.body.some(b => b.text && b.text.includes('43%'));
    expect(hasPercent).toBe(true);
  });
});

// ─── slotLabel ────────────────────────────────────────────────────────────────

describe('slotLabel', () => {
  test('returns " (Slot 0)" for slotIndex 0', () => {
    expect(slotLabel({ slotType: 'promotion', slotIndex: 0 })).toBe(' (Slot 0)');
  });
  test('returns "" for null slotIndex', () => {
    expect(slotLabel({ slotType: 'campaign', slotIndex: null })).toBe('');
  });
  test('returns "" for null slotContext', () => {
    expect(slotLabel(null)).toBe('');
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildQuestionCard — determinism', () => {
  test('same presentation produces identical card', () => {
    const p = makePresentation();
    expect(JSON.stringify(buildQuestionCard(p)))
      .toBe(JSON.stringify(buildQuestionCard(p)));
  });
});
