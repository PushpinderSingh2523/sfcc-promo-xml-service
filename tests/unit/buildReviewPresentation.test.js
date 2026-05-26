'use strict';

const { buildReviewPresentation }  = require('../../src/presentation/adapters/buildReviewPresentation');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFieldSummary(overrides = {}) {
  return {
    fieldId:          'campaignId',
    key:              'campaignId::campaign::_::_',
    label:            'Campaign ID',
    group:            'Campaign',
    slotContext:      { slotType: 'campaign', slotIndex: null },
    xmlLang:          null,
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

function makeReviewSummary(overrides = {}) {
  return {
    groups: [
      {
        group: 'Campaign',
        fields: [makeFieldSummary()],
      },
      {
        group: 'Identity',
        fields: [
          makeFieldSummary({
            fieldId:        'promotionId',
            key:            'promotionId::promotion::0::_',
            label:          'Promotion ID',
            group:          'Identity',
            slotContext:    { slotType: 'promotion', slotIndex: 0 },
            priorValue:     'OLD_PROMO',
            newValue:       'NEW_PROMO',
            changed:        true,
            replayCritical: true,
          }),
        ],
      },
    ],
    replaySafetyWarnings: [],
    sessionStatus:        'COMPLETE',
    completionPercentage: 100,
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildReviewPresentation — input validation', () => {
  test('throws when reviewSummary is null', () => {
    expect(() => buildReviewPresentation(null)).toThrow('reviewSummary must be a non-null object');
  });

  test('throws when reviewSummary is a string', () => {
    expect(() => buildReviewPresentation('bad')).toThrow('reviewSummary must be a non-null object');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('buildReviewPresentation — return shape', () => {
  let presentation;

  beforeAll(() => { presentation = buildReviewPresentation(makeReviewSummary()); });

  test('type is "review"', () => {
    expect(presentation.type).toBe('review');
  });

  test('has all required top-level fields', () => {
    const required = [
      'type', 'sessionStatus', 'completionPercentage',
      'groups', 'replayWarnings', 'reviewRequired',
    ];
    required.forEach(f => expect(presentation).toHaveProperty(f));
  });

  test('groups is an array', () => {
    expect(Array.isArray(presentation.groups)).toBe(true);
  });

  test('replayWarnings is an array', () => {
    expect(Array.isArray(presentation.replayWarnings)).toBe(true);
  });
});

// ─── Field preservation ───────────────────────────────────────────────────────

describe('buildReviewPresentation — field preservation', () => {
  let campaignGroup;

  beforeAll(() => {
    const p = buildReviewPresentation(makeReviewSummary());
    campaignGroup = p.groups.find(g => g.group === 'Campaign');
  });

  test('field entry has all required properties', () => {
    const f = campaignGroup.fields[0];
    const required = [
      'fieldId', 'key', 'label', 'xmlLang', 'slotContext',
      'required', 'replayCritical', 'priorValue', 'newValue',
      'changed', 'answered', 'valid', 'validationErrors',
    ];
    required.forEach(prop => expect(f).toHaveProperty(prop));
  });

  test('priorValue preserved', () => {
    expect(campaignGroup.fields[0].priorValue).toBe('2025_SUMMER_SAS');
  });

  test('newValue preserved', () => {
    expect(campaignGroup.fields[0].newValue).toBe('2026_SUMMER_SAS');
  });

  test('changed=true preserved', () => {
    expect(campaignGroup.fields[0].changed).toBe(true);
  });

  test('changed=false preserved', () => {
    const summary = makeReviewSummary({
      groups: [{ group: 'Campaign', fields: [makeFieldSummary({ changed: false })] }],
    });
    const p = buildReviewPresentation(summary);
    expect(p.groups[0].fields[0].changed).toBe(false);
  });

  test('changed=null preserved (unanswered field)', () => {
    const summary = makeReviewSummary({
      groups: [{ group: 'Campaign', fields: [makeFieldSummary({ changed: null, answered: false })] }],
    });
    const p = buildReviewPresentation(summary);
    expect(p.groups[0].fields[0].changed).toBeNull();
  });

  test('replayCritical=true preserved', () => {
    const p = buildReviewPresentation(makeReviewSummary());
    const identityGroup = p.groups.find(g => g.group === 'Identity');
    expect(identityGroup.fields[0].replayCritical).toBe(true);
  });

  test('xmlLang preserved for localized field', () => {
    const summary = makeReviewSummary({
      groups: [{
        group: 'Identity',
        fields: [makeFieldSummary({ xmlLang: 'x-default', fieldId: 'name', key: 'name::promotion::0::x-default' })],
      }],
    });
    const p = buildReviewPresentation(summary);
    expect(p.groups[0].fields[0].xmlLang).toBe('x-default');
  });

  test('slotIndex 0 preserved (not treated as falsy)', () => {
    const summary = makeReviewSummary({
      groups: [{
        group: 'Identity',
        fields: [makeFieldSummary({
          slotContext: { slotType: 'promotion', slotIndex: 0 },
        })],
      }],
    });
    const p = buildReviewPresentation(summary);
    expect(p.groups[0].fields[0].slotContext.slotIndex).toBe(0);
  });

  test('validationErrors array preserved', () => {
    const errors = [{ rule: 'minLength', message: 'Too short' }];
    const summary = makeReviewSummary({
      groups: [{ group: 'Campaign', fields: [makeFieldSummary({ validationErrors: errors, valid: false })] }],
    });
    const p = buildReviewPresentation(summary);
    expect(p.groups[0].fields[0].validationErrors).toEqual(errors);
  });
});

// ─── Group ordering ───────────────────────────────────────────────────────────

describe('buildReviewPresentation — group ordering', () => {
  test('groups are in same order as buildReviewSummary output (GROUP_ORDER)', () => {
    const p = buildReviewPresentation(makeReviewSummary());
    expect(p.groups[0].group).toBe('Campaign');
    expect(p.groups[1].group).toBe('Identity');
  });

  test('does NOT reorder groups', () => {
    // Summary intentionally has groups in non-GROUP_ORDER for testing passthrough
    const summary = makeReviewSummary({
      groups: [
        { group: 'Discounting', fields: [makeFieldSummary({ group: 'Discounting' })] },
        { group: 'Campaign',    fields: [makeFieldSummary()] },
      ],
    });
    const p = buildReviewPresentation(summary);
    // Presentation layer preserves input order exactly
    expect(p.groups[0].group).toBe('Discounting');
    expect(p.groups[1].group).toBe('Campaign');
  });
});

// ─── Replay warnings ──────────────────────────────────────────────────────────

describe('buildReviewPresentation — replay warnings', () => {
  test('no warnings → replayWarnings empty, reviewRequired false', () => {
    const p = buildReviewPresentation(makeReviewSummary({ replaySafetyWarnings: [] }));
    expect(p.replayWarnings).toHaveLength(0);
    expect(p.reviewRequired).toBe(false);
  });

  test('warnings present → replayWarnings populated, reviewRequired true', () => {
    const summary = makeReviewSummary({
      replaySafetyWarnings: [{
        fieldId:    'campaignId',
        key:        'campaignId::campaign::_::_',
        slotContext: { slotType: 'campaign', slotIndex: null },
        severity:   'HIGH',
        message:    'Changing Campaign ID may affect replay.',
        priorValue: '2025_SUMMER_SAS',
        newValue:   '2026_SUMMER_SAS',
      }],
    });
    const p = buildReviewPresentation(summary);
    expect(p.replayWarnings).toHaveLength(1);
    expect(p.reviewRequired).toBe(true);
    expect(p.replayWarnings[0].severity).toBe('HIGH');
    expect(p.replayWarnings[0].acknowledgementRequired).toBe(true);
  });

  test('warning source ordering preserved', () => {
    const summary = makeReviewSummary({
      replaySafetyWarnings: [
        { fieldId: 'campaignId',  key: 'campaignId::campaign::_::_', slotContext: { slotType: 'campaign', slotIndex: null }, severity: 'HIGH', message: 'A', priorValue: 'O1', newValue: 'N1' },
        { fieldId: 'promotionId', key: 'promotionId::promotion::0::_', slotContext: { slotType: 'promotion', slotIndex: 0 }, severity: 'HIGH', message: 'B', priorValue: 'O2', newValue: 'N2' },
      ],
    });
    const p = buildReviewPresentation(summary);
    expect(p.replayWarnings[0].fieldId).toBe('campaignId');
    expect(p.replayWarnings[1].fieldId).toBe('promotionId');
  });
});

// ─── Session metadata passthrough ─────────────────────────────────────────────

describe('buildReviewPresentation — session metadata', () => {
  test('sessionStatus passed through', () => {
    const p = buildReviewPresentation(makeReviewSummary({ sessionStatus: 'REVIEW_PENDING' }));
    expect(p.sessionStatus).toBe('REVIEW_PENDING');
  });

  test('completionPercentage passed through', () => {
    const p = buildReviewPresentation(makeReviewSummary({ completionPercentage: 57 }));
    expect(p.completionPercentage).toBe(57);
  });
});

// ─── Mutation safety ──────────────────────────────────────────────────────────

describe('buildReviewPresentation — mutation safety', () => {
  test('does NOT mutate the input reviewSummary', () => {
    const summary  = makeReviewSummary();
    const snapshot = JSON.stringify(summary);
    buildReviewPresentation(summary);
    expect(JSON.stringify(summary)).toBe(snapshot);
  });

  test('mutating returned groups does not affect re-build', () => {
    const summary = makeReviewSummary();
    const p = buildReviewPresentation(summary);
    p.groups.push({ group: 'Fake', fields: [] });
    expect(buildReviewPresentation(summary).groups.length).toBe(2);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildReviewPresentation — determinism', () => {
  test('same input produces identical output', () => {
    const summary = makeReviewSummary();
    expect(JSON.stringify(buildReviewPresentation(summary)))
      .toBe(JSON.stringify(buildReviewPresentation(summary)));
  });
});
