'use strict';

// fieldExtractionService is mocked so we can control extraction output in all tests.
// The real extractor can only populate discountType/discountValue/threshold/customerGroup/category —
// it can never produce promotionId, name, campaignId, currency, or promotionType, so the
// XML-generation path is unreachable without a mock.
jest.mock('../../src/services/fieldExtractionService');

const { processPromotionRequest } = require('../../src/services/promotionRequestOrchestrator');
const { extractFields }           = require('../../src/services/fieldExtractionService');
const promotionDefinition         = require('../../src/config/promotionDefinition');

// Required field names per the current definition
const REQUIRED_FIELDS = Object.entries(promotionDefinition)
  .filter(([, cfg]) => cfg.required)
  .map(([field]) => field);

// ─── Shared fixtures ──────────────────────────────────────────────────────────

// Partial extraction — only fields the regex extractor can detect
const PARTIAL = {
  discountType:  'percentage',
  discountValue: 20,
  category:      'shoes',
};

// Complete extraction — every required field present → no clarification needed
const COMPLETE = {
  promotionType: 'product',
  promotionId:   'test-promo',
  name:          'Test Promo',
  campaignId:    'test-campaign',
  discountType:  'percentage',
  discountValue: 20,
  currency:      'USD',
};

// Complete with all optional fields too — uses updated field names from the new schema
const COMPLETE_WITH_OPTIONALS = {
  ...COMPLETE,
  customerGroups:     'VIP',
  categoryConditions: ['shoes'],
  threshold:          100,
  description:        'VIP shoes discount',
};

afterEach(() => extractFields.mockReset());

// ─── 1. Clarification-required flow ───────────────────────────────────────────

describe('clarification-required flow', () => {
  beforeEach(() => extractFields.mockReturnValue(PARTIAL));

  it('returns clarificationRequired: true when required fields are missing', () => {
    expect(processPromotionRequest('20% off on shoes').clarificationRequired).toBe(true);
  });

  it('lists each absent required field in missingFields', () => {
    const { missingFields } = processPromotionRequest('20% off on shoes');
    // Required fields per updated schema: promotionType, promotionId, name, campaignId
    expect(missingFields).toContain('promotionId');
    expect(missingFields).toContain('name');
    expect(missingFields).toContain('campaignId');
    expect(missingFields).toContain('promotionType');
  });

  it('returns one question per missing field', () => {
    const { missingFields, questions } = processPromotionRequest('20% off');
    expect(questions).toHaveLength(missingFields.length);
  });

  it('questions use verbatim clarification text from the definition', () => {
    const { missingFields, questions } = processPromotionRequest('20% off');
    const expected = missingFields.map(f => promotionDefinition[f].clarification);
    expect(questions).toEqual(expected);
  });

  it('does NOT include xml in the clarification response', () => {
    const result = processPromotionRequest('20% off on shoes');
    expect(result).not.toHaveProperty('xml');
  });

  it('includes the extracted object unmodified', () => {
    const { extracted } = processPromotionRequest('20% off');
    expect(extracted).toEqual(PARTIAL);
  });
});

// ─── 2. Complete XML-generation flow ──────────────────────────────────────────

describe('complete XML-generation flow', () => {
  beforeEach(() => extractFields.mockReturnValue(COMPLETE));

  it('returns clarificationRequired: false when all required fields are present', () => {
    expect(processPromotionRequest('anything').clarificationRequired).toBe(false);
  });

  it('returns an xml string in the response', () => {
    const { xml } = processPromotionRequest('anything');
    expect(typeof xml).toBe('string');
    expect(xml.length).toBeGreaterThan(0);
  });

  it('xml contains valid SFCC promotion structure', () => {
    const { xml } = processPromotionRequest('anything');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31"');
    expect(xml).toContain('promotion-id="test-promo"');
    expect(xml).toContain('<name xml:lang="x-default">Test Promo</name>');
    expect(xml).toContain('<campaign-id>test-campaign</campaign-id>');
    expect(xml).toContain('<percentage>20</percentage>');
  });

  it('does NOT include missingFields or questions in the complete response', () => {
    const result = processPromotionRequest('anything');
    expect(result).not.toHaveProperty('missingFields');
    expect(result).not.toHaveProperty('questions');
  });

  it('includes the extracted object in the complete response', () => {
    const { extracted } = processPromotionRequest('anything');
    expect(extracted).toEqual(COMPLETE);
  });

  it('includes optional XML sections when optional fields are present in extraction', () => {
    extractFields.mockReturnValue(COMPLETE_WITH_OPTIONALS);
    const { xml } = processPromotionRequest('anything');
    expect(xml).toContain('<customer-groups');
    expect(xml).toContain('<qualifying-products>');
    expect(xml).toContain('<subtotal-condition');
  });
});

// ─── 3. Deterministic XML output ──────────────────────────────────────────────

describe('deterministic XML output', () => {
  beforeEach(() => extractFields.mockReturnValue(COMPLETE));

  it('produces byte-identical XML on repeated calls with the same extraction', () => {
    const first  = processPromotionRequest('anything').xml;
    const second = processPromotionRequest('anything').xml;
    expect(first).toBe(second);
  });

  it('produces different XML when extraction differs', () => {
    const pct = processPromotionRequest('anything').xml;
    extractFields.mockReturnValue({ ...COMPLETE, discountType: 'fixed-price', currency: 'USD' });
    const amt = processPromotionRequest('anything').xml;
    expect(pct).not.toBe(amt);
  });
});

// ─── 4. No XML generated when fields are missing ──────────────────────────────

describe('no XML generated when required fields are missing', () => {
  it('does not include xml when extraction is empty', () => {
    extractFields.mockReturnValue({});
    expect(processPromotionRequest('').xml).toBeUndefined();
  });

  it('does not include xml when only partial fields are extracted', () => {
    extractFields.mockReturnValue(PARTIAL);
    expect(processPromotionRequest('20% off').xml).toBeUndefined();
  });

  it('does not include xml when only optional fields are present', () => {
    extractFields.mockReturnValue({ customerGroup: 'VIP', category: 'shoes', threshold: 100 });
    expect(processPromotionRequest('').xml).toBeUndefined();
  });
});

// ─── 5. Extraction output preserved ───────────────────────────────────────────

describe('extracted object is passed through unmodified', () => {
  it('extracted equals the mock return value exactly — clarification path', () => {
    extractFields.mockReturnValue(PARTIAL);
    expect(processPromotionRequest('anything').extracted).toEqual(PARTIAL);
  });

  it('extracted equals the mock return value exactly — complete path', () => {
    extractFields.mockReturnValue(COMPLETE);
    expect(processPromotionRequest('anything').extracted).toEqual(COMPLETE);
  });

  it('orchestrator does not add fabricated keys to extracted', () => {
    extractFields.mockReturnValue(PARTIAL);
    const { extracted } = processPromotionRequest('anything');
    expect(Object.keys(extracted).sort()).toEqual(Object.keys(PARTIAL).sort());
  });

  it('orchestrator does not mutate the extracted object returned by the extractor', () => {
    const payload = { ...PARTIAL };
    extractFields.mockReturnValue(payload);
    processPromotionRequest('anything');
    expect(payload).toEqual(PARTIAL);
  });
});

// ─── 6. Renderer invocation only on complete payload ──────────────────────────

describe('renderer is only invoked when the payload is complete', () => {
  it('xml is present in the response when and only when clarificationRequired is false', () => {
    extractFields.mockReturnValue(PARTIAL);
    const incomplete = processPromotionRequest('');
    expect(incomplete.clarificationRequired).toBe(true);
    expect(incomplete.xml).toBeUndefined();

    extractFields.mockReturnValue(COMPLETE);
    const complete = processPromotionRequest('');
    expect(complete.clarificationRequired).toBe(false);
    expect(complete.xml).toBeDefined();
  });
});

// ─── 7. Malformed and invalid input handled safely ────────────────────────────

describe('safe handling of malformed and invalid input', () => {
  it('does not throw for empty string', () => {
    extractFields.mockReturnValue({});
    expect(() => processPromotionRequest('')).not.toThrow();
  });

  it('does not throw for null', () => {
    extractFields.mockReturnValue({});
    expect(() => processPromotionRequest(null)).not.toThrow();
  });

  it('does not throw for undefined', () => {
    extractFields.mockReturnValue({});
    expect(() => processPromotionRequest(undefined)).not.toThrow();
  });

  it('does not throw for a number', () => {
    extractFields.mockReturnValue({});
    expect(() => processPromotionRequest(42)).not.toThrow();
  });

  it('does not throw for a very long string', () => {
    extractFields.mockReturnValue({});
    expect(() => processPromotionRequest('x'.repeat(10_000))).not.toThrow();
  });

  it('returns a valid response shape for any input', () => {
    extractFields.mockReturnValue({});
    const result = processPromotionRequest(null);
    expect(result).toHaveProperty('clarificationRequired');
    expect(result).toHaveProperty('extracted');
    expect(typeof result.clarificationRequired).toBe('boolean');
  });

  it('returns clarificationRequired: true for all invalid inputs (nothing extractable)', () => {
    extractFields.mockReturnValue({});
    const cases = [null, undefined, '', 42, [], {}];
    cases.forEach(input => {
      expect(processPromotionRequest(input).clarificationRequired).toBe(true);
    });
  });
});

// ─── 8. Output shape contract ─────────────────────────────────────────────────

describe('output shape contract', () => {
  it('clarification response always has: clarificationRequired, extracted, missingFields, questions', () => {
    extractFields.mockReturnValue({});
    const result = processPromotionRequest('');
    expect(result).toHaveProperty('clarificationRequired', true);
    expect(result).toHaveProperty('extracted');
    expect(result).toHaveProperty('missingFields');
    expect(result).toHaveProperty('questions');
  });

  it('complete response always has: clarificationRequired, extracted, xml', () => {
    extractFields.mockReturnValue(COMPLETE);
    const result = processPromotionRequest('');
    expect(result).toHaveProperty('clarificationRequired', false);
    expect(result).toHaveProperty('extracted');
    expect(result).toHaveProperty('xml');
  });

  it('missingFields and questions always have the same length in clarification responses', () => {
    const partials = [
      {},
      { discountType: 'percentage', discountValue: 10 },
      { promotionType: 'product' },
    ];
    partials.forEach(payload => {
      extractFields.mockReturnValue(payload);
      const { missingFields, questions } = processPromotionRequest('');
      expect(questions).toHaveLength(missingFields.length);
    });
  });
});

// ─── 9. Repeatability consistency ─────────────────────────────────────────────

describe('repeatability', () => {
  it('returns equal results on repeated calls — clarification path', () => {
    extractFields.mockReturnValue(PARTIAL);
    const a = processPromotionRequest('20% off');
    const b = processPromotionRequest('20% off');
    expect(a).toEqual(b);
  });

  it('returns equal results on repeated calls — complete path', () => {
    extractFields.mockReturnValue(COMPLETE);
    const a = processPromotionRequest('anything');
    const b = processPromotionRequest('anything');
    expect(a.clarificationRequired).toBe(b.clarificationRequired);
    expect(a.xml).toBe(b.xml);
    expect(a.extracted).toEqual(b.extracted);
  });

  it('different extractions produce different outcomes', () => {
    extractFields.mockReturnValue(PARTIAL);
    const { clarificationRequired: clr } = processPromotionRequest('');

    extractFields.mockReturnValue(COMPLETE);
    const { clarificationRequired: done } = processPromotionRequest('');

    expect(clr).toBe(true);
    expect(done).toBe(false);
  });
});
