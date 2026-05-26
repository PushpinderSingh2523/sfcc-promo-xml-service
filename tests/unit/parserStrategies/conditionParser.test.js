'use strict';

const { parse, parseCondition } = require('../../../src/services/parserStrategies/conditionParser');

describe('conditionParser.parse', () => {
  describe('coupon', () => {
    test('coupon code SAVE20', () => {
      const r = parse('use coupon code SAVE20');
      expect(r.value.conditionType).toBe('coupon');
      expect(r.value.couponCode).toBe('SAVE20');
      expect(r.confidence).toBeGreaterThan(0.85);
    });

    test('promo code SUMMER15', () => {
      expect(parse('promo code SUMMER15').value.couponCode).toBe('SUMMER15');
    });

    test('voucher LOYALTY25', () => {
      expect(parse('voucher LOYALTY25 for members').value.couponCode).toBe('LOYALTY25');
    });

    test('no code extracted → PROMO10 fallback', () => {
      const r = parse('use a coupon to save');
      expect(r.value.couponCode).toBe('PROMO10');
      expect(r.confidence).toBeLessThan(0.80);
    });
  });

  describe('minimum-amount', () => {
    test.each([
      ['orders over $50', 50],
      ['orders above $100', 100],
      ['spend $75 or more', 75],
      ['minimum order of $25', 25],
      ['$150 or more', 150],
      ['spend over $80', 80],
    ])('%s → conditionValue=%d', (text, val) => {
      const r = parse(text);
      expect(r.value.conditionType).toBe('minimum-amount');
      expect(r.value.conditionValue).toBe(val);
    });
  });

  describe('minimum-quantity', () => {
    test.each([
      ['buy 2 or more items', 2],
      ['buy 3 pairs of shoes', 3],
      ['purchase 5 or more units', 5],
    ])('%s → conditionValue=%d', (text, val) => {
      const r = parse(text);
      expect(r.value.conditionType).toBe('minimum-quantity');
      expect(r.value.conditionValue).toBe(val);
    });
  });

  describe('none (open)', () => {
    test('10% off everything → conditionType=none', () => {
      const r = parse('10% off everything');
      expect(r.value.conditionType).toBe('none');
      expect(r.value.conditionValue).toBeNull();
    });
  });
});

describe('parseCondition (compat)', () => {
  test('returns v1-shape', () => {
    const { conditionType, conditionValue } = parseCondition('orders over $50');
    expect(conditionType).toBe('minimum-amount');
    expect(conditionValue).toBe(50);
  });
});
