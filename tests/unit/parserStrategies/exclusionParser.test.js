'use strict';

const { parse } = require('../../../src/services/parserStrategies/exclusionParser');

describe('exclusionParser.parse', () => {
  describe('direct phrases', () => {
    test.each([
      ['excluding sale items', 'sale'],
      ['not valid on gift cards', 'gift-cards'],
      ['excluding private sale', 'private-sale'],
      ['excluding preorders', 'preorder'],
      ['excluding clearance', 'clearance'],
      ['not valid on foundation products', 'foundation'],
    ])('%s → excludes %s', (text, catId) => {
      const r = parse(text);
      expect(r.value.excludedCategoryIds).toContain(catId);
    });
  });

  describe('trigger + category', () => {
    test('excluding final sale', () => {
      expect(parse('excluding final-sale items').value.excludedCategoryIds).toContain('final-sale');
    });

    test('excluding monogrammed', () => {
      expect(parse('excluding monogrammed products').value.excludedCategoryIds).toContain('monogrammed');
    });
  });

  describe('no exclusion', () => {
    test('returns empty array', () => {
      expect(parse('20% off handbags').value.excludedCategoryIds).toHaveLength(0);
    });
  });

  describe('confidence', () => {
    test('with exclusion → high confidence', () => {
      expect(parse('excluding sale items').confidence).toBeGreaterThan(0.70);
    });
    test('no exclusion → low confidence', () => {
      expect(parse('20% off').confidence).toBeLessThan(0.20);
    });
  });
});
