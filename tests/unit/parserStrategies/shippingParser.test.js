'use strict';

const { parse } = require('../../../src/services/parserStrategies/shippingParser');

describe('shippingParser.parse', () => {
  describe('shipping promo detection', () => {
    test.each([
      'free shipping on all orders',
      'free delivery this weekend',
      'ship for free',
      'no shipping fee',
      'shipping is free',
    ])('%s → isShippingPromo=true', text => {
      expect(parse(text).value.isShippingPromo).toBe(true);
    });

    test('10% off shoes → isShippingPromo=false', () => {
      expect(parse('10% off shoes').value.isShippingPromo).toBe(false);
    });
  });

  describe('method ID extraction', () => {
    test('standard shipping → standard', () => {
      expect(parse('free standard shipping').value.methodIds).toContain('standard');
    });

    test('two-day shipping → twoday', () => {
      expect(parse('free two-day shipping').value.methodIds).toContain('twoday');
    });

    test('2 day shipping → twoday', () => {
      expect(parse('free 2 day shipping').value.methodIds).toContain('twoday');
    });

    test('overnight → overnight', () => {
      expect(parse('free overnight shipping').value.methodIds).toContain('overnight');
    });

    test('hazmat → standard-hazmat', () => {
      expect(parse('free hazmat shipping').value.methodIds).toContain('standard-hazmat');
    });

    test('surepost → surepost', () => {
      expect(parse('free surepost delivery').value.methodIds).toContain('surepost');
    });

    test('no method specified → empty array + warning', () => {
      const r = parse('free shipping');
      expect(r.value.methodIds).toHaveLength(0);
      expect(r.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('disable-global-excluded-products', () => {
    test('no exclusions phrase → true', () => {
      expect(parse('free shipping, no exclusions').value.disableGlobalExcludedProducts).toBe(true);
    });

    test('normal text → false', () => {
      expect(parse('free standard shipping').value.disableGlobalExcludedProducts).toBe(false);
    });
  });

  describe('upsell threshold', () => {
    test('spend $50 for free shipping → upsellThreshold=50', () => {
      const r = parse('spend $50 for free shipping');
      expect(r.value.upsellThreshold).toBe(50);
    });

    test('no threshold text → null', () => {
      expect(parse('free standard shipping').value.upsellThreshold).toBeNull();
    });
  });

  describe('confidence', () => {
    test('shipping promo with method → high confidence', () => {
      expect(parse('free standard shipping').confidence).toBeGreaterThan(0.85);
    });

    test('shipping promo without method → medium confidence', () => {
      expect(parse('free shipping').confidence).toBeLessThan(0.85);
      expect(parse('free shipping').confidence).toBeGreaterThan(0.40);
    });

    test('non-shipping → very low confidence', () => {
      expect(parse('10% off shoes').confidence).toBeLessThan(0.20);
    });
  });
});
