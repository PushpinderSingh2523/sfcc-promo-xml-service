'use strict';

const {
  validateSessionAnswer,
  _internals: { normalizeAnswer, runValidationSpec, checkTypeMismatch, inferFieldType, isEmpty },
} = require('../../src/blueprints/session/validateSessionAnswer');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueueItem(overrides = {}) {
  return {
    key:      'campaignId::campaign::_::_',
    fieldId:  'campaignId',
    slotType: 'campaign',
    slotIndex: null,
    xmlLang:  null,
    group:    'Campaign',
    label:    'Campaign ID',
    question: 'What is the campaign ID?',
    required: true,
    currentValue: '2025_SUMMER_SAS',
    validation: { minLength: 1, maxLength: 100 },
    replayCritical: false,
    ...overrides,
  };
}

// ─── isEmpty ─────────────────────────────────────────────────────────────────

describe('isEmpty', () => {
  test('null → true', () => expect(isEmpty(null)).toBe(true));
  test('undefined → true', () => expect(isEmpty(undefined)).toBe(true));
  test('empty string → true', () => expect(isEmpty('')).toBe(true));
  test('empty array → true', () => expect(isEmpty([])).toBe(true));
  test('non-empty string → false', () => expect(isEmpty('x')).toBe(false));
  test('non-empty array → false', () => expect(isEmpty(['a'])).toBe(false));
  test('zero → false', () => expect(isEmpty(0)).toBe(false));
  test('false → false', () => expect(isEmpty(false)).toBe(false));
});

// ─── inferFieldType ───────────────────────────────────────────────────────────

describe('inferFieldType', () => {
  test('couponIds → stringArray', () => {
    expect(inferFieldType(makeQueueItem({ fieldId: 'couponIds' }))).toBe('stringArray');
  });

  test('discountEntries → discountEntryArray', () => {
    expect(inferFieldType(makeQueueItem({ fieldId: 'discountEntries' }))).toBe('discountEntryArray');
  });

  test('simpleDiscountValue → number', () => {
    expect(inferFieldType(makeQueueItem({ fieldId: 'simpleDiscountValue', validation: null }))).toBe('number');
  });

  test('iso8601 format in validation → iso8601', () => {
    expect(inferFieldType(makeQueueItem({
      fieldId: 'startDate',
      validation: { format: 'iso8601' },
    }))).toBe('iso8601');
  });

  test('enum array in validation → enum', () => {
    expect(inferFieldType(makeQueueItem({
      fieldId: 'exclusivity',
      validation: { enum: ['no-overlap', 'class', 'global'] },
    }))).toBe('enum');
  });

  test('type array in validation → stringArray', () => {
    expect(inferFieldType(makeQueueItem({
      fieldId: 'tags',
      validation: { type: 'array' },
    }))).toBe('stringArray');
  });

  test('default → string', () => {
    expect(inferFieldType(makeQueueItem({ fieldId: 'promotionId', validation: {} }))).toBe('string');
  });
});

// ─── normalizeAnswer ──────────────────────────────────────────────────────────

describe('normalizeAnswer', () => {
  describe('string type', () => {
    test('trims leading and trailing whitespace', () => {
      const { normalizedValue } = normalizeAnswer('  hello  ', 'string');
      expect(normalizedValue).toBe('hello');
    });

    test('normalizes \\r\\n to \\n', () => {
      const { normalizedValue } = normalizeAnswer('line1\r\nline2', 'string');
      expect(normalizedValue).toBe('line1\nline2');
    });

    test('normalizes bare \\r to \\n', () => {
      const { normalizedValue } = normalizeAnswer('line1\rline2', 'string');
      expect(normalizedValue).toBe('line1\nline2');
    });

    test('already clean string → no normalization applied flag', () => {
      const { normalizationApplied } = normalizeAnswer('hello', 'string');
      expect(normalizationApplied).toBe(false);
    });

    test('null → null', () => {
      const { normalizedValue } = normalizeAnswer(null, 'string');
      expect(normalizedValue).toBeNull();
    });
  });

  describe('iso8601 type', () => {
    test('trims whitespace from iso8601 string', () => {
      const { normalizedValue } = normalizeAnswer('  2026-06-01T04:00:00.000Z  ', 'iso8601');
      expect(normalizedValue).toBe('2026-06-01T04:00:00.000Z');
    });
  });

  describe('number type', () => {
    test('numeric string is parsed to number', () => {
      const { normalizedValue, normalizationApplied } = normalizeAnswer('25', 'number');
      expect(normalizedValue).toBe(25);
      expect(normalizationApplied).toBe(true);
    });

    test('actual number is returned unchanged', () => {
      const { normalizedValue, normalizationApplied } = normalizeAnswer(25, 'number');
      expect(normalizedValue).toBe(25);
      expect(normalizationApplied).toBe(false);
    });

    test('non-numeric string returned as-is (for validation to reject)', () => {
      const { normalizedValue } = normalizeAnswer('abc', 'number');
      expect(normalizedValue).toBe('abc');
    });
  });

  describe('boolean type', () => {
    test('true string → boolean true', () => {
      const { normalizedValue } = normalizeAnswer('true', 'boolean');
      expect(normalizedValue).toBe(true);
    });

    test('false string → boolean false', () => {
      const { normalizedValue } = normalizeAnswer('false', 'boolean');
      expect(normalizedValue).toBe(false);
    });

    test('actual boolean unchanged', () => {
      const { normalizedValue } = normalizeAnswer(true, 'boolean');
      expect(normalizedValue).toBe(true);
    });
  });

  describe('stringArray type', () => {
    test('JSON string is parsed to array', () => {
      const { normalizedValue } = normalizeAnswer('["coupon1","coupon2"]', 'stringArray');
      expect(normalizedValue).toEqual(['coupon1', 'coupon2']);
    });

    test('array items are trimmed', () => {
      const { normalizedValue } = normalizeAnswer(['  coupon1  ', 'coupon2'], 'stringArray');
      expect(normalizedValue).toEqual(['coupon1', 'coupon2']);
    });

    test('invalid JSON string → returned as-is', () => {
      const { normalizedValue } = normalizeAnswer('not-json', 'stringArray');
      expect(normalizedValue).toBe('not-json');
    });
  });

  describe('discountEntryArray type', () => {
    test('JSON string is parsed to array', () => {
      const { normalizedValue } = normalizeAnswer(
        '[{"threshold":50,"discountValue":10}]',
        'discountEntryArray'
      );
      expect(normalizedValue).toEqual([{ threshold: 50, discountValue: 10 }]);
    });

    test('string threshold/discountValue normalized to numbers', () => {
      const { normalizedValue } = normalizeAnswer(
        [{ threshold: '50', discountValue: '10' }],
        'discountEntryArray'
      );
      expect(normalizedValue[0].threshold).toBe(50);
      expect(normalizedValue[0].discountValue).toBe(10);
    });

    test('actual array of objects returned unchanged shape', () => {
      const raw = [{ threshold: 50, discountValue: 10 }];
      const { normalizedValue } = normalizeAnswer(raw, 'discountEntryArray');
      expect(normalizedValue).toEqual(raw);
    });
  });
});

// ─── runValidationSpec ────────────────────────────────────────────────────────

describe('runValidationSpec', () => {
  test('minLength violation returns minLength error', () => {
    const errors = runValidationSpec('ab', { minLength: 5 }, 'Field', 'string');
    expect(errors.some(e => e.rule === 'minLength')).toBe(true);
  });

  test('maxLength violation returns maxLength error', () => {
    const errors = runValidationSpec('abcdef', { maxLength: 3 }, 'Field', 'string');
    expect(errors.some(e => e.rule === 'maxLength')).toBe(true);
  });

  test('pattern violation returns pattern error', () => {
    const errors = runValidationSpec('hello world', { pattern: '^\\S+$' }, 'Field', 'string');
    expect(errors.some(e => e.rule === 'pattern')).toBe(true);
  });

  test('valid pattern → no errors', () => {
    const errors = runValidationSpec('hello', { pattern: '^\\S+$' }, 'Field', 'string');
    expect(errors).toHaveLength(0);
  });

  test('iso8601 format — valid ISO string → no error', () => {
    const errors = runValidationSpec('2026-06-01T04:00:00.000Z', { format: 'iso8601' }, 'Field', 'iso8601');
    expect(errors).toHaveLength(0);
  });

  test('iso8601 format — invalid string → error', () => {
    const errors = runValidationSpec('2026/06/01', { format: 'iso8601' }, 'Field', 'iso8601');
    expect(errors.some(e => e.rule === 'iso8601')).toBe(true);
  });

  test('enum — valid value → no error', () => {
    const errors = runValidationSpec('class', { enum: ['no-overlap', 'class', 'global'] }, 'Field', 'enum');
    expect(errors).toHaveLength(0);
  });

  test('enum — invalid value → error', () => {
    const errors = runValidationSpec('unknown', { enum: ['no-overlap', 'class', 'global'] }, 'Field', 'enum');
    expect(errors.some(e => e.rule === 'enum')).toBe(true);
  });

  test('min violation on number', () => {
    const errors = runValidationSpec(0, { min: 1 }, 'Field', 'number');
    expect(errors.some(e => e.rule === 'min')).toBe(true);
  });

  test('max violation on number', () => {
    const errors = runValidationSpec(200, { max: 100 }, 'Field', 'number');
    expect(errors.some(e => e.rule === 'max')).toBe(true);
  });

  test('integer violation on float', () => {
    const errors = runValidationSpec(3.14, { type: 'integer' }, 'Field', 'number');
    expect(errors.some(e => e.rule === 'integer')).toBe(true);
  });

  test('minItems violation on array', () => {
    const errors = runValidationSpec([], { minItems: 1 }, 'Field', 'stringArray');
    expect(errors.some(e => e.rule === 'minItems')).toBe(true);
  });

  test('null spec → no errors', () => {
    const errors = runValidationSpec('hello', null, 'Field', 'string');
    expect(errors).toHaveLength(0);
  });
});

// ─── checkTypeMismatch ────────────────────────────────────────────────────────

describe('checkTypeMismatch', () => {
  test('number type with string value → error', () => {
    const errors = checkTypeMismatch('abc', 'number', 'Field');
    expect(errors.some(e => e.rule === 'type')).toBe(true);
  });

  test('number type with actual number → no error', () => {
    expect(checkTypeMismatch(25, 'number', 'Field')).toHaveLength(0);
  });

  test('boolean type with string → error', () => {
    const errors = checkTypeMismatch('maybe', 'boolean', 'Field');
    expect(errors.some(e => e.rule === 'type')).toBe(true);
  });

  test('boolean type with actual boolean → no error', () => {
    expect(checkTypeMismatch(true, 'boolean', 'Field')).toHaveLength(0);
  });

  test('stringArray with non-array → error', () => {
    const errors = checkTypeMismatch('not-array', 'stringArray', 'Field');
    expect(errors.some(e => e.rule === 'type')).toBe(true);
  });

  test('null value → no type error (null is handled separately)', () => {
    expect(checkTypeMismatch(null, 'number', 'Field')).toHaveLength(0);
  });
});

// ─── validateSessionAnswer ────────────────────────────────────────────────────

describe('validateSessionAnswer', () => {
  describe('input validation', () => {
    test('throws when queueItem is null', () => {
      expect(() => validateSessionAnswer(null, 'value')).toThrow('queueItem must be a non-null object');
    });

    test('throws when queueItem is a string', () => {
      expect(() => validateSessionAnswer('bad', 'value')).toThrow('queueItem must be a non-null object');
    });
  });

  describe('required field', () => {
    test('null → invalid with required error', () => {
      const result = validateSessionAnswer(makeQueueItem({ required: true }), null);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'required')).toBe(true);
    });

    test('empty string → invalid with required error', () => {
      const result = validateSessionAnswer(makeQueueItem({ required: true }), '');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'required')).toBe(true);
    });

    test('whitespace-only → trimmed to empty → invalid', () => {
      const result = validateSessionAnswer(makeQueueItem({ required: true }), '   ');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'required')).toBe(true);
    });
  });

  describe('optional field', () => {
    test('null on optional → valid with null normalizedValue', () => {
      const result = validateSessionAnswer(makeQueueItem({ required: false }), null);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBeNull();
      expect(result.errors).toHaveLength(0);
    });

    test('empty string on optional → valid with null normalizedValue', () => {
      const result = validateSessionAnswer(makeQueueItem({ required: false }), '');
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBeNull();
    });
  });

  describe('string field validation', () => {
    test('valid string → valid', () => {
      const result = validateSessionAnswer(
        makeQueueItem({ validation: { minLength: 1, maxLength: 100 } }),
        '2026_SUMMER_SAS'
      );
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('2026_SUMMER_SAS');
    });

    test('string too short → minLength error', () => {
      const result = validateSessionAnswer(
        makeQueueItem({ validation: { minLength: 5 } }),
        'ab'
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'minLength')).toBe(true);
    });

    test('string too long → maxLength error', () => {
      const result = validateSessionAnswer(
        makeQueueItem({ validation: { maxLength: 3 } }),
        'toolongvalue'
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'maxLength')).toBe(true);
    });

    test('whitespace is trimmed before validation', () => {
      const result = validateSessionAnswer(
        makeQueueItem({ validation: { minLength: 1 } }),
        '  hello  '
      );
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('hello');
    });
  });

  describe('ISO-8601 field', () => {
    const dateItem = makeQueueItem({
      fieldId:    'endDate',
      required:   false,
      validation: { format: 'iso8601' },
    });

    test('valid ISO-8601 string → valid', () => {
      const result = validateSessionAnswer(dateItem, '2026-07-04T04:00:00.000Z');
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('2026-07-04T04:00:00.000Z');
    });

    test('invalid date format → error', () => {
      const result = validateSessionAnswer(dateItem, '2026/07/04');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'iso8601')).toBe(true);
    });
  });

  describe('number field (simpleDiscountValue)', () => {
    const discountItem = makeQueueItem({
      fieldId:    'simpleDiscountValue',
      required:   false,
      validation: { min: 0, max: 100 },
    });

    test('valid number → valid', () => {
      const result = validateSessionAnswer(discountItem, 25);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(25);
    });

    test('numeric string → normalized to number and valid', () => {
      const result = validateSessionAnswer(discountItem, '30');
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(30);
    });

    test('non-numeric string → type error', () => {
      const result = validateSessionAnswer(discountItem, 'abc');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'type')).toBe(true);
    });

    test('value below min → min error', () => {
      const result = validateSessionAnswer(discountItem, -5);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'min')).toBe(true);
    });
  });

  describe('stringArray field (couponIds)', () => {
    const couponItem = makeQueueItem({
      fieldId:    'couponIds',
      required:   false,
      validation: { minItems: 1, items: { type: 'string', minLength: 1 } },
    });

    test('valid string array → valid', () => {
      const result = validateSessionAnswer(couponItem, ['COUPON_A', 'COUPON_B']);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual(['COUPON_A', 'COUPON_B']);
    });

    test('JSON string of array → parsed and valid', () => {
      const result = validateSessionAnswer(couponItem, '["COUPON_A"]');
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual(['COUPON_A']);
    });

    test('optional empty array is accepted as null (isEmpty semantics)', () => {
      // An empty array on an optional field means "not provided" — treated as null
      const result = validateSessionAnswer(couponItem, []);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBeNull();
    });

    test('non-empty array with too few items fails minItems', () => {
      const strictItem = makeQueueItem({
        fieldId:    'couponIds',
        required:   false,
        validation: { minItems: 2, items: { type: 'string', minLength: 1 } },
      });
      const result = validateSessionAnswer(strictItem, ['ONLY_ONE']);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.rule === 'minItems')).toBe(true);
    });
  });

  describe('discountEntryArray field', () => {
    const discountEntriesItem = makeQueueItem({
      fieldId:    'discountEntries',
      required:   false,
      validation: {
        minItems: 1,
        items: { threshold: { min: 0 }, discountValue: { min: 0 } },
      },
    });

    test('valid discount entries → valid', () => {
      const result = validateSessionAnswer(discountEntriesItem, [
        { threshold: 50, discountValue: 10 },
      ]);
      expect(result.valid).toBe(true);
    });

    test('string threshold normalized to number', () => {
      const result = validateSessionAnswer(discountEntriesItem, [
        { threshold: '100', discountValue: '15' },
      ]);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue[0].threshold).toBe(100);
      expect(result.normalizedValue[0].discountValue).toBe(15);
    });
  });

  describe('return shape', () => {
    test('valid result has valid=true, errors=[], non-null normalizedValue', () => {
      const result = validateSessionAnswer(makeQueueItem(), '2026_SUMMER_SAS');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.normalizedValue).toBe('2026_SUMMER_SAS');
    });

    test('invalid result has valid=false, non-empty errors', () => {
      const result = validateSessionAnswer(makeQueueItem({ required: true }), null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
