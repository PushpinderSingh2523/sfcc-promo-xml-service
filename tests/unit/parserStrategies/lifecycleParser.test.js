'use strict';

const { parse, parseExclusivity } = require('../../../src/services/parserStrategies/lifecycleParser');

describe('lifecycleParser.parse', () => {
  describe('exclusivity', () => {
    test('VIP → class', () => expect(parse('VIP only').value.exclusivity).toBe('class'));
    test('members → class', () => expect(parse('members discount').value.exclusivity).toBe('class'));
    test('loyalty → class', () => expect(parse('loyalty reward').value.exclusivity).toBe('class'));
    test('employees → class', () => expect(parse('employee discount').value.exclusivity).toBe('class'));
    test('sitewide → global', () => expect(parse('sitewide sale').value.exclusivity).toBe('global'));
    test('all customers → global', () => expect(parse('for all customers').value.exclusivity).toBe('global'));
    test('no signal → no', () => expect(parse('10% off shoes').value.exclusivity).toBe('no'));
  });

  describe('lifecycle flags', () => {
    test('enabled is true by default', () => {
      expect(parse('10% off').value.lifecycle.enabled).toBe(true);
    });

    test('disabled signal → enabled=false', () => {
      expect(parse('this promotion is disabled').value.lifecycle.enabled).toBe(false);
    });

    test('archived signal → archived=true', () => {
      expect(parse('archived promotion').value.lifecycle.archived).toBe(true);
    });

    test('searchable signal → searchable=true', () => {
      expect(parse('searchable promotion').value.lifecycle.searchable).toBe(true);
    });

    test('one-time use → preventRequalifying=true', () => {
      expect(parse('one-time use promotion').value.lifecycle.preventRequalifying).toBe(true);
    });

    test('preventRequalifying=false by default', () => {
      expect(parse('10% off handbags').value.lifecycle.preventRequalifying).toBe(false);
    });
  });

  describe('all six flags present', () => {
    test('lifecycle object always has all 6 keys', () => {
      const { lifecycle } = parse('VIP 20% discount').value;
      expect(lifecycle).toHaveProperty('enabled');
      expect(lifecycle).toHaveProperty('archived');
      expect(lifecycle).toHaveProperty('searchable');
      expect(lifecycle).toHaveProperty('refinable');
      expect(lifecycle).toHaveProperty('preventRequalifying');
      expect(lifecycle).toHaveProperty('prorateAcrossEligibleItems');
    });
  });
});

describe('parseExclusivity (compat)', () => {
  test('VIP → class', () => expect(parseExclusivity('VIP only')).toBe('class'));
  test('sitewide → global', () => expect(parseExclusivity('sitewide')).toBe('global'));
  test('no signal → no', () => expect(parseExclusivity('10% off')).toBe('no'));
});
