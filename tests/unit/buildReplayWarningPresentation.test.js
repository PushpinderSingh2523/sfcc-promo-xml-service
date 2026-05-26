'use strict';

const { buildReplayWarningPresentation } = require('../../src/presentation/adapters/buildReplayWarningPresentation');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWarning(overrides = {}) {
  return {
    fieldId:    'campaignId',
    key:        'campaignId::campaign::_::_',
    slotContext: { slotType: 'campaign', slotIndex: null },
    severity:   'HIGH',
    message:    'Changing "Campaign ID" may affect replay parity. Prior value: "2025_SUMMER_SAS". New value: "2026_SUMMER_SAS".',
    priorValue: '2025_SUMMER_SAS',
    newValue:   '2026_SUMMER_SAS',
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildReplayWarningPresentation — input validation', () => {
  test('throws when warnings is not an array', () => {
    expect(() => buildReplayWarningPresentation(null)).toThrow('warnings must be an array');
    expect(() => buildReplayWarningPresentation('bad')).toThrow('warnings must be an array');
    expect(() => buildReplayWarningPresentation({})).toThrow('warnings must be an array');
  });
});

// ─── Empty warnings ───────────────────────────────────────────────────────────

describe('buildReplayWarningPresentation — empty warnings', () => {
  let presentation;

  beforeAll(() => { presentation = buildReplayWarningPresentation([]); });

  test('type is "warning"', () => {
    expect(presentation.type).toBe('warning');
  });

  test('warnings is empty array', () => {
    expect(presentation.warnings).toEqual([]);
  });

  test('totalWarnings is 0', () => {
    expect(presentation.totalWarnings).toBe(0);
  });

  test('acknowledgementRequired is false', () => {
    expect(presentation.acknowledgementRequired).toBe(false);
  });
});

// ─── Single warning ───────────────────────────────────────────────────────────

describe('buildReplayWarningPresentation — single warning', () => {
  let presentation;

  beforeAll(() => {
    presentation = buildReplayWarningPresentation([makeWarning()]);
  });

  test('type is "warning"', () => {
    expect(presentation.type).toBe('warning');
  });

  test('totalWarnings is 1', () => {
    expect(presentation.totalWarnings).toBe(1);
  });

  test('acknowledgementRequired is true', () => {
    expect(presentation.acknowledgementRequired).toBe(true);
  });

  test('warning entry has all required fields', () => {
    const w = presentation.warnings[0];
    expect(w).toHaveProperty('severity');
    expect(w).toHaveProperty('fieldId');
    expect(w).toHaveProperty('key');
    expect(w).toHaveProperty('slotContext');
    expect(w).toHaveProperty('message');
    expect(w).toHaveProperty('priorValue');
    expect(w).toHaveProperty('newValue');
    expect(w).toHaveProperty('acknowledgementRequired');
  });

  test('severity preserved as HIGH', () => {
    expect(presentation.warnings[0].severity).toBe('HIGH');
  });

  test('fieldId preserved', () => {
    expect(presentation.warnings[0].fieldId).toBe('campaignId');
  });

  test('key preserved', () => {
    expect(presentation.warnings[0].key).toBe('campaignId::campaign::_::_');
  });

  test('message preserved verbatim', () => {
    expect(presentation.warnings[0].message).toContain('replay parity');
  });

  test('priorValue preserved', () => {
    expect(presentation.warnings[0].priorValue).toBe('2025_SUMMER_SAS');
  });

  test('newValue preserved', () => {
    expect(presentation.warnings[0].newValue).toBe('2026_SUMMER_SAS');
  });

  test('acknowledgementRequired is true on individual warning', () => {
    expect(presentation.warnings[0].acknowledgementRequired).toBe(true);
  });

  test('slotContext has slotType and slotIndex', () => {
    const sc = presentation.warnings[0].slotContext;
    expect(sc.slotType).toBe('campaign');
    expect(sc.slotIndex).toBeNull();
  });
});

// ─── Multiple warnings ────────────────────────────────────────────────────────

describe('buildReplayWarningPresentation — multiple warnings', () => {
  const w1 = makeWarning({ fieldId: 'campaignId', key: 'campaignId::campaign::_::_' });
  const w2 = makeWarning({
    fieldId:    'promotionId',
    key:        'promotionId::promotion::0::_',
    slotContext: { slotType: 'promotion', slotIndex: 0 },
    priorValue: 'OLD_PROMO',
    newValue:   'NEW_PROMO',
    message:    'Changing "Promotion ID" may affect replay parity.',
  });

  let presentation;

  beforeAll(() => {
    presentation = buildReplayWarningPresentation([w1, w2]);
  });

  test('totalWarnings is 2', () => {
    expect(presentation.totalWarnings).toBe(2);
  });

  test('warnings array has 2 entries', () => {
    expect(presentation.warnings).toHaveLength(2);
  });

  test('source ordering is preserved', () => {
    expect(presentation.warnings[0].fieldId).toBe('campaignId');
    expect(presentation.warnings[1].fieldId).toBe('promotionId');
  });

  test('slotIndex 0 preserved on promotion warning', () => {
    expect(presentation.warnings[1].slotContext.slotIndex).toBe(0);
  });

  test('all individual warnings have acknowledgementRequired=true', () => {
    presentation.warnings.forEach(w => expect(w.acknowledgementRequired).toBe(true));
  });
});

// ─── Mutation safety ──────────────────────────────────────────────────────────

describe('buildReplayWarningPresentation — mutation safety', () => {
  test('does NOT mutate the input warnings array', () => {
    const warnings = [makeWarning()];
    const snapshot = JSON.stringify(warnings);
    buildReplayWarningPresentation(warnings);
    expect(JSON.stringify(warnings)).toBe(snapshot);
  });

  test('modifying returned warnings does not affect re-build', () => {
    const warnings = [makeWarning()];
    const p = buildReplayWarningPresentation(warnings);
    p.warnings[0].severity = 'MUTATED';
    const p2 = buildReplayWarningPresentation(warnings);
    expect(p2.warnings[0].severity).toBe('HIGH');
  });

  test('presentation layer NEVER modifies orchestration state', () => {
    // Simulated session warnings array — must remain untouched
    const sessionWarnings = Object.freeze([Object.freeze(makeWarning())]);
    expect(() => buildReplayWarningPresentation(sessionWarnings)).not.toThrow();
    expect(sessionWarnings[0].severity).toBe('HIGH'); // unchanged
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildReplayWarningPresentation — determinism', () => {
  test('same inputs produce identical output', () => {
    const warnings = [makeWarning()];
    expect(JSON.stringify(buildReplayWarningPresentation(warnings)))
      .toBe(JSON.stringify(buildReplayWarningPresentation(warnings)));
  });
});
