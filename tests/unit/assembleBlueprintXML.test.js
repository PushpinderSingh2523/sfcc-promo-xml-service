'use strict';

const { assembleBlueprintXML, GLOBAL_PROMOTION_SETTINGS } = require('../../src/blueprints/assembleBlueprintXML');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeCampaignSlot(overrides = {}) {
  return {
    frozenStructure: {
      enabledFlag: true,
      campaignScope: { applicableOnline: true },
      ...overrides.frozenStructure,
    },
    editableFields: {
      campaignId: '2025_SUMMER_SAS',
      ...overrides.editableFields,
    },
  };
}

function makePromotionSlot(overrides = {}) {
  return {
    frozenStructure: {
      enabledFlag:                    true,
      archivedFlag:                   false,
      searchableFlag:                 false,
      refinableFlag:                  false,
      preventRequalifyingFlag:        false,
      prorateAcrossEligibleItemsFlag: false,
      exclusivity:                    'no-exclusivity',
      discountFamily:                 'simple',
      simpleDiscountType:             'percentage',
      qualifyingProducts:             null,
      discountedProducts:             null,
      disableGlobalExcludedProducts:  false,
      discountEntryTemplates:         [],
      maxApplications:                null,
      frozenCustomAttributes:         [],
      ...overrides.frozenStructure,
    },
    editableFields: {
      promotionId:             'TEST_PROMO',
      names:                   [{ xmlLang: 'x-default', value: 'Test Promo' }],
      simpleDiscountValue:     25,
      discountEntries:         null,
      editableCustomAttributes: [],
      ...overrides.editableFields,
    },
  };
}

function makeAssignmentSlot(overrides = {}) {
  return {
    frozenStructure: {
      qualifiers: { matchMode: 'any', hasCustomerGroups: false, hasSourceCodes: false, hasCoupons: false },
      rank:         1,
      hasStartDate: false,
      hasEndDate:   false,
      customerGroups: null,
      ...overrides.frozenStructure,
    },
    editableFields: {
      promotionId: 'TEST_PROMO',
      campaignId:  '2025_SUMMER_SAS',
      couponIds:   null,
      startDate:   null,
      endDate:     null,
      ...overrides.editableFields,
    },
  };
}

function makeMinimalBlueprint(opts = {}) {
  return {
    blueprintId:      opts.blueprintId  || 'test-bp',
    sourceExport:     opts.sourceExport || 'test.xml',
    extractedAt:      opts.extractedAt  || '2025-01-01T00:00:00.000Z',
    campaignSlot:     opts.campaignSlot     || makeCampaignSlot(),
    promotionSlots:   opts.promotionSlots   || [makePromotionSlot()],
    assignmentSlots:  opts.assignmentSlots  || [makeAssignmentSlot()],
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('assembleBlueprintXML — input validation', () => {
  test('throws for null blueprint', () => {
    expect(() => assembleBlueprintXML(null)).toThrow('blueprint');
  });

  test('throws for non-object blueprint', () => {
    expect(() => assembleBlueprintXML('string')).toThrow();
  });

  test('throws when campaignSlot is missing', () => {
    const bp = makeMinimalBlueprint();
    delete bp.campaignSlot;
    expect(() => assembleBlueprintXML(bp)).toThrow('campaignSlot');
  });

  test('throws when promotionSlots is missing', () => {
    const bp = makeMinimalBlueprint();
    delete bp.promotionSlots;
    expect(() => assembleBlueprintXML(bp)).toThrow('promotionSlots');
  });

  test('throws when promotionSlots is empty array', () => {
    const bp = makeMinimalBlueprint({ promotionSlots: [] });
    expect(() => assembleBlueprintXML(bp)).toThrow('promotionSlots');
  });

  test('throws when assignmentSlots is missing', () => {
    const bp = makeMinimalBlueprint();
    delete bp.assignmentSlots;
    expect(() => assembleBlueprintXML(bp)).toThrow('assignmentSlots');
  });

  test('throws when assignmentSlots is empty array', () => {
    const bp = makeMinimalBlueprint({ assignmentSlots: [] });
    expect(() => assembleBlueprintXML(bp)).toThrow('assignmentSlots');
  });
});

// ─── XML declaration ──────────────────────────────────────────────────────────

describe('assembleBlueprintXML — XML declaration', () => {
  test('output starts with XML declaration', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  test('XML declaration is on the first line', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    const firstLine = xml.split('\n')[0];
    expect(firstLine).toBe('<?xml version="1.0" encoding="UTF-8"?>');
  });
});

// ─── Root element ─────────────────────────────────────────────────────────────

describe('assembleBlueprintXML — root element', () => {
  const SFCC_NS = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';

  test('output contains opening <promotions> tag', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    expect(xml).toContain('<promotions xmlns=');
  });

  test('root element has correct SFCC namespace', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    expect(xml).toContain(`xmlns="${SFCC_NS}"`);
  });

  test('output ends with closing </promotions> followed by newline', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    expect(xml.endsWith('</promotions>\n')).toBe(true);
  });
});

// ─── Section ordering ─────────────────────────────────────────────────────────

describe('assembleBlueprintXML — section ordering', () => {
  test('XML declaration appears before <promotions>', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    const declPos   = xml.indexOf('<?xml');
    const rootPos   = xml.indexOf('<promotions');
    expect(declPos).toBeLessThan(rootPos);
  });

  test('<campaign> appears before <global-promotion-settings>', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    const campaignPos = xml.indexOf('<campaign ');
    const globalPos   = xml.indexOf('<global-promotion-settings>');
    expect(campaignPos).toBeLessThan(globalPos);
  });

  test('<global-promotion-settings> appears before first <promotion>', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    const globalPos   = xml.indexOf('<global-promotion-settings>');
    const promotionPos = xml.indexOf('<promotion ');
    expect(globalPos).toBeLessThan(promotionPos);
  });

  test('<promotion> appears before <promotion-campaign-assignment>', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    const promotionPos   = xml.indexOf('<promotion ');
    const assignmentPos  = xml.indexOf('<promotion-campaign-assignment');
    expect(promotionPos).toBeLessThan(assignmentPos);
  });

  test('<promotion-campaign-assignment> appears before </promotions>', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    const assignmentPos  = xml.indexOf('<promotion-campaign-assignment');
    const closingPos     = xml.indexOf('</promotions>');
    expect(assignmentPos).toBeLessThan(closingPos);
  });
});

// ─── Section content ──────────────────────────────────────────────────────────

describe('assembleBlueprintXML — section content', () => {
  test('campaign-id from campaignSlot appears in output', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint({
      campaignSlot: makeCampaignSlot({ editableFields: { campaignId: 'MY_CAMPAIGN' } }),
    }));
    expect(xml).toContain('campaign-id="MY_CAMPAIGN"');
  });

  test('promotion-id from promotionSlot appears in output', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint({
      promotionSlots: [makePromotionSlot({ editableFields: { promotionId: 'MY_PROMO', names: [{ xmlLang: 'x-default', value: 'My Promo' }], simpleDiscountValue: 10, discountEntries: null, editableCustomAttributes: [] } })],
    }));
    expect(xml).toContain('promotion-id="MY_PROMO"');
  });

  test('global-promotion-settings block is included verbatim', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    expect(xml).toContain('<global-promotion-settings>');
    expect(xml).toContain('<global-excluded-products>');
    expect(xml).toContain('Exclusions-Always');
    expect(xml).toContain('accessories-seedbox-foundation');
    expect(xml).toContain('accessories-masks');
    expect(xml).toContain('<global-excluded-product-options>');
    expect(xml).toContain('monogramming');
    expect(xml).toContain('</global-promotion-settings>');
  });

  test('promotion-campaign-assignment promotion-id appears in output', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint({
      assignmentSlots: [makeAssignmentSlot({ editableFields: { promotionId: 'MY_PROMO', campaignId: '2025_SUMMER_SAS', couponIds: null, startDate: null, endDate: null } })],
    }));
    expect(xml).toContain('promotion-id="MY_PROMO"');
  });
});

// ─── Multiple slots ───────────────────────────────────────────────────────────

describe('assembleBlueprintXML — multiple slots', () => {
  function make3SlotBlueprint() {
    return makeMinimalBlueprint({
      promotionSlots: [
        makePromotionSlot({ editableFields: { promotionId: 'PROMO_A', names: [{ xmlLang: 'x-default', value: 'A' }], simpleDiscountValue: 10, discountEntries: null, editableCustomAttributes: [] } }),
        makePromotionSlot({ editableFields: { promotionId: 'PROMO_B', names: [{ xmlLang: 'x-default', value: 'B' }], simpleDiscountValue: 20, discountEntries: null, editableCustomAttributes: [] } }),
        makePromotionSlot({ editableFields: { promotionId: 'PROMO_C', names: [{ xmlLang: 'x-default', value: 'C' }], simpleDiscountValue: 30, discountEntries: null, editableCustomAttributes: [] } }),
      ],
      assignmentSlots: [
        makeAssignmentSlot({ editableFields: { promotionId: 'PROMO_A', campaignId: '2025_SUMMER_SAS', couponIds: null, startDate: null, endDate: null } }),
        makeAssignmentSlot({ editableFields: { promotionId: 'PROMO_B', campaignId: '2025_SUMMER_SAS', couponIds: null, startDate: null, endDate: null } }),
        makeAssignmentSlot({ editableFields: { promotionId: 'PROMO_C', campaignId: '2025_SUMMER_SAS', couponIds: null, startDate: null, endDate: null } }),
      ],
    });
  }

  test('all three promotion IDs present in output', () => {
    const xml = assembleBlueprintXML(make3SlotBlueprint());
    expect(xml).toContain('promotion-id="PROMO_A"');
    expect(xml).toContain('promotion-id="PROMO_B"');
    expect(xml).toContain('promotion-id="PROMO_C"');
  });

  test('promotions appear in source order (A before B before C)', () => {
    const xml = assembleBlueprintXML(make3SlotBlueprint());
    const posA = xml.indexOf('PROMO_A');
    const posB = xml.indexOf('PROMO_B');
    const posC = xml.indexOf('PROMO_C');
    expect(posA).toBeLessThan(posB);
    expect(posB).toBeLessThan(posC);
  });

  test('all assignment IDs present', () => {
    const xml = assembleBlueprintXML(make3SlotBlueprint());
    // Each promotionId appears at least twice (once in promotion, once in assignment)
    const count = (str, sub) => str.split(sub).length - 1;
    expect(count(xml, 'PROMO_A')).toBeGreaterThanOrEqual(2);
    expect(count(xml, 'PROMO_B')).toBeGreaterThanOrEqual(2);
    expect(count(xml, 'PROMO_C')).toBeGreaterThanOrEqual(2);
  });
});

// ─── Global promotion settings constant ──────────────────────────────────────

describe('assembleBlueprintXML — GLOBAL_PROMOTION_SETTINGS export', () => {
  test('GLOBAL_PROMOTION_SETTINGS is a non-empty string', () => {
    expect(typeof GLOBAL_PROMOTION_SETTINGS).toBe('string');
    expect(GLOBAL_PROMOTION_SETTINGS.length).toBeGreaterThan(0);
  });

  test('GLOBAL_PROMOTION_SETTINGS contains all three canonical categories', () => {
    expect(GLOBAL_PROMOTION_SETTINGS).toContain('Exclusions-Always');
    expect(GLOBAL_PROMOTION_SETTINGS).toContain('accessories-seedbox-foundation');
    expect(GLOBAL_PROMOTION_SETTINGS).toContain('accessories-masks');
  });

  test('GLOBAL_PROMOTION_SETTINGS contains product-option-id monogramming', () => {
    expect(GLOBAL_PROMOTION_SETTINGS).toContain('monogramming');
  });

  test('GLOBAL_PROMOTION_SETTINGS is indented at 4-space level', () => {
    expect(GLOBAL_PROMOTION_SETTINGS.startsWith('    <global-promotion-settings>')).toBe(true);
  });
});

// ─── Output format ────────────────────────────────────────────────────────────

describe('assembleBlueprintXML — output format', () => {
  test('sections are separated by blank lines (double newline)', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    // There must be at least one occurrence of \n\n between sections
    expect(xml).toContain('\n\n');
  });

  test('output ends with exactly one trailing newline', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    expect(xml.endsWith('\n')).toBe(true);
    expect(xml.endsWith('\n\n')).toBe(false);
  });
});

// ─── Assembler purity ─────────────────────────────────────────────────────────

describe('assembleBlueprintXML — assembler purity', () => {
  test('does not mutate the blueprint object', () => {
    const bp = makeMinimalBlueprint();
    const bpCopy = JSON.stringify(bp);
    assembleBlueprintXML(bp);
    expect(JSON.stringify(bp)).toBe(bpCopy);
  });

  test('calling twice with same blueprint produces same output', () => {
    const bp  = makeMinimalBlueprint();
    const r1  = assembleBlueprintXML(bp);
    const r2  = assembleBlueprintXML(bp);
    expect(r1).toBe(r2);
  });

  test('does not add extra elements beyond what renderers produce', () => {
    const xml = assembleBlueprintXML(makeMinimalBlueprint());
    // Should contain exactly one <campaign> block
    const campaignOpenCount = (xml.match(/<campaign /g) || []).length;
    expect(campaignOpenCount).toBe(1);
    // Should contain exactly one <global-promotion-settings> block
    const gpsCount = (xml.match(/<global-promotion-settings>/g) || []).length;
    expect(gpsCount).toBe(1);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('assembleBlueprintXML — determinism', () => {
  test('three identical calls produce identical output', () => {
    const bp = makeMinimalBlueprint();
    const r1 = assembleBlueprintXML(bp);
    const r2 = assembleBlueprintXML(bp);
    const r3 = assembleBlueprintXML(bp);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });
});
