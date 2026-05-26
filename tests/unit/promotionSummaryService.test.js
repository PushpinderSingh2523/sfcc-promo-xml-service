'use strict';

const { generateSummary, explainValidation } = require('../../src/services/promotionSummaryService');

// Minimal valid doc fixture
function makeDoc(overrides = {}) {
  return {
    globalSettings: { catalogId: 'siteCatalog_ToryUS', excludedCategoryIds: [], excludedProductOptionIds: [] },
    promotion: {
      id: 'test-promo',
      name: 'Test Promo',
      ruleType: 'product',
      discountConditionType: 'product-amount',
      exclusivity: 'no',
      lifecycle: { enabled: true, archived: false, searchable: true, refinable: true, preventRequalifying: false, prorateAcrossEligibleItems: false },
      discounts: [{ discountType: 'percentage', discountValue: 20, threshold: 0 }],
      qualifyingProducts: { conditionGroups: [] },
      customAttributes: { gwp: false, isExcludeTranslate: false },
      ...overrides,
    },
  };
}

describe('promotionSummaryService', () => {

  describe('generateSummary', () => {

    test('returns oneLiner, headline, bullets, businessNote', () => {
      const result = generateSummary(makeDoc());
      expect(result).toHaveProperty('oneLiner');
      expect(result).toHaveProperty('headline');
      expect(result).toHaveProperty('bullets');
      expect(result).toHaveProperty('businessNote');
      expect(Array.isArray(result.bullets)).toBe(true);
    });

    test('percentage discount one-liner contains percent', () => {
      const doc = makeDoc({ discounts: [{ discountType: 'percentage', discountValue: 20, threshold: 0 }] });
      expect(generateSummary(doc).oneLiner).toContain('20%');
    });

    test('amount discount one-liner contains dollar amount', () => {
      const doc = makeDoc({ discounts: [{ discountType: 'amount', discountValue: 50, threshold: 0 }] });
      expect(generateSummary(doc).oneLiner).toContain('$50');
    });

    test('free shipping one-liner contains "free shipping"', () => {
      const doc = makeDoc({ ruleType: 'shipping', discounts: [{ discountType: 'free-shipping', discountValue: 0, threshold: 0 }] });
      expect(generateSummary(doc).oneLiner).toContain('free shipping');
    });

    test('includes customer group in one-liner', () => {
      const doc = makeDoc();
      doc.campaign = { id: 'camp', enabled: true, scope: 'online', customerGroups: { groupIds: ['VIP'] } };
      expect(generateSummary(doc).oneLiner).toContain('VIP');
    });

    test('includes category in one-liner', () => {
      const doc = makeDoc({
        qualifyingProducts: { conditionGroups: [{ categoryCondition: { categoryIds: ['handbags'] } }] },
      });
      expect(generateSummary(doc).oneLiner).toContain('handbags');
    });

    test('includes coupon in one-liner', () => {
      const doc = makeDoc();
      doc.assignment = { activationCoupons: ['VIP20'] };
      expect(generateSummary(doc).oneLiner).toContain('VIP20');
    });

    test('tiered discounts produce multi-part one-liner', () => {
      const doc = makeDoc({
        ruleType: 'order',
        discounts: [
          { discountType: 'percentage', discountValue: 10, threshold: 500 },
          { discountType: 'percentage', discountValue: 20, threshold: 2000 },
        ],
      });
      const result = generateSummary(doc);
      expect(result.oneLiner).toContain('10%');
      expect(result.oneLiner).toContain('20%');
    });

    test('preventRequalifying appears in bullets', () => {
      const doc = makeDoc({ lifecycle: { enabled: true, archived: false, searchable: true, refinable: true, preventRequalifying: true, prorateAcrossEligibleItems: false } });
      const result = generateSummary(doc);
      expect(result.bullets.some(b => b.toLowerCase().includes('one-time'))).toBe(true);
    });

    test('shipping methods appear in bullets', () => {
      const doc = makeDoc({
        ruleType: 'shipping',
        discounts: [{ discountType: 'free-shipping', discountValue: 0, threshold: 0 }],
        shippingRuleOptions: { methodIds: ['standard', 'twoday'], disableGlobalExcludedProducts: false },
      });
      const result = generateSummary(doc);
      expect(result.bullets.some(b => b.toLowerCase().includes('standard') || b.toLowerCase().includes('two-day'))).toBe(true);
    });

    test('handles null / missing doc gracefully', () => {
      const result = generateSummary(null);
      expect(result.oneLiner).toBeTruthy();
      expect(result.bullets).toEqual([]);
    });

    test('headline is short and card-friendly', () => {
      const doc = makeDoc({ discounts: [{ discountType: 'percentage', discountValue: 20, threshold: 0 }] });
      const result = generateSummary(doc);
      expect(result.headline.length).toBeLessThan(80);
    });

    test('businessNote contains ruleType', () => {
      const doc = makeDoc({ ruleType: 'order' });
      expect(generateSummary(doc).businessNote).toContain('order');
    });
  });

  describe('explainValidation', () => {
    test('valid result → positive message', () => {
      const result = explainValidation({ valid: true, errors: [] });
      expect(result).toContain('valid');
    });

    test('invalid result → lists errors', () => {
      const result = explainValidation({
        valid: false,
        errors: [{ field: 'discounts', message: 'must be array' }],
      });
      expect(result).toContain('discounts');
      expect(result).toContain('must be array');
    });

    test('invalid with no errors → generic message', () => {
      const result = explainValidation({ valid: false, errors: [] });
      expect(result).toBeTruthy();
    });
  });
});
