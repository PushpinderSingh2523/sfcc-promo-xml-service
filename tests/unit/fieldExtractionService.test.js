'use strict';

const { extractFields } = require('../../src/services/fieldExtractionService');

describe('fieldExtractionService.extractFields', () => {

  // ── A. Percentage discount ─────────────────────────────────────────────────

  describe('percentage discount extraction', () => {
    it('extracts integer percentage — "20% off"', () => {
      expect(extractFields('20% off')).toMatchObject({ discountType: 'percentage', discountValue: 20 });
    });

    it('extracts decimal percentage — "12.5% off"', () => {
      expect(extractFields('12.5% off')).toMatchObject({ discountType: 'percentage', discountValue: 12.5 });
    });

    it('extracts "percent" spelling — "15 percent discount"', () => {
      expect(extractFields('15 percent discount')).toMatchObject({ discountType: 'percentage', discountValue: 15 });
    });

    it('extracts "percent off" spelling — "30 percent off"', () => {
      expect(extractFields('30 percent off')).toMatchObject({ discountType: 'percentage', discountValue: 30 });
    });

    it('percentage takes priority over fixed amount when both appear', () => {
      const result = extractFields('20% off and $10 off');
      expect(result.discountType).toBe('percentage');
      expect(result.discountValue).toBe(20);
    });
  });

  // ── B. Fixed amount discount ───────────────────────────────────────────────

  describe('fixed amount discount extraction', () => {
    it('extracts dollar-sign prefix — "$20 off"', () => {
      expect(extractFields('$20 off')).toMatchObject({ discountType: 'amount', discountValue: 20 });
    });

    it('extracts decimal dollar amount — "$9.99 off"', () => {
      expect(extractFields('$9.99 off')).toMatchObject({ discountType: 'amount', discountValue: 9.99 });
    });

    it('extracts "dollars off" phrasing — "20 dollars off"', () => {
      expect(extractFields('20 dollars off')).toMatchObject({ discountType: 'amount', discountValue: 20 });
    });

    it('extracts "dollar off" singular — "5 dollar off"', () => {
      expect(extractFields('5 dollar off')).toMatchObject({ discountType: 'amount', discountValue: 5 });
    });

    it('does not extract amount when no "off" keyword present', () => {
      const result = extractFields('spend $100');
      expect(result.discountType).toBeUndefined();
    });
  });

  // ── C. Threshold extraction ────────────────────────────────────────────────

  describe('threshold extraction', () => {
    it('extracts "above $N" — "above $100"', () => {
      expect(extractFields('above $100')).toMatchObject({ threshold: 100 });
    });

    it('extracts "over $N" — "over $50"', () => {
      expect(extractFields('over $50')).toMatchObject({ threshold: 50 });
    });

    it('extracts "minimum order $N" — "minimum order $200"', () => {
      expect(extractFields('minimum order $200')).toMatchObject({ threshold: 200 });
    });

    it('extracts decimal threshold — "above $49.99"', () => {
      expect(extractFields('above $49.99')).toMatchObject({ threshold: 49.99 });
    });

    it('does not extract threshold without dollar sign', () => {
      const result = extractFields('above 100 items');
      expect(result.threshold).toBeUndefined();
    });
  });

  // ── D. Customer group extraction ───────────────────────────────────────────

  describe('customer group extraction', () => {
    it('extracts VIP — "VIP users"', () => {
      expect(extractFields('VIP users')).toMatchObject({ customerGroup: 'VIP' });
    });

    it('extracts employees — "employees only"', () => {
      expect(extractFields('employees only')).toMatchObject({ customerGroup: 'employees' });
    });

    it('extracts singular employee — "employee discount"', () => {
      expect(extractFields('employee discount')).toMatchObject({ customerGroup: 'employee' });
    });

    it('extracts members — "for members"', () => {
      expect(extractFields('for members')).toMatchObject({ customerGroup: 'members' });
    });

    it('extracts gold — "gold customers"', () => {
      expect(extractFields('gold customers')).toMatchObject({ customerGroup: 'gold' });
    });

    it('extracts silver — "silver tier"', () => {
      expect(extractFields('silver tier')).toMatchObject({ customerGroup: 'silver' });
    });

    it('extracts wholesale — "wholesale buyers"', () => {
      expect(extractFields('wholesale buyers')).toMatchObject({ customerGroup: 'wholesale' });
    });

    it('preserves original case of the group name', () => {
      expect(extractFields('VIP customers').customerGroup).toBe('VIP');
      expect(extractFields('employees only').customerGroup).toBe('employees');
    });
  });

  // ── E. Category extraction ─────────────────────────────────────────────────

  describe('category extraction', () => {
    it('extracts "on <word>" — "on shoes"', () => {
      expect(extractFields('on shoes')).toMatchObject({ category: 'shoes' });
    });

    it('extracts "for <word>" — "for handbags"', () => {
      expect(extractFields('for handbags')).toMatchObject({ category: 'handbags' });
    });

    it('normalises category to lowercase', () => {
      expect(extractFields('on Shoes').category).toBe('shoes');
    });

    it('"for VIP" does not set category — VIP is a group term', () => {
      const result = extractFields('for VIP users');
      expect(result.category).toBeUndefined();
    });

    it('"for employees" does not set category — employees is a group term', () => {
      expect(extractFields('for employees').category).toBeUndefined();
    });

    it('"on" match takes priority over "for" match in the same string', () => {
      // "on shoes for handbags" — "on" branch wins first
      const result = extractFields('on shoes for handbags');
      expect(result.category).toBe('shoes');
    });
  });

  // ── F. Combined extraction ─────────────────────────────────────────────────

  describe('combined extraction', () => {
    it('extracts all five fields from a rich input', () => {
      const result = extractFields('20% off on shoes above $100 for VIP users');
      expect(result).toMatchObject({
        discountType:  'percentage',
        discountValue: 20,
        threshold:     100,
        customerGroup: 'VIP',
        category:      'shoes',
      });
    });

    it('extracts fixed amount + threshold together', () => {
      const result = extractFields('$15 off on orders above $50');
      expect(result).toMatchObject({ discountType: 'amount', discountValue: 15, threshold: 50 });
    });

    it('extracts percentage + customer group without category', () => {
      const result = extractFields('10% off for members');
      expect(result).toMatchObject({ discountType: 'percentage', discountValue: 10, customerGroup: 'members' });
      expect(result.category).toBeUndefined();
    });

    it('extracts category + threshold without discount', () => {
      const result = extractFields('on handbags above $200');
      expect(result).toMatchObject({ category: 'handbags', threshold: 200 });
      expect(result.discountType).toBeUndefined();
    });
  });

  // ── G. Unknown text safely ignored ────────────────────────────────────────

  describe('unknown text safely ignored', () => {
    it('returns empty object for completely unrelated text', () => {
      expect(extractFields('the quick brown fox jumps over the lazy dog')).toEqual({});
    });

    it('returns empty object for a single unrecognised word', () => {
      expect(extractFields('foobar')).toEqual({});
    });
  });

  // ── H. Malformed text safely ignored ──────────────────────────────────────

  describe('malformed text safely ignored', () => {
    it('returns empty object for symbol noise', () => {
      expect(extractFields('%%%$$$###')).toEqual({});
    });

    it('returns empty object for a number with no context', () => {
      expect(extractFields('42')).toEqual({});
    });

    it('does not throw for very long strings', () => {
      expect(() => extractFields('x'.repeat(10_000))).not.toThrow();
    });
  });

  // ── I. Empty input ─────────────────────────────────────────────────────────

  describe('empty and absent input', () => {
    it('returns empty object for empty string', () => {
      expect(extractFields('')).toEqual({});
    });

    it('returns empty object for whitespace-only string', () => {
      expect(extractFields('   ')).toEqual({});
    });

    it('returns empty object for null', () => {
      expect(extractFields(null)).toEqual({});
    });

    it('returns empty object for undefined', () => {
      expect(extractFields(undefined)).toEqual({});
    });

    it('returns empty object for a non-string value', () => {
      expect(extractFields(42)).toEqual({});
    });
  });

  // ── J. Mixed irrelevant text ───────────────────────────────────────────────

  describe('mixed irrelevant text around recognisable patterns', () => {
    it('extracts discount embedded in a sentence', () => {
      const result = extractFields('We are happy to offer you 20% off your next purchase!');
      expect(result).toMatchObject({ discountType: 'percentage', discountValue: 20 });
    });

    it('extracts threshold embedded in marketing copy', () => {
      const result = extractFields('Free delivery on all orders above $75 this weekend only!');
      expect(result).toMatchObject({ threshold: 75 });
    });

    it('ignores filler words around the group name', () => {
      const result = extractFields('This offer is exclusively available to our VIP loyalty customers.');
      expect(result).toMatchObject({ customerGroup: 'VIP' });
    });

    it('never fabricates fields from irrelevant promotional language', () => {
      const result = extractFields('Hurry — limited time only! Shop now!');
      expect(result).toEqual({});
    });
  });

  // ── K. Return shape contract ───────────────────────────────────────────────

  describe('return shape', () => {
    it('always returns a plain object', () => {
      expect(typeof extractFields('anything')).toBe('object');
      expect(Array.isArray(extractFields('anything'))).toBe(false);
    });

    it('never returns null', () => {
      expect(extractFields('')).not.toBeNull();
      expect(extractFields(null)).not.toBeNull();
    });

    it('never adds extra keys beyond the recognised set', () => {
      const KNOWN_KEYS = new Set(['discountType', 'discountValue', 'threshold', 'customerGroup', 'category']);
      const result = extractFields('20% off on shoes above $100 for VIP users');
      Object.keys(result).forEach(k => expect(KNOWN_KEYS.has(k)).toBe(true));
    });
  });
});
