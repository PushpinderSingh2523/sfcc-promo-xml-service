'use strict';

const {
  validateBlueprintCompatibility,
  _internals,
} = require('../../src/blueprints/validators/validateBlueprintCompatibility');

const { arrayDiff, deepDiff } = _internals;

// ─── Fixture builders ─────────────────────────────────────────────────────────

/**
 * Build a minimal valid promotion slot for testing.
 * Override any field via the `overrides` argument.
 *
 * @param {number} index
 * @param {object} overrides - applied shallowly to the top-level slot
 * @param {object} frozenOverrides - applied shallowly to frozenStructure
 * @param {object} editableOverrides - applied shallowly to editableFields
 */
function makePromotionSlot(index = 0, frozenOverrides = {}, editableOverrides = {}) {
  return {
    slotIndex: index,
    frozenStructure: {
      enabledFlag:                    true,
      archivedFlag:                   false,
      searchableFlag:                 false,
      refinableFlag:                  false,
      preventRequalifyingFlag:        false,
      prorateAcrossEligibleItemsFlag: false,
      exclusivity:                    'class',
      nameLocales:                    ['x-default'],
      discountFamily:                 'simple',
      simpleDiscountType:             'percentage',
      discountEntryTemplates:         null,
      qualifyingProducts:             null,
      discountedProducts: {
        includedProducts: {
          conditionGroups: [{
            condition: {
              type: 'category',
              catalogId: 'siteCatalog_ToryUS',
              operator: 'is equal',
              categoryIds: ['sale-view-all'],
            },
          }],
        },
        excludedProducts: null,
      },
      disableGlobalExcludedProducts: null,
      maxApplications:               null,
      frozenCustomAttributes: [
        { attributeId: 'gwp', xmlLang: null, valueType: 'text', value: 'false' },
      ],
      ...frozenOverrides,
    },
    editableFields: {
      promotionId:              'PROMO-2025',
      names:                    [{ xmlLang: 'x-default', value: 'Test Promo' }],
      simpleDiscountValue:      25,
      discountEntries:          null,
      editableCustomAttributes: [
        { attributeId: 'storefront_msg_cart_inclusion', xmlLang: 'x-default', valueType: 'text', value: '25% Off' },
      ],
      ...editableOverrides,
    },
  };
}

/**
 * Build a minimal valid assignment slot for testing.
 */
function makeAssignmentSlot(index = 0, frozenOverrides = {}, editableOverrides = {}) {
  return {
    slotIndex: index,
    frozenStructure: {
      qualifiers: {
        matchMode:         'any',
        hasCustomerGroups: true,
        hasSourceCodes:    true,
        hasCoupons:        true,
      },
      customerGroups: null,
      rank:          10,
      hasStartDate:  false,
      hasEndDate:    true,
      ...frozenOverrides,
    },
    editableFields: {
      promotionId: 'PROMO-2025',
      campaignId:  'CAMP-2025',
      couponIds:   ['COUPON-2025'],
      startDate:   null,
      endDate:     '2025-07-08T04:00:00.000Z',
      ...editableOverrides,
    },
  };
}

/**
 * Build a minimal valid blueprint for testing.
 */
function makeBlueprint({
  promotionSlots  = [makePromotionSlot(0)],
  assignmentSlots = [makeAssignmentSlot(0)],
} = {}) {
  return {
    blueprintId:  'SAS-TEST',
    sourceExport: 'test.xml',
    extractedAt:  '2025-01-01T00:00:00.000Z',
    campaignSlot: {
      frozenStructure: {
        enabledFlag:   true,
        campaignScope: { applicableOnline: true },
      },
      editableFields: { campaignId: 'CAMP-2025' },
    },
    promotionSlots,
    assignmentSlots,
  };
}

// ─── arrayDiff ────────────────────────────────────────────────────────────────

describe('arrayDiff', () => {
  test('returns null for identical arrays', () => {
    expect(arrayDiff(['a', 'b'], ['a', 'b'])).toBeNull();
  });

  test('returns description when lengths differ', () => {
    expect(arrayDiff(['a'], ['a', 'b'])).toMatch(/length/);
  });

  test('returns description when element differs', () => {
    expect(arrayDiff(['a', 'x'], ['a', 'y'])).toMatch(/\[1\]/);
  });

  test('returns null for two non-arrays', () => {
    expect(arrayDiff(undefined, undefined)).toBeNull();
  });
});

// ─── deepDiff ─────────────────────────────────────────────────────────────────

describe('deepDiff', () => {
  test('returns null for identical values', () => {
    expect(deepDiff('x', 'x', 'root')).toBeNull();
    expect(deepDiff({ a: 1 }, { a: 1 }, 'root')).toBeNull();
  });

  test('reports null → present change', () => {
    const diff = deepDiff(null, { a: 1 }, 'field');
    expect(diff).toMatch(/field.*now present/);
  });

  test('reports present → null change', () => {
    const diff = deepDiff({ a: 1 }, null, 'field');
    expect(diff).toMatch(/field.*now null/);
  });

  test('reports nested key change', () => {
    const diff = deepDiff({ a: { b: 'x' } }, { a: { b: 'y' } }, 'root');
    expect(diff).toMatch(/root\.a\.b/);
    expect(diff).toContain('"x"');
    expect(diff).toContain('"y"');
  });

  test('reports array length change', () => {
    const diff = deepDiff([1, 2], [1], 'arr');
    expect(diff).toMatch(/length/);
  });

  test('reports added key', () => {
    const diff = deepDiff({}, { newKey: 'val' }, 'obj');
    expect(diff).toMatch(/newKey.*added/);
  });
});

// ─── validateBlueprintCompatibility — input validation ────────────────────────

describe('validateBlueprintCompatibility — input validation', () => {
  test('throws for null previousBlueprint', () => {
    expect(() => validateBlueprintCompatibility(null, makeBlueprint()))
      .toThrow('previousBlueprint');
  });

  test('throws for null nextBlueprint', () => {
    expect(() => validateBlueprintCompatibility(makeBlueprint(), null))
      .toThrow('nextBlueprint');
  });

  test('throws for non-object previousBlueprint', () => {
    expect(() => validateBlueprintCompatibility('string', makeBlueprint()))
      .toThrow();
  });
});

// ─── validateBlueprintCompatibility — identical blueprints ────────────────────

describe('validateBlueprintCompatibility — identical blueprints', () => {
  test('identical blueprints are compatible with zero changes', () => {
    const blueprint = makeBlueprint();
    const result = validateBlueprintCompatibility(blueprint, blueprint);
    expect(result.compatible).toBe(true);
    expect(result.breakingChanges).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ─── validateBlueprintCompatibility — slot count changes ─────────────────────

describe('validateBlueprintCompatibility — slot count changes', () => {
  test('adding a promotion slot is a breaking change', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0)] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0), makePromotionSlot(1)] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.match(/promotionSlots count.*1.*2/))).toBe(true);
  });

  test('removing a promotion slot is a breaking change', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0), makePromotionSlot(1)] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0)] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.match(/promotionSlots count/))).toBe(true);
  });

  test('adding an assignment slot is a breaking change', () => {
    const prev = makeBlueprint({ assignmentSlots: [makeAssignmentSlot(0)] });
    const next = makeBlueprint({ assignmentSlots: [makeAssignmentSlot(0), makeAssignmentSlot(1)] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.match(/assignmentSlots count/))).toBe(true);
  });
});

// ─── validateBlueprintCompatibility — discount family changes ─────────────────

describe('validateBlueprintCompatibility — discount family changes', () => {
  test('changing discountFamily from simple to product-amount is breaking', () => {
    const prev = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'simple', simpleDiscountType: 'percentage', discountEntryTemplates: null })],
    });
    const next = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'product-amount', simpleDiscountType: null, discountEntryTemplates: [{ discountType: 'amount' }] })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('discountFamily'))).toBe(true);
  });

  test('changing simpleDiscountType from percentage to amount is breaking', () => {
    const prev = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'simple', simpleDiscountType: 'percentage' })],
    });
    const next = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'simple', simpleDiscountType: 'amount' })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('simpleDiscountType'))).toBe(true);
  });

  test('adding a discount tier in product-amount family is breaking', () => {
    const prev = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'product-amount', simpleDiscountType: null, discountEntryTemplates: [{ discountType: 'amount' }] })],
    });
    const next = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'product-amount', simpleDiscountType: null, discountEntryTemplates: [{ discountType: 'amount' }, { discountType: 'amount' }] })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('discountEntryTemplates count'))).toBe(true);
  });

  test('changing discount entry type (percentage → amount) is breaking', () => {
    const prev = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'product-amount', simpleDiscountType: null, discountEntryTemplates: [{ discountType: 'percentage' }] })],
    });
    const next = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'product-amount', simpleDiscountType: null, discountEntryTemplates: [{ discountType: 'amount' }] })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('discountType'))).toBe(true);
  });

  test('same discount family and type is compatible', () => {
    const prev = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'simple', simpleDiscountType: 'percentage' })],
    });
    const next = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, { discountFamily: 'simple', simpleDiscountType: 'percentage' })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(true);
  });
});

// ─── validateBlueprintCompatibility — frozen flag changes ─────────────────────

describe('validateBlueprintCompatibility — frozen flag changes', () => {
  test('enabledFlag change is a breaking change', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { enabledFlag: true })] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { enabledFlag: false })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('enabledFlag'))).toBe(true);
  });

  test('archivedFlag change is a breaking change', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { archivedFlag: false })] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { archivedFlag: true })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('archivedFlag'))).toBe(true);
  });

  test('exclusivity change is a breaking change', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { exclusivity: 'class' })] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { exclusivity: 'global' })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('exclusivity'))).toBe(true);
  });
});

// ─── validateBlueprintCompatibility — product structure changes ───────────────

describe('validateBlueprintCompatibility — product structure changes', () => {
  test('changing a category ID in discountedProducts is a breaking change', () => {
    const prevDp = {
      includedProducts: {
        conditionGroups: [{
          condition: { type: 'category', catalogId: 'siteCatalog_ToryUS', operator: 'is equal', categoryIds: ['sale-view-all'] },
        }],
      },
      excludedProducts: null,
    };
    const nextDp = {
      includedProducts: {
        conditionGroups: [{
          condition: { type: 'category', catalogId: 'siteCatalog_ToryUS', operator: 'is equal', categoryIds: ['NEW-CATEGORY'] },
        }],
      },
      excludedProducts: null,
    };
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { discountedProducts: prevDp })] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { discountedProducts: nextDp })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('discountedProducts'))).toBe(true);
  });

  test('qualifying-products appearing when previously absent is a breaking change', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { qualifyingProducts: null })] });
    const next = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, {
        qualifyingProducts: {
          includedProducts: { conditionGroups: [{ condition: { type: 'price', operator: 'greater than', price: 0.01 } }] },
          excludedProducts: null,
        },
      })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('qualifyingProducts'))).toBe(true);
  });

  test('disableGlobalExcludedProducts change is breaking', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { disableGlobalExcludedProducts: null })] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { disableGlobalExcludedProducts: true })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('disableGlobalExcludedProducts'))).toBe(true);
  });

  test('maxApplications change is breaking', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { maxApplications: 1 })] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { maxApplications: 2 })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('maxApplications'))).toBe(true);
  });
});

// ─── validateBlueprintCompatibility — qualifier changes ───────────────────────

describe('validateBlueprintCompatibility — qualifier changes', () => {
  test('changing qualifier matchMode is breaking', () => {
    const prev = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { qualifiers: { matchMode: 'any', hasCustomerGroups: true, hasSourceCodes: true, hasCoupons: true } })],
    });
    const next = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { qualifiers: { matchMode: 'all', hasCustomerGroups: true, hasSourceCodes: true, hasCoupons: true } })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('qualifiers.matchMode'))).toBe(true);
  });

  test('hasCoupons changing from true to false is breaking', () => {
    const prev = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { qualifiers: { matchMode: 'any', hasCustomerGroups: true, hasSourceCodes: true, hasCoupons: true } })],
    });
    const next = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { qualifiers: { matchMode: 'any', hasCustomerGroups: true, hasSourceCodes: true, hasCoupons: false } })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('qualifiers.hasCoupons'))).toBe(true);
  });

  test('customerGroups block appearing when previously absent is breaking', () => {
    const prev = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { customerGroups: null })],
    });
    const next = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { customerGroups: { matchMode: 'any', groupIds: ['Everyone'] } })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('customerGroups block presence'))).toBe(true);
  });

  test('customerGroups matchMode change is breaking', () => {
    const prev = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { customerGroups: { matchMode: 'any', groupIds: ['Group-A'] } })],
    });
    const next = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { customerGroups: { matchMode: 'all', groupIds: ['Group-A'] } })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('customerGroups.matchMode'))).toBe(true);
  });

  test('customerGroups groupId change is a warning, not breaking', () => {
    const prev = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { customerGroups: { matchMode: 'any', groupIds: ['Old-Group'] } })],
    });
    const next = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { customerGroups: { matchMode: 'any', groupIds: ['New-Group'] } })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(true);
    expect(result.warnings.some(w => w.includes('groupIds'))).toBe(true);
  });
});

// ─── validateBlueprintCompatibility — schedule presence changes ───────────────

describe('validateBlueprintCompatibility — schedule presence changes', () => {
  test('hasStartDate changing from false to true is breaking', () => {
    const prev = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { hasStartDate: false })],
    });
    const next = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { hasStartDate: true })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('hasStartDate'))).toBe(true);
  });

  test('hasEndDate changing is breaking', () => {
    const prev = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { hasEndDate: true })],
    });
    const next = makeBlueprint({
      assignmentSlots: [makeAssignmentSlot(0, { hasEndDate: false })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('hasEndDate'))).toBe(true);
  });
});

// ─── validateBlueprintCompatibility — warnings ────────────────────────────────

describe('validateBlueprintCompatibility — warnings (non-breaking)', () => {
  test('nameLocales change produces a warning, not a breaking change', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { nameLocales: ['x-default'] })] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { nameLocales: ['x-default', 'en'] })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(true);
    expect(result.warnings.some(w => w.includes('nameLocales'))).toBe(true);
    expect(result.breakingChanges).toHaveLength(0);
  });

  test('frozen custom attribute count change produces a warning', () => {
    const prev = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, {
        frozenCustomAttributes: [
          { attributeId: 'gwp', xmlLang: null, valueType: 'text', value: 'false' },
        ],
      })],
    });
    const next = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, {
        frozenCustomAttributes: [
          { attributeId: 'gwp', xmlLang: null, valueType: 'text', value: 'false' },
          { attributeId: 'newFlag', xmlLang: null, valueType: 'text', value: 'false' },
        ],
      })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(true);
    expect(result.warnings.some(w => w.includes('frozenCustomAttributes count'))).toBe(true);
  });

  test('frozen custom attribute value change produces a warning', () => {
    const prev = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, {
        frozenCustomAttributes: [{ attributeId: 'gwp', xmlLang: null, valueType: 'text', value: 'false' }],
      })],
    });
    const next = makeBlueprint({
      promotionSlots: [makePromotionSlot(0, {
        frozenCustomAttributes: [{ attributeId: 'gwp', xmlLang: null, valueType: 'text', value: 'true' }],
      })],
    });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(true);
    expect(result.warnings.some(w => w.includes('gwp'))).toBe(true);
  });

  test('campaign enabledFlag change produces a warning', () => {
    const prev = makeBlueprint();
    const next = {
      ...makeBlueprint(),
      campaignSlot: {
        frozenStructure: { enabledFlag: false, campaignScope: { applicableOnline: true } },
        editableFields: { campaignId: 'CAMP-2025' },
      },
    };
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(true);
    expect(result.warnings.some(w => w.includes('enabledFlag'))).toBe(true);
  });

  test('rank change produces a warning', () => {
    const prev = makeBlueprint({ assignmentSlots: [makeAssignmentSlot(0, { rank: 10 })] });
    const next = makeBlueprint({ assignmentSlots: [makeAssignmentSlot(0, { rank: 20 })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(true);
    expect(result.warnings.some(w => w.includes('rank'))).toBe(true);
  });
});

// ─── validateBlueprintCompatibility — result shape ────────────────────────────

describe('validateBlueprintCompatibility — result shape', () => {
  test('always returns compatible, breakingChanges, and warnings', () => {
    const result = validateBlueprintCompatibility(makeBlueprint(), makeBlueprint());
    expect(result).toHaveProperty('compatible');
    expect(result).toHaveProperty('breakingChanges');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.breakingChanges)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('compatible is false when breakingChanges is non-empty', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0)] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0), makePromotionSlot(1)] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.length).toBeGreaterThan(0);
  });

  test('compatible is true when only warnings are present', () => {
    const prev = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { nameLocales: ['x-default'] })] });
    const next = makeBlueprint({ promotionSlots: [makePromotionSlot(0, { nameLocales: ['x-default', 'en'] })] });
    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('this function does not mutate either blueprint', () => {
    const prev = makeBlueprint();
    const next = makeBlueprint();
    const prevJson = JSON.stringify(prev);
    const nextJson = JSON.stringify(next);
    validateBlueprintCompatibility(prev, next);
    expect(JSON.stringify(prev)).toBe(prevJson);
    expect(JSON.stringify(next)).toBe(nextJson);
  });
});

// ─── validateBlueprintCompatibility — multi-slot scenarios ───────────────────

describe('validateBlueprintCompatibility — multi-slot pairwise comparison', () => {
  test('breaking change in slot[1] is reported with correct context', () => {
    const slot0 = makePromotionSlot(0);
    const prevSlot1 = makePromotionSlot(1, { discountFamily: 'simple', simpleDiscountType: 'percentage' });
    const nextSlot1 = makePromotionSlot(1, { discountFamily: 'product-amount', simpleDiscountType: null, discountEntryTemplates: [{ discountType: 'amount' }] });

    const prev = makeBlueprint({ promotionSlots: [slot0, prevSlot1] });
    const next = makeBlueprint({ promotionSlots: [slot0, nextSlot1] });

    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('promotionSlots[1]'))).toBe(true);
    // slot[0] should be clean
    expect(result.breakingChanges.some(c => c.includes('promotionSlots[0]'))).toBe(false);
  });

  test('breaking change in assignment[1] is reported with correct context', () => {
    const slot0 = makeAssignmentSlot(0);
    const prevSlot1 = makeAssignmentSlot(1, { qualifiers: { matchMode: 'any', hasCustomerGroups: true, hasSourceCodes: true, hasCoupons: true } });
    const nextSlot1 = makeAssignmentSlot(1, { qualifiers: { matchMode: 'all', hasCustomerGroups: true, hasSourceCodes: true, hasCoupons: true } });

    const prev = makeBlueprint({ assignmentSlots: [slot0, prevSlot1] });
    const next = makeBlueprint({ assignmentSlots: [slot0, nextSlot1] });

    const result = validateBlueprintCompatibility(prev, next);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.includes('assignmentSlots[1]'))).toBe(true);
    expect(result.breakingChanges.some(c => c.includes('assignmentSlots[0]'))).toBe(false);
  });
});
