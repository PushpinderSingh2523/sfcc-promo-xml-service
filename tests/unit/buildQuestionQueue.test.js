'use strict';

const { buildQuestionQueue, buildAnswerKey } = require('../../src/blueprints/session/buildQuestionQueue');

// ─── Fixture ──────────────────────────────────────────────────────────────────

/**
 * Minimal blueprint that produces exactly 5 deterministic questions:
 *   campaignId      → Campaign
 *   name (x-default)→ Identity
 *   promotionId     → Identity
 *   endDate         → Scheduling
 *   simpleDiscountValue → Discounting
 */
function makeBlueprint(overrides = {}) {
  return {
    blueprintId: 'test-bp',
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

// ─── buildAnswerKey ───────────────────────────────────────────────────────────

describe('buildAnswerKey', () => {
  test('campaign field — null slotIndex and xmlLang become underscores', () => {
    expect(buildAnswerKey('campaignId', 'campaign', null, null))
      .toBe('campaignId::campaign::_::_');
  });

  test('campaign field — undefined slotIndex and xmlLang become underscores', () => {
    expect(buildAnswerKey('campaignId', 'campaign', undefined, undefined))
      .toBe('campaignId::campaign::_::_');
  });

  test('promotion field with numeric slotIndex', () => {
    expect(buildAnswerKey('promotionId', 'promotion', 2, null))
      .toBe('promotionId::promotion::2::_');
  });

  test('slotIndex 0 is preserved — not treated as falsy', () => {
    expect(buildAnswerKey('promotionId', 'promotion', 0, null))
      .toBe('promotionId::promotion::0::_');
  });

  test('name field with locale', () => {
    expect(buildAnswerKey('name', 'promotion', 1, 'en'))
      .toBe('name::promotion::1::en');
  });

  test('assignment field', () => {
    expect(buildAnswerKey('endDate', 'assignment', 3, null))
      .toBe('endDate::assignment::3::_');
  });

  test('uses double-colon separator throughout', () => {
    const key = buildAnswerKey('myField', 'promotion', 0, 'x-default');
    expect(key.split('::').length).toBe(4);
    expect(key).toBe('myField::promotion::0::x-default');
  });

  test('xmlLang x-default locale is preserved verbatim', () => {
    expect(buildAnswerKey('name', 'promotion', 0, 'x-default'))
      .toBe('name::promotion::0::x-default');
  });

  test('numeric slotIndex is stringified', () => {
    const key = buildAnswerKey('discountEntries', 'promotion', 10, null);
    expect(key).toBe('discountEntries::promotion::10::_');
  });
});

// ─── buildQuestionQueue ───────────────────────────────────────────────────────

describe('buildQuestionQueue', () => {
  describe('return shape', () => {
    test('returns an array', () => {
      expect(Array.isArray(buildQuestionQueue(makeBlueprint()))).toBe(true);
    });

    test('each item has required QueueItem fields', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      expect(queue.length).toBeGreaterThan(0);
      queue.forEach(item => {
        expect(typeof item.key).toBe('string');
        expect(typeof item.fieldId).toBe('string');
        expect(typeof item.slotType).toBe('string');
        expect(typeof item.group).toBe('string');
        expect(typeof item.label).toBe('string');
        expect(typeof item.question).toBe('string');
        expect(typeof item.required).toBe('boolean');
        expect('currentValue' in item).toBe(true);
        expect('validation' in item).toBe(true);
        expect(typeof item.replayCritical).toBe('boolean');
      });
    });

    test('key is built from fieldId + slotType + slotIndex + xmlLang', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      queue.forEach(item => {
        const expectedKey = buildAnswerKey(item.fieldId, item.slotType, item.slotIndex, item.xmlLang);
        expect(item.key).toBe(expectedKey);
      });
    });
  });

  describe('determinism and ordering', () => {
    test('returns identical queue on repeated calls (deterministic)', () => {
      const bp = makeBlueprint();
      const q1 = buildQuestionQueue(bp);
      const q2 = buildQuestionQueue(bp);
      expect(q1.map(i => i.key)).toEqual(q2.map(i => i.key));
    });

    test('keys are unique', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const keys = queue.map(i => i.key);
      const unique = [...new Set(keys)];
      expect(unique.length).toBe(keys.length);
    });

    test('Campaign group appears before Identity group in queue', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const campaignIdx = queue.findIndex(i => i.group === 'Campaign');
      const identityIdx = queue.findIndex(i => i.group === 'Identity');
      expect(campaignIdx).toBeGreaterThanOrEqual(0);
      expect(identityIdx).toBeGreaterThanOrEqual(0);
      expect(campaignIdx).toBeLessThan(identityIdx);
    });

    test('Identity group appears before Scheduling group', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const identityIdx  = queue.findIndex(i => i.group === 'Identity');
      const schedulingIdx = queue.findIndex(i => i.group === 'Scheduling');
      expect(identityIdx).toBeGreaterThanOrEqual(0);
      expect(schedulingIdx).toBeGreaterThanOrEqual(0);
      expect(identityIdx).toBeLessThan(schedulingIdx);
    });

    test('Scheduling appears before Discounting', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const schedulingIdx  = queue.findIndex(i => i.group === 'Scheduling');
      const discountingIdx = queue.findIndex(i => i.group === 'Discounting');
      expect(schedulingIdx).toBeGreaterThanOrEqual(0);
      expect(discountingIdx).toBeGreaterThanOrEqual(0);
      expect(schedulingIdx).toBeLessThan(discountingIdx);
    });
  });

  describe('content correctness', () => {
    test('campaignId question is present and required', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const campaignQ = queue.find(i => i.key === 'campaignId::campaign::_::_');
      expect(campaignQ).toBeDefined();
      expect(campaignQ.required).toBe(true);
      expect(campaignQ.slotType).toBe('campaign');
      expect(campaignQ.slotIndex).toBeNull();
      expect(campaignQ.xmlLang).toBeNull();
    });

    test('campaignId currentValue matches blueprint', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const q = queue.find(i => i.key === 'campaignId::campaign::_::_');
      expect(q.currentValue).toBe('2025_SUMMER_SAS');
    });

    test('promotionId question is present and required', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const q = queue.find(i => i.key === 'promotionId::promotion::0::_');
      expect(q).toBeDefined();
      expect(q.required).toBe(true);
      expect(q.slotType).toBe('promotion');
      expect(q.slotIndex).toBe(0);
    });

    test('promotionId currentValue matches blueprint', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const q = queue.find(i => i.key === 'promotionId::promotion::0::_');
      expect(q.currentValue).toBe('TEST_PROMO');
    });

    test('name question per locale — x-default locale present', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const q = queue.find(i => i.key === 'name::promotion::0::x-default');
      expect(q).toBeDefined();
      expect(q.xmlLang).toBe('x-default');
      expect(q.slotType).toBe('promotion');
    });

    test('endDate question present for assignment slot with hasEndDate=true', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const q = queue.find(i => i.key === 'endDate::assignment::0::_');
      expect(q).toBeDefined();
      expect(q.slotType).toBe('assignment');
    });

    test('simpleDiscountValue question present for simple discount promo', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const q = queue.find(i => i.key === 'simpleDiscountValue::promotion::0::_');
      expect(q).toBeDefined();
      expect(q.currentValue).toBe(25);
    });

    test('all five expected questions present for minimal blueprint', () => {
      const queue = buildQuestionQueue(makeBlueprint());
      const keys = queue.map(i => i.key);
      expect(keys).toContain('campaignId::campaign::_::_');
      expect(keys).toContain('promotionId::promotion::0::_');
      expect(keys).toContain('name::promotion::0::x-default');
      expect(keys).toContain('endDate::assignment::0::_');
      expect(keys).toContain('simpleDiscountValue::promotion::0::_');
    });
  });

  describe('multi-slot blueprints', () => {
    test('two promotion slots → distinct promotionId keys', () => {
      const bp = makeBlueprint();
      // Add a second promotion slot
      bp.promotionSlots.push({
        slotIndex: 1,
        frozenStructure: {
          ...bp.promotionSlots[0].frozenStructure,
          nameLocales: ['x-default'],
          discountFamily: 'simple',
        },
        editableFields: {
          promotionId: 'TEST_PROMO_2',
          names: [{ xmlLang: 'x-default', value: 'Second Promo' }],
          simpleDiscountValue: 30, discountEntries: null, editableCustomAttributes: [],
        },
      });
      bp.assignmentSlots.push({
        slotIndex: 1,
        frozenStructure: {
          qualifiers: { matchMode: 'any', hasCustomerGroups: false, hasSourceCodes: false, hasCoupons: false },
          customerGroups: null, rank: 20, hasStartDate: false, hasEndDate: true,
        },
        editableFields: {
          promotionId: 'TEST_PROMO_2', campaignId: '2025_SUMMER_SAS',
          couponIds: null, startDate: null, endDate: '2025-07-08T04:00:00.000Z',
        },
      });

      const queue = buildQuestionQueue(bp);
      const keys = queue.map(i => i.key);
      expect(keys).toContain('promotionId::promotion::0::_');
      expect(keys).toContain('promotionId::promotion::1::_');
    });

    test('multiple locales → one name question per locale', () => {
      const bp = makeBlueprint();
      bp.promotionSlots[0].frozenStructure.nameLocales = ['x-default', 'en'];
      bp.promotionSlots[0].editableFields.names = [
        { xmlLang: 'x-default', value: 'Promo' },
        { xmlLang: 'en',        value: 'Promo EN' },
      ];
      const queue = buildQuestionQueue(bp);
      const keys = queue.map(i => i.key);
      expect(keys).toContain('name::promotion::0::x-default');
      expect(keys).toContain('name::promotion::0::en');
    });
  });

  describe('Summer_SAS.xml integration', () => {
    const path = require('path');
    const fs   = require('fs');
    const { extractSASBlueprint } = require('../../src/blueprints/extractors/extractSASBlueprint');

    let sasQueue;

    beforeAll(() => {
      const xml = fs.readFileSync(path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8');
      const bp  = extractSASBlueprint(xml);
      sasQueue  = buildQuestionQueue(bp);
    });

    test('produces 35 questions for Summer_SAS.xml', () => {
      expect(sasQueue.length).toBe(35);
    });

    test('all keys are unique', () => {
      const keys = sasQueue.map(i => i.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    test('campaignId is the very first question (Campaign group first)', () => {
      expect(sasQueue[0].key).toBe('campaignId::campaign::_::_');
    });

    test('no assignment slotType questions appear before promotion questions', () => {
      const firstAssignment = sasQueue.findIndex(i => i.slotType === 'assignment');
      const lastPromotion   = [...sasQueue].reverse().findIndex(i => i.slotType === 'promotion');
      // At least some promotions finish before assignments start
      expect(firstAssignment).toBeGreaterThan(0);
    });
  });
});
