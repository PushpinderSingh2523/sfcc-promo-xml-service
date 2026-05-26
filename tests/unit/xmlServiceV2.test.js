'use strict';

const { buildDocument } = require('../../src/services/xmlServiceV2');

const NS = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasTag(xml, tag) {
  return xml.includes(`<${tag}`) || xml.includes(`<${tag}>`);
}

function tagValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m ? m[1] : null;
}

function attrValue(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`));
  return m ? m[1] : null;
}

function countOccurrences(xml, str) {
  return (xml.match(new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const globalSettings = {
  catalogId: 'siteCatalog_ToryUS',
  excludedCategoryIds: ['Exclusions-Always', 'accessories-seedbox-foundation', 'accessories-masks'],
  excludedProductOptionIds: ['monogramming'],
};

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('xmlServiceV2.buildDocument', () => {
  // ── Common output shape ───────────────────────────────────────────────────

  test('output starts with XML declaration and promotions root', () => {
    const xml = buildDocument({
      globalSettings,
      promotion: {
        id: 'test-promo',
        name: 'Test',
        lifecycle: { enabled: true },
        exclusivity: 'no',
        ruleType: 'order',
        discountConditionType: 'order-total',
        discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 10 }],
      },
    });
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain(`xmlns="${NS}"`);
    expect(xml).toContain('<promotions');
  });

  // ── Block 1: GlobalPromotionSettings ─────────────────────────────────────

  describe('Block 1 — GlobalPromotionSettings', () => {
    let xml;
    beforeAll(() => {
      xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
    });

    test('contains global-promotion-settings element', () => {
      expect(hasTag(xml, 'global-promotion-settings')).toBe(true);
    });

    test('emits one condition-group per excluded category', () => {
      expect(countOccurrences(xml, '<condition-group>')).toBe(3);
    });

    test('excluded category IDs are present', () => {
      expect(xml).toContain('<category-id>Exclusions-Always</category-id>');
      expect(xml).toContain('<category-id>accessories-seedbox-foundation</category-id>');
      expect(xml).toContain('<category-id>accessories-masks</category-id>');
    });

    test('catalog-id attribute is set on each category-condition', () => {
      expect(countOccurrences(xml, 'catalog-id="siteCatalog_ToryUS"')).toBeGreaterThanOrEqual(3);
    });

    test('global-excluded-product-options contains monogramming', () => {
      expect(xml).toContain('<product-option-id>monogramming</product-option-id>');
    });

    test('defaults are used when globalSettings is omitted', () => {
      const xml2 = buildDocument({
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(xml2).toContain('<category-id>Exclusions-Always</category-id>');
      expect(xml2).toContain('<product-option-id>monogramming</product-option-id>');
    });
  });

  // ── Block 2: Campaign ─────────────────────────────────────────────────────

  describe('Block 2 — Campaign', () => {
    test('campaign block appears before global-promotion-settings', () => {
      const xml = buildDocument({
        globalSettings,
        campaign: { id: 'my-campaign', enabled: true, scope: 'online' },
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      const campaignPos = xml.indexOf('<campaign');
      const settingsPos = xml.indexOf('<global-promotion-settings>');
      expect(campaignPos).toBeGreaterThan(-1);
      expect(campaignPos).toBeLessThan(settingsPos);
    });

    test('campaign-id attribute is set', () => {
      const xml = buildDocument({
        globalSettings,
        campaign: { id: 'vip-2024', enabled: true },
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(attrValue(xml, 'campaign', 'campaign-id')).toBe('vip-2024');
    });

    test('applicable-online is written inside campaign-scope', () => {
      const xml = buildDocument({
        globalSettings,
        campaign: { id: 'c', enabled: true, scope: 'online' },
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(xml).toContain('<applicable-online/>');
    });

    test('campaign with dates and customer-groups (VJTEMP pattern)', () => {
      const xml = buildDocument({
        globalSettings,
        campaign: {
          id: 'handbags-watches',
          enabled: true,
          scope: 'online',
          startDate: '2023-09-15T05:00:00.000Z',
          endDate: '2023-09-20T00:00:00.000Z',
          customerGroups: { matchMode: 'any', groupIds: ['Everyone'] },
        },
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'global',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 500, discountType: 'percentage', discountValue: 10 }],
        },
      });
      expect(xml).toContain('<start-date>2023-09-15T05:00:00.000Z</start-date>');
      expect(xml).toContain('<end-date>2023-09-20T00:00:00.000Z</end-date>');
      expect(xml).toContain('group-id="Everyone"');
      expect(xml).toContain('match-mode="any"');
    });

    test('no campaign block when campaign is omitted', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(hasTag(xml, 'campaign')).toBe(false);
    });
  });

  // ── Block 3: LifecycleFlags ───────────────────────────────────────────────

  describe('Block 3 — LifecycleFlags', () => {
    test('all six flags are present', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P',
          lifecycle: {
            enabled: true, archived: false, searchable: false,
            refinable: false, preventRequalifying: false, prorateAcrossEligibleItems: false,
          },
          exclusivity: 'no', ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(xml).toContain('<enabled-flag>true</enabled-flag>');
      expect(xml).toContain('<archived-flag>false</archived-flag>');
      expect(xml).toContain('<searchable-flag>false</searchable-flag>');
      expect(xml).toContain('<refinable-flag>false</refinable-flag>');
      expect(xml).toContain('<prevent-requalifying-flag>false</prevent-requalifying-flag>');
      expect(xml).toContain('<prorate-across-eligible-items-flag>false</prorate-across-eligible-items-flag>');
    });

    test('archived=true is reflected', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P',
          lifecycle: { enabled: true, archived: true },
          exclusivity: 'no', ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(xml).toContain('<archived-flag>true</archived-flag>');
    });
  });

  // ── Block 13: CustomAttributes ────────────────────────────────────────────

  describe('Block 13 — CustomAttributes', () => {
    test('custom-attributes block is written', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
          customAttributes: { gwp: false, isExcludeTranslate: false },
        },
      });
      expect(xml).toContain('attribute-id="gwp"');
      expect(xml).toContain('attribute-id="isExcludeTranslate"');
    });

    test('attribute values are serialized as strings', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
          customAttributes: { gwp: false },
        },
      });
      expect(xml).toContain('>false<');
    });

    test('omitted customAttributes produces no custom-attributes element', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(hasTag(xml, 'custom-attributes')).toBe(false);
    });
  });

  // ── Promotion core fields ─────────────────────────────────────────────────

  describe('Promotion core fields', () => {
    test('promotion-id attribute is set', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'birthday-50-off', name: 'Birthday', lifecycle: {}, exclusivity: 'class',
          ruleType: 'product', discountConditionType: 'product-amount',
          discounts: [{ threshold: 50, discountType: 'amount', discountValue: 50 }],
        },
      });
      expect(attrValue(xml, 'promotion', 'promotion-id')).toBe('birthday-50-off');
    });

    test('name element uses xml:lang="x-default"', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'My Promo', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(xml).toContain('<name xml:lang="x-default">My Promo</name>');
    });

    test('callout-msg is written when provided', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', calloutMsg: 'ONE-TIME-USE', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(xml).toContain('<callout-msg xml:lang="x-default">ONE-TIME-USE</callout-msg>');
    });

    test('callout-msg is omitted when not provided', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(hasTag(xml, 'callout-msg')).toBe(false);
    });

    test('exclusivity value is written', () => {
      const xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'global',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      });
      expect(xml).toContain('<exclusivity>global</exclusivity>');
    });
  });

  // ── Product promotion rule ────────────────────────────────────────────────

  describe('Product Promotion Rule', () => {
    let xml;
    beforeAll(() => {
      xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'birthday-50-off',
          name: 'Birthday',
          calloutMsg: 'ONE-TIME-USE-ONLY PROMOTION.',
          lifecycle: { enabled: true, archived: true, searchable: false, refinable: false,
            preventRequalifying: false, prorateAcrossEligibleItems: false },
          exclusivity: 'class',
          ruleType: 'product',
          discountConditionType: 'product-amount',
          discounts: [{ threshold: 50.0, discountType: 'amount', discountValue: 50.0 }],
          qualifyingProducts: {
            conditionGroups: [{ priceCondition: { operator: 'greater than', price: 0.01 } }],
          },
          productRuleOptions: { maxApplications: 1 },
          customAttributes: { gwp: false, isExcludeTranslate: false },
        },
      });
    });

    test('uses product-promotion-rule element', () => {
      expect(hasTag(xml, 'product-promotion-rule')).toBe(true);
    });

    test('qualifying-products / price-condition is present', () => {
      expect(hasTag(xml, 'qualifying-products')).toBe(true);
      expect(hasTag(xml, 'price-condition')).toBe(true);
      expect(xml).toContain('<price>0.01</price>');
    });

    test('discounts condition-type="product-amount"', () => {
      expect(xml).toContain('condition-type="product-amount"');
    });

    test('amount discount with threshold', () => {
      expect(xml).toContain('<threshold>50</threshold>');
      expect(xml).toContain('<amount>50</amount>');
    });

    test('max-applications is written', () => {
      expect(xml).toContain('<max-applications>1</max-applications>');
    });
  });

  // ── Order promotion rule ──────────────────────────────────────────────────

  describe('Order Promotion Rule — Tiered (VJTEMP pattern)', () => {
    let xml;
    beforeAll(() => {
      xml = buildDocument({
        globalSettings,
        campaign: {
          id: 'handbags-watches-tiered-sept-2023',
          enabled: true,
          scope: 'online',
          startDate: '2023-09-15T05:00:00.000Z',
          endDate: '2023-09-20T00:00:00.000Z',
          customerGroups: { matchMode: 'any', groupIds: ['Everyone'] },
        },
        promotion: {
          id: 'VJTEMP2023DTM',
          name: 'Handbags & Watches Tiered Discount September 2023',
          lifecycle: { enabled: false, archived: false, searchable: false, refinable: false,
            preventRequalifying: false, prorateAcrossEligibleItems: false },
          exclusivity: 'global',
          ruleType: 'order',
          discountConditionType: 'order-total',
          discounts: [
            { threshold: 500.0,  discountType: 'percentage', discountValue: 10.0 },
            { threshold: 2000.0, discountType: 'percentage', discountValue: 20.0 },
          ],
          qualifyingProducts: {
            conditionGroups: [{
              categoryCondition: {
                catalogId: 'siteCatalog_ToryUS',
                operator: 'is equal',
                categoryIds: ['handbags', 'watches'],
              },
            }],
          },
          orderRuleOptions: { discountOnlyQualifyingProducts: true, excludeDiscountedProducts: false },
          customAttributes: {
            enableShowingEmptyThresholdBar: false,
            enableShowingFreeShippingLabel: false,
            gwp: false,
            isCouponOnlyActivatesPromotion: false,
            isExcludeTranslate: false,
            isForcedShowingExcludedMessage: false,
          },
        },
        assignment: {
          promotionId: 'VJTEMP2023DTM',
          campaignId: 'handbags-watches-tiered-sept-2023',
          qualifiers: { matchMode: 'any', customerGroupIds: [], sourceCodes: [], qualifierCouponIds: [] },
          activationCoupons: [],
        },
      });
    });

    test('uses order-promotion-rule element', () => {
      expect(hasTag(xml, 'order-promotion-rule')).toBe(true);
    });

    test('category condition includes both category IDs', () => {
      expect(xml).toContain('<category-id>handbags</category-id>');
      expect(xml).toContain('<category-id>watches</category-id>');
    });

    test('discount-only-qualifying-products is true', () => {
      expect(xml).toContain('<discount-only-qualifying-products>true</discount-only-qualifying-products>');
    });

    test('two discount tiers are emitted', () => {
      expect(countOccurrences(xml, '<discount>')).toBe(2);
    });

    test('first tier: threshold=500, percentage=10', () => {
      expect(xml).toContain('<threshold>500</threshold>');
      expect(xml).toContain('<percentage>10</percentage>');
    });

    test('second tier: threshold=2000, percentage=20', () => {
      expect(xml).toContain('<threshold>2000</threshold>');
      expect(xml).toContain('<percentage>20</percentage>');
    });

    test('exclude-discounted-products is false', () => {
      expect(xml).toContain('<exclude-discounted-products>false</exclude-discounted-products>');
    });

    test('condition-type="order-total"', () => {
      expect(xml).toContain('condition-type="order-total"');
    });

    test('assignment block is present', () => {
      expect(hasTag(xml, 'promotion-campaign-assignment')).toBe(true);
      expect(xml).toContain('promotion-id="VJTEMP2023DTM"');
    });
  });

  // ── Shipping promotion rule ───────────────────────────────────────────────

  describe('Shipping Promotion Rule — Free Two-Day (VIP-2024 pattern)', () => {
    let xml;
    beforeAll(() => {
      xml = buildDocument({
        globalSettings,
        campaign: { id: '2024-Free-Two-Day-Shipping', enabled: true, scope: 'online' },
        promotion: {
          id: 'VIP-2024-Free-Two-Day-Shipping',
          name: 'Free 2 Day Shipping',
          calloutMsg: 'Free 2 Day Shipping',
          lifecycle: { enabled: true, archived: false, searchable: false, refinable: false,
            preventRequalifying: false, prorateAcrossEligibleItems: false },
          exclusivity: 'no',
          ruleType: 'shipping',
          discountConditionType: 'shipment-total',
          discounts: [{ threshold: 0.01, discountType: 'free-shipping', discountValue: 0 }],
          qualifyingProducts: {
            conditionGroups: [{ priceCondition: { operator: 'greater than', price: 0.01 } }],
          },
          shippingRuleOptions: {
            methodIds: ['twoday'],
            disableGlobalExcludedProducts: false,
          },
          customAttributes: {
            enableShowingEmptyThresholdBar: false,
            enableShowingFreeShippingLabel: false,
            gwp: false,
            hideDisclaimerMessage: false,
            isCouponOnlyActivatesPromotion: false,
            isExcludeTranslate: false,
            isForcedShowingExcludedMessage: false,
            isShowPrviewOnEmptyCart: false,
            showDisclaimerMessage: false,
          },
        },
        assignment: {
          promotionId: 'VIP-2024-Free-Two-Day-Shipping',
          campaignId: '2024-Free-Two-Day-Shipping',
          rank: 10,
          qualifiers: { matchMode: 'any', customerGroupIds: [], sourceCodes: [], qualifierCouponIds: [] },
          activationCoupons: ['VIP-2024-Free-Two-Day-Shipping'],
          schedule: {
            startDate: '2024-07-06T04:00:00.000Z',
            endDate: '2024-09-30T07:30:00.000Z',
          },
        },
      });
    });

    test('uses shipping-promotion-rule element', () => {
      expect(hasTag(xml, 'shipping-promotion-rule')).toBe(true);
    });

    test('shipping-methods contains twoday', () => {
      expect(xml).toContain('<method-id>twoday</method-id>');
    });

    test('free discount element is emitted (not fixed-price)', () => {
      expect(xml).toContain('<free/>');
      expect(xml).not.toContain('<fixed-price>');
    });

    test('condition-type="shipment-total"', () => {
      expect(xml).toContain('condition-type="shipment-total"');
    });

    test('disable-global-excluded-products is absent when false', () => {
      expect(xml).not.toContain('<disable-global-excluded-products>');
    });

    test('assignment has activation coupon', () => {
      expect(xml).toContain('coupon-id="VIP-2024-Free-Two-Day-Shipping"');
    });

    test('assignment rank is 10', () => {
      expect(xml).toContain('<rank>10</rank>');
    });

    test('assignment schedule start-date and end-date are written', () => {
      expect(xml).toContain('<start-date>2024-07-06T04:00:00.000Z</start-date>');
      expect(xml).toContain('<end-date>2024-09-30T07:30:00.000Z</end-date>');
    });
  });

  describe('Shipping Promotion Rule — Welcome free standard shipping pattern', () => {
    let xml;
    beforeAll(() => {
      xml = buildDocument({
        globalSettings,
        promotion: {
          id: 'Welcome-free-standard-shipping',
          name: 'Welcome: Free Shipping',
          lifecycle: { enabled: true, archived: true, searchable: true, refinable: false,
            preventRequalifying: false, prorateAcrossEligibleItems: false },
          exclusivity: 'class',
          ruleType: 'shipping',
          discountConditionType: 'shipment-total',
          discounts: [{ threshold: 1.0, discountType: 'free-shipping', discountValue: 0 }],
          shippingRuleOptions: {
            methodIds: ['standard-hazmat', 'surepost', 'standard'],
            disableGlobalExcludedProducts: true,
            upsellThreshold: 0.0,
          },
          customAttributes: { gwp: false, isExcludeTranslate: false },
        },
      });
    });

    test('three shipping methods emitted', () => {
      expect(xml).toContain('<method-id>standard-hazmat</method-id>');
      expect(xml).toContain('<method-id>surepost</method-id>');
      expect(xml).toContain('<method-id>standard</method-id>');
    });

    test('disable-global-excluded-products is true', () => {
      expect(xml).toContain('<disable-global-excluded-products>true</disable-global-excluded-products>');
    });

    test('upsell-threshold is 0.0', () => {
      expect(xml).toContain('<upsell-threshold>0</upsell-threshold>');
    });

    test('no campaign element (standalone promotion)', () => {
      expect(hasTag(xml, 'campaign')).toBe(false);
    });

    test('no assignment element (standalone promotion)', () => {
      expect(hasTag(xml, 'promotion-campaign-assignment')).toBe(false);
    });

    test('archived-flag is true', () => {
      expect(xml).toContain('<archived-flag>true</archived-flag>');
    });
  });

  // ── Block 10 / 11 / 12: Assignment detail ────────────────────────────────

  describe('Block 10-12 — Assignment qualifiers', () => {
    test('empty qualifier children produce self-closing-like empty elements', () => {
      const xml = buildDocument({
        globalSettings,
        campaign: { id: 'c', enabled: true },
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
        assignment: {
          promotionId: 'p',
          campaignId: 'c',
          qualifiers: { matchMode: 'any', customerGroupIds: [], sourceCodes: [], qualifierCouponIds: [] },
          activationCoupons: [],
        },
      });
      expect(xml).toContain('<customer-groups/>');
      expect(xml).toContain('<source-codes/>');
    });

    test('non-empty activation coupons are written outside qualifiers', () => {
      const xml = buildDocument({
        globalSettings,
        campaign: { id: 'c', enabled: true },
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
        assignment: {
          promotionId: 'p',
          campaignId: 'c',
          qualifiers: { matchMode: 'any', customerGroupIds: [], sourceCodes: [], qualifierCouponIds: [] },
          activationCoupons: ['MY-COUPON'],
        },
      });
      expect(xml).toContain('coupon-id="MY-COUPON"');
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe('Error handling', () => {
    test('unknown ruleType throws', () => {
      expect(() => buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'unknown',
          discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 5 }],
        },
      })).toThrow(/unknown ruleType/i);
    });

    test('unknown discount discountType throws', () => {
      expect(() => buildDocument({
        globalSettings,
        promotion: {
          id: 'p', name: 'P', lifecycle: {}, exclusivity: 'no',
          ruleType: 'order', discountConditionType: 'order-total',
          discounts: [{ threshold: 0, discountType: 'mystery', discountValue: 5 }],
        },
      })).toThrow(/unknown discount discountType/i);
    });
  });
});
