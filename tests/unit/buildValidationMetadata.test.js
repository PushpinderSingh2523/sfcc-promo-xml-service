'use strict';

const {
  buildFieldValidationMetadata,
  buildAllValidationMetadata,
  buildValidationMetadataFromClassified,
  _internals: { deriveRules },
} = require('../../src/blueprints/validation/buildValidationMetadata');

const { classifyEditableFields }  = require('../../src/blueprints/classification/classifyEditableFields');
const { getField, getEditableFields } = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');

const path = require('path');
const fs   = require('fs');
const { extractSASBlueprint } = require('../../src/blueprints/extractors/extractSASBlueprint');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_XML = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8'
);

function makeBlueprint() {
  return {
    blueprintId: 'vm-test', sourceExport: 'test.xml', extractedAt: '2025-01-01T00:00:00.000Z',
    campaignSlot: {
      frozenStructure: { enabledFlag: true, campaignScope: { applicableOnline: true } },
      editableFields: { campaignId: '2025_SUMMER_SAS' },
    },
    promotionSlots: [{
      slotIndex: 0,
      frozenStructure: {
        enabledFlag: true, archivedFlag: false, searchableFlag: false, refinableFlag: false,
        preventRequalifyingFlag: false, prorateAcrossEligibleItemsFlag: false,
        exclusivity: 'class', nameLocales: ['x-default'],
        discountFamily: 'simple', simpleDiscountType: 'percentage',
        discountEntryTemplates: null, qualifyingProducts: null, discountedProducts: null,
        disableGlobalExcludedProducts: null, maxApplications: null, frozenCustomAttributes: [],
      },
      editableFields: {
        promotionId: 'TEST_PROMO',
        names: [{ xmlLang: 'x-default', value: 'Test Promo' }],
        simpleDiscountValue: 25, discountEntries: null, editableCustomAttributes: [],
      },
    }],
    assignmentSlots: [{
      slotIndex: 0,
      frozenStructure: {
        qualifiers: { matchMode: 'any', hasCustomerGroups: false, hasSourceCodes: false, hasCoupons: false },
        customerGroups: null, rank: 10, hasStartDate: false, hasEndDate: true,
      },
      editableFields: {
        promotionId: 'TEST_PROMO', campaignId: '2025_SUMMER_SAS',
        couponIds: null, startDate: null, endDate: '2025-07-08T04:00:00.000Z',
      },
    }],
  };
}

// ─── buildFieldValidationMetadata ────────────────────────────────────────────

describe('buildFieldValidationMetadata — basic', () => {
  test('returns null for unknown fieldId', () => {
    expect(buildFieldValidationMetadata('unknownField_xyz')).toBeNull();
  });

  test('returns FieldValidationMetadata for known fieldId', () => {
    const meta = buildFieldValidationMetadata('campaignId');
    expect(meta).not.toBeNull();
    expect(meta.fieldId).toBe('campaignId');
  });

  test('metadata has required keys: fieldId, required, type, rules', () => {
    const meta = buildFieldValidationMetadata('campaignId');
    expect(meta).toHaveProperty('fieldId');
    expect(meta).toHaveProperty('required');
    expect(meta).toHaveProperty('type');
    expect(meta).toHaveProperty('rules');
  });

  test('rules is an array', () => {
    const meta = buildFieldValidationMetadata('campaignId');
    expect(Array.isArray(meta.rules)).toBe(true);
  });

  test('required fields have a required rule', () => {
    const meta = buildFieldValidationMetadata('campaignId');
    const reqRule = meta.rules.find(r => r.rule === 'required');
    expect(reqRule).toBeDefined();
    expect(reqRule.message).toBeTruthy();
  });

  test('non-required fields do NOT have a required rule', () => {
    const meta = buildFieldValidationMetadata('startDate');
    const reqRule = meta.rules.find(r => r.rule === 'required');
    expect(reqRule).toBeUndefined();
  });
});

// ─── buildFieldValidationMetadata — string fields ────────────────────────────

describe('buildFieldValidationMetadata — string fields', () => {
  test('campaignId has minLength rule', () => {
    const meta = buildFieldValidationMetadata('campaignId');
    const rule = meta.rules.find(r => r.rule === 'minLength');
    expect(rule).toBeDefined();
    expect(rule.value).toBe(1);
  });

  test('campaignId has maxLength rule', () => {
    const meta = buildFieldValidationMetadata('campaignId');
    const rule = meta.rules.find(r => r.rule === 'maxLength');
    expect(rule).toBeDefined();
    expect(rule.value).toBe(256);
  });

  test('campaignId has pattern rule', () => {
    const meta = buildFieldValidationMetadata('campaignId');
    const rule = meta.rules.find(r => r.rule === 'pattern');
    expect(rule).toBeDefined();
    expect(typeof rule.value).toBe('string');
  });

  test('name has minLength and maxLength but no pattern', () => {
    const meta = buildFieldValidationMetadata('name');
    expect(meta.rules.find(r => r.rule === 'minLength')).toBeDefined();
    expect(meta.rules.find(r => r.rule === 'maxLength')).toBeDefined();
    expect(meta.rules.find(r => r.rule === 'pattern')).toBeUndefined();
  });

  test('storefront message fields have minLength and maxLength', () => {
    ['storefront_msg_cart_inclusion', 'storefront_msg_cart_exclusion'].forEach(id => {
      const meta = buildFieldValidationMetadata(id);
      expect(meta.rules.find(r => r.rule === 'minLength')).toBeDefined();
      expect(meta.rules.find(r => r.rule === 'maxLength')).toBeDefined();
    });
  });
});

// ─── buildFieldValidationMetadata — numeric fields ───────────────────────────

describe('buildFieldValidationMetadata — numeric fields', () => {
  test('simpleDiscountValue has min rule', () => {
    const meta = buildFieldValidationMetadata('simpleDiscountValue');
    const rule = meta.rules.find(r => r.rule === 'min');
    expect(rule).toBeDefined();
    expect(rule.value).toBe(0.01);
  });

  test('simpleDiscountValue has max rule', () => {
    const meta = buildFieldValidationMetadata('simpleDiscountValue');
    const rule = meta.rules.find(r => r.rule === 'max');
    expect(rule).toBeDefined();
  });
});

// ─── buildFieldValidationMetadata — ISO-8601 fields ──────────────────────────

describe('buildFieldValidationMetadata — iso8601 fields', () => {
  test('startDate has iso8601 rule', () => {
    const meta = buildFieldValidationMetadata('startDate');
    const rule = meta.rules.find(r => r.rule === 'iso8601');
    expect(rule).toBeDefined();
    expect(rule.message).toContain('ISO-8601');
  });

  test('endDate has iso8601 rule', () => {
    const meta = buildFieldValidationMetadata('endDate');
    expect(meta.rules.find(r => r.rule === 'iso8601')).toBeDefined();
  });
});

// ─── buildFieldValidationMetadata — array fields ─────────────────────────────

describe('buildFieldValidationMetadata — array fields', () => {
  test('couponIds has minItems rule', () => {
    const meta = buildFieldValidationMetadata('couponIds');
    const rule = meta.rules.find(r => r.rule === 'minItems');
    expect(rule).toBeDefined();
    expect(rule.value).toBe(1);
  });

  test('couponIds has itemMinLength rule', () => {
    const meta = buildFieldValidationMetadata('couponIds');
    expect(meta.rules.find(r => r.rule === 'itemMinLength')).toBeDefined();
  });

  test('discountEntries has minItems rule', () => {
    const meta = buildFieldValidationMetadata('discountEntries');
    expect(meta.rules.find(r => r.rule === 'minItems')).toBeDefined();
  });

  test('discountEntries has itemThresholdMin rule', () => {
    const meta = buildFieldValidationMetadata('discountEntries');
    const rule = meta.rules.find(r => r.rule === 'itemThresholdMin');
    expect(rule).toBeDefined();
    expect(rule.value).toBe(0.01);
  });

  test('discountEntries has itemDiscountValueMin rule', () => {
    const meta = buildFieldValidationMetadata('discountEntries');
    const rule = meta.rules.find(r => r.rule === 'itemDiscountValueMin');
    expect(rule).toBeDefined();
  });
});

// ─── buildAllValidationMetadata ───────────────────────────────────────────────

describe('buildAllValidationMetadata', () => {
  test('returns non-empty array', () => {
    const all = buildAllValidationMetadata();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  test('every item has fieldId, required, type, rules keys', () => {
    buildAllValidationMetadata().forEach(m => {
      expect(m).toHaveProperty('fieldId');
      expect(m).toHaveProperty('required');
      expect(m).toHaveProperty('type');
      expect(m).toHaveProperty('rules');
    });
  });

  test('only includes editable fields', () => {
    const editableIds = new Set(getEditableFields().map(f => f.fieldId));
    buildAllValidationMetadata().forEach(m => {
      expect(editableIds.has(m.fieldId)).toBe(true);
    });
  });

  test('only includes fields with non-null validation', () => {
    buildAllValidationMetadata().forEach(m => {
      const reg = getField(m.fieldId);
      expect(reg.validation).not.toBeNull();
    });
  });

  test('includes campaignId, promotionId, name, couponIds', () => {
    const ids = buildAllValidationMetadata().map(m => m.fieldId);
    expect(ids).toContain('campaignId');
    expect(ids).toContain('promotionId');
    expect(ids).toContain('name');
    expect(ids).toContain('couponIds');
  });

  test('does NOT include frozen-only fields (rank, exclusivity)', () => {
    const ids = buildAllValidationMetadata().map(m => m.fieldId);
    expect(ids).not.toContain('rank');
    expect(ids).not.toContain('exclusivity');
  });
});

// ─── buildValidationMetadataFromClassified ────────────────────────────────────

describe('buildValidationMetadataFromClassified', () => {
  let classifiedResult;
  beforeAll(() => {
    classifiedResult = classifyEditableFields(makeBlueprint());
  });

  test('throws for non-array input', () => {
    expect(() => buildValidationMetadataFromClassified(null)).toThrow('classifiedFields');
    expect(() => buildValidationMetadataFromClassified('string')).toThrow('classifiedFields');
  });

  test('returns an array', () => {
    const meta = buildValidationMetadataFromClassified(classifiedResult.orderedQuestions);
    expect(Array.isArray(meta)).toBe(true);
  });

  test('every item has fieldId, path, required, type, rules', () => {
    const meta = buildValidationMetadataFromClassified(classifiedResult.orderedQuestions);
    meta.forEach(m => {
      expect(m).toHaveProperty('fieldId');
      expect(m).toHaveProperty('path');
      expect(m).toHaveProperty('required');
      expect(m).toHaveProperty('type');
      expect(m).toHaveProperty('rules');
    });
  });

  test('only includes editable fields', () => {
    const meta = buildValidationMetadataFromClassified(classifiedResult.orderedQuestions);
    meta.forEach(m => {
      const reg = getField(m.fieldId);
      expect(reg.editable).toBe(true);
    });
  });

  test('includes campaignId metadata with rules', () => {
    const meta = buildValidationMetadataFromClassified(classifiedResult.orderedQuestions);
    const campaignMeta = meta.find(m => m.fieldId === 'campaignId');
    expect(campaignMeta).toBeDefined();
    expect(campaignMeta.rules.length).toBeGreaterThan(0);
  });

  test('path field corresponds to blueprint path from classification', () => {
    const meta = buildValidationMetadataFromClassified(classifiedResult.orderedQuestions);
    const campaignMeta = meta.find(m => m.fieldId === 'campaignId');
    expect(campaignMeta.path).toContain('campaignSlot');
  });
});

// ─── Rule messages ────────────────────────────────────────────────────────────

describe('buildFieldValidationMetadata — rule messages', () => {
  test('every rule has a non-empty message string', () => {
    buildAllValidationMetadata().forEach(m => {
      m.rules.forEach(r => {
        expect(typeof r.message).toBe('string');
        expect(r.message.length).toBeGreaterThan(0);
      });
    });
  });

  test('required rule message contains the field label', () => {
    const meta = buildFieldValidationMetadata('campaignId');
    const reqRule = meta.rules.find(r => r.rule === 'required');
    const label = getField('campaignId').label;
    expect(reqRule.message).toContain(label);
  });
});

// ─── _internals.deriveRules ───────────────────────────────────────────────────

describe('_internals.deriveRules', () => {
  function makeEntry(overrides = {}) {
    return {
      fieldId: 'testField', required: false, label: 'Test Field',
      validation: null, type: 'string',
      ...overrides,
    };
  }

  test('empty spec with required:false → empty rules array', () => {
    const rules = deriveRules(makeEntry(), null);
    expect(rules).toHaveLength(0);
  });

  test('required:true adds required rule', () => {
    const rules = deriveRules(makeEntry({ required: true }), null);
    expect(rules.find(r => r.rule === 'required')).toBeDefined();
  });

  test('minLength spec adds minLength rule', () => {
    const rules = deriveRules(makeEntry(), { minLength: 2 });
    const r = rules.find(r => r.rule === 'minLength');
    expect(r).toBeDefined();
    expect(r.value).toBe(2);
  });

  test('maxLength spec adds maxLength rule', () => {
    const rules = deriveRules(makeEntry(), { maxLength: 100 });
    const r = rules.find(r => r.rule === 'maxLength');
    expect(r).toBeDefined();
    expect(r.value).toBe(100);
  });

  test('pattern spec adds pattern rule', () => {
    const rules = deriveRules(makeEntry(), { pattern: '^[A-Z]+$' });
    const r = rules.find(r => r.rule === 'pattern');
    expect(r).toBeDefined();
    expect(r.value).toBe('^[A-Z]+$');
  });

  test('min spec adds min rule with correct value', () => {
    const rules = deriveRules(makeEntry({ type: 'number' }), { min: 5 });
    const r = rules.find(r => r.rule === 'min');
    expect(r).toBeDefined();
    expect(r.value).toBe(5);
  });

  test('max spec adds max rule', () => {
    const rules = deriveRules(makeEntry({ type: 'number' }), { max: 100 });
    expect(rules.find(r => r.rule === 'max')).toBeDefined();
  });

  test('type:integer adds integer rule', () => {
    const rules = deriveRules(makeEntry({ type: 'number' }), { type: 'integer' });
    expect(rules.find(r => r.rule === 'integer')).toBeDefined();
  });

  test('format:iso8601 adds iso8601 rule', () => {
    const rules = deriveRules(makeEntry({ type: 'iso8601' }), { format: 'iso8601' });
    expect(rules.find(r => r.rule === 'iso8601')).toBeDefined();
  });

  test('enum spec adds enum rule with value array', () => {
    const rules = deriveRules(makeEntry({ type: 'enum' }), { enum: ['a', 'b'] });
    const r = rules.find(r => r.rule === 'enum');
    expect(r).toBeDefined();
    expect(r.value).toEqual(['a', 'b']);
  });

  test('array spec with minItems adds minItems rule', () => {
    const rules = deriveRules(makeEntry({ type: 'stringArray' }), { type: 'array', minItems: 1 });
    expect(rules.find(r => r.rule === 'minItems')).toBeDefined();
  });

  test('array spec with items.minLength adds itemMinLength rule', () => {
    const rules = deriveRules(makeEntry({ type: 'stringArray' }), { type: 'array', minItems: 1, items: { type: 'string', minLength: 1, maxLength: 256 } });
    expect(rules.find(r => r.rule === 'itemMinLength')).toBeDefined();
    expect(rules.find(r => r.rule === 'itemMaxLength')).toBeDefined();
  });

  test('multiple rules combined: required + minLength + maxLength', () => {
    const rules = deriveRules(
      makeEntry({ required: true }),
      { minLength: 1, maxLength: 256 }
    );
    expect(rules.find(r => r.rule === 'required')).toBeDefined();
    expect(rules.find(r => r.rule === 'minLength')).toBeDefined();
    expect(rules.find(r => r.rule === 'maxLength')).toBeDefined();
  });
});

// ─── Summer_SAS.xml full metadata ────────────────────────────────────────────

describe('buildValidationMetadata — Summer_SAS.xml full metadata', () => {
  let blueprint;
  let meta;

  beforeAll(() => {
    blueprint = extractSASBlueprint(FIXTURE_XML, {
      blueprintId: 'vm-sas', sourceExport: 'Summer_SAS.xml', extractedAt: '2025-01-01T00:00:00.000Z',
    });
    const classified = classifyEditableFields(blueprint);
    meta = buildValidationMetadataFromClassified(classified.orderedQuestions);
  });

  test('produces non-empty metadata list', () => {
    expect(meta.length).toBeGreaterThan(0);
  });

  test('every metadata item has non-empty rules', () => {
    meta.forEach(m => {
      expect(m.rules.length).toBeGreaterThan(0);
    });
  });

  test('campaignId metadata has required rule', () => {
    const m = meta.find(m => m.fieldId === 'campaignId');
    expect(m).toBeDefined();
    expect(m.rules.find(r => r.rule === 'required')).toBeDefined();
  });
});
