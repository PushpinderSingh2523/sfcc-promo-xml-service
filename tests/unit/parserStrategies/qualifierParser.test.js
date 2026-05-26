'use strict';

const { parse, parseExclusivity } = require('../../../src/services/parserStrategies/qualifierParser');

describe('qualifierParser.parse', () => {
  describe('customer groups', () => {
    test.each([
      ['VIP customers', 'VIP'],
      ['loyalty reward', 'Loyalty'],
      ['for employees', 'Employees'],
      ['registered users', 'RegisteredUsers'],
      ['partners discount', 'Partners'],
      ['birthday offer', 'Birthday'],
      ['new customers', 'Welcome'],
    ])('%s → group=%s', (text, group) => {
      const r = parse(text);
      expect(r.value.customerGroupIds).toContain(group);
    });

    test('sitewide → Everyone group', () => {
      const r = parse('sitewide sale');
      expect(r.value.customerGroupIds).toContain('Everyone');
    });
  });

  describe('activation coupons', () => {
    test('coupon code SAVE20 extracted', () => {
      const r = parse('use coupon code SAVE20');
      expect(r.value.activationCoupons).toContain('SAVE20');
    });

    test('promo code SUMMER15', () => {
      const r = parse('promo code SUMMER15 at checkout');
      expect(r.value.activationCoupons).toContain('SUMMER15');
    });

    test('no specific code → warning', () => {
      const r = parse('use a coupon to save');
      expect(r.warnings.some(w => w.includes('no code'))).toBe(true);
    });
  });

  describe('exclusivity hint', () => {
    test('VIP → class', () => expect(parse('VIP only').value.exclusivityHint).toBe('class'));
    test('sitewide → global', () => expect(parse('sitewide').value.exclusivityHint).toBe('global'));
    test('no signal → no', () => expect(parse('10% off shoes').value.exclusivityHint).toBe('no'));
  });

  describe('confidence', () => {
    test('with specific group → high confidence', () => {
      const r = parse('VIP customer discount');
      expect(r.confidence).toBeGreaterThan(0.75);
    });

    test('no qualifier → low confidence', () => {
      const r = parse('10% off everything');
      expect(r.confidence).toBeLessThan(0.50);
    });
  });
});

describe('parseExclusivity (compat)', () => {
  test('VIP → class', () => expect(parseExclusivity('VIP only')).toBe('class'));
  test('employees → class', () => expect(parseExclusivity('for employees')).toBe('class'));
  test('sitewide → global', () => expect(parseExclusivity('sitewide sale')).toBe('global'));
  test('all customers → global', () => expect(parseExclusivity('for all customers')).toBe('global'));
  test('no signal → no', () => expect(parseExclusivity('10% off shoes')).toBe('no'));
});
