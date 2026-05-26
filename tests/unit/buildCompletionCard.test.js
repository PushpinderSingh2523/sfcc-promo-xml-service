'use strict';

const { buildCompletionCard, _internals } = require('../../src/teams/cards/buildCompletionCard');
const { buildChangedFieldFact }           = _internals;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePresentation(overrides = {}) {
  return {
    type:                'completion',
    sessionId:           'sess-001',
    blueprintId:         'bp-Summer_SAS_2025',
    status:              'COMPLETE',
    completionPercentage: 31,
    promotionCount:      4,
    assignmentCount:     4,
    answeredFields:      11,
    totalFields:         35,
    payloadReady:        true,
    warningsAcknowledged: true,
    replayWarnings:      [],
    changedFields:       [],
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildCompletionCard — input validation', () => {
  test('throws when presentation is null', () => {
    expect(() => buildCompletionCard(null)).toThrow('presentation must be a non-null object');
  });
  test('throws when type is not "completion"', () => {
    expect(() => buildCompletionCard({ type: 'review' }))
      .toThrow('buildCompletionCard expects type "completion"');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('buildCompletionCard — return shape', () => {
  let card;
  beforeAll(() => { card = buildCompletionCard(makePresentation()); });

  test('type is AdaptiveCard', () => { expect(card.type).toBe('AdaptiveCard'); });
  test('version is 1.5',       () => { expect(card.version).toBe('1.5'); });
  test('has $schema',          () => { expect(card.$schema).toMatch(/adaptivecards/); });
  test('body is an array',     () => { expect(Array.isArray(card.body)).toBe(true); });
  test('actions is an array',  () => { expect(Array.isArray(card.actions)).toBe(true); });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe('buildCompletionCard — metadata', () => {
  let cardStr;
  beforeAll(() => { cardStr = JSON.stringify(buildCompletionCard(makePresentation())); });

  test('sessionId appears in card', () => { expect(cardStr).toContain('sess-001'); });
  test('blueprintId appears in card', () => { expect(cardStr).toContain('bp-Summer_SAS_2025'); });
  test('status appears in card', () => { expect(cardStr).toContain('COMPLETE'); });
  test('answeredFields and totalFields appear', () => {
    expect(cardStr).toContain('11');
    expect(cardStr).toContain('35');
  });
  test('promotionCount appears', () => { expect(cardStr).toContain('4'); });
  test('completionPercentage appears', () => { expect(cardStr).toContain('31%'); });
});

// ─── payloadReady states ──────────────────────────────────────────────────────

describe('buildCompletionCard — payloadReady', () => {
  test('payloadReady=true shows ✅ header and generate action', () => {
    const card = buildCompletionCard(makePresentation({ payloadReady: true }));
    const headerBlock = card.body[0];
    expect(headerBlock.text).toContain('✅');
    const hasGenerate = card.actions.some(a =>
      a.type === 'Action.Submit' && a.data && a.data.action === 'CONFIRM_GENERATION'
    );
    expect(hasGenerate).toBe(true);
  });

  test('payloadReady=false shows pending header, no generate action', () => {
    const card = buildCompletionCard(makePresentation({ payloadReady: false, status: 'IN_PROGRESS' }));
    const headerBlock = card.body[0];
    expect(headerBlock.text).toContain('⏳');
    const hasGenerate = card.actions.some(a =>
      a.type === 'Action.Submit' && a.data && a.data.action === 'CONFIRM_GENERATION'
    );
    expect(hasGenerate).toBe(false);
  });
});

// ─── warningsAcknowledged ─────────────────────────────────────────────────────

describe('buildCompletionCard — warningsAcknowledged', () => {
  test('acknowledged=true shows ✅ text', () => {
    const card = buildCompletionCard(makePresentation({ warningsAcknowledged: true }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('All acknowledged');
  });

  test('acknowledged=false shows pending text', () => {
    const card = buildCompletionCard(makePresentation({ warningsAcknowledged: false }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('Pending');
  });
});

// ─── Changed fields ───────────────────────────────────────────────────────────

describe('buildCompletionCard — changedFields', () => {
  test('changed fields section appears when there are changes', () => {
    const card = buildCompletionCard(makePresentation({
      changedFields: [{
        fieldId: 'campaignId', key: 'campaignId::campaign::_::_',
        label: 'Campaign ID',
        slotContext: { slotType: 'campaign', slotIndex: null },
        priorValue: '2025_SUMMER_SAS', newValue: '2026_SUMMER_SAS',
      }],
    }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('Campaign ID');
    expect(cardStr).toContain('2025_SUMMER_SAS');
    expect(cardStr).toContain('2026_SUMMER_SAS');
  });

  test('no changed fields shows "no fields changed" message', () => {
    const card = buildCompletionCard(makePresentation({ changedFields: [] }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('No fields changed');
  });

  test('changed field with slotIndex 0 shows "(Slot 0)"', () => {
    const card = buildCompletionCard(makePresentation({
      changedFields: [{
        fieldId: 'promotionId', key: 'promotionId::promotion::0::_',
        label: 'Promotion ID',
        slotContext: { slotType: 'promotion', slotIndex: 0 },
        priorValue: 'OLD', newValue: 'NEW',
      }],
    }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('Slot 0');
  });
});

// ─── Replay warnings summary ──────────────────────────────────────────────────

describe('buildCompletionCard — replayWarnings', () => {
  test('replay warnings note appears when warnings present', () => {
    const card = buildCompletionCard(makePresentation({
      replayWarnings: [{ severity: 'HIGH', fieldId: 'campaignId', message: '...' }],
    }));
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain('replay warning');
  });

  test('no replay warnings section when empty', () => {
    const card = buildCompletionCard(makePresentation({ replayWarnings: [] }));
    const cardStr = JSON.stringify(card);
    // No "replay warning" text (beyond section count)
    const body = JSON.stringify(card.body);
    expect(body).not.toContain('replay warning');
  });
});

// ─── buildChangedFieldFact ────────────────────────────────────────────────────

describe('buildChangedFieldFact', () => {
  test('title includes field label', () => {
    const fact = buildChangedFieldFact({
      label: 'Campaign ID',
      slotContext: { slotType: 'campaign', slotIndex: null },
      priorValue: 'OLD', newValue: 'NEW',
    });
    expect(fact.title).toContain('Campaign ID');
  });

  test('value shows prior → new', () => {
    const fact = buildChangedFieldFact({
      label: 'Campaign ID',
      slotContext: { slotType: 'campaign', slotIndex: null },
      priorValue: 'OLD', newValue: 'NEW',
    });
    expect(fact.value).toBe('OLD → NEW');
  });

  test('slotIndex 0 included in title', () => {
    const fact = buildChangedFieldFact({
      label: 'Promotion ID',
      slotContext: { slotType: 'promotion', slotIndex: 0 },
      priorValue: 'OLD', newValue: 'NEW',
    });
    expect(fact.title).toContain('(Slot 0)');
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildCompletionCard — determinism', () => {
  test('same presentation produces identical card', () => {
    const p = makePresentation();
    expect(JSON.stringify(buildCompletionCard(p))).toBe(JSON.stringify(buildCompletionCard(p)));
  });
});
