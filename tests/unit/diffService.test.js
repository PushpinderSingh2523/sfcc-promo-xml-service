'use strict';

const { diff, parseXmlToFlat, docToFlat } = require('../../src/services/diffService');

const SAMPLE_XML_A = `
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
  <promotion promotion-id="vip-20pct" exclusivity="class">
    <name>VIP 20% Off</name>
    <order-promotion-rule>
      <discounts><discount><percentage>20</percentage></discount></discounts>
    </order-promotion-rule>
  </promotion>
  <campaign campaign-id="camp-vip">
    <enabled>true</enabled>
    <start-date>2026-07-01T00:00:00.000Z</start-date>
    <end-date>2026-07-31T23:59:59.000Z</end-date>
    <customer-groups><customer-group-id>VIP</customer-group-id></customer-groups>
  </campaign>
</promotions>`;

const SAMPLE_XML_B = `
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
  <promotion promotion-id="vip-30pct" exclusivity="class">
    <name>VIP 30% Off</name>
    <order-promotion-rule>
      <discounts><discount><percentage>30</percentage></discount></discounts>
    </order-promotion-rule>
  </promotion>
  <campaign campaign-id="camp-vip">
    <enabled>true</enabled>
    <start-date>2026-08-01T00:00:00.000Z</start-date>
    <end-date>2026-08-31T23:59:59.000Z</end-date>
    <customer-groups><customer-group-id>VIP</customer-group-id></customer-groups>
  </campaign>
</promotions>`;

const DOC_A = {
  globalSettings: { catalogId: 'siteCatalog_ToryUS', excludedCategoryIds: [], excludedProductOptionIds: [] },
  promotion: {
    id: 'promo-a', name: 'Promo A', ruleType: 'product', discountConditionType: 'product-amount',
    exclusivity: 'no', lifecycle: { enabled: true, archived: false, searchable: true, refinable: true, preventRequalifying: false, prorateAcrossEligibleItems: false },
    discounts: [{ discountType: 'percentage', discountValue: 20, threshold: 0 }],
    qualifyingProducts: { conditionGroups: [] },
    customAttributes: { gwp: false, isExcludeTranslate: false },
  },
};

const DOC_B = {
  ...DOC_A,
  promotion: {
    ...DOC_A.promotion,
    id: 'promo-b',
    discounts: [{ discountType: 'percentage', discountValue: 30, threshold: 0 }],
  },
};

describe('diffService', () => {

  describe('parseXmlToFlat', () => {
    test('extracts promotionId from XML', () => {
      const flat = parseXmlToFlat(SAMPLE_XML_A);
      expect(flat.promotionId).toBe('vip-20pct');
    });

    test('detects order rule type', () => {
      const flat = parseXmlToFlat(SAMPLE_XML_A);
      expect(flat.ruleType).toBe('order');
    });

    test('extracts startDate and endDate', () => {
      const flat = parseXmlToFlat(SAMPLE_XML_A);
      expect(flat.startDate).toContain('2026-07-01');
      expect(flat.endDate).toContain('2026-07-31');
    });

    test('extracts customer groups', () => {
      const flat = parseXmlToFlat(SAMPLE_XML_A);
      expect(flat.customerGroups).toContain('VIP');
    });

    test('handles null/empty XML', () => {
      expect(parseXmlToFlat(null)).toEqual({});
      expect(parseXmlToFlat('')).toEqual({});
    });
  });

  describe('docToFlat', () => {
    test('extracts promotionId from doc', () => {
      expect(docToFlat(DOC_A).promotionId).toBe('promo-a');
    });

    test('extracts ruleType from doc', () => {
      expect(docToFlat(DOC_A).ruleType).toBe('product');
    });

    test('extracts discounts as formatted strings', () => {
      expect(docToFlat(DOC_A).discounts).toContain('20%');
    });

    test('handles null doc', () => {
      expect(docToFlat(null)).toEqual({});
    });
  });

  describe('diff — XML vs XML', () => {
    test('detects changes between two XML strings', () => {
      const result = diff(SAMPLE_XML_A, SAMPLE_XML_B);
      expect(result.hasChanges).toBe(true);
    });

    test('detects schedule change', () => {
      const result = diff(SAMPLE_XML_A, SAMPLE_XML_B);
      expect(result.changes.schedule.length).toBeGreaterThan(0);
    });

    test('no changes when same XML', () => {
      const result = diff(SAMPLE_XML_A, SAMPLE_XML_A);
      expect(result.hasChanges).toBe(false);
      expect(result.summary).toContain('No changes');
    });

    test('summary describes what changed', () => {
      const result = diff(SAMPLE_XML_A, SAMPLE_XML_B);
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  describe('diff — Doc vs Doc', () => {
    test('detects discount change between two docs', () => {
      const result = diff(DOC_A, DOC_B);
      expect(result.hasChanges).toBe(true);
      expect(result.changes.discounts.length).toBeGreaterThan(0);
    });

    test('detects identity change (promotionId)', () => {
      const result = diff(DOC_A, DOC_B);
      expect(result.changes.identity.some(c => c.field === 'promotionId')).toBe(true);
    });

    test('no changes when same doc', () => {
      const result = diff(DOC_A, DOC_A);
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('diff — mixed (XML vs Doc)', () => {
    test('can compare XML and doc', () => {
      const result = diff(SAMPLE_XML_A, DOC_A);
      expect(result).toHaveProperty('hasChanges');
      expect(result).toHaveProperty('summary');
    });
  });

  describe('change entry shapes', () => {
    test('each change entry has field, changeType, oldValue/newValue', () => {
      const result = diff(DOC_A, DOC_B);
      const allChanges = Object.values(result.changes).flat();
      for (const c of allChanges) {
        expect(c).toHaveProperty('field');
        expect(c).toHaveProperty('changeType');
        expect(['added', 'removed', 'changed']).toContain(c.changeType);
      }
    });
  });
});
