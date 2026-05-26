'use strict';

const { detectMissingFields } = require('../../src/services/clarificationService');
const promotionDefinition     = require('../../src/config/promotionDefinition');

// Required fields per the current definition
const REQUIRED_FIELDS = Object.entries(promotionDefinition)
  .filter(([, cfg]) => cfg.required)
  .map(([field]) => field);

// A fully populated payload covering all required fields
// Only promotionType, promotionId, name, campaignId are required in the updated schema.
const COMPLETE_PAYLOAD = {
  promotionType: 'product',
  promotionId:   'summer-sale',
  name:          'Summer Sale',
  campaignId:    'campaign-2026',
};

describe('clarificationService.detectMissingFields', () => {

  // ── Fully complete payload ──────────────────────────────────────────────────

  describe('fully complete payload', () => {
    it('returns clarificationRequired false', () => {
      const result = detectMissingFields(COMPLETE_PAYLOAD, promotionDefinition);
      expect(result.clarificationRequired).toBe(false);
    });

    it('returns empty missingFields array', () => {
      const result = detectMissingFields(COMPLETE_PAYLOAD, promotionDefinition);
      expect(result.missingFields).toEqual([]);
    });

    it('returns empty questions array', () => {
      const result = detectMissingFields(COMPLETE_PAYLOAD, promotionDefinition);
      expect(result.questions).toEqual([]);
    });
  });

  // ── Partially complete payload ──────────────────────────────────────────────

  describe('partially complete payload', () => {
    // promotionType is present; missing: promotionId, name, campaignId
    const PARTIAL = {
      promotionType: 'product',
      discountType:  'percentage',
      discountValue: 20,
    };

    let result;
    beforeEach(() => { result = detectMissingFields(PARTIAL, promotionDefinition); });

    it('returns clarificationRequired true', () => {
      expect(result.clarificationRequired).toBe(true);
    });

    it('lists exactly the missing required fields', () => {
      expect(result.missingFields).toEqual(['promotionId', 'name', 'campaignId']);
    });

    it('returns one question per missing field', () => {
      expect(result.questions).toHaveLength(result.missingFields.length);
    });

    it('uses verbatim clarification text from the definition', () => {
      expect(result.questions).toContain(promotionDefinition.promotionId.clarification);
      expect(result.questions).toContain(promotionDefinition.name.clarification);
      expect(result.questions).toContain(promotionDefinition.campaignId.clarification);
    });

    it('does not include optional fields in missingFields', () => {
      const optionalFields = Object.entries(promotionDefinition)
        .filter(([, cfg]) => !cfg.required)
        .map(([field]) => field);
      optionalFields.forEach(f => {
        expect(result.missingFields).not.toContain(f);
      });
    });
  });

  // ── Empty payload ───────────────────────────────────────────────────────────

  describe('empty payload', () => {
    let result;
    beforeEach(() => { result = detectMissingFields({}, promotionDefinition); });

    it('returns clarificationRequired true', () => {
      expect(result.clarificationRequired).toBe(true);
    });

    it('lists all required fields as missing', () => {
      expect(result.missingFields).toEqual(REQUIRED_FIELDS);
    });

    it('returns a question for every required field', () => {
      expect(result.questions).toHaveLength(REQUIRED_FIELDS.length);
    });

    it('questions match definition clarification text in order', () => {
      const expectedQuestions = REQUIRED_FIELDS.map(f => promotionDefinition[f].clarification);
      expect(result.questions).toEqual(expectedQuestions);
    });
  });

  // ── Optional fields missing (required fields all present) ──────────────────

  describe('optional fields missing — required fields all present', () => {
    it('returns clarificationRequired false when only optional fields are absent', () => {
      // COMPLETE_PAYLOAD has no optional fields (category, customerGroup, threshold, startDate, endDate)
      const result = detectMissingFields(COMPLETE_PAYLOAD, promotionDefinition);
      expect(result.clarificationRequired).toBe(false);
      expect(result.missingFields).toEqual([]);
    });
  });

  // ── Unknown fields ignored ──────────────────────────────────────────────────

  describe('unknown fields in extracted payload are ignored', () => {
    it('does not treat unknown fields as missing required fields', () => {
      const withExtras = {
        ...COMPLETE_PAYLOAD,
        unknownField: 'some value',
        anotherUnknown: 42,
      };
      const result = detectMissingFields(withExtras, promotionDefinition);
      expect(result.clarificationRequired).toBe(false);
      expect(result.missingFields).toEqual([]);
    });

    it('does not include unknown fields in missingFields even when absent', () => {
      // An empty payload: unknown keys not in definition cannot appear as missing
      const result = detectMissingFields({}, promotionDefinition);
      result.missingFields.forEach(f => {
        expect(promotionDefinition).toHaveProperty(f);
      });
    });
  });

  // ── Null and empty-string values treated as missing ─────────────────────────

  describe('null and empty-string values count as missing', () => {
    it('treats null values as missing for required fields', () => {
      const result = detectMissingFields(
        { ...COMPLETE_PAYLOAD, promotionId: null },
        promotionDefinition
      );
      expect(result.missingFields).toContain('promotionId');
    });

    it('treats empty-string values as missing for required fields', () => {
      const result = detectMissingFields(
        { ...COMPLETE_PAYLOAD, name: '' },
        promotionDefinition
      );
      expect(result.missingFields).toContain('name');
    });

    it('treats undefined explicitly set values as missing for required fields', () => {
      const result = detectMissingFields(
        { ...COMPLETE_PAYLOAD, campaignId: undefined },
        promotionDefinition
      );
      expect(result.missingFields).toContain('campaignId');
    });
  });

  // ── Output shape contract ───────────────────────────────────────────────────

  describe('output shape is always the same structure', () => {
    it('always returns clarificationRequired, missingFields, questions', () => {
      const result = detectMissingFields({}, promotionDefinition);
      expect(result).toHaveProperty('clarificationRequired');
      expect(result).toHaveProperty('missingFields');
      expect(result).toHaveProperty('questions');
      expect(typeof result.clarificationRequired).toBe('boolean');
      expect(Array.isArray(result.missingFields)).toBe(true);
      expect(Array.isArray(result.questions)).toBe(true);
    });

    it('missingFields and questions always have the same length', () => {
      const cases = [{}, COMPLETE_PAYLOAD, { promotionType: 'product' }];
      cases.forEach(payload => {
        const result = detectMissingFields(payload, promotionDefinition);
        expect(result.questions).toHaveLength(result.missingFields.length);
      });
    });
  });
});
