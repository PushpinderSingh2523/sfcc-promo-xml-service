const { validateIntent, validateXml } = require('../../src/services/validationService');
const sampleIntent = require('../fixtures/sampleIntent.json');
const fs = require('fs');
const path = require('path');

describe('validationService.validateIntent', () => {
  it('validates a correct intent object', () => {
    const result = validateIntent(sampleIntent);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing required field "name"', () => {
    const bad = { ...sampleIntent };
    delete bad.name;
    const result = validateIntent(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('required'))).toBe(true);
  });

  it('rejects invalid exclusivity value', () => {
    const bad = { ...sampleIntent, exclusivity: 'invalid-value' };
    const result = validateIntent(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid discountType', () => {
    const bad = { ...sampleIntent, discountType: 'mystery-type' };
    const result = validateIntent(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects non-ISO startDate', () => {
    const bad = { ...sampleIntent, startDate: 'not-a-date' };
    const result = validateIntent(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects discountValue above 100000', () => {
    const bad = { ...sampleIntent, discountValue: 999999 };
    const result = validateIntent(bad);
    expect(result.valid).toBe(false);
  });

  it('accepts null conditionValue', () => {
    const data = { ...sampleIntent, conditionType: 'none', conditionValue: null };
    const result = validateIntent(data);
    expect(result.valid).toBe(true);
  });

  it('accepts all valid exclusivity values', () => {
    ['no', 'class', 'global'].forEach(exclusivity => {
      expect(validateIntent({ ...sampleIntent, exclusivity }).valid).toBe(true);
    });
  });

  it('accepts all valid discountTypes', () => {
    ['percentage', 'fixed-price', 'amount-off', 'free-shipping', 'bonus-product'].forEach(discountType => {
      expect(validateIntent({ ...sampleIntent, discountType }).valid).toBe(true);
    });
  });
});

describe('validationService.validateXml', () => {
  const sampleXml = fs.readFileSync(
    path.join(__dirname, '../fixtures/samplePromotion.xml'),
    'utf8'
  );

  it('validates correct SFCC XML', () => {
    const result = validateXml(sampleXml);
    expect(result.valid).toBe(true);
  });

  it('rejects XML missing the namespace', () => {
    const bad = sampleXml.replace(/xmlns="[^"]+"/, '');
    const result = validateXml(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects XML missing promotion-id attribute', () => {
    const bad = sampleXml.replace(/promotion-id="[^"]+"/, '');
    const result = validateXml(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects XML missing discount block', () => {
    const bad = sampleXml.replace(/<discounts[^>]*>[\s\S]*?<\/discounts>/, '');
    const result = validateXml(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects completely empty string', () => {
    const result = validateXml('');
    expect(result.valid).toBe(false);
  });
});
