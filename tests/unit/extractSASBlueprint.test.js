'use strict';

const { extractSASBlueprint, _internals } = require('../../src/blueprints/extractors/extractSASBlueprint');

const {
  toArray,
  parseBoolNode,
  deepEqual,
  extractConditionFromGroup,
  extractProductConditionBlock,
  classifyDiscountFamily,
  extractSimpleDiscountFields,
  extractProductAmountDiscountFields,
  extractCustomAttributes,
  extractNames,
  validateGlobalPromotionSettings,
  extractCampaignSlot,
  FROZEN_GLOBAL_SETTINGS_FINGERPRINT,
  EDITABLE_CUSTOM_ATTR_IDS,
} = _internals;

// ─── XML fixtures ─────────────────────────────────────────────────────────────

const NS = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';

const GLOBAL_SETTINGS_XML = `
    <global-promotion-settings>
        <global-excluded-products>
            <included-products>
                <condition-group>
                    <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                        <category-id>Exclusions-Always</category-id>
                    </category-condition>
                </condition-group>
                <condition-group>
                    <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                        <category-id>accessories-seedbox-foundation</category-id>
                    </category-condition>
                </condition-group>
                <condition-group>
                    <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                        <category-id>accessories-masks</category-id>
                    </category-condition>
                </condition-group>
            </included-products>
        </global-excluded-products>
        <global-excluded-product-options>
            <product-option-id>monogramming</product-option-id>
        </global-excluded-product-options>
    </global-promotion-settings>`;

/**
 * Build a minimal valid SAS XML string for use in integration-style tests.
 * Accepts overrides for individual promotions or assignments.
 */
function buildSasXml({
  campaignId   = '2025_SUMMER_SAS',
  promotions   = null,
  assignments  = null,
  includeGlobalSettings = true,
} = {}) {
  const globalSettings = includeGlobalSettings ? GLOBAL_SETTINGS_XML : '';

  const defaultPromotions = `
    <promotion promotion-id="2025-SUMMER-SAS-APPEASEMENT">
        <enabled-flag>true</enabled-flag>
        <archived-flag>false</archived-flag>
        <searchable-flag>false</searchable-flag>
        <refinable-flag>false</refinable-flag>
        <prevent-requalifying-flag>false</prevent-requalifying-flag>
        <prorate-across-eligible-items-flag>false</prorate-across-eligible-items-flag>
        <exclusivity>class</exclusivity>
        <name xml:lang="x-default">Promo Applied</name>
        <name xml:lang="en">Promo Applied</name>
        <custom-attributes>
            <custom-attribute attribute-id="gwp">false</custom-attribute>
            <custom-attribute attribute-id="storefront_msg_cart_inclusion" xml:lang="x-default">25% Off Discount Applied</custom-attribute>
            <custom-attribute attribute-id="storefront_msg_cart_exclusion" xml:lang="x-default">Excluded From Promotion</custom-attribute>
        </custom-attributes>
        <product-promotion-rule>
            <discounted-products>
                <included-products>
                    <condition-group>
                        <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                            <category-id>sale-view-all</category-id>
                        </category-condition>
                    </condition-group>
                </included-products>
                <excluded-products>
                    <condition-group>
                        <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                            <category-id>Exclusions-Always</category-id>
                            <category-id>accessories-seedbox-foundation</category-id>
                            <category-id>Exclusions-Welcome-Offer</category-id>
                        </category-condition>
                    </condition-group>
                </excluded-products>
            </discounted-products>
            <simple-discount>
                <percentage>25.0</percentage>
            </simple-discount>
        </product-promotion-rule>
    </promotion>

    <promotion promotion-id="2025_Summer_SAS_BB50OFF">
        <enabled-flag>true</enabled-flag>
        <archived-flag>false</archived-flag>
        <searchable-flag>false</searchable-flag>
        <refinable-flag>false</refinable-flag>
        <prevent-requalifying-flag>false</prevent-requalifying-flag>
        <prorate-across-eligible-items-flag>false</prorate-across-eligible-items-flag>
        <exclusivity>class</exclusivity>
        <name xml:lang="x-default">$50 off $250</name>
        <custom-attributes>
            <custom-attribute attribute-id="gwp">false</custom-attribute>
            <custom-attribute attribute-id="storefront_msg_cart_exclusion" xml:lang="x-default">Excluded From $50 Off $250</custom-attribute>
            <custom-attribute attribute-id="storefront_msg_cart_inclusion" xml:lang="x-default">You Have Received $50 Off</custom-attribute>
        </custom-attributes>
        <product-promotion-rule>
            <qualifying-products>
                <included-products>
                    <condition-group>
                        <price-condition operator="greater than">
                            <price>0.01</price>
                        </price-condition>
                    </condition-group>
                </included-products>
            </qualifying-products>
            <discounted-products>
                <included-products>
                    <condition-group>
                        <price-condition operator="greater than">
                            <price>0.01</price>
                        </price-condition>
                    </condition-group>
                </included-products>
                <excluded-products>
                    <condition-group>
                        <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                            <category-id>Exclusions-Always</category-id>
                            <category-id>2025-Summer-SAS-Bounceback-Exclusions</category-id>
                        </category-condition>
                    </condition-group>
                </excluded-products>
            </discounted-products>
            <disable-global-excluded-products>true</disable-global-excluded-products>
            <discounts condition-type="product-amount">
                <discount>
                    <threshold>250.0</threshold>
                    <amount>50.0</amount>
                </discount>
            </discounts>
            <max-applications>1</max-applications>
        </product-promotion-rule>
    </promotion>`;

  const defaultAssignments = `
    <promotion-campaign-assignment promotion-id="2025-SUMMER-SAS-APPEASEMENT" campaign-id="${campaignId}">
        <qualifiers match-mode="any">
            <customer-groups/>
            <source-codes/>
            <coupons/>
        </qualifiers>
        <coupons>
            <coupon coupon-id="2025-Summer-SAS-CS"/>
        </coupons>
        <rank>10</rank>
        <schedule>
            <end-date>2025-07-08T04:00:00.000Z</end-date>
        </schedule>
    </promotion-campaign-assignment>

    <promotion-campaign-assignment promotion-id="2025_Summer_SAS_BB50OFF" campaign-id="${campaignId}">
        <qualifiers match-mode="all">
            <customer-groups/>
            <source-codes/>
            <coupons/>
        </qualifiers>
        <coupons>
            <coupon coupon-id="2025_Summer_SAS_BB"/>
        </coupons>
        <rank>10</rank>
        <schedule>
            <end-date>2025-07-25T04:00:00.000Z</end-date>
        </schedule>
    </promotion-campaign-assignment>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="${NS}">
    <campaign campaign-id="${campaignId}">
        <enabled-flag>true</enabled-flag>
        <campaign-scope><applicable-online/></campaign-scope>
    </campaign>
    ${globalSettings}
    ${promotions !== null ? promotions : defaultPromotions}
    ${assignments !== null ? assignments : defaultAssignments}
</promotions>`;
}

// ─── toArray ──────────────────────────────────────────────────────────────────

describe('toArray', () => {
  test('wraps a non-array value in an array', () => {
    expect(toArray('x')).toEqual(['x']);
  });

  test('returns an array unchanged', () => {
    expect(toArray(['a', 'b'])).toEqual(['a', 'b']);
  });

  test('returns [] for undefined', () => {
    expect(toArray(undefined)).toEqual([]);
  });

  test('returns [] for null', () => {
    expect(toArray(null)).toEqual([]);
  });

  test('wraps an object value in an array', () => {
    const obj = { a: 1 };
    expect(toArray(obj)).toEqual([obj]);
  });
});

// ─── parseBoolNode ────────────────────────────────────────────────────────────

describe('parseBoolNode', () => {
  test('parses "true" → true', () => {
    expect(parseBoolNode('true', 'enabled-flag')).toBe(true);
  });

  test('parses "false" → false', () => {
    expect(parseBoolNode('false', 'enabled-flag')).toBe(false);
  });

  test('throws for unexpected value', () => {
    expect(() => parseBoolNode('yes', 'some-flag')).toThrow(/<some-flag>/);
  });

  test('throws for empty string', () => {
    expect(() => parseBoolNode('', 'some-flag')).toThrow();
  });
});

// ─── deepEqual ────────────────────────────────────────────────────────────────

describe('deepEqual', () => {
  test('identical primitives are equal', () => {
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
  });

  test('different primitives are not equal', () => {
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  test('identical flat objects are equal', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  test('objects with different key count are not equal', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  test('nested objects are compared recursively', () => {
    expect(deepEqual({ a: { b: 'x' } }, { a: { b: 'x' } })).toBe(true);
    expect(deepEqual({ a: { b: 'x' } }, { a: { b: 'y' } })).toBe(false);
  });

  test('arrays are compared element-by-element', () => {
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
    expect(deepEqual([1], [1, 2])).toBe(false);
  });

  test('array vs non-array is not equal', () => {
    expect(deepEqual([1], 1)).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });
});

// ─── extractConditionFromGroup ────────────────────────────────────────────────

describe('extractConditionFromGroup', () => {
  test('extracts a single-category category-condition', () => {
    const cg = {
      'category-condition': {
        '@catalog-id': 'siteCatalog_ToryUS',
        '@operator': 'is equal',
        'category-id': 'sale-view-all',
      },
    };
    const result = extractConditionFromGroup(cg);
    expect(result.type).toBe('category');
    expect(result.catalogId).toBe('siteCatalog_ToryUS');
    expect(result.operator).toBe('is equal');
    expect(result.categoryIds).toEqual(['sale-view-all']);
  });

  test('extracts a multi-category category-condition as an array', () => {
    const cg = {
      'category-condition': {
        '@catalog-id': 'siteCatalog_ToryUS',
        '@operator': 'is equal',
        'category-id': ['Exclusions-Always', 'accessories-seedbox-foundation'],
      },
    };
    const result = extractConditionFromGroup(cg);
    expect(result.categoryIds).toEqual(['Exclusions-Always', 'accessories-seedbox-foundation']);
  });

  test('extracts a price-condition', () => {
    const cg = {
      'price-condition': {
        '@operator': 'greater than',
        'price': '0.01',
      },
    };
    const result = extractConditionFromGroup(cg);
    expect(result.type).toBe('price');
    expect(result.operator).toBe('greater than');
    expect(result.price).toBe(0.01);
  });

  test('throws for unrecognised condition-group', () => {
    expect(() => extractConditionFromGroup({ 'unknown-condition': {} }))
      .toThrow('Unrecognised condition-group');
  });
});

// ─── extractProductConditionBlock ─────────────────────────────────────────────

describe('extractProductConditionBlock', () => {
  test('extracts a single condition-group as a one-element array', () => {
    const node = {
      'condition-group': {
        'category-condition': {
          '@catalog-id': 'siteCatalog_ToryUS',
          '@operator': 'is equal',
          'category-id': 'sale-view-all',
        },
      },
    };
    const result = extractProductConditionBlock(node);
    expect(result.conditionGroups).toHaveLength(1);
    expect(result.conditionGroups[0].condition.type).toBe('category');
  });

  test('preserves source order of multiple condition-groups', () => {
    const node = {
      'condition-group': [
        { 'category-condition': { '@catalog-id': 'cat', '@operator': 'is equal', 'category-id': 'A' } },
        { 'category-condition': { '@catalog-id': 'cat', '@operator': 'is equal', 'category-id': 'B' } },
        { 'category-condition': { '@catalog-id': 'cat', '@operator': 'is equal', 'category-id': 'C' } },
      ],
    };
    const result = extractProductConditionBlock(node);
    expect(result.conditionGroups).toHaveLength(3);
    expect(result.conditionGroups[0].condition.categoryIds).toEqual(['A']);
    expect(result.conditionGroups[1].condition.categoryIds).toEqual(['B']);
    expect(result.conditionGroups[2].condition.categoryIds).toEqual(['C']);
  });

  test('throws when no condition-groups present', () => {
    expect(() => extractProductConditionBlock({})).toThrow('no <condition-group>');
  });
});

// ─── classifyDiscountFamily ───────────────────────────────────────────────────

describe('classifyDiscountFamily', () => {
  test('returns "simple" when simple-discount is present', () => {
    expect(classifyDiscountFamily({ 'simple-discount': { percentage: '25.0' } }))
      .toBe('simple');
  });

  test('returns "product-amount" when discounts condition-type=product-amount is present', () => {
    expect(classifyDiscountFamily({ 'discounts': { '@condition-type': 'product-amount', 'discount': {} } }))
      .toBe('product-amount');
  });

  test('throws for unsupported condition-type', () => {
    expect(() => classifyDiscountFamily({ 'discounts': { '@condition-type': 'order-total' } }))
      .toThrow('Unsupported');
  });

  test('throws when neither simple-discount nor discounts is present', () => {
    expect(() => classifyDiscountFamily({}))
      .toThrow('Cannot classify discount family');
  });
});

// ─── extractSimpleDiscountFields ──────────────────────────────────────────────

describe('extractSimpleDiscountFields', () => {
  test('extracts percentage from simple-discount', () => {
    const rule = { 'simple-discount': { 'percentage': '25.0' } };
    const result = extractSimpleDiscountFields(rule);
    expect(result.simpleDiscountType).toBe('percentage');
    expect(result.simpleDiscountValue).toBe(25.0);
  });

  test('extracts amount from simple-discount', () => {
    const rule = { 'simple-discount': { 'amount': '50.0' } };
    const result = extractSimpleDiscountFields(rule);
    expect(result.simpleDiscountType).toBe('amount');
    expect(result.simpleDiscountValue).toBe(50.0);
  });

  test('throws when simple-discount has no recognised child', () => {
    const rule = { 'simple-discount': { 'unknown': '10' } };
    expect(() => extractSimpleDiscountFields(rule)).toThrow('Unrecognised <simple-discount>');
  });

  test('discount value is parsed as float, not string', () => {
    const rule = { 'simple-discount': { 'percentage': '30.0' } };
    const result = extractSimpleDiscountFields(rule);
    expect(typeof result.simpleDiscountValue).toBe('number');
    expect(result.simpleDiscountValue).toBe(30.0);
  });
});

// ─── extractProductAmountDiscountFields ───────────────────────────────────────

describe('extractProductAmountDiscountFields', () => {
  test('extracts a single amount discount', () => {
    const rule = {
      'discounts': {
        '@condition-type': 'product-amount',
        'discount': { 'threshold': '250.0', 'amount': '50.0' },
      },
    };
    const result = extractProductAmountDiscountFields(rule);
    expect(result.discountEntryTemplates).toHaveLength(1);
    expect(result.discountEntryTemplates[0].discountType).toBe('amount');
    expect(result.discountEntries[0].threshold).toBe(250.0);
    expect(result.discountEntries[0].discountValue).toBe(50.0);
  });

  test('extracts a single percentage discount', () => {
    const rule = {
      'discounts': {
        '@condition-type': 'product-amount',
        'discount': { 'threshold': '0.01', 'percentage': '25.0' },
      },
    };
    const result = extractProductAmountDiscountFields(rule);
    expect(result.discountEntryTemplates[0].discountType).toBe('percentage');
    expect(result.discountEntries[0].threshold).toBe(0.01);
    expect(result.discountEntries[0].discountValue).toBe(25.0);
  });

  test('extracts multiple discount tiers, preserving order', () => {
    const rule = {
      'discounts': {
        '@condition-type': 'product-amount',
        'discount': [
          { 'threshold': '100', 'percentage': '10' },
          { 'threshold': '200', 'percentage': '20' },
          { 'threshold': '300', 'percentage': '30' },
        ],
      },
    };
    const result = extractProductAmountDiscountFields(rule);
    expect(result.discountEntries).toHaveLength(3);
    expect(result.discountEntries[0].threshold).toBe(100);
    expect(result.discountEntries[1].discountValue).toBe(20);
    expect(result.discountEntries[2].threshold).toBe(300);
  });

  test('frozen discountType is separate from editable discountValue', () => {
    const rule = {
      'discounts': {
        '@condition-type': 'product-amount',
        'discount': { 'threshold': '50', 'amount': '10' },
      },
    };
    const result = extractProductAmountDiscountFields(rule);
    // discountType lives in frozenStructure side (templates)
    expect(result.discountEntryTemplates[0]).toHaveProperty('discountType', 'amount');
    // discountValue lives in editableFields side (entries)
    expect(result.discountEntries[0]).not.toHaveProperty('discountType');
    expect(result.discountEntries[0]).toHaveProperty('discountValue', 10);
  });

  test('all numeric values are parsed as numbers, not strings', () => {
    const rule = {
      'discounts': {
        '@condition-type': 'product-amount',
        'discount': { 'threshold': '250.0', 'amount': '50.0' },
      },
    };
    const result = extractProductAmountDiscountFields(rule);
    expect(typeof result.discountEntries[0].threshold).toBe('number');
    expect(typeof result.discountEntries[0].discountValue).toBe('number');
  });

  test('throws when discount entry lacks threshold', () => {
    const rule = {
      'discounts': {
        '@condition-type': 'product-amount',
        'discount': { 'percentage': '25.0' },
      },
    };
    expect(() => extractProductAmountDiscountFields(rule)).toThrow('threshold');
  });

  test('throws when discount entry lacks percentage and amount', () => {
    const rule = {
      'discounts': {
        '@condition-type': 'product-amount',
        'discount': { 'threshold': '100' },
      },
    };
    expect(() => extractProductAmountDiscountFields(rule)).toThrow('percentage');
  });

  test('throws when discounts block has no discount elements', () => {
    const rule = { 'discounts': { '@condition-type': 'product-amount' } };
    expect(() => extractProductAmountDiscountFields(rule)).toThrow('no <discount>');
  });
});

// ─── extractCustomAttributes ──────────────────────────────────────────────────

describe('extractCustomAttributes', () => {
  test('classifies storefront_msg_cart_inclusion as editable', () => {
    const node = {
      'custom-attribute': {
        '@attribute-id': 'storefront_msg_cart_inclusion',
        '@xml:lang': 'x-default',
        '#': '25% Off',
      },
    };
    const result = extractCustomAttributes(node);
    expect(result.editableCustomAttributes).toHaveLength(1);
    expect(result.frozenCustomAttributes).toHaveLength(0);
    expect(result.editableCustomAttributes[0].attributeId).toBe('storefront_msg_cart_inclusion');
    expect(result.editableCustomAttributes[0].value).toBe('25% Off');
    expect(result.editableCustomAttributes[0].xmlLang).toBe('x-default');
  });

  test('classifies gwp as frozen', () => {
    const node = {
      'custom-attribute': { '@attribute-id': 'gwp', '#': 'false' },
    };
    const result = extractCustomAttributes(node);
    expect(result.frozenCustomAttributes).toHaveLength(1);
    expect(result.frozenCustomAttributes[0].attributeId).toBe('gwp');
    expect(result.frozenCustomAttributes[0].value).toBe('false');
  });

  test('extracts nested <value> as valueType=nested', () => {
    const node = {
      'custom-attribute': {
        '@attribute-id': 'thresholdPercentage',
        'value': '25',
      },
    };
    const result = extractCustomAttributes(node);
    expect(result.frozenCustomAttributes).toHaveLength(1);
    expect(result.frozenCustomAttributes[0].valueType).toBe('nested');
    expect(result.frozenCustomAttributes[0].value).toBe('25');
  });

  test('preserves source order across mixed editable and frozen attributes', () => {
    const node = {
      'custom-attribute': [
        { '@attribute-id': 'gwp', '#': 'false' },
        { '@attribute-id': 'storefront_msg_cart_inclusion', '@xml:lang': 'x-default', '#': '25% Off' },
        { '@attribute-id': 'isCouponOnlyActivatesPromotion', '#': 'true' },
        { '@attribute-id': 'storefront_msg_cart_exclusion', '@xml:lang': 'x-default', '#': 'Excluded' },
      ],
    };
    const result = extractCustomAttributes(node);
    expect(result.frozenCustomAttributes).toHaveLength(2);
    expect(result.editableCustomAttributes).toHaveLength(2);
    expect(result.frozenCustomAttributes[0].attributeId).toBe('gwp');
    expect(result.frozenCustomAttributes[1].attributeId).toBe('isCouponOnlyActivatesPromotion');
    expect(result.editableCustomAttributes[0].attributeId).toBe('storefront_msg_cart_inclusion');
    expect(result.editableCustomAttributes[1].attributeId).toBe('storefront_msg_cart_exclusion');
  });

  test('attribute without xmlLang gets xmlLang=null', () => {
    const node = {
      'custom-attribute': { '@attribute-id': 'gwp', '#': 'false' },
    };
    const result = extractCustomAttributes(node);
    expect(result.frozenCustomAttributes[0].xmlLang).toBeNull();
  });

  test('attribute with no text content gets value=null', () => {
    const node = {
      'custom-attribute': { '@attribute-id': 'someFlag' },
    };
    const result = extractCustomAttributes(node);
    expect(result.frozenCustomAttributes[0].value).toBeNull();
  });

  test('all EDITABLE_CUSTOM_ATTR_IDS are classified as editable', () => {
    EDITABLE_CUSTOM_ATTR_IDS.forEach(id => {
      const node = {
        'custom-attribute': { '@attribute-id': id, '#': 'some value' },
      };
      const result = extractCustomAttributes(node);
      expect(result.editableCustomAttributes.map(a => a.attributeId)).toContain(id);
      expect(result.frozenCustomAttributes.map(a => a.attributeId)).not.toContain(id);
    });
  });
});

// ─── extractNames ─────────────────────────────────────────────────────────────

describe('extractNames', () => {
  test('extracts a single name element', () => {
    const nameNode = { '@xml:lang': 'x-default', '#': 'Promo Applied' };
    const result = extractNames(nameNode);
    expect(result.nameLocales).toEqual(['x-default']);
    expect(result.names).toEqual([{ xmlLang: 'x-default', value: 'Promo Applied' }]);
  });

  test('extracts multiple name elements preserving order', () => {
    const nameNode = [
      { '@xml:lang': 'x-default', '#': 'Promo Applied' },
      { '@xml:lang': 'en', '#': 'Promo Applied' },
    ];
    const result = extractNames(nameNode);
    expect(result.nameLocales).toEqual(['x-default', 'en']);
    expect(result.names[0].xmlLang).toBe('x-default');
    expect(result.names[1].xmlLang).toBe('en');
  });

  test('throws when name node is missing', () => {
    expect(() => extractNames(undefined)).toThrow('no <name>');
  });
});

// ─── validateGlobalPromotionSettings ─────────────────────────────────────────

describe('validateGlobalPromotionSettings', () => {
  test('accepts the canonical fingerprint without throwing', () => {
    const node = { 'global-promotion-settings': FROZEN_GLOBAL_SETTINGS_FINGERPRINT };
    expect(() => validateGlobalPromotionSettings(node)).not.toThrow();
  });

  test('throws when global-promotion-settings is absent', () => {
    expect(() => validateGlobalPromotionSettings({}))
      .toThrow('EXTRACTION HALTED');
  });

  test('throws when a category-id in the fingerprint is changed', () => {
    const modified = JSON.parse(JSON.stringify(FROZEN_GLOBAL_SETTINGS_FINGERPRINT));
    modified['global-excluded-products']['included-products']['condition-group'][0]['category-condition']['category-id'] = 'WRONG';
    expect(() => validateGlobalPromotionSettings({ 'global-promotion-settings': modified }))
      .toThrow('EXTRACTION HALTED');
  });

  test('throws when a condition-group is removed', () => {
    const modified = JSON.parse(JSON.stringify(FROZEN_GLOBAL_SETTINGS_FINGERPRINT));
    modified['global-excluded-products']['included-products']['condition-group'].pop();
    expect(() => validateGlobalPromotionSettings({ 'global-promotion-settings': modified }))
      .toThrow('EXTRACTION HALTED');
  });

  test('throws when product-option-id is changed', () => {
    const modified = JSON.parse(JSON.stringify(FROZEN_GLOBAL_SETTINGS_FINGERPRINT));
    modified['global-excluded-product-options']['product-option-id'] = 'embroidery';
    expect(() => validateGlobalPromotionSettings({ 'global-promotion-settings': modified }))
      .toThrow('EXTRACTION HALTED');
  });

  test('throws when an extra field is added to global settings', () => {
    const modified = JSON.parse(JSON.stringify(FROZEN_GLOBAL_SETTINGS_FINGERPRINT));
    modified['extra-field'] = 'unexpected';
    expect(() => validateGlobalPromotionSettings({ 'global-promotion-settings': modified }))
      .toThrow('EXTRACTION HALTED');
  });
});

// ─── extractCampaignSlot ──────────────────────────────────────────────────────

describe('extractCampaignSlot', () => {
  test('extracts campaign-id into editableFields', () => {
    const node = {
      '@campaign-id': '2025_SUMMER_SAS',
      'enabled-flag': 'true',
      'campaign-scope': { 'applicable-online': {} },
    };
    const result = extractCampaignSlot(node);
    expect(result.editableFields.campaignId).toBe('2025_SUMMER_SAS');
  });

  test('freezes enabledFlag', () => {
    const node = {
      '@campaign-id': 'CAMP',
      'enabled-flag': 'true',
      'campaign-scope': { 'applicable-online': {} },
    };
    const result = extractCampaignSlot(node);
    expect(result.frozenStructure.enabledFlag).toBe(true);
  });

  test('freezes applicableOnline=true when applicable-online element is present', () => {
    const node = {
      '@campaign-id': 'CAMP',
      'enabled-flag': 'true',
      'campaign-scope': { 'applicable-online': {} },
    };
    const result = extractCampaignSlot(node);
    expect(result.frozenStructure.campaignScope.applicableOnline).toBe(true);
  });

  test('sets applicableOnline=false when campaign-scope is absent', () => {
    const node = { '@campaign-id': 'CAMP', 'enabled-flag': 'false' };
    const result = extractCampaignSlot(node);
    expect(result.frozenStructure.campaignScope.applicableOnline).toBe(false);
  });
});

// ─── extractSASBlueprint — integration tests ──────────────────────────────────

describe('extractSASBlueprint — input validation', () => {
  test('throws for empty string', () => {
    expect(() => extractSASBlueprint('')).toThrow('non-empty string');
  });

  test('throws for non-string input', () => {
    expect(() => extractSASBlueprint(null)).toThrow();
    expect(() => extractSASBlueprint(42)).toThrow();
  });

  test('throws for invalid XML', () => {
    expect(() => extractSASBlueprint('<broken xml')).toThrow('XML parse failure');
  });

  test('throws when root promotions element is missing', () => {
    expect(() => extractSASBlueprint('<?xml version="1.0"?><root/>')).toThrow('Root <promotions>');
  });

  test('throws when global-promotion-settings is absent', () => {
    const xml = buildSasXml({ includeGlobalSettings: false });
    expect(() => extractSASBlueprint(xml)).toThrow('EXTRACTION HALTED');
  });
});

describe('extractSASBlueprint — source-order preservation', () => {
  test('promotion slots preserve XML source order', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[0].editableFields.promotionId).toBe('2025-SUMMER-SAS-APPEASEMENT');
    expect(blueprint.promotionSlots[1].editableFields.promotionId).toBe('2025_Summer_SAS_BB50OFF');
  });

  test('assignment slots preserve XML source order', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.assignmentSlots[0].editableFields.promotionId).toBe('2025-SUMMER-SAS-APPEASEMENT');
    expect(blueprint.assignmentSlots[1].editableFields.promotionId).toBe('2025_Summer_SAS_BB50OFF');
  });

  test('slotIndex matches array position', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    blueprint.promotionSlots.forEach((slot, i) => {
      expect(slot.slotIndex).toBe(i);
    });
    blueprint.assignmentSlots.forEach((slot, i) => {
      expect(slot.slotIndex).toBe(i);
    });
  });
});

describe('extractSASBlueprint — campaign extraction', () => {
  test('extracts campaign ID into editableFields', () => {
    const xml = buildSasXml({ campaignId: '2025_SUMMER_SAS' });
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.campaignSlot.editableFields.campaignId).toBe('2025_SUMMER_SAS');
  });

  test('freezes campaign enabledFlag', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.campaignSlot.frozenStructure.enabledFlag).toBe(true);
  });

  test('freezes applicableOnline scope', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.campaignSlot.frozenStructure.campaignScope.applicableOnline).toBe(true);
  });
});

describe('extractSASBlueprint — discount family classification', () => {
  test('APPEASEMENT slot is classified as simple family', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const appeasement = blueprint.promotionSlots[0];
    expect(appeasement.frozenStructure.discountFamily).toBe('simple');
  });

  test('BB50OFF slot is classified as product-amount family', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const bb50 = blueprint.promotionSlots[1];
    expect(bb50.frozenStructure.discountFamily).toBe('product-amount');
  });

  test('simple family slots have discountEntryTemplates=null', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[0].frozenStructure.discountEntryTemplates).toBeNull();
  });

  test('product-amount family slots have simpleDiscountType=null', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[1].frozenStructure.simpleDiscountType).toBeNull();
  });
});

describe('extractSASBlueprint — simple discount editable values', () => {
  test('simpleDiscountValue is extracted into editableFields', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[0].editableFields.simpleDiscountValue).toBe(25.0);
  });

  test('simpleDiscountValue is a number not a string', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(typeof blueprint.promotionSlots[0].editableFields.simpleDiscountValue).toBe('number');
  });

  test('product-amount slots have simpleDiscountValue=null in editableFields', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[1].editableFields.simpleDiscountValue).toBeNull();
  });
});

describe('extractSASBlueprint — product-amount discount editable values', () => {
  test('discountEntries are extracted into editableFields', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const entries = blueprint.promotionSlots[1].editableFields.discountEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0].threshold).toBe(250.0);
    expect(entries[0].discountValue).toBe(50.0);
  });

  test('discountEntryTemplates freeze the discount type', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const templates = blueprint.promotionSlots[1].frozenStructure.discountEntryTemplates;
    expect(templates[0].discountType).toBe('amount');
  });

  test('simple slots have discountEntries=null in editableFields', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[0].editableFields.discountEntries).toBeNull();
  });
});

describe('extractSASBlueprint — frozen flags', () => {
  test('all six boolean flags are extracted as booleans', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const fs = blueprint.promotionSlots[0].frozenStructure;
    expect(typeof fs.enabledFlag).toBe('boolean');
    expect(typeof fs.archivedFlag).toBe('boolean');
    expect(typeof fs.searchableFlag).toBe('boolean');
    expect(typeof fs.refinableFlag).toBe('boolean');
    expect(typeof fs.preventRequalifyingFlag).toBe('boolean');
    expect(typeof fs.prorateAcrossEligibleItemsFlag).toBe('boolean');
  });

  test('exclusivity is extracted and frozen', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[0].frozenStructure.exclusivity).toBe('class');
  });
});

describe('extractSASBlueprint — name extraction', () => {
  test('single-locale name extracts correctly', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    // BB50OFF has one name (x-default only)
    const slot = blueprint.promotionSlots[1];
    expect(slot.frozenStructure.nameLocales).toEqual(['x-default']);
    expect(slot.editableFields.names).toEqual([{ xmlLang: 'x-default', value: '$50 off $250' }]);
  });

  test('multi-locale name preserves order in nameLocales', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    // APPEASEMENT has x-default and en
    const slot = blueprint.promotionSlots[0];
    expect(slot.frozenStructure.nameLocales).toEqual(['x-default', 'en']);
  });

  test('name values are in editableFields, locales list is in frozenStructure', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const slot = blueprint.promotionSlots[0];
    expect(slot.frozenStructure).toHaveProperty('nameLocales');
    expect(slot.editableFields).toHaveProperty('names');
    // frozenStructure should not contain actual name text
    expect(slot.frozenStructure).not.toHaveProperty('names');
  });
});

describe('extractSASBlueprint — qualifying and discounted products', () => {
  test('qualifying-products is null for slots that lack it', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    // APPEASEMENT has no qualifying-products
    expect(blueprint.promotionSlots[0].frozenStructure.qualifyingProducts).toBeNull();
  });

  test('qualifying-products is extracted for BB50OFF (price gate)', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const qp = blueprint.promotionSlots[1].frozenStructure.qualifyingProducts;
    expect(qp).not.toBeNull();
    expect(qp.includedProducts.conditionGroups[0].condition.type).toBe('price');
    expect(qp.includedProducts.conditionGroups[0].condition.price).toBe(0.01);
  });

  test('discounted-products is extracted for APPEASEMENT', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const dp = blueprint.promotionSlots[0].frozenStructure.discountedProducts;
    expect(dp).not.toBeNull();
    expect(dp.includedProducts.conditionGroups[0].condition.type).toBe('category');
    expect(dp.includedProducts.conditionGroups[0].condition.categoryIds).toContain('sale-view-all');
  });

  test('excluded-products inside discounted-products captures all category IDs', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const excluded = blueprint.promotionSlots[0].frozenStructure.discountedProducts.excludedProducts;
    expect(excluded.conditionGroups[0].condition.categoryIds).toContain('Exclusions-Always');
    expect(excluded.conditionGroups[0].condition.categoryIds).toContain('accessories-seedbox-foundation');
    expect(excluded.conditionGroups[0].condition.categoryIds).toContain('Exclusions-Welcome-Offer');
  });

  test('absent excluded-products is null, not an empty object', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    // BB50OFF qualifying-products has no excluded-products in included side
    const qp = blueprint.promotionSlots[1].frozenStructure.qualifyingProducts;
    expect(qp.excludedProducts).toBeNull();
  });
});

describe('extractSASBlueprint — disable-global-excluded-products and max-applications', () => {
  test('disableGlobalExcludedProducts is true for BB50OFF', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[1].frozenStructure.disableGlobalExcludedProducts).toBe(true);
  });

  test('disableGlobalExcludedProducts is null for slots without the element', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[0].frozenStructure.disableGlobalExcludedProducts).toBeNull();
  });

  test('maxApplications is 1 for BB50OFF', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[1].frozenStructure.maxApplications).toBe(1);
  });

  test('maxApplications is null for slots without the element', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.promotionSlots[0].frozenStructure.maxApplications).toBeNull();
  });
});

describe('extractSASBlueprint — custom attribute classification', () => {
  test('storefront_msg_cart_inclusion is in editableCustomAttributes', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const editable = blueprint.promotionSlots[0].editableFields.editableCustomAttributes;
    const ids = editable.map(a => a.attributeId);
    expect(ids).toContain('storefront_msg_cart_inclusion');
  });

  test('storefront_msg_cart_exclusion is in editableCustomAttributes', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const editable = blueprint.promotionSlots[0].editableFields.editableCustomAttributes;
    const ids = editable.map(a => a.attributeId);
    expect(ids).toContain('storefront_msg_cart_exclusion');
  });

  test('gwp is in frozenCustomAttributes', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const frozen = blueprint.promotionSlots[0].frozenStructure.frozenCustomAttributes;
    expect(frozen.map(a => a.attributeId)).toContain('gwp');
  });

  test('editable attributes never appear in frozenCustomAttributes', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    blueprint.promotionSlots.forEach(slot => {
      const frozenIds = slot.frozenStructure.frozenCustomAttributes.map(a => a.attributeId);
      EDITABLE_CUSTOM_ATTR_IDS.forEach(id => {
        expect(frozenIds).not.toContain(id);
      });
    });
  });
});

describe('extractSASBlueprint — assignment extraction', () => {
  test('extracts promotionId and campaignId into editableFields', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const slot = blueprint.assignmentSlots[0];
    expect(slot.editableFields.promotionId).toBe('2025-SUMMER-SAS-APPEASEMENT');
    expect(slot.editableFields.campaignId).toBe('2025_SUMMER_SAS');
  });

  test('extracts coupon IDs into editableFields', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.assignmentSlots[0].editableFields.couponIds).toEqual(['2025-Summer-SAS-CS']);
  });

  test('couponIds is null when assignment has no coupons block', () => {
    // Build XML with an assignment that has no coupons
    const assignmentWithoutCoupon = `
    <promotion-campaign-assignment promotion-id="P1" campaign-id="C1">
        <qualifiers match-mode="any">
            <customer-groups/>
            <source-codes/>
            <coupons/>
        </qualifiers>
        <customer-groups match-mode="any">
            <customer-group group-id="Everyone"/>
        </customer-groups>
        <rank>10</rank>
        <schedule><end-date>2025-07-08T04:00:00.000Z</end-date></schedule>
    </promotion-campaign-assignment>`;
    const xml = buildSasXml({ assignments: assignmentWithoutCoupon });
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.assignmentSlots[0].editableFields.couponIds).toBeNull();
  });

  test('qualifiers match-mode is frozen in frozenStructure', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.assignmentSlots[0].frozenStructure.qualifiers.matchMode).toBe('any');
    expect(blueprint.assignmentSlots[1].frozenStructure.qualifiers.matchMode).toBe('all');
  });

  test('qualifier presence flags are frozen correctly', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    const q = blueprint.assignmentSlots[0].frozenStructure.qualifiers;
    expect(q.hasCustomerGroups).toBe(true);
    expect(q.hasSourceCodes).toBe(true);
    expect(q.hasCoupons).toBe(true);
  });

  test('hasStartDate is false when start-date is absent', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.assignmentSlots[0].frozenStructure.hasStartDate).toBe(false);
    expect(blueprint.assignmentSlots[0].editableFields.startDate).toBeNull();
  });

  test('hasEndDate is true when end-date is present', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.assignmentSlots[0].frozenStructure.hasEndDate).toBe(true);
    expect(blueprint.assignmentSlots[0].editableFields.endDate).toBe('2025-07-08T04:00:00.000Z');
  });

  test('rank is extracted into frozenStructure', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(blueprint.assignmentSlots[0].frozenStructure.rank).toBe(10);
  });

  test('customerGroups outside qualifiers is null when absent', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    // First assignment has no customer-groups block outside qualifiers
    expect(blueprint.assignmentSlots[0].frozenStructure.customerGroups).toBeNull();
  });
});

describe('extractSASBlueprint — options', () => {
  test('blueprintId is set from options', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml, { blueprintId: 'SAS-2025' });
    expect(blueprint.blueprintId).toBe('SAS-2025');
  });

  test('sourceExport is set from options', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml, { sourceExport: 'Summer_SAS.xml' });
    expect(blueprint.sourceExport).toBe('Summer_SAS.xml');
  });

  test('extractedAt can be overridden for deterministic testing', () => {
    const xml = buildSasXml();
    const ts = '2025-06-01T00:00:00.000Z';
    const blueprint = extractSASBlueprint(xml, { extractedAt: ts });
    expect(blueprint.extractedAt).toBe(ts);
  });

  test('extractedAt defaults to a valid ISO string when not provided', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    expect(() => new Date(blueprint.extractedAt)).not.toThrow();
  });
});

describe('extractSASBlueprint — determinism', () => {
  test('same XML input always produces byte-identical JSON output', () => {
    const xml = buildSasXml();
    const ts  = '2026-01-01T00:00:00.000Z';
    const opts = { blueprintId: 'SAS-STABLE', sourceExport: 'Summer_SAS.xml', extractedAt: ts };

    const run1 = JSON.stringify(extractSASBlueprint(xml, opts));
    const run2 = JSON.stringify(extractSASBlueprint(xml, opts));
    const run3 = JSON.stringify(extractSASBlueprint(xml, opts));

    expect(run1).toBe(run2);
    expect(run2).toBe(run3);
  });
});

describe('extractSASBlueprint — editable/frozen separation guarantees', () => {
  test('frozenStructure never contains promotionId', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    blueprint.promotionSlots.forEach(slot => {
      expect(slot.frozenStructure).not.toHaveProperty('promotionId');
    });
  });

  test('frozenStructure never contains name text values', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    blueprint.promotionSlots.forEach(slot => {
      expect(slot.frozenStructure).not.toHaveProperty('names');
    });
  });

  test('frozenStructure never contains discount numeric values', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    blueprint.promotionSlots.forEach(slot => {
      expect(slot.frozenStructure).not.toHaveProperty('simpleDiscountValue');
    });
  });

  test('editableFields never contains flag booleans', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    blueprint.promotionSlots.forEach(slot => {
      expect(slot.editableFields).not.toHaveProperty('enabledFlag');
      expect(slot.editableFields).not.toHaveProperty('archivedFlag');
      expect(slot.editableFields).not.toHaveProperty('exclusivity');
    });
  });

  test('editableFields never contains product condition structures', () => {
    const xml = buildSasXml();
    const blueprint = extractSASBlueprint(xml);
    blueprint.promotionSlots.forEach(slot => {
      expect(slot.editableFields).not.toHaveProperty('qualifyingProducts');
      expect(slot.editableFields).not.toHaveProperty('discountedProducts');
    });
  });
});
