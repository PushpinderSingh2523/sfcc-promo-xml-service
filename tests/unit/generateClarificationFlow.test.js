'use strict';

const path = require('path');
const fs   = require('fs');

const {
  generateClarificationFlow,
  generateGroupedClarificationFlow,
  _internals: { buildQuestion },
} = require('../../src/blueprints/clarification/generateClarificationFlow');

const { extractSASBlueprint } = require('../../src/blueprints/extractors/extractSASBlueprint');
const { GROUP_ORDER }         = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_XML = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8'
);

function makeBlueprint(opts = {}) {
  return {
    blueprintId:     'test-bp',
    sourceExport:    'test.xml',
    extractedAt:     '2025-01-01T00:00:00.000Z',
    campaignSlot:    opts.campaignSlot    || makeCampaignSlot(),
    promotionSlots:  opts.promotionSlots  || [makeSimplePromoSlot()],
    assignmentSlots: opts.assignmentSlots || [makeAssignmentSlot()],
  };
}

function makeCampaignSlot() {
  return {
    frozenStructure: { enabledFlag: true, campaignScope: { applicableOnline: true } },
    editableFields:  { campaignId: '2025_SUMMER_SAS' },
  };
}

function makeSimplePromoSlot(overrides = {}) {
  return {
    slotIndex: 0,
    frozenStructure: {
      enabledFlag: true, archivedFlag: false, searchableFlag: false, refinableFlag: false,
      preventRequalifyingFlag: false, prorateAcrossEligibleItemsFlag: false,
      exclusivity: 'class', nameLocales: ['x-default'],
      discountFamily: 'simple', simpleDiscountType: 'percentage',
      discountEntryTemplates: null, qualifyingProducts: null, discountedProducts: null,
      disableGlobalExcludedProducts: null, maxApplications: null, frozenCustomAttributes: [],
      ...overrides.frozenStructure,
    },
    editableFields: {
      promotionId: 'TEST_PROMO',
      names: [{ xmlLang: 'x-default', value: 'Test Promo' }],
      simpleDiscountValue: 25,
      discountEntries: null,
      editableCustomAttributes: [],
      ...overrides.editableFields,
    },
  };
}

function makeAssignmentSlot(overrides = {}) {
  return {
    slotIndex: 0,
    frozenStructure: {
      qualifiers: { matchMode: 'any', hasCustomerGroups: false, hasSourceCodes: false, hasCoupons: false },
      customerGroups: null, rank: 10, hasStartDate: false, hasEndDate: true,
      ...overrides.frozenStructure,
    },
    editableFields: {
      promotionId: 'TEST_PROMO', campaignId: '2025_SUMMER_SAS',
      couponIds: null, startDate: null, endDate: '2025-07-08T04:00:00.000Z',
      ...overrides.editableFields,
    },
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('generateClarificationFlow — input validation', () => {
  test('throws for null blueprint', () => {
    expect(() => generateClarificationFlow(null)).toThrow('blueprint');
  });

  test('throws for non-object', () => {
    expect(() => generateClarificationFlow('string')).toThrow();
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('generateClarificationFlow — return shape', () => {
  let flow;
  beforeAll(() => { flow = generateClarificationFlow(makeBlueprint()); });

  test('returns an array', () => {
    expect(Array.isArray(flow)).toBe(true);
  });

  test('array is non-empty', () => {
    expect(flow.length).toBeGreaterThan(0);
  });

  test('every question has required keys', () => {
    const REQUIRED_KEYS = [
      'fieldId', 'group', 'label', 'question', 'required',
      'currentValue', 'xmlLang', 'slotContext', 'validation', 'replayCritical',
    ];
    flow.forEach(q => {
      REQUIRED_KEYS.forEach(key => expect(q).toHaveProperty(key));
    });
  });

  test('slotContext has slotType and slotIndex', () => {
    flow.forEach(q => {
      expect(q.slotContext).toHaveProperty('slotType');
      expect(q.slotContext).toHaveProperty('slotIndex');
    });
  });
});

// ─── Question ordering ────────────────────────────────────────────────────────

describe('generateClarificationFlow — question ordering', () => {
  let flow;
  beforeAll(() => { flow = generateClarificationFlow(makeBlueprint()); });

  test('questions follow GROUP_ORDER sequence', () => {
    const groupRank = {};
    GROUP_ORDER.forEach((g, i) => { groupRank[g] = i; });

    for (let i = 1; i < flow.length; i++) {
      const prev = groupRank[flow[i - 1].group] ?? 999;
      const curr = groupRank[flow[i].group] ?? 999;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  test('Campaign group is first', () => {
    expect(flow[0].group).toBe('Campaign');
  });

  test('campaignId is the very first question', () => {
    expect(flow[0].fieldId).toBe('campaignId');
  });

  test('Identity questions come before Discounting questions', () => {
    const identityIdx  = flow.findIndex(q => q.group === 'Identity');
    const discountIdx  = flow.findIndex(q => q.group === 'Discounting');
    if (identityIdx !== -1 && discountIdx !== -1) {
      expect(identityIdx).toBeLessThan(discountIdx);
    }
  });

  test('Scheduling questions come before Merchandising questions', () => {
    const schedIdx = flow.findIndex(q => q.group === 'Scheduling');
    const merchIdx = flow.findIndex(q => q.group === 'Merchandising');
    if (schedIdx !== -1 && merchIdx !== -1) {
      expect(schedIdx).toBeLessThan(merchIdx);
    }
  });

  test('Merchandising before Storefront before Messaging', () => {
    const groups = [...new Set(flow.map(q => q.group))];
    const mIdx = groups.indexOf('Merchandising');
    const sIdx = groups.indexOf('Storefront');
    const msgIdx = groups.indexOf('Messaging');
    if (mIdx !== -1 && sIdx !== -1) expect(mIdx).toBeLessThan(sIdx);
    if (sIdx !== -1 && msgIdx !== -1) expect(sIdx).toBeLessThan(msgIdx);
  });
});

// ─── Only editable fields ─────────────────────────────────────────────────────

describe('generateClarificationFlow — only editable fields', () => {
  test('flow does NOT contain frozen-only fields (rank, exclusivity)', () => {
    const flow = generateClarificationFlow(makeBlueprint());
    const fieldIds = flow.map(q => q.fieldId);
    expect(fieldIds).not.toContain('rank');
    expect(fieldIds).not.toContain('exclusivity');
    expect(fieldIds).not.toContain('qualifiersMatchMode');
  });

  test('flow DOES contain editable fields (campaignId, promotionId, name)', () => {
    const flow = generateClarificationFlow(makeBlueprint());
    const fieldIds = flow.map(q => q.fieldId);
    expect(fieldIds).toContain('campaignId');
    expect(fieldIds).toContain('promotionId');
    expect(fieldIds).toContain('name');
  });
});

// ─── Question text ────────────────────────────────────────────────────────────

describe('generateClarificationFlow — question text from registry', () => {
  test('campaignId question text comes from registry (not hardcoded)', () => {
    const { getField } = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');
    const flow = generateClarificationFlow(makeBlueprint());
    const q = flow.find(q => q.fieldId === 'campaignId');
    expect(q.question).toBe(getField('campaignId').question);
  });

  test('every question string is non-empty', () => {
    const flow = generateClarificationFlow(makeBlueprint());
    flow.forEach(q => {
      expect(typeof q.question).toBe('string');
      expect(q.question.length).toBeGreaterThan(0);
    });
  });
});

// ─── Current value pass-through ───────────────────────────────────────────────

describe('generateClarificationFlow — currentValue pass-through', () => {
  test('campaignId carries current value from blueprint', () => {
    const flow = generateClarificationFlow(makeBlueprint());
    const q = flow.find(q => q.fieldId === 'campaignId');
    expect(q.currentValue).toBe('2025_SUMMER_SAS');
  });

  test('simpleDiscountValue carries numeric value', () => {
    const flow = generateClarificationFlow(makeBlueprint());
    const q = flow.find(q => q.fieldId === 'simpleDiscountValue');
    expect(q.currentValue).toBe(25);
  });

  test('endDate carries ISO-8601 string value', () => {
    const flow = generateClarificationFlow(makeBlueprint());
    const q = flow.find(q => q.fieldId === 'endDate');
    expect(q.currentValue).toBe('2025-07-08T04:00:00.000Z');
  });
});

// ─── replayCritical flag ──────────────────────────────────────────────────────

describe('generateClarificationFlow — replayCritical on editable fields', () => {
  test('campaignId question has replayCritical: true', () => {
    const flow = generateClarificationFlow(makeBlueprint());
    const q = flow.find(q => q.fieldId === 'campaignId');
    expect(q.replayCritical).toBe(true);
  });

  test('promotionId question has replayCritical: true', () => {
    const flow = generateClarificationFlow(makeBlueprint());
    const q = flow.find(q => q.fieldId === 'promotionId');
    expect(q.replayCritical).toBe(true);
  });

  test('storefront_msg_cart_inclusion question has replayCritical: false', () => {
    const slot = makeSimplePromoSlot({
      editableFields: {
        editableCustomAttributes: [
          { attributeId: 'storefront_msg_cart_inclusion', xmlLang: 'x-default', valueType: 'text', value: 'Applied' },
        ],
      },
    });
    const flow = generateClarificationFlow(makeBlueprint({ promotionSlots: [slot] }));
    const q = flow.find(q => q.fieldId === 'storefront_msg_cart_inclusion');
    if (q) expect(q.replayCritical).toBe(false);
  });
});

// ─── generateGroupedClarificationFlow ────────────────────────────────────────

describe('generateGroupedClarificationFlow', () => {
  let grouped;
  beforeAll(() => { grouped = generateGroupedClarificationFlow(makeBlueprint()); });

  test('returns object with GROUP_ORDER keys', () => {
    GROUP_ORDER.forEach(g => {
      expect(grouped).toHaveProperty(g);
    });
  });

  test('Campaign group has campaignId question', () => {
    const campaignQ = grouped['Campaign'].find(q => q.fieldId === 'campaignId');
    expect(campaignQ).toBeDefined();
  });

  test('all questions in a group have matching group field', () => {
    GROUP_ORDER.forEach(g => {
      grouped[g].forEach(q => {
        expect(q.group).toBe(g);
      });
    });
  });

  test('total questions in grouped equals flat flow length', () => {
    const flat = generateClarificationFlow(makeBlueprint());
    const total = GROUP_ORDER.reduce((sum, g) => sum + grouped[g].length, 0);
    expect(total).toBe(flat.length);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('generateClarificationFlow — determinism', () => {
  test('same blueprint produces identical flow on three calls', () => {
    const bp = makeBlueprint();
    const f1 = generateClarificationFlow(bp);
    const f2 = generateClarificationFlow(bp);
    const f3 = generateClarificationFlow(bp);
    expect(JSON.stringify(f1)).toBe(JSON.stringify(f2));
    expect(JSON.stringify(f2)).toBe(JSON.stringify(f3));
  });
});

// ─── No AI inference guarantee ────────────────────────────────────────────────

describe('generateClarificationFlow — no AI inference (structural guarantees)', () => {
  test('question text for unknown new field is not auto-generated', () => {
    // Any field not in the registry produces no question in the flow
    // (classification silently skips it; no hallucinated question is produced)
    const slot = makeSimplePromoSlot({
      editableFields: {
        editableCustomAttributes: [
          { attributeId: 'unknownNewAttribute_zzz', xmlLang: 'x-default', valueType: 'text', value: 'something' },
        ],
      },
    });
    const flow = generateClarificationFlow(makeBlueprint({ promotionSlots: [slot] }));
    const q = flow.find(q => q.fieldId === 'unknownNewAttribute_zzz');
    expect(q).toBeUndefined(); // Not in registry = no question generated
  });

  test('flow does not add questions beyond what registry defines', () => {
    const bp   = makeBlueprint();
    const flow = generateClarificationFlow(bp);
    flow.forEach(q => {
      const { getField } = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');
      const regEntry = getField(q.fieldId);
      expect(regEntry).toBeDefined();
      expect(regEntry.editable).toBe(true);
    });
  });
});

// ─── Summer_SAS.xml full flow ─────────────────────────────────────────────────

describe('generateClarificationFlow — Summer_SAS.xml full flow', () => {
  let blueprint;
  let flow;

  beforeAll(() => {
    blueprint = extractSASBlueprint(FIXTURE_XML, {
      blueprintId: 'flow-test', sourceExport: 'Summer_SAS.xml', extractedAt: '2025-01-01T00:00:00.000Z',
    });
    flow = generateClarificationFlow(blueprint);
  });

  test('generates a non-empty flow', () => {
    expect(flow.length).toBeGreaterThan(0);
  });

  test('first question is campaignId', () => {
    expect(flow[0].fieldId).toBe('campaignId');
    expect(flow[0].currentValue).toBe('2025_SUMMER_SAS');
  });

  test('flow includes all 4 promotionId questions', () => {
    const promoIdQs = flow.filter(q => q.fieldId === 'promotionId');
    expect(promoIdQs).toHaveLength(4);
  });

  test('flow includes endDate questions for all 4 assignments', () => {
    const endDateQs = flow.filter(q => q.fieldId === 'endDate');
    expect(endDateQs).toHaveLength(4);
  });

  test('flow includes storefront cart messages for all 4 promotions', () => {
    const inclusions = flow.filter(q => q.fieldId === 'storefront_msg_cart_inclusion');
    expect(inclusions).toHaveLength(4);
  });

  test('coupon questions only appear for assignments that have coupons', () => {
    const couponQs = flow.filter(q => q.fieldId === 'couponIds');
    // 2 assignments have coupons in Summer_SAS.xml
    expect(couponQs).toHaveLength(2);
  });
});
