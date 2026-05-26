'use strict';

const { parse, parseProductKeywords } = require('../../../src/services/parserStrategies/categoryParser');

describe('categoryParser.parse', () => {
  describe('category ID extraction', () => {
    test.each([
      ['10% off handbags', 'handbags'],
      ['discount on watches', 'watches'],
      ['20% off shoes', 'shoes'],
      ['accessories sale', 'accessories'],
      ['jacket discount', 'apparel'],
      ['sportswear deal', 'sportswear'],
      ['beauty products', 'beauty'],
      ['electronics sale', 'electronics'],
    ])('%s → categoryId includes %s', (text, catId) => {
      const r = parse(text);
      expect(r.value.qualifyingCategoryIds).toContain(catId);
    });
  });

  describe('multiple categories', () => {
    test('handbags and watches', () => {
      const r = parse('10% off handbags and watches');
      expect(r.value.qualifyingCategoryIds).toContain('handbags');
      expect(r.value.qualifyingCategoryIds).toContain('watches');
    });
  });

  describe('no categories', () => {
    test('returns empty array and warning', () => {
      const r = parse('10% off all orders');
      expect(r.value.qualifyingCategoryIds).toHaveLength(0);
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThan(0.20);
    });
  });

  describe('catalogId default', () => {
    test('returns siteCatalog_ToryUS by default', () => {
      const r = parse('handbags sale');
      expect(r.value.catalogId).toBe('siteCatalog_ToryUS');
    });
  });
});

describe('parseProductKeywords (compat)', () => {
  test('extracts shoe keyword', () => {
    expect(parseProductKeywords('10% off shoes')).toContain('shoes');
  });

  test('extracts jackets keyword', () => {
    expect(parseProductKeywords('discount on jackets')).toContain('jackets');
  });

  test('returns empty array for no match', () => {
    expect(parseProductKeywords('10% off your order')).toEqual([]);
  });

  test('deduplicates', () => {
    const kw = parseProductKeywords('buy shoes, all shoes on sale');
    expect(kw.filter(k => k === 'shoes').length).toBe(1);
  });
});
