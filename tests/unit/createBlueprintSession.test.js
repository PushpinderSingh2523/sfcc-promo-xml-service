'use strict';

const { createBlueprintSession }           = require('../../src/blueprints/session/createBlueprintSession');
const { STATUS }                           = require('../../src/blueprints/session/updateBlueprintSession');
const { GROUP_ORDER }                      = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBlueprint(overrides = {}) {
  return {
    blueprintId: 'test-bp-001',
    campaignSlot: {
      frozenStructure: { enabledFlag: true },
      editableFields:  { campaignId: '2025_SUMMER_SAS' },
    },
    promotionSlots: [{
      slotIndex: 0,
      frozenStructure: {
        enabledFlag: true, archivedFlag: false, searchableFlag: false, refinableFlag: false,
        preventRequalifyingFlag: false, prorateAcrossEligibleItemsFlag: false,
        exclusivity: 'class', nameLocales: ['x-default'],
        discountFamily: 'simple', simpleDiscountType: 'percentage',
        discountEntryTemplates: null, qualifyingProducts: null, discountedProducts: null,
        disableGlobalExcludedProducts: null, maxApplications: null, frozenCustomAttributes: [],
      },
      editableFields: {
        promotionId: 'TEST_PROMO',
        names: [{ xmlLang: 'x-default', value: 'Test Promo' }],
        simpleDiscountValue: 25, discountEntries: null, editableCustomAttributes: [],
      },
    }],
    assignmentSlots: [{
      slotIndex: 0,
      frozenStructure: {
        qualifiers: { matchMode: 'any', hasCustomerGroups: false, hasSourceCodes: false, hasCoupons: false },
        customerGroups: null, rank: 10, hasStartDate: false, hasEndDate: true,
      },
      editableFields: {
        promotionId: 'TEST_PROMO', campaignId: '2025_SUMMER_SAS',
        couponIds: null, startDate: null, endDate: '2025-07-08T04:00:00.000Z',
      },
    }],
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('createBlueprintSession — input validation', () => {
  test('throws when blueprint is null', () => {
    expect(() => createBlueprintSession(null)).toThrow('blueprint must be a non-null object');
  });

  test('throws when blueprint is a string', () => {
    expect(() => createBlueprintSession('bad')).toThrow('blueprint must be a non-null object');
  });

  test('throws when campaignSlot is missing', () => {
    const bp = makeBlueprint();
    delete bp.campaignSlot;
    expect(() => createBlueprintSession(bp)).toThrow('blueprint.campaignSlot is required');
  });

  test('throws when promotionSlots is missing', () => {
    const bp = makeBlueprint();
    delete bp.promotionSlots;
    expect(() => createBlueprintSession(bp)).toThrow('blueprint.promotionSlots must be a non-empty array');
  });

  test('throws when promotionSlots is empty array', () => {
    const bp = makeBlueprint({ promotionSlots: [] });
    expect(() => createBlueprintSession(bp)).toThrow('blueprint.promotionSlots must be a non-empty array');
  });

  test('throws when assignmentSlots is missing', () => {
    const bp = makeBlueprint();
    delete bp.assignmentSlots;
    expect(() => createBlueprintSession(bp)).toThrow('blueprint.assignmentSlots must be a non-empty array');
  });

  test('throws when assignmentSlots is empty array', () => {
    const bp = makeBlueprint({ assignmentSlots: [] });
    expect(() => createBlueprintSession(bp)).toThrow('blueprint.assignmentSlots must be a non-empty array');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('createBlueprintSession — return shape', () => {
  let session;

  beforeAll(() => {
    session = createBlueprintSession(makeBlueprint(), {
      sessionId: 'fixed-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  test('returns an object', () => {
    expect(session).toBeDefined();
    expect(typeof session).toBe('object');
  });

  test('sessionId is set from options', () => {
    expect(session.sessionId).toBe('fixed-session-id');
  });

  test('blueprintId matches blueprint', () => {
    expect(session.blueprintId).toBe('test-bp-001');
  });

  test('createdAt is set from options', () => {
    expect(session.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test('status is CREATED', () => {
    expect(session.status).toBe(STATUS.CREATED);
  });

  test('answers is an empty object', () => {
    expect(typeof session.answers).toBe('object');
    expect(Object.keys(session.answers)).toHaveLength(0);
  });

  test('invalidFields is an empty object', () => {
    expect(typeof session.invalidFields).toBe('object');
    expect(Object.keys(session.invalidFields)).toHaveLength(0);
  });

  test('questionQueue is a non-empty array', () => {
    expect(Array.isArray(session.questionQueue)).toBe(true);
    expect(session.questionQueue.length).toBeGreaterThan(0);
  });

  test('unansweredFields contains all queue keys', () => {
    const queueKeys = session.questionQueue.map(q => q.key);
    queueKeys.forEach(k => expect(session.unansweredFields).toContain(k));
  });

  test('completionPercentage is 0', () => {
    expect(session.completionPercentage).toBe(0);
  });

  test('reviewRequired is false', () => {
    expect(session.reviewRequired).toBe(false);
  });

  test('replaySafetyWarnings is empty array', () => {
    expect(session.replaySafetyWarnings).toEqual([]);
  });

  test('reviewConfirmedAt is null', () => {
    expect(session.reviewConfirmedAt).toBeNull();
  });

  test('generatedPayload is null', () => {
    expect(session.generatedPayload).toBeNull();
  });

  test('groupedProgress is an object keyed by GROUP_ORDER entries', () => {
    GROUP_ORDER.forEach(group => {
      expect(session.groupedProgress).toHaveProperty(group);
    });
  });

  test('groupedProgress groups with questions have total > 0', () => {
    expect(session.groupedProgress['Campaign'].total).toBeGreaterThan(0);
    expect(session.groupedProgress['Identity'].total).toBeGreaterThan(0);
  });

  test('groupedProgress answered is 0 for all groups initially', () => {
    Object.values(session.groupedProgress).forEach(gp => {
      expect(gp.answered).toBe(0);
    });
  });

  test('currentGroup is the first group with questions', () => {
    // First question is campaignId → Campaign group
    expect(session.currentGroup).toBe('Campaign');
  });
});

// ─── Options ──────────────────────────────────────────────────────────────────

describe('createBlueprintSession — options', () => {
  test('sessionId defaults to a generated string when not provided', () => {
    const s = createBlueprintSession(makeBlueprint());
    expect(typeof s.sessionId).toBe('string');
    expect(s.sessionId.length).toBeGreaterThan(0);
  });

  test('generated sessionId incorporates blueprintId', () => {
    const s = createBlueprintSession(makeBlueprint({ blueprintId: 'bp-xyz' }));
    expect(s.sessionId).toContain('bp-xyz');
  });

  test('createdAt defaults to current ISO timestamp when not provided', () => {
    const before = new Date().toISOString();
    const s      = createBlueprintSession(makeBlueprint());
    const after  = new Date().toISOString();
    expect(s.createdAt >= before).toBe(true);
    expect(s.createdAt <= after).toBe(true);
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('createBlueprintSession — determinism', () => {
  test('two sessions from identical blueprints have identical question queue order', () => {
    const bp = makeBlueprint();
    const s1 = createBlueprintSession(bp, { sessionId: 's1', createdAt: '2026-01-01T00:00:00.000Z' });
    const s2 = createBlueprintSession(bp, { sessionId: 's2', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(s1.questionQueue.map(q => q.key)).toEqual(s2.questionQueue.map(q => q.key));
  });

  test('session does not mutate the input blueprint', () => {
    const bp       = makeBlueprint();
    const snapshot = JSON.stringify(bp);
    createBlueprintSession(bp);
    expect(JSON.stringify(bp)).toBe(snapshot);
  });
});

// ─── Summer_SAS.xml integration ───────────────────────────────────────────────

describe('createBlueprintSession — Summer_SAS.xml', () => {
  const path = require('path');
  const fs   = require('fs');
  const { extractSASBlueprint } = require('../../src/blueprints/extractors/extractSASBlueprint');

  let session;

  beforeAll(() => {
    const xml = fs.readFileSync(path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8');
    const bp  = extractSASBlueprint(xml);
    session   = createBlueprintSession(bp, { sessionId: 'sas-test', createdAt: '2026-01-01T00:00:00.000Z' });
  });

  test('produces 35 questions for Summer_SAS.xml', () => {
    expect(session.questionQueue.length).toBe(35);
  });

  test('unansweredFields has 35 entries', () => {
    expect(session.unansweredFields.length).toBe(35);
  });

  test('completionPercentage is 0', () => {
    expect(session.completionPercentage).toBe(0);
  });

  test('status is CREATED', () => {
    expect(session.status).toBe(STATUS.CREATED);
  });

  test('blueprintId is populated from blueprint', () => {
    expect(typeof session.blueprintId).toBe('string');
    expect(session.blueprintId.length).toBeGreaterThan(0);
  });
});
