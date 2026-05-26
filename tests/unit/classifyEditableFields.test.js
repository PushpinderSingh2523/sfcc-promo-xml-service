'use strict';

const path = require('path');
const fs   = require('fs');

const {
  classifyEditableFields,
  _internals: {
    classifyPromotionSlot,
    classifyAssignmentSlot,
    buildGroupedFields,
    buildOrderedQuestions,
    buildValidationRequirements,
    makeClassifiedField,
  },
} = require('../../src/blueprints/classification/classifyEditableFields');

const { extractSASBlueprint }           = require('../../src/blueprints/extractors/extractSASBlueprint');
const { GROUP_ORDER, REGISTRY_MAP }     = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_XML = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8'
);

function makeBlueprint(opts = {}) {
  return {
    blueprintId:      'test-bp',
    sourceExport:     'test.xml',
    extractedAt:      '2025-01-01T00:00:00.000Z',
    campaignSlot:     opts.campaignSlot     || makeCampaignSlot(),
    promotionSlots:   opts.promotionSlots   || [makeSimplePromoSlot()],
    assignmentSlots:  opts.assignmentSlots  || [makeAssignmentSlot()],
  };
}

function makeCampaignSlot(id = '2025_SUMMER_SAS') {
  return {
    frozenStructure: { enabledFlag: true, campaignScope: { applicableOnline: true } },
    editableFields:  { campaignId: id },
  };
}

function makeSimplePromoSlot(overrides = {}) {
  return {
    slotIndex: 0,
    frozenStructure: {
      enabledFlag: true, archivedFlag: false, searchableFlag: false,
      refinableFlag: false, preventRequalifyingFlag: false, prorateAcrossEligibleItemsFlag: false,
      exclusivity: 'class',
      nameLocales: ['x-default'],
      discountFamily: 'simple',
      simpleDiscountType: 'percentage',
      discountEntryTemplates: null,
      qualifyingProducts: null,
      discountedProducts: null,
      disableGlobalExcludedProducts: null,
      maxApplications: null,
      frozenCustomAttributes: [],
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
      customerGroups: null,
      rank: 10,
      hasStartDate: false,
      hasEndDate: true,
      ...overrides.frozenStructure,
    },
    editableFields: {
      promotionId: 'TEST_PROMO',
      campaignId:  '2025_SUMMER_SAS',
      couponIds:   null,
      startDate:   null,
      endDate:     '2025-07-08T04:00:00.000Z',
      ...overrides.editableFields,
    },
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('classifyEditableFields — input validation', () => {
  test('throws for null blueprint', () => {
    expect(() => classifyEditableFields(null)).toThrow('blueprint');
  });

  test('throws for non-object blueprint', () => {
    expect(() => classifyEditableFields('string')).toThrow();
  });

  test('throws when campaignSlot is missing', () => {
    const bp = makeBlueprint();
    delete bp.campaignSlot;
    expect(() => classifyEditableFields(bp)).toThrow('campaignSlot');
  });

  test('throws when promotionSlots is empty', () => {
    expect(() => classifyEditableFields(makeBlueprint({ promotionSlots: [] }))).toThrow();
  });

  test('throws when assignmentSlots is empty', () => {
    expect(() => classifyEditableFields(makeBlueprint({ assignmentSlots: [] }))).toThrow();
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('classifyEditableFields — return shape', () => {
  let result;
  beforeAll(() => { result = classifyEditableFields(makeBlueprint()); });

  test('returns object with groupedFields, orderedQuestions, validationRequirements', () => {
    expect(result).toHaveProperty('groupedFields');
    expect(result).toHaveProperty('orderedQuestions');
    expect(result).toHaveProperty('validationRequirements');
  });

  test('groupedFields has all GROUP_ORDER keys', () => {
    GROUP_ORDER.forEach(g => {
      expect(result.groupedFields).toHaveProperty(g);
    });
  });

  test('orderedQuestions is an array', () => {
    expect(Array.isArray(result.orderedQuestions)).toBe(true);
  });

  test('validationRequirements is an array', () => {
    expect(Array.isArray(result.validationRequirements)).toBe(true);
  });
});

// ─── ClassifiedField shape ────────────────────────────────────────────────────

describe('classifyEditableFields — ClassifiedField shape', () => {
  let result;
  beforeAll(() => { result = classifyEditableFields(makeBlueprint()); });

  test('every classifiedField has required keys', () => {
    const REQUIRED_KEYS = ['fieldId', 'slotType', 'slotIndex', 'path', 'currentValue', 'xmlLang', 'registryEntry'];
    result.orderedQuestions.forEach(cf => {
      REQUIRED_KEYS.forEach(key => expect(cf).toHaveProperty(key));
    });
  });

  test('registryEntry on each classifiedField matches REGISTRY_MAP', () => {
    result.orderedQuestions.forEach(cf => {
      expect(cf.registryEntry).toBe(REGISTRY_MAP.get(cf.fieldId));
    });
  });

  test('slotType is one of campaign, promotion, assignment', () => {
    result.orderedQuestions.forEach(cf => {
      expect(['campaign', 'promotion', 'assignment']).toContain(cf.slotType);
    });
  });
});

// ─── campaignId classification ────────────────────────────────────────────────

describe('classifyEditableFields — campaignId', () => {
  test('campaignId appears in groupedFields.Campaign', () => {
    const result = classifyEditableFields(makeBlueprint());
    const campaignGroup = result.groupedFields['Campaign'];
    const cf = campaignGroup.find(f => f.fieldId === 'campaignId');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('2025_SUMMER_SAS');
    expect(cf.slotType).toBe('campaign');
    expect(cf.slotIndex).toBeNull();
  });

  test('campaignId appears in orderedQuestions (first question)', () => {
    const result = classifyEditableFields(makeBlueprint());
    expect(result.orderedQuestions[0].fieldId).toBe('campaignId');
  });
});

// ─── promotionId classification ───────────────────────────────────────────────

describe('classifyEditableFields — promotionId', () => {
  test('promotionId appears in Identity group', () => {
    const result = classifyEditableFields(makeBlueprint());
    const identityGroup = result.groupedFields['Identity'];
    const cf = identityGroup.find(f => f.fieldId === 'promotionId');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('TEST_PROMO');
    expect(cf.slotType).toBe('promotion');
    expect(cf.slotIndex).toBe(0);
  });
});

// ─── Name classification ──────────────────────────────────────────────────────

describe('classifyEditableFields — name (localized)', () => {
  test('name fields appear in Identity group', () => {
    const result = classifyEditableFields(makeBlueprint());
    const nameFlds = result.groupedFields['Identity'].filter(f => f.fieldId === 'name');
    expect(nameFlds.length).toBeGreaterThan(0);
  });

  test('name field carries xmlLang from source', () => {
    const result = classifyEditableFields(makeBlueprint());
    const nameField = result.groupedFields['Identity'].find(f => f.fieldId === 'name');
    expect(nameField.xmlLang).toBe('x-default');
    expect(nameField.currentValue).toBe('Test Promo');
  });

  test('multiple locales produce multiple classified name entries', () => {
    const slot = makeSimplePromoSlot({
      frozenStructure: { nameLocales: ['x-default', 'en'] },
      editableFields: {
        names: [
          { xmlLang: 'x-default', value: 'Test Promo' },
          { xmlLang: 'en',        value: 'Test Promo EN' },
        ],
      },
    });
    const result = classifyEditableFields(makeBlueprint({ promotionSlots: [slot] }));
    const nameFields = result.groupedFields['Identity'].filter(f => f.fieldId === 'name');
    expect(nameFields.length).toBe(2);
    const locales = nameFields.map(f => f.xmlLang);
    expect(locales).toContain('x-default');
    expect(locales).toContain('en');
  });
});

// ─── Discount classification ──────────────────────────────────────────────────

describe('classifyEditableFields — discounting', () => {
  test('simpleDiscountValue appears in Discounting group', () => {
    const result = classifyEditableFields(makeBlueprint());
    const discountGroup = result.groupedFields['Discounting'];
    const cf = discountGroup.find(f => f.fieldId === 'simpleDiscountValue');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe(25);
  });

  test('discountEntries appears in Discounting group when present', () => {
    const slot = makeSimplePromoSlot({
      frozenStructure: { discountFamily: 'product-amount', simpleDiscountType: null, discountEntryTemplates: [{ discountType: 'amount' }] },
      editableFields:  { simpleDiscountValue: null, discountEntries: [{ threshold: 250, discountValue: 50 }] },
    });
    const result = classifyEditableFields(makeBlueprint({ promotionSlots: [slot] }));
    const cf = result.groupedFields['Discounting'].find(f => f.fieldId === 'discountEntries');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toEqual([{ threshold: 250, discountValue: 50 }]);
  });

  test('simpleDiscountValue NOT emitted when null', () => {
    const slot = makeSimplePromoSlot({
      editableFields: { simpleDiscountValue: null },
    });
    const result = classifyEditableFields(makeBlueprint({ promotionSlots: [slot] }));
    const cf = result.groupedFields['Discounting'].find(f => f.fieldId === 'simpleDiscountValue');
    expect(cf).toBeUndefined();
  });
});

// ─── Custom attribute classification ─────────────────────────────────────────

describe('classifyEditableFields — editable custom attributes', () => {
  test('storefront_msg_cart_inclusion appears in Storefront group', () => {
    const slot = makeSimplePromoSlot({
      editableFields: {
        editableCustomAttributes: [
          { attributeId: 'storefront_msg_cart_inclusion', xmlLang: 'x-default', valueType: 'text', value: 'Discount Applied' },
        ],
      },
    });
    const result = classifyEditableFields(makeBlueprint({ promotionSlots: [slot] }));
    const cf = result.groupedFields['Storefront']
      .find(f => f.fieldId === 'storefront_msg_cart_inclusion');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('Discount Applied');
    expect(cf.xmlLang).toBe('x-default');
  });

  test('couponErrorMsgNoActivePromotion appears in Messaging group', () => {
    const slot = makeSimplePromoSlot({
      editableFields: {
        editableCustomAttributes: [
          { attributeId: 'couponErrorMsgNoActivePromotion', xmlLang: 'x-default', valueType: 'text', value: 'This promo code has expired' },
        ],
      },
    });
    const result = classifyEditableFields(makeBlueprint({ promotionSlots: [slot] }));
    const cf = result.groupedFields['Messaging']
      .find(f => f.fieldId === 'couponErrorMsgNoActivePromotion');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('This promo code has expired');
  });

  test('includedBadge appears in Merchandising group', () => {
    const slot = makeSimplePromoSlot({
      editableFields: {
        editableCustomAttributes: [
          { attributeId: 'includedBadge', xmlLang: 'x-default', valueType: 'text', value: '{price} after 25% off' },
        ],
      },
    });
    const result = classifyEditableFields(makeBlueprint({ promotionSlots: [slot] }));
    const cf = result.groupedFields['Merchandising'].find(f => f.fieldId === 'includedBadge');
    expect(cf).toBeDefined();
    expect(cf.xmlLang).toBe('x-default');
  });
});

// ─── Scheduling classification ────────────────────────────────────────────────

describe('classifyEditableFields — scheduling', () => {
  test('endDate appears in Scheduling group when hasEndDate is true', () => {
    const result = classifyEditableFields(makeBlueprint());
    const cf = result.groupedFields['Scheduling'].find(f => f.fieldId === 'endDate');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('2025-07-08T04:00:00.000Z');
    expect(cf.slotType).toBe('assignment');
  });

  test('startDate NOT emitted when hasStartDate is false', () => {
    const result = classifyEditableFields(makeBlueprint());
    const cf = result.groupedFields['Scheduling'].find(f => f.fieldId === 'startDate');
    expect(cf).toBeUndefined();
  });

  test('startDate emitted when hasStartDate is true', () => {
    const aSlot = makeAssignmentSlot({
      frozenStructure: { hasStartDate: true, hasEndDate: true },
      editableFields:  { startDate: '2025-06-01T00:00:00.000Z', endDate: '2025-07-01T00:00:00.000Z' },
    });
    const result = classifyEditableFields(makeBlueprint({ assignmentSlots: [aSlot] }));
    const cf = result.groupedFields['Scheduling'].find(f => f.fieldId === 'startDate');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('2025-06-01T00:00:00.000Z');
  });
});

// ─── Coupon classification ────────────────────────────────────────────────────

describe('classifyEditableFields — coupons', () => {
  test('couponIds appears in Coupons group when non-null', () => {
    const aSlot = makeAssignmentSlot({
      editableFields: { couponIds: ['2025-Summer-SAS-CS'] },
    });
    const result = classifyEditableFields(makeBlueprint({ assignmentSlots: [aSlot] }));
    const cf = result.groupedFields['Coupons'].find(f => f.fieldId === 'couponIds');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toEqual(['2025-Summer-SAS-CS']);
  });

  test('couponIds NOT emitted when null', () => {
    const result = classifyEditableFields(makeBlueprint());
    const cf = result.groupedFields['Coupons'].find(f => f.fieldId === 'couponIds');
    expect(cf).toBeUndefined();
  });
});

// ─── Eligibility and Operational (frozen, replay-critical) ───────────────────

describe('classifyEditableFields — frozen replay-critical fields', () => {
  test('qualifiersMatchMode appears in Eligibility group', () => {
    const result = classifyEditableFields(makeBlueprint());
    const cf = result.groupedFields['Eligibility'].find(f => f.fieldId === 'qualifiersMatchMode');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('any');
    expect(cf.registryEntry.replayCritical).toBe(true);
  });

  test('rank appears in Operational group', () => {
    const result = classifyEditableFields(makeBlueprint());
    const cf = result.groupedFields['Operational'].find(f => f.fieldId === 'rank');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe(10);
    expect(cf.registryEntry.replayCritical).toBe(true);
  });

  test('exclusivity appears in Operational group', () => {
    const result = classifyEditableFields(makeBlueprint());
    const cf = result.groupedFields['Operational'].find(f => f.fieldId === 'exclusivity');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('class');
  });

  test('maxApplications NOT emitted when null', () => {
    const result = classifyEditableFields(makeBlueprint());
    const cf = result.groupedFields['Operational'].find(f => f.fieldId === 'maxApplications');
    expect(cf).toBeUndefined();
  });

  test('maxApplications emitted when present', () => {
    const slot = makeSimplePromoSlot({
      frozenStructure: { maxApplications: 1 },
    });
    const result = classifyEditableFields(makeBlueprint({ promotionSlots: [slot] }));
    const cf = result.groupedFields['Operational'].find(f => f.fieldId === 'maxApplications');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe(1);
  });

  test('customerGroupIds emitted when outer customer-groups is present', () => {
    const aSlot = makeAssignmentSlot({
      frozenStructure: {
        customerGroups: { matchMode: 'any', groupIds: ['Everyone-webapp-except-employees'] },
      },
    });
    const result = classifyEditableFields(makeBlueprint({ assignmentSlots: [aSlot] }));
    const cf = result.groupedFields['Eligibility'].find(f => f.fieldId === 'customerGroupIds');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toContain('Everyone-webapp-except-employees');
  });
});

// ─── Ordering guarantees ──────────────────────────────────────────────────────

describe('classifyEditableFields — ordering guarantees', () => {
  test('orderedQuestions follow GROUP_ORDER sequence', () => {
    const result = classifyEditableFields(makeBlueprint());
    const groupRank = {};
    GROUP_ORDER.forEach((g, i) => { groupRank[g] = i; });

    for (let i = 1; i < result.orderedQuestions.length; i++) {
      const prev = groupRank[result.orderedQuestions[i - 1].registryEntry.group];
      const curr = groupRank[result.orderedQuestions[i].registryEntry.group];
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  test('orderedQuestions only contains editable fields', () => {
    const result = classifyEditableFields(makeBlueprint());
    result.orderedQuestions.forEach(cf => {
      expect(cf.registryEntry.editable).toBe(true);
    });
  });

  test('campaignId is always the first ordered question', () => {
    const result = classifyEditableFields(makeBlueprint());
    expect(result.orderedQuestions[0].fieldId).toBe('campaignId');
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('classifyEditableFields — determinism', () => {
  test('same blueprint produces identical JSON output on three calls', () => {
    const bp = makeBlueprint();
    const r1 = classifyEditableFields(bp);
    const r2 = classifyEditableFields(bp);
    const r3 = classifyEditableFields(bp);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(JSON.stringify(r2)).toBe(JSON.stringify(r3));
  });
});

// ─── Multi-slot ordering ──────────────────────────────────────────────────────

describe('classifyEditableFields — multi-slot source order preservation', () => {
  test('promotions appear in source order within their group', () => {
    const slots = ['PROMO_A', 'PROMO_B', 'PROMO_C'].map((id, i) =>
      makeSimplePromoSlot({ editableFields: { promotionId: id } })
    );
    const result = classifyEditableFields(makeBlueprint({ promotionSlots: slots }));
    const promoIdFields = result.orderedQuestions.filter(cf => cf.fieldId === 'promotionId');
    expect(promoIdFields.map(cf => cf.currentValue)).toEqual(['PROMO_A', 'PROMO_B', 'PROMO_C']);
  });
});

// ─── Summer_SAS.xml full classification ──────────────────────────────────────

describe('classifyEditableFields — Summer_SAS.xml full classification', () => {
  let blueprint;
  let result;

  beforeAll(() => {
    blueprint = extractSASBlueprint(FIXTURE_XML, {
      blueprintId: 'classify-test', sourceExport: 'Summer_SAS.xml', extractedAt: '2025-01-01T00:00:00.000Z',
    });
    result = classifyEditableFields(blueprint);
  });

  test('classifies without throwing', () => {
    expect(result).toBeDefined();
  });

  test('orderedQuestions is non-empty', () => {
    expect(result.orderedQuestions.length).toBeGreaterThan(0);
  });

  test('campaignId classified with value 2025_SUMMER_SAS', () => {
    const cf = result.orderedQuestions.find(q => q.fieldId === 'campaignId');
    expect(cf).toBeDefined();
    expect(cf.currentValue).toBe('2025_SUMMER_SAS');
  });

  test('all 4 promotionIds classified in Identity group', () => {
    const promoIds = result.groupedFields['Identity']
      .filter(cf => cf.fieldId === 'promotionId')
      .map(cf => cf.currentValue);
    expect(promoIds).toHaveLength(4);
    expect(promoIds).toContain('2025-SUMMER-SAS-APPEASEMENT');
    expect(promoIds).toContain('2025_SUMMER_SAS');
    expect(promoIds).toContain('2025_Summer_SAS_BB50OFF');
    expect(promoIds).toContain('2025_Summer_SAS_WebApp');
  });

  test('storefront_msg_cart_inclusion classified for all 4 promotions', () => {
    const inclusions = result.groupedFields['Storefront']
      .filter(cf => cf.fieldId === 'storefront_msg_cart_inclusion');
    expect(inclusions.length).toBe(4);
  });

  test('coupon codes classified in Coupons group', () => {
    const coupons = result.groupedFields['Coupons'].filter(cf => cf.fieldId === 'couponIds');
    // 2 assignments have coupons (APPEASEMENT and BB50OFF)
    expect(coupons.length).toBe(2);
    const allIds = coupons.flatMap(cf => cf.currentValue);
    expect(allIds).toContain('2025-Summer-SAS-CS');
    expect(allIds).toContain('2025_Summer_SAS_BB');
  });

  test('end dates classified for all 4 assignments', () => {
    const endDates = result.groupedFields['Scheduling'].filter(cf => cf.fieldId === 'endDate');
    expect(endDates.length).toBe(4);
  });

  test('start date classified for WebApp assignment only', () => {
    const startDates = result.groupedFields['Scheduling'].filter(cf => cf.fieldId === 'startDate');
    expect(startDates.length).toBe(1);
    expect(startDates[0].currentValue).toBe('2025-07-07T04:00:00.000Z');
  });

  test('validationRequirements is non-empty', () => {
    expect(result.validationRequirements.length).toBeGreaterThan(0);
  });

  test('every item in validationRequirements has fieldId, path, validation, required', () => {
    result.validationRequirements.forEach(vr => {
      expect(vr).toHaveProperty('fieldId');
      expect(vr).toHaveProperty('path');
      expect(vr).toHaveProperty('validation');
      expect(vr).toHaveProperty('required');
    });
  });
});

// ─── _internals.makeClassifiedField ──────────────────────────────────────────

describe('_internals.makeClassifiedField', () => {
  test('returns null for unknown fieldId', () => {
    expect(makeClassifiedField('unknownField_xyz', 'promotion', 0, 'p', 'v')).toBeNull();
  });

  test('returns ClassifiedField for known fieldId', () => {
    const cf = makeClassifiedField('campaignId', 'campaign', null, 'campaignSlot.editableFields.campaignId', '2025_SUMMER_SAS');
    expect(cf).not.toBeNull();
    expect(cf.fieldId).toBe('campaignId');
    expect(cf.registryEntry).toBeDefined();
  });
});
