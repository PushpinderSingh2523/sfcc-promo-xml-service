'use strict';

const { parse, parseDiscount } = require('../../../src/services/parserStrategies/discountParser');

describe('discountParser.parse', () => {
  describe('tiered percentage', () => {
    test('two-tier: 10% over $500 and 20% over $2000', () => {
      const r = parse('10% off on orders over $500 and 20% off on orders over $2000');
      expect(r.value.tiers).toHaveLength(2);
      expect(r.value.tiers[0]).toMatchObject({ threshold: 500, kind: 'percentage', value: 10 });
      expect(r.value.tiers[1]).toMatchObject({ threshold: 2000, kind: 'percentage', value: 20 });
      expect(r.value.ruleTypeHint).toBe('order');
      expect(r.confidence).toBeGreaterThan(0.85);
      expect(r.matchedPatterns).toContain('tiered-percentage');
    });

    test('tiers sorted ascending by threshold', () => {
      const r = parse('20% off over $2000 and 10% off over $500');
      expect(r.value.tiers[0].threshold).toBe(500);
      expect(r.value.tiers[1].threshold).toBe(2000);
    });
  });

  describe('free discount', () => {
    test('free shipping', () => {
      const r = parse('free shipping on all orders');
      expect(r.value.tiers[0].kind).toBe('free');
      expect(r.value.ruleTypeHint).toBe('shipping');
      expect(r.matchedPatterns).toContain('free-shipping');
    });

    test('free delivery', () => {
      const r = parse('free delivery this weekend');
      expect(r.value.tiers[0].kind).toBe('free');
      expect(r.value.ruleTypeHint).toBe('shipping');
    });

    test('gift with purchase → isGwp=true, ruleTypeHint=product', () => {
      const r = parse('gift with purchase on orders over $75');
      expect(r.value.tiers[0].kind).toBe('free');
      expect(r.value.isGwp).toBe(true);
      expect(r.value.ruleTypeHint).toBe('product');
    });
  });

  describe('percentage', () => {
    test.each([
      ['10% off all orders', 10],
      ['save 25 percent', 25],
      ['get 15% off', 15],
      ['50% discount', 50],
    ])('%s → value=%d', (text, val) => {
      const r = parse(text);
      expect(r.value.tiers[0].kind).toBe('percentage');
      expect(r.value.tiers[0].value).toBe(val);
    });
  });

  describe('amount', () => {
    test.each([
      ['$20 off your order', 20],
      ['save $15', 15],
      ['30 dollars off', 30],
    ])('%s → value=%d', (text, val) => {
      const r = parse(text);
      expect(r.value.tiers[0].kind).toBe('amount');
      expect(r.value.tiers[0].value).toBe(val);
    });
  });

  describe('fixed-price', () => {
    test('Fixed price $9.99', () => {
      const r = parse('Fixed price $9.99 on accessories');
      expect(r.value.tiers[0].kind).toBe('fixed-price');
      expect(r.value.tiers[0].value).toBeCloseTo(9.99);
    });
  });

  describe('fallback', () => {
    test('no match → 10% default with low confidence', () => {
      const r = parse('something vague');
      expect(r.value.tiers[0].kind).toBe('percentage');
      expect(r.value.tiers[0].value).toBe(10);
      expect(r.confidence).toBeLessThan(0.40);
      expect(r.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('confidence levels', () => {
    test('tiered has highest confidence', () => {
      const tiered = parse('10% off over $500 and 20% off over $2000');
      const single = parse('10% off');
      const fallback = parse('vague text');
      expect(tiered.confidence).toBeGreaterThan(single.confidence);
      expect(single.confidence).toBeGreaterThan(fallback.confidence);
    });
  });
});

describe('parseDiscount (compat)', () => {
  test('percentage returns amount-off for amount', () => {
    const { discountType } = parseDiscount('$20 off');
    expect(discountType).toBe('amount-off');
  });

  test('free shipping returns free-shipping', () => {
    const { discountType, discountValue } = parseDiscount('free shipping on all orders');
    expect(discountType).toBe('free-shipping');
    expect(discountValue).toBe(0);
  });

  test('gwp returns bonus-product', () => {
    const { discountType } = parseDiscount('gift with purchase on orders over $75');
    expect(discountType).toBe('bonus-product');
  });

  test('fixed-price returns fixed-price', () => {
    const { discountType } = parseDiscount('Fixed price $9.99');
    expect(discountType).toBe('fixed-price');
  });
});
