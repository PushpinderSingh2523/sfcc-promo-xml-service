'use strict';

/**
 * parserScenarios.test.js
 *
 * End-to-end parser scenario tests covering all real-world promotion types
 * from the requirements: employee discounts, birthday promos, VIP shipping,
 * tiered luxury promos, preorder exclusions, coupon-only promotions,
 * category-scoped order promos, free shipping weekends.
 *
 * Each test verifies the full PromotionDocumentV2 shape produced by
 * localParser.parseIntent().
 */

const { parseIntent } = require('../../src/services/localParser');
const { validateDocument } = require('../../src/services/validationService');
const { buildDocument } = require('../../src/services/xmlServiceV2');

const NOW = new Date('2026-01-15T12:00:00.000Z');

// Helper: assert document passes schema validation
function assertValid(doc) {
  const result = validateDocument(doc);
  if (!result.valid) {
    throw new Error(`Document failed schema validation:\n${JSON.stringify(result.errors, null, 2)}`);
  }
}

// ─── Scenario tests ────────────────────────────────────────────────────────────

describe('Real-world parser scenarios', () => {

  test('Employee discount — 30% off for all employees, class exclusivity', () => {
    const r = parseIntent('30% off for all employees', NOW);
    const p = r.document.promotion;
    expect(p.discounts[0].discountType).toBe('percentage');
    expect(p.discounts[0].discountValue).toBe(30);
    expect(p.exclusivity).toBe('class');
    expect(r.document.campaign?.customerGroups?.groupIds).toContain('Employees');
  });

  test('Birthday promo — $50 off orders over $50, VIP only, one-time use, no gift cards', () => {
    const r = parseIntent(
      'Birthday promotion: $50 off orders over $50 for VIP members, one-time use only, not valid on gift cards',
      NOW
    );
    const p = r.document.promotion;
    expect(p.discounts[0].discountType).toBe('amount');
    expect(p.discounts[0].discountValue).toBe(50);
    expect(p.exclusivity).toBe('class');
    expect(p.lifecycle.preventRequalifying).toBe(true);
    const excluded = p.excludedProducts?.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(excluded).toContain('gift-cards');
  });

  test('VIP free two-day shipping with coupon — shipping rule, twoday method, coupon in assignment', () => {
    const r = parseIntent(
      'Free two-day shipping for VIP customers with coupon VIP2024SHIP',
      NOW
    );
    const p = r.document.promotion;
    expect(p.ruleType).toBe('shipping');
    expect(p.discounts[0].discountType).toBe('free-shipping');
    expect(p.shippingRuleOptions.methodIds).toContain('twoday');
    expect(p.exclusivity).toBe('class');
    const coupons = r.document.assignment?.activationCoupons || [];
    expect(coupons).toContain('VIP2024SHIP');
  });

  test('Tiered luxury promo — 10% over $500, 20% over $2000, handbags and watches', () => {
    const r = parseIntent(
      '10% off on orders over $500 and 20% off on orders over $2000 on handbags and watches in September',
      NOW
    );
    const p = r.document.promotion;
    expect(p.ruleType).toBe('order');
    expect(p.discountConditionType).toBe('order-total');
    expect(p.discounts).toHaveLength(2);
    expect(p.discounts[0]).toMatchObject({ threshold: 500, discountType: 'percentage', discountValue: 10 });
    expect(p.discounts[1]).toMatchObject({ threshold: 2000, discountType: 'percentage', discountValue: 20 });
    const catIds = p.qualifyingProducts.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(catIds).toContain('handbags');
    expect(catIds).toContain('watches');
  });

  test('Preorder exclusions — 20% off, excluding preorders and sale items', () => {
    const r = parseIntent(
      '20% off on all shoes, excluding preorders and sale items',
      NOW
    );
    const p = r.document.promotion;
    expect(p.discounts[0].discountType).toBe('percentage');
    const excluded = p.excludedProducts?.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(excluded).toContain('preorder');
    expect(excluded).toContain('sale');
  });

  test('Coupon-only promotion — no customer group, coupon activates promo', () => {
    const r = parseIntent(
      'Get 25% off when you enter promo code FLASH25',
      NOW
    );
    const p = r.document.promotion;
    expect(p.discounts[0].discountType).toBe('percentage');
    expect(p.discounts[0].discountValue).toBe(25);
    const coupons = r.document.assignment?.activationCoupons || [];
    expect(coupons).toContain('FLASH25');
  });

  test('Category-scoped promo — 15% off on accessories on orders over $100 → product rule (category overrides threshold)', () => {
    const r = parseIntent(
      '15% off on accessories on orders over $100 this month',
      NOW
    );
    const p = r.document.promotion;
    // Category qualifier (accessories) takes precedence over the minimum-amount threshold.
    // Per Phase 7 precedence rules: category presence → product, regardless of "orders over $X".
    expect(p.ruleType).toBe('product');
    expect(p.discounts[0].discountType).toBe('percentage');
    expect(p.discounts[0].discountValue).toBe(15);
    const catIds = p.qualifyingProducts.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(catIds).toContain('accessories');
  });

  test('Free shipping weekend — free standard shipping, this weekend', () => {
    const r = parseIntent('Free standard shipping this weekend', NOW);
    const p = r.document.promotion;
    expect(p.ruleType).toBe('shipping');
    expect(p.discounts[0].discountType).toBe('free-shipping');
    expect(p.shippingRuleOptions.methodIds).toContain('standard');
    const schedule = r.document.assignment?.schedule || r.document.campaign || {};
    expect(r.parserTrace.schedule.matchedPatterns).toContain('this-weekend');
  });

  test('Partners 40% off with coupon, excluding private sale', () => {
    const r = parseIntent(
      '40% off for partners with coupon PARTNER40, excluding private sale',
      NOW
    );
    const p = r.document.promotion;
    expect(p.discounts[0].discountType).toBe('percentage');
    expect(p.discounts[0].discountValue).toBe(40);
    expect(r.document.campaign?.customerGroups?.groupIds).toContain('Partners');
    const coupons = r.document.assignment?.activationCoupons || [];
    expect(coupons).toContain('PARTNER40');
    const excluded = p.excludedProducts?.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(excluded).toContain('private-sale');
  });

  test('Welcome free standard shipping — standalone, no campaign', () => {
    const r = parseIntent(
      'Welcome promotion: free standard, surepost and hazmat shipping for new customers',
      NOW
    );
    const p = r.document.promotion;
    expect(p.ruleType).toBe('shipping');
    expect(p.discounts[0].discountType).toBe('free-shipping');
    expect(p.shippingRuleOptions.methodIds).toContain('standard');
    expect(p.shippingRuleOptions.methodIds).toContain('surepost');
  });

  // Schema validation round-trips
  describe('All scenarios pass schema validation', () => {
    const scenarios = [
      'Employee discount: 30% off for all employees',
      'Birthday: $50 off for VIP members',
      'Free two-day shipping for VIP customers',
      '10% off on orders over $500 and 20% off on orders over $2000',
      '20% off shoes excluding preorders',
      '25% off with coupon code FLASH25',
      '15% off accessories on orders over $100',
      'Free standard shipping this weekend',
    ];

    scenarios.forEach(intent => {
      test(`"${intent.slice(0, 50)}..." validates against PromotionDocumentV2 schema`, () => {
        const r = parseIntent(intent, NOW);
        assertValid(r.document);
      });
    });
  });

  // XML generation round-trips
  describe('All scenarios generate valid XML', () => {
    const scenarios = [
      '30% off for all employees',
      '$50 off orders over $50 for VIP members',
      'Free two-day shipping for VIP',
      '10% off on orders over $500 and 20% off on orders over $2000 on handbags',
      '20% off shoes excluding sale items',
      'Free standard shipping this weekend',
    ];

    scenarios.forEach(intent => {
      test(`"${intent.slice(0, 50)}..." → XML contains SFCC namespace`, () => {
        const r = parseIntent(intent, NOW);
        const xml = buildDocument(r.document);
        expect(xml).toContain('http://www.demandware.com/xml/impex/promotion/2008-01-31');
        expect(xml).toContain('<promotions');
        expect(xml).toContain('<promotion promotion-id=');
      });
    });
  });
});
