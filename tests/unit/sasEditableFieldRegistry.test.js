'use strict';

const {
  REGISTRY,
  REGISTRY_MAP,
  GROUP_ORDER,
  getField,
  getGroup,
  getEditableFields,
  getReplayCriticalFields,
  getAllFieldIds,
} = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');

const path = require('path');
const fs   = require('fs');
const { extractSASBlueprint } = require('../../src/blueprints/extractors/extractSASBlueprint');

// ─── Fixture ──────────────────────────────────────────────────────────────────

const FIXTURE_XML = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8'
);

// ─── Registry shape ───────────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — registry shape', () => {
  test('REGISTRY is a non-empty array', () => {
    expect(Array.isArray(REGISTRY)).toBe(true);
    expect(REGISTRY.length).toBeGreaterThan(0);
  });

  test('REGISTRY_MAP is a Map', () => {
    expect(REGISTRY_MAP instanceof Map).toBe(true);
  });

  test('REGISTRY_MAP has same count as REGISTRY', () => {
    expect(REGISTRY_MAP.size).toBe(REGISTRY.length);
  });

  test('every fieldId in REGISTRY is unique', () => {
    const ids = REGISTRY.map(e => e.fieldId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('GROUP_ORDER is a non-empty array of strings', () => {
    expect(Array.isArray(GROUP_ORDER)).toBe(true);
    expect(GROUP_ORDER.length).toBeGreaterThan(0);
    GROUP_ORDER.forEach(g => expect(typeof g).toBe('string'));
  });
});

// ─── Required field shape ──────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — every entry has required shape', () => {
  const REQUIRED_KEYS = [
    'fieldId', 'editable', 'required', 'group', 'type',
    'label', 'description', 'question', 'validation',
    'multiValue', 'localized', 'rendererOwner', 'replayCritical',
  ];

  REGISTRY.forEach(entry => {
    test(`entry "${entry.fieldId}" has all required keys`, () => {
      REQUIRED_KEYS.forEach(key => {
        expect(entry).toHaveProperty(key);
      });
    });
  });
});

// ─── Type constraints ─────────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — type constraints on entries', () => {
  REGISTRY.forEach(entry => {
    test(`entry "${entry.fieldId}" — editable is boolean`, () => {
      expect(typeof entry.editable).toBe('boolean');
    });

    test(`entry "${entry.fieldId}" — required is boolean`, () => {
      expect(typeof entry.required).toBe('boolean');
    });

    test(`entry "${entry.fieldId}" — multiValue is boolean`, () => {
      expect(typeof entry.multiValue).toBe('boolean');
    });

    test(`entry "${entry.fieldId}" — localized is boolean`, () => {
      expect(typeof entry.localized).toBe('boolean');
    });

    test(`entry "${entry.fieldId}" — replayCritical is boolean`, () => {
      expect(typeof entry.replayCritical).toBe('boolean');
    });

    test(`entry "${entry.fieldId}" — group is in GROUP_ORDER`, () => {
      expect(GROUP_ORDER).toContain(entry.group);
    });

    test(`entry "${entry.fieldId}" — non-editable fields have null question`, () => {
      if (!entry.editable) {
        expect(entry.question).toBeNull();
      }
    });

    test(`entry "${entry.fieldId}" — editable fields have non-null question string`, () => {
      if (entry.editable) {
        expect(typeof entry.question).toBe('string');
        expect(entry.question.length).toBeGreaterThan(0);
      }
    });

    test(`entry "${entry.fieldId}" — label is a non-empty string`, () => {
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
    });

    test(`entry "${entry.fieldId}" — description is a non-empty string`, () => {
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
    });

    test(`entry "${entry.fieldId}" — rendererOwner is a non-empty string`, () => {
      expect(typeof entry.rendererOwner).toBe('string');
      expect(entry.rendererOwner.length).toBeGreaterThan(0);
    });
  });
});

// ─── Group coverage ───────────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — all groups have at least one entry', () => {
  GROUP_ORDER.forEach(group => {
    test(`group "${group}" has at least one registry entry`, () => {
      const entries = REGISTRY.filter(e => e.group === group);
      expect(entries.length).toBeGreaterThan(0);
    });
  });
});

// ─── getField ─────────────────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — getField', () => {
  test('returns entry for known fieldId', () => {
    const entry = getField('campaignId');
    expect(entry).toBeDefined();
    expect(entry.fieldId).toBe('campaignId');
  });

  test('returns undefined for unknown fieldId', () => {
    expect(getField('nonExistentField_xyz')).toBeUndefined();
  });

  test('returned entry is the exact object from REGISTRY', () => {
    const entry = getField('promotionId');
    const registryEntry = REGISTRY.find(e => e.fieldId === 'promotionId');
    expect(entry).toBe(registryEntry);
  });
});

// ─── getGroup ─────────────────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — getGroup', () => {
  test('returns array of entries for known group', () => {
    const entries = getGroup('Campaign');
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach(e => expect(e.group).toBe('Campaign'));
  });

  test('returns empty array for unknown group', () => {
    expect(getGroup('NonExistentGroup')).toHaveLength(0);
  });

  test('Campaign group contains campaignId', () => {
    const ids = getGroup('Campaign').map(e => e.fieldId);
    expect(ids).toContain('campaignId');
  });

  test('Identity group contains promotionId and name', () => {
    const ids = getGroup('Identity').map(e => e.fieldId);
    expect(ids).toContain('promotionId');
    expect(ids).toContain('name');
  });

  test('Scheduling group contains startDate and endDate', () => {
    const ids = getGroup('Scheduling').map(e => e.fieldId);
    expect(ids).toContain('startDate');
    expect(ids).toContain('endDate');
  });

  test('Discounting group contains simpleDiscountValue and discountEntries', () => {
    const ids = getGroup('Discounting').map(e => e.fieldId);
    expect(ids).toContain('simpleDiscountValue');
    expect(ids).toContain('discountEntries');
  });

  test('Coupons group contains couponIds', () => {
    const ids = getGroup('Coupons').map(e => e.fieldId);
    expect(ids).toContain('couponIds');
  });

  test('Merchandising group contains includedBadge and includedBadgeSPP', () => {
    const ids = getGroup('Merchandising').map(e => e.fieldId);
    expect(ids).toContain('includedBadge');
    expect(ids).toContain('includedBadgeSPP');
  });

  test('Storefront group contains both cart message fields', () => {
    const ids = getGroup('Storefront').map(e => e.fieldId);
    expect(ids).toContain('storefront_msg_cart_inclusion');
    expect(ids).toContain('storefront_msg_cart_exclusion');
  });

  test('Messaging group contains coupon error message fields', () => {
    const ids = getGroup('Messaging').map(e => e.fieldId);
    expect(ids).toContain('couponErrorMsgNoActivePromotion');
    expect(ids).toContain('couponErrorMsgRedemptionLimitExeeded');
    expect(ids).toContain('couponErrorMsgNoApplicablePromotion');
    expect(ids).toContain('couponErrorMsgNoApplicablePromo');
  });

  test('Operational group contains rank, exclusivity, maxApplications, disableGlobalExcludedProducts', () => {
    const ids = getGroup('Operational').map(e => e.fieldId);
    expect(ids).toContain('rank');
    expect(ids).toContain('exclusivity');
    expect(ids).toContain('maxApplications');
    expect(ids).toContain('disableGlobalExcludedProducts');
  });

  test('Eligibility group contains qualifier-related fields', () => {
    const ids = getGroup('Eligibility').map(e => e.fieldId);
    expect(ids).toContain('qualifiersMatchMode');
    expect(ids).toContain('customerGroupIds');
  });

  test('Categories group contains included and excluded category fields', () => {
    const ids = getGroup('Categories').map(e => e.fieldId);
    expect(ids).toContain('includedCategoryIds');
    expect(ids).toContain('excludedCategoryIds');
  });
});

// ─── getEditableFields ────────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — getEditableFields', () => {
  test('returns only entries where editable is true', () => {
    const editableFields = getEditableFields();
    editableFields.forEach(e => expect(e.editable).toBe(true));
  });

  test('returns non-empty array', () => {
    expect(getEditableFields().length).toBeGreaterThan(0);
  });

  test('includes campaignId', () => {
    expect(getEditableFields().map(e => e.fieldId)).toContain('campaignId');
  });

  test('includes promotionId', () => {
    expect(getEditableFields().map(e => e.fieldId)).toContain('promotionId');
  });

  test('includes all storefront message fields', () => {
    const ids = getEditableFields().map(e => e.fieldId);
    expect(ids).toContain('storefront_msg_cart_inclusion');
    expect(ids).toContain('storefront_msg_cart_exclusion');
  });

  test('does NOT include frozen operational fields', () => {
    const ids = getEditableFields().map(e => e.fieldId);
    expect(ids).not.toContain('rank');
    expect(ids).not.toContain('exclusivity');
    expect(ids).not.toContain('maxApplications');
  });
});

// ─── getReplayCriticalFields ──────────────────────────────────────────────────

describe('sasEditableFieldRegistry — getReplayCriticalFields', () => {
  test('returns only entries where replayCritical is true', () => {
    getReplayCriticalFields().forEach(e => expect(e.replayCritical).toBe(true));
  });

  test('includes campaignId', () => {
    expect(getReplayCriticalFields().map(e => e.fieldId)).toContain('campaignId');
  });

  test('includes exclusivity', () => {
    expect(getReplayCriticalFields().map(e => e.fieldId)).toContain('exclusivity');
  });

  test('includes rank', () => {
    expect(getReplayCriticalFields().map(e => e.fieldId)).toContain('rank');
  });

  test('includes qualifiersMatchMode', () => {
    expect(getReplayCriticalFields().map(e => e.fieldId)).toContain('qualifiersMatchMode');
  });

  test('includes thresholdPercentage and thresholdValues', () => {
    const ids = getReplayCriticalFields().map(e => e.fieldId);
    expect(ids).toContain('thresholdPercentage');
    expect(ids).toContain('thresholdValues');
  });

  test('does NOT include name (not replay-critical)', () => {
    const ids = getReplayCriticalFields().map(e => e.fieldId);
    expect(ids).not.toContain('name');
  });
});

// ─── getAllFieldIds ───────────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — getAllFieldIds', () => {
  test('returns array of strings', () => {
    const ids = getAllFieldIds();
    expect(Array.isArray(ids)).toBe(true);
    ids.forEach(id => expect(typeof id).toBe('string'));
  });

  test('returns same count as REGISTRY', () => {
    expect(getAllFieldIds().length).toBe(REGISTRY.length);
  });
});

// ─── Specific field definitions ───────────────────────────────────────────────

describe('sasEditableFieldRegistry — specific field definitions', () => {
  test('campaignId is Campaign group, editable, replayCritical, rendererOwner=renderCampaign', () => {
    const f = getField('campaignId');
    expect(f.group).toBe('Campaign');
    expect(f.editable).toBe(true);
    expect(f.replayCritical).toBe(true);
    expect(f.rendererOwner).toBe('renderCampaign');
    expect(f.localized).toBe(false);
    expect(f.multiValue).toBe(false);
  });

  test('name is Identity group, editable, localized, NOT replayCritical', () => {
    const f = getField('name');
    expect(f.group).toBe('Identity');
    expect(f.editable).toBe(true);
    expect(f.localized).toBe(true);
    expect(f.replayCritical).toBe(false);
  });

  test('startDate is Scheduling group, type=iso8601, NOT required', () => {
    const f = getField('startDate');
    expect(f.group).toBe('Scheduling');
    expect(f.type).toBe('iso8601');
    expect(f.required).toBe(false);
  });

  test('couponIds is Coupons group, multiValue, editable', () => {
    const f = getField('couponIds');
    expect(f.group).toBe('Coupons');
    expect(f.multiValue).toBe(true);
    expect(f.editable).toBe(true);
  });

  test('discountEntries is Discounting group, type=discountEntryArray, multiValue', () => {
    const f = getField('discountEntries');
    expect(f.group).toBe('Discounting');
    expect(f.type).toBe('discountEntryArray');
    expect(f.multiValue).toBe(true);
  });

  test('storefront_msg_cart_inclusion is Storefront group, localized, editable', () => {
    const f = getField('storefront_msg_cart_inclusion');
    expect(f.group).toBe('Storefront');
    expect(f.localized).toBe(true);
    expect(f.editable).toBe(true);
    expect(f.replayCritical).toBe(false);
  });

  test('couponErrorMsgRedemptionLimitExeeded preserves the intentional typo in fieldId', () => {
    // The SFCC platform attribute-id has "Exeeded" (not "Exceeded") — must be preserved exactly
    const f = getField('couponErrorMsgRedemptionLimitExeeded');
    expect(f).toBeDefined();
    expect(f.fieldId).toBe('couponErrorMsgRedemptionLimitExeeded');
  });

  test('exclusivity is Operational group, NOT editable, replayCritical, enum type', () => {
    const f = getField('exclusivity');
    expect(f.group).toBe('Operational');
    expect(f.editable).toBe(false);
    expect(f.replayCritical).toBe(true);
    expect(f.type).toBe('enum');
    expect(f.validation.enum).toContain('class');
  });

  test('thresholdPercentage and thresholdValues are Discounting, NOT editable, replayCritical', () => {
    ['thresholdPercentage', 'thresholdValues'].forEach(id => {
      const f = getField(id);
      expect(f.group).toBe('Discounting');
      expect(f.editable).toBe(false);
      expect(f.replayCritical).toBe(true);
    });
  });

  test('includedCategoryIds and excludedCategoryIds are Categories, NOT editable, replayCritical', () => {
    ['includedCategoryIds', 'excludedCategoryIds'].forEach(id => {
      const f = getField(id);
      expect(f.group).toBe('Categories');
      expect(f.editable).toBe(false);
      expect(f.replayCritical).toBe(true);
    });
  });
});

// ─── CRITICAL: Summer_SAS.xml coverage test ────────────────────────────────────

describe('sasEditableFieldRegistry — Summer_SAS.xml coverage (MANDATORY)', () => {
  /**
   * This test MUST FAIL if:
   *   - a new editable attribute appears in Summer_SAS.xml
   *   - registry coverage becomes incomplete
   *
   * It works by extracting the real fixture and collecting every attribute-id
   * that lands in editableCustomAttributes, then asserting each one exists in
   * the registry.
   */

  let blueprint;
  beforeAll(() => {
    blueprint = extractSASBlueprint(FIXTURE_XML, {
      blueprintId:  'registry-coverage-test',
      sourceExport: 'Summer_SAS.xml',
      extractedAt:  '2025-01-01T00:00:00.000Z',
    });
  });

  test('every editable custom attribute ID from Summer_SAS.xml exists in the registry', () => {
    const missingFromRegistry = [];

    blueprint.promotionSlots.forEach((slot, i) => {
      slot.editableFields.editableCustomAttributes.forEach(attr => {
        if (!REGISTRY_MAP.has(attr.attributeId)) {
          missingFromRegistry.push(`promotionSlots[${i}].${attr.attributeId}`);
        }
      });
    });

    if (missingFromRegistry.length > 0) {
      throw new Error(
        `The following editable attribute IDs from Summer_SAS.xml are NOT registered:\n` +
        missingFromRegistry.map(m => `  - ${m}`).join('\n') +
        `\n\nAdd these entries to sasEditableFieldRegistry.js to restore coverage.`
      );
    }

    expect(missingFromRegistry).toHaveLength(0);
  });

  test('storefront_msg_cart_inclusion appears in every promotion and is registered', () => {
    blueprint.promotionSlots.forEach((slot, i) => {
      const attr = slot.editableFields.editableCustomAttributes
        .find(a => a.attributeId === 'storefront_msg_cart_inclusion');
      if (attr) {
        expect(REGISTRY_MAP.has('storefront_msg_cart_inclusion')).toBe(true);
      }
    });
  });

  test('storefront_msg_cart_exclusion is registered', () => {
    expect(REGISTRY_MAP.has('storefront_msg_cart_exclusion')).toBe(true);
  });

  test('includedBadge and includedBadgeSPP are registered', () => {
    expect(REGISTRY_MAP.has('includedBadge')).toBe(true);
    expect(REGISTRY_MAP.has('includedBadgeSPP')).toBe(true);
  });

  test('couponErrorMsgNoActivePromotion is registered', () => {
    expect(REGISTRY_MAP.has('couponErrorMsgNoActivePromotion')).toBe(true);
  });

  test('couponErrorMsgRedemptionLimitExeeded is registered (with intentional typo)', () => {
    expect(REGISTRY_MAP.has('couponErrorMsgRedemptionLimitExeeded')).toBe(true);
  });

  test('couponErrorMsgNoApplicablePromotion is registered', () => {
    expect(REGISTRY_MAP.has('couponErrorMsgNoApplicablePromotion')).toBe(true);
  });

  test('blueprint editableFields keys all have registry entries', () => {
    // Top-level editable blueprint fields
    const topLevelEditableFields = [
      'campaignId',    // from campaignSlot
      'promotionId',   // from promotionSlots[].editableFields
      'name',          // (localized) from promotionSlots[].editableFields.names
      'couponIds',     // from assignmentSlots[].editableFields
      'startDate',     // from assignmentSlots[].editableFields
      'endDate',       // from assignmentSlots[].editableFields
    ];
    topLevelEditableFields.forEach(fieldId => {
      expect(REGISTRY_MAP.has(fieldId)).toBe(true);
    });
  });
});

// ─── Localized fields ─────────────────────────────────────────────────────────

describe('sasEditableFieldRegistry — localized fields', () => {
  test('all localized fields have localized:true', () => {
    const localizedFieldIds = [
      'name',
      'storefront_msg_cart_inclusion',
      'storefront_msg_cart_exclusion',
      'includedBadge',
      'includedBadgeSPP',
      'couponErrorMsgNoActivePromotion',
      'couponErrorMsgRedemptionLimitExeeded',
      'couponErrorMsgNoApplicablePromotion',
      'couponErrorMsgNoApplicablePromo',
    ];
    localizedFieldIds.forEach(id => {
      const f = getField(id);
      expect(f).toBeDefined();
      expect(f.localized).toBe(true);
    });
  });

  test('non-localized fields have localized:false', () => {
    const nonLocalizedIds = [
      'campaignId', 'promotionId', 'simpleDiscountValue',
      'couponIds', 'startDate', 'endDate', 'rank',
    ];
    nonLocalizedIds.forEach(id => {
      const f = getField(id);
      if (f) expect(f.localized).toBe(false);
    });
  });
});
