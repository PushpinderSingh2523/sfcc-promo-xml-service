'use strict';

const { buildReviewCard, _internals } = require('../../src/teams/cards/buildReviewCard');
const { changeBadge, displayValue, buildWarningsSummary } = _internals;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeField(overrides = {}) {
  return {
    fieldId:          'campaignId',
    key:              'campaignId::campaign::_::_',
    label:            'Campaign ID',
    xmlLang:          null,
    slotContext:      { slotType: 'campaign', slotIndex: null },
    required:         true,
    replayCritical:   false,
    priorValue:       '2025_SUMMER_SAS',
    newValue:         '2026_SUMMER_SAS',
    changed:          true,
    answered:         true,
    valid:            true,
    validationErrors: [],
    ...overrides,
  };
}

function makePresentation(overrides = {}) {
  return {
    type:                'review',
    sessionStatus:       'REVIEW_PENDING',
    completionPercentage: 34,
    groups: [
      { group: 'Campaign', fields: [makeField()] },
    ],
    replayWarnings:      [],
    reviewRequired:      false,
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildReviewCard — input validation', () => {
  test('throws when presentation is null', () => {
    expect(() => buildReviewCard(null)).toThrow('presentation must be a non-null object');
  });
  test('throws when type is not "review"', () => {
    expect(() => buildReviewCard({ type: 'question' }))
      .toThrow('buildReviewCard expects type "review"');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('buildReviewCard — return shape', () => {
  let card;
  beforeAll(() => { card = buildReviewCard(makePresentation()); });

  test('type is AdaptiveCard', () => { expect(card.type).toBe('AdaptiveCard'); });
  test('version is 1.5',       () => { expect(card.version).toBe('1.5'); });
  test('has $schema',          () => { expect(card.$schema).toMatch(/adaptivecards/); });
  test('body is an array',     () => { expect(Array.isArray(card.body)).toBe(true); });
  test('actions is an array',  () => { expect(Array.isArray(card.actions)).toBe(true); });
});

// ─── Session metadata ─────────────────────────────────────────────────────────

describe('buildReviewCard — session metadata', () => {
  test('sessionStatus appears in card body', () => {
    const card = buildReviewCard(makePresentation({ sessionStatus: 'REVIEW_PENDING' }));
    const hasStatus = card.body.some(b => b.text && b.text.includes('REVIEW_PENDING'));
    expect(hasStatus).toBe(true);
  });

  test('completionPercentage appears in card body', () => {
    const card = buildReviewCard(makePresentation({ completionPercentage: 57 }));
    const hasPercent = card.body.some(b => b.text && b.text.includes('57%'));
    expect(hasPercent).toBe(true);
  });
});

// ─── Group sections ───────────────────────────────────────────────────────────

describe('buildReviewCard — group sections', () => {
  test('group name appears in body', () => {
    const card = buildReviewCard(makePresentation());
    const hasGroup = card.body.some(b => b.text && b.text.includes('Campaign'));
    expect(hasGroup).toBe(true);
  });

  test('field label appears in body', () => {
    const card = buildReviewCard(makePresentation());
    const hasLabel = card.body.some(b =>
      (b.text && b.text.includes('Campaign ID')) ||
      (Array.isArray(b.items) && b.items.some(i => i.text && i.text.includes('Campaign ID')))
    );
    expect(hasLabel).toBe(true);
  });

  test('prior value appears somewhere in card', () => {
    const card = buildReviewCard(makePresentation());
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('2025_SUMMER_SAS');
  });

  test('new value appears somewhere in card', () => {
    const card = buildReviewCard(makePresentation());
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('2026_SUMMER_SAS');
  });
});

// ─── changed badge rendering ──────────────────────────────────────────────────

describe('buildReviewCard — change badges', () => {
  test('changed=true renders "Changed" badge', () => {
    const card = buildReviewCard(makePresentation({
      groups: [{ group: 'Campaign', fields: [makeField({ changed: true, answered: true })] }],
    }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('Changed');
  });

  test('changed=null renders "Not answered" badge', () => {
    const card = buildReviewCard(makePresentation({
      groups: [{ group: 'Campaign', fields: [makeField({ changed: null, answered: false })] }],
    }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('Not answered');
  });

  test('changed=false renders no badge', () => {
    expect(changeBadge(false, true)).toBe('');
  });

  test('changeBadge: not answered returns unanswered badge', () => {
    expect(changeBadge(null, false)).toContain('Not answered');
  });

  test('changeBadge: changed true returns Changed badge', () => {
    expect(changeBadge(true, true)).toContain('Changed');
  });
});

// ─── replayCritical indicator ─────────────────────────────────────────────────

describe('buildReviewCard — replayCritical', () => {
  test('replayCritical field has warning icon in card', () => {
    const card = buildReviewCard(makePresentation({
      groups: [{ group: 'Campaign', fields: [makeField({ replayCritical: true })] }],
    }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('⚠');
  });
});

// ─── Replay warnings summary ──────────────────────────────────────────────────

describe('buildReviewCard — replay warnings', () => {
  test('replay warnings appear in body when present', () => {
    const card = buildReviewCard(makePresentation({
      replayWarnings: [{
        severity: 'HIGH', fieldId: 'campaignId',
        message: 'Campaign ID change may affect replay.',
        priorValue: '2025_SUMMER_SAS', newValue: '2026_SUMMER_SAS',
      }],
    }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('Campaign ID change may affect replay');
  });

  test('no warnings → no warnings section', () => {
    const blocks = buildWarningsSummary([]);
    expect(blocks).toHaveLength(0);
  });
});

// ─── Actions ──────────────────────────────────────────────────────────────────

describe('buildReviewCard — actions', () => {
  test('has CONFIRM_GENERATION action', () => {
    const card = buildReviewCard(makePresentation());
    const hasConfirm = card.actions.some(a => a.data && a.data.action === 'CONFIRM_GENERATION');
    expect(hasConfirm).toBe(true);
  });

  test('has CANCEL_SESSION action', () => {
    const card = buildReviewCard(makePresentation());
    const hasCancel = card.actions.some(a => a.data && a.data.action === 'CANCEL_SESSION');
    expect(hasCancel).toBe(true);
  });
});

// ─── displayValue ─────────────────────────────────────────────────────────────

describe('displayValue', () => {
  test('null returns em-dash', () => { expect(displayValue(null)).toBe('—'); });
  test('undefined returns em-dash', () => { expect(displayValue(undefined)).toBe('—'); });
  test('array is joined', () => { expect(displayValue(['a', 'b'])).toBe('a, b'); });
  test('number is stringified', () => { expect(displayValue(42)).toBe('42'); });
  test('string is returned as-is', () => { expect(displayValue('hello')).toBe('hello'); });
});

// ─── Slot index ───────────────────────────────────────────────────────────────

describe('buildReviewCard — slot index 0 preserved', () => {
  test('slotIndex 0 appears in card (not treated as falsy)', () => {
    const card = buildReviewCard(makePresentation({
      groups: [{
        group: 'Identity',
        fields: [makeField({ slotContext: { slotType: 'promotion', slotIndex: 0 }, label: 'Promotion ID' })],
      }],
    }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('Slot 0');
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildReviewCard — determinism', () => {
  test('same presentation produces identical card', () => {
    const p = makePresentation();
    expect(JSON.stringify(buildReviewCard(p))).toBe(JSON.stringify(buildReviewCard(p)));
  });
});
