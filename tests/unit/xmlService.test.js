const { buildXml } = require('../../src/services/xmlService');
const sampleIntent = require('../fixtures/sampleIntent.json');

describe('xmlService.buildXml', () => {
  it('produces valid XML string', () => {
    const xml = buildXml(sampleIntent);
    expect(typeof xml).toBe('string');
    expect(xml).toContain('<?xml version="1.0"');
  });

  it('includes SFCC namespace', () => {
    const xml = buildXml(sampleIntent);
    expect(xml).toContain('http://www.demandware.com/xml/impex/promotion/2008-01-31');
  });

  it('includes promotion id and campaign-id attributes', () => {
    const xml = buildXml(sampleIntent);
    expect(xml).toContain('campaign-id="summer-sale-2025"');
    expect(xml).toContain('id="summer-10pct-off"');
  });

  it('outputs percentage discount correctly', () => {
    const xml = buildXml(sampleIntent);
    expect(xml).toContain('<percentage>10</percentage>');
  });

  it('outputs minimum-amount eligibility condition', () => {
    const xml = buildXml(sampleIntent);
    expect(xml).toContain('greater-than-or-equal');
    expect(xml).toContain('>50<');
  });

  it('outputs start and end dates', () => {
    const xml = buildXml(sampleIntent);
    expect(xml).toContain('<start-date>2025-06-01T00:00:00.000Z</start-date>');
    expect(xml).toContain('<end-date>2025-08-31T23:59:59.000Z</end-date>');
  });

  it('handles amount-off discount type', () => {
    const data = { ...sampleIntent, discountType: 'amount-off', discountValue: 20 };
    const xml = buildXml(data);
    expect(xml).toContain('<amount>20</amount>');
  });

  it('handles free-shipping discount type', () => {
    const data = { ...sampleIntent, discountType: 'free-shipping', discountValue: 0, conditionType: 'none' };
    const xml = buildXml(data);
    expect(xml).toContain('<shipping-discount>');
  });

  it('handles coupon condition type', () => {
    const data = {
      ...sampleIntent,
      conditionType: 'coupon',
      couponCode: 'SAVE10',
    };
    const xml = buildXml(data);
    expect(xml).toContain('<coupon-code>SAVE10</coupon-code>');
  });

  it('handles bonus-product discount type', () => {
    const data = { ...sampleIntent, discountType: 'bonus-product', discountValue: 0 };
    const xml = buildXml(data);
    expect(xml).toContain('<bonus-choice-count>1</bonus-choice-count>');
  });

  it('includes qualifying product IDs when provided', () => {
    const data = { ...sampleIntent, qualifyingProductIds: ['SKU-001', 'SKU-002'] };
    const xml = buildXml(data);
    expect(xml).toContain('<product-id>SKU-001</product-id>');
    expect(xml).toContain('<product-id>SKU-002</product-id>');
  });

  it('includes target product IDs when provided', () => {
    const data = { ...sampleIntent, targetProductIds: ['GIFT-A'] };
    const xml = buildXml(data);
    expect(xml).toContain('<product-id>GIFT-A</product-id>');
  });

  it('handles minimum-quantity condition type', () => {
    const data = { ...sampleIntent, conditionType: 'minimum-quantity', conditionValue: 3 };
    const xml = buildXml(data);
    expect(xml).toContain('<quantity');
    expect(xml).toContain('>3<');
  });
});
