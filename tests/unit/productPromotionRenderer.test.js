'use strict';

// Tests verify that renderProductPromotion produces XML that matches the structure
// observed in real SFCC promotion exports.
//
// Source of truth: 2018-April-VIP-Email-Promo-Bday.xml, 2018-THANKS-TEST.xml
//
// Canonical discount schema: discounts[] — the ONLY accepted field.
// discountTiers is the old field name and is explicitly rejected.

const { renderProductPromotion } = require('../../src/services/productPromotionRenderer');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

// Minimal valid product promotion — price gate + single percentage discount
// Mirrors 2018-THANKS-TEST.xml structure
const PRICE_GATE_PERCENTAGE = {
  promotionId:        '2018-THANKS-TEST',
  name:               'THANKS TEST',
  exclusivity:        'class',
  qualifyingProducts: { type: 'price' },
  discounts: [
    { threshold: 0.01, discountType: 'percentage', discountValue: 30 },
  ],
};

// Amount discount with category qualifying, max-applications, callout, archived
// Mirrors 2018-April-VIP-Email-Promo-Bday.xml structure
const CATEGORY_AMOUNT_MAX = {
  promotionId:        'birthday-promo',
  name:               'Birthday',
  exclusivity:        'class',
  archivedFlag:       true,
  calloutMsg:         'Birthday discount — one-time use only',
  qualifyingProducts: {
    type:        'category',
    categoryIds: ['shoes', 'handbags'],
  },
  discounts: [
    { threshold: 50, discountType: 'amount', discountValue: 50 },
  ],
  maxApplications: 1,
};

// Tiered discounts — multiple discount objects in the discounts[] array
const TIERED_PRODUCT = {
  promotionId:        'tiered-product',
  name:               'Tiered Product Promo',
  exclusivity:        'no',
  qualifyingProducts: { type: 'price' },
  discounts: [
    { threshold: 100, discountType: 'percentage', discountValue: 10 },
    { threshold: 200, discountType: 'percentage', discountValue: 20 },
    { threshold: 300, discountType: 'percentage', discountValue: 30 },
  ],
};

// ─── 1. Document structure ────────────────────────────────────────────────────

describe('document structure', () => {
  let xml;
  beforeEach(() => { xml = renderProductPromotion(PRICE_GATE_PERCENTAGE); });

  it('starts with XML 1.0 UTF-8 declaration', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('includes SFCC promotions namespace', () => {
    expect(xml).toContain('xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31"');
  });

  it('contains global-promotion-settings block', () => {
    expect(xml).toContain('<global-promotion-settings>');
    expect(xml).toContain('</global-promotion-settings>');
  });

  it('contains promotion block', () => {
    expect(xml).toContain('<promotion promotion-id=');
    expect(xml).toContain('</promotion>');
  });

  it('closes promotions tag', () => {
    expect(xml.trimEnd().endsWith('</promotions>')).toBe(true);
  });

  it('global-promotion-settings appears before promotion block', () => {
    const settingsPos  = xml.indexOf('<global-promotion-settings>');
    const promotionPos = xml.indexOf('<promotion ');
    expect(settingsPos).toBeLessThan(promotionPos);
  });
});

// ─── 2. Global promotion settings (static boilerplate) ───────────────────────

describe('global-promotion-settings boilerplate', () => {
  let xml;
  beforeEach(() => { xml = renderProductPromotion(PRICE_GATE_PERCENTAGE); });

  it('contains Exclusions-Always global exclusion', () => {
    expect(xml).toContain('<category-id>Exclusions-Always</category-id>');
  });

  it('contains accessories-seedbox-foundation global exclusion', () => {
    expect(xml).toContain('<category-id>accessories-seedbox-foundation</category-id>');
  });

  it('contains accessories-masks global exclusion', () => {
    expect(xml).toContain('<category-id>accessories-masks</category-id>');
  });

  it('contains monogramming excluded product option', () => {
    expect(xml).toContain('<product-option-id>monogramming</product-option-id>');
  });

  it('global exclusion category-conditions reference siteCatalog_ToryUS', () => {
    const settingsBlock = xml.slice(
      xml.indexOf('<global-promotion-settings>'),
      xml.indexOf('</global-promotion-settings>'),
    );
    expect(settingsBlock).toContain('catalog-id="siteCatalog_ToryUS"');
  });

  it('global-excluded-products structure uses included-products/condition-group nesting', () => {
    expect(xml).toContain('<global-excluded-products>');
    expect(xml).toContain('<included-products>');
    expect(xml).toContain('<condition-group>');
    expect(xml).toContain('</condition-group>');
    expect(xml).toContain('</included-products>');
    expect(xml).toContain('</global-excluded-products>');
  });
});

// ─── 3. Mandatory promotion flags ────────────────────────────────────────────

describe('mandatory promotion flags', () => {
  it('renders enabled-flag true by default (no enabledFlag supplied)', () => {
    const xml = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    expect(xml).toContain('<enabled-flag>true</enabled-flag>');
  });

  it('renders enabled-flag false when enabledFlag: false', () => {
    const xml = renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, enabledFlag: false });
    expect(xml).toContain('<enabled-flag>false</enabled-flag>');
  });

  it('renders archived-flag false by default', () => {
    const xml = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    expect(xml).toContain('<archived-flag>false</archived-flag>');
  });

  it('renders archived-flag true when archivedFlag: true', () => {
    const xml = renderProductPromotion(CATEGORY_AMOUNT_MAX);
    expect(xml).toContain('<archived-flag>true</archived-flag>');
  });

  it('renders searchable-flag false by default', () => {
    const xml = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    expect(xml).toContain('<searchable-flag>false</searchable-flag>');
  });

  it('renders searchable-flag true when searchableFlag: true', () => {
    const xml = renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, searchableFlag: true });
    expect(xml).toContain('<searchable-flag>true</searchable-flag>');
  });

  it('always renders refinable-flag false', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).toContain('<refinable-flag>false</refinable-flag>');
    expect(renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, refinableFlag: true })).toContain('<refinable-flag>false</refinable-flag>');
  });

  it('always renders prevent-requalifying-flag false', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).toContain('<prevent-requalifying-flag>false</prevent-requalifying-flag>');
  });

  it('always renders prorate-across-eligible-items-flag false', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).toContain('<prorate-across-eligible-items-flag>false</prorate-across-eligible-items-flag>');
  });

  it('renders exclusivity', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).toContain('<exclusivity>class</exclusivity>');
  });

  it('renders name with xml:lang attribute', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).toContain('<name xml:lang="x-default">THANKS TEST</name>');
  });
});

// ─── 4. Flag ordering matches real export order ───────────────────────────────

describe('flag node order matches real export order', () => {
  let xml;
  beforeEach(() => { xml = renderProductPromotion(PRICE_GATE_PERCENTAGE); });

  it('enabled-flag appears before archived-flag', () => {
    expect(xml.indexOf('<enabled-flag>')).toBeLessThan(xml.indexOf('<archived-flag>'));
  });

  it('archived-flag appears before searchable-flag', () => {
    expect(xml.indexOf('<archived-flag>')).toBeLessThan(xml.indexOf('<searchable-flag>'));
  });

  it('searchable-flag appears before refinable-flag', () => {
    expect(xml.indexOf('<searchable-flag>')).toBeLessThan(xml.indexOf('<refinable-flag>'));
  });

  it('refinable-flag appears before prevent-requalifying-flag', () => {
    expect(xml.indexOf('<refinable-flag>')).toBeLessThan(xml.indexOf('<prevent-requalifying-flag>'));
  });

  it('prevent-requalifying-flag appears before prorate-across-eligible-items-flag', () => {
    expect(xml.indexOf('<prevent-requalifying-flag>')).toBeLessThan(xml.indexOf('<prorate-across-eligible-items-flag>'));
  });

  it('prorate flag appears before exclusivity', () => {
    expect(xml.indexOf('<prorate-across-eligible-items-flag>')).toBeLessThan(xml.indexOf('<exclusivity>'));
  });

  it('exclusivity appears before name', () => {
    expect(xml.indexOf('<exclusivity>')).toBeLessThan(xml.indexOf('<name '));
  });

  it('name appears before custom-attributes', () => {
    expect(xml.indexOf('<name ')).toBeLessThan(xml.indexOf('<custom-attributes>'));
  });

  it('custom-attributes appears before product-promotion-rule', () => {
    expect(xml.indexOf('<custom-attributes>')).toBeLessThan(xml.indexOf('<product-promotion-rule>'));
  });
});

// ─── 5. Promotion identity ────────────────────────────────────────────────────

describe('promotion identity', () => {
  it('sets promotion-id attribute', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).toContain('promotion-id="2018-THANKS-TEST"');
  });

  it('renders name content', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).toContain('>THANKS TEST</name>');
  });
});

// ─── 6. Optional: callout message ─────────────────────────────────────────────

describe('callout-msg', () => {
  it('renders callout-msg when calloutMsg is supplied', () => {
    const xml = renderProductPromotion(CATEGORY_AMOUNT_MAX);
    expect(xml).toContain('<callout-msg xml:lang="x-default">Birthday discount — one-time use only</callout-msg>');
  });

  it('omits callout-msg when not supplied', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).not.toContain('<callout-msg');
  });

  it('callout-msg appears between name and custom-attributes', () => {
    const xml = renderProductPromotion(CATEGORY_AMOUNT_MAX);
    expect(xml.indexOf('<callout-msg')).toBeGreaterThan(xml.indexOf('<name '));
    expect(xml.indexOf('<callout-msg')).toBeLessThan(xml.indexOf('<custom-attributes>'));
  });
});

// ─── 7. Custom attributes ─────────────────────────────────────────────────────

describe('custom-attributes', () => {
  let xml;
  beforeEach(() => { xml = renderProductPromotion(PRICE_GATE_PERCENTAGE); });

  it('renders custom-attributes block', () => {
    expect(xml).toContain('<custom-attributes>');
    expect(xml).toContain('</custom-attributes>');
  });

  it('renders gwp attribute as false', () => {
    expect(xml).toContain('<custom-attribute attribute-id="gwp">false</custom-attribute>');
  });

  it('renders isExcludeTranslate attribute as false', () => {
    expect(xml).toContain('<custom-attribute attribute-id="isExcludeTranslate">false</custom-attribute>');
  });
});

// ─── 8. Product-promotion-rule element ────────────────────────────────────────

describe('product-promotion-rule element', () => {
  let xml;
  beforeEach(() => { xml = renderProductPromotion(PRICE_GATE_PERCENTAGE); });

  it('renders <product-promotion-rule> — the exact element name from real exports', () => {
    expect(xml).toContain('<product-promotion-rule>');
    expect(xml).toContain('</product-promotion-rule>');
  });

  it('qualifying-products appears before discounts inside product-promotion-rule', () => {
    const ruleBlock = xml.slice(
      xml.indexOf('<product-promotion-rule>'),
      xml.indexOf('</product-promotion-rule>'),
    );
    expect(ruleBlock.indexOf('<qualifying-products>')).toBeLessThan(ruleBlock.indexOf('<discounts'));
  });
});

// ─── 9. Price-condition qualifying products ───────────────────────────────────

describe('price-condition qualifying products', () => {
  let xml;
  beforeEach(() => { xml = renderProductPromotion(PRICE_GATE_PERCENTAGE); });

  it('renders qualifying-products wrapper', () => {
    expect(xml).toContain('<qualifying-products>');
    expect(xml).toContain('</qualifying-products>');
  });

  it('qualifying-products uses included-products/condition-group nesting — matches export', () => {
    expect(xml).toContain('<included-products>');
    expect(xml).toContain('<condition-group>');
  });

  it('renders price-condition with operator="greater than"', () => {
    expect(xml).toContain('<price-condition operator="greater than">');
  });

  it('renders price value 0.01 inside price-condition', () => {
    expect(xml).toContain('<price>0.01</price>');
  });

  it('price-condition is inside condition-group which is inside included-products', () => {
    const qualBlock = xml.slice(
      xml.indexOf('<qualifying-products>'),
      xml.indexOf('</qualifying-products>'),
    );
    expect(qualBlock).toContain('<included-products>');
    expect(qualBlock).toContain('<condition-group>');
    expect(qualBlock).toContain('<price-condition operator="greater than">');
    expect(qualBlock).toContain('<price>0.01</price>');
  });
});

// ─── 10. Category-condition qualifying products ───────────────────────────────

describe('category-condition qualifying products', () => {
  let xml;
  beforeEach(() => { xml = renderProductPromotion(CATEGORY_AMOUNT_MAX); });

  it('renders qualifying-products wrapper', () => {
    expect(xml).toContain('<qualifying-products>');
  });

  it('renders category-condition with catalog-id="siteCatalog_ToryUS" and operator="is equal"', () => {
    expect(xml).toContain('<category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">');
  });

  it('renders each category-id as a separate element', () => {
    expect(xml).toContain('<category-id>shoes</category-id>');
    expect(xml).toContain('<category-id>handbags</category-id>');
  });

  it('category-condition is inside included-products/condition-group nesting', () => {
    const qualBlock = xml.slice(
      xml.indexOf('<qualifying-products>'),
      xml.indexOf('</qualifying-products>'),
    );
    const cgStart  = qualBlock.indexOf('<condition-group>');
    const catStart = qualBlock.indexOf('<category-condition');
    const cgEnd    = qualBlock.indexOf('</condition-group>');
    expect(cgStart).toBeGreaterThan(-1);
    expect(catStart).toBeGreaterThan(cgStart);
    expect(catStart).toBeLessThan(cgEnd);
  });

  it('renders all supplied category IDs — none lost', () => {
    const xml3 = renderProductPromotion({
      ...CATEGORY_AMOUNT_MAX,
      qualifyingProducts: {
        type:        'category',
        categoryIds: ['shoes', 'handbags', 'Sale-viewAll'],
      },
    });
    expect(xml3).toContain('<category-id>shoes</category-id>');
    expect(xml3).toContain('<category-id>handbags</category-id>');
    expect(xml3).toContain('<category-id>Sale-viewAll</category-id>');
    expect((xml3.match(/<category-id>[^<]+<\/category-id>/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('accepts explicit catalogId override', () => {
    const xml2 = renderProductPromotion({
      ...CATEGORY_AMOUNT_MAX,
      qualifyingProducts: {
        type:       'category',
        catalogId:  'siteCatalog_ToryEU',
        categoryIds: ['shoes'],
      },
    });
    expect(xml2).toContain('catalog-id="siteCatalog_ToryEU"');
  });

  it('defaults catalogId to siteCatalog_ToryUS when not supplied', () => {
    expect(xml).toContain('catalog-id="siteCatalog_ToryUS"');
  });
});

// ─── 11. Discounts block structure ────────────────────────────────────────────

describe('discounts block structure', () => {
  it('discounts element uses condition-type="product-amount" — exact value from exports', () => {
    const xml = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    expect(xml).toContain('<discounts condition-type="product-amount">');
  });

  it('threshold lives inside <discount>, not in a separate <condition> wrapper', () => {
    const xml = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    const discountBlock = xml.slice(xml.indexOf('<discount>'), xml.indexOf('</discount>'));
    expect(discountBlock).toContain('<threshold>');
    expect(xml).not.toContain('<condition>');
    expect(xml).not.toContain('<subtotal-condition');
  });

  it('threshold value is rendered as supplied', () => {
    const xml = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    expect(xml).toContain('<threshold>0.01</threshold>');
  });

  it('percentage discount renders as <percentage> — matching export node name', () => {
    const xml = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    expect(xml).toContain('<percentage>30</percentage>');
  });

  it('amount discount renders as <amount> — NOT <fixed-price>', () => {
    const xml = renderProductPromotion(CATEGORY_AMOUNT_MAX);
    expect(xml).toContain('<amount>50</amount>');
    expect(xml).not.toContain('<fixed-price');
  });

  it('<threshold> appears before the discount value node inside <discount>', () => {
    const xml    = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    const dStart = xml.indexOf('<discount>');
    const thPos  = xml.indexOf('<threshold>', dStart);
    const pctPos = xml.indexOf('<percentage>', dStart);
    expect(thPos).toBeGreaterThan(dStart);
    expect(thPos).toBeLessThan(pctPos);
  });
});

// ─── 12. discounts[] — single and multiple entries ───────────────────────────

describe('discounts[] array — single and multiple entries', () => {
  it('single-entry discounts[] renders one <discount> element', () => {
    const xml = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    expect((xml.match(/<discount>/g) || []).length).toBe(1);
  });

  it('multi-entry discounts[] renders one <discount> per entry — all entries rendered', () => {
    const xml   = renderProductPromotion(TIERED_PRODUCT);
    const count = (xml.match(/<discount>/g) || []).length;
    expect(count).toBe(3);
  });

  it('each entry has its own threshold inside its own <discount>', () => {
    const xml = renderProductPromotion(TIERED_PRODUCT);
    expect(xml).toContain('<threshold>100</threshold>');
    expect(xml).toContain('<threshold>200</threshold>');
    expect(xml).toContain('<threshold>300</threshold>');
  });

  it('each entry has its own discount value', () => {
    const xml = renderProductPromotion(TIERED_PRODUCT);
    expect(xml).toContain('<percentage>10</percentage>');
    expect(xml).toContain('<percentage>20</percentage>');
    expect(xml).toContain('<percentage>30</percentage>');
  });

  it('all <discount> elements are siblings inside one <discounts> block', () => {
    const xml            = renderProductPromotion(TIERED_PRODUCT);
    const discountsStart = xml.indexOf('<discounts ');
    const discountsEnd   = xml.indexOf('</discounts>');
    const count          = (xml.slice(discountsStart, discountsEnd).match(/<discount>/g) || []).length;
    expect(count).toBe(3);
  });

  it('all entries use condition-type="product-amount"', () => {
    const xml = renderProductPromotion(TIERED_PRODUCT);
    expect(xml).toContain('<discounts condition-type="product-amount">');
    expect((xml.match(/<discounts /g) || []).length).toBe(1);
  });

  it('supports amount discount type in discounts[]', () => {
    const xml = renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 100, discountType: 'amount', discountValue: 10 }],
    });
    expect(xml).toContain('<amount>10</amount>');
  });

  it('supports mixed discountTypes across entries', () => {
    const xml = renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [
        { threshold: 100, discountType: 'percentage', discountValue: 10 },
        { threshold: 200, discountType: 'amount',     discountValue: 20 },
      ],
    });
    expect(xml).toContain('<percentage>10</percentage>');
    expect(xml).toContain('<amount>20</amount>');
  });
});

// ─── 13. discountTiers is explicitly rejected ──────────────────────────────────

describe('discountTiers is rejected — canonical field is discounts[]', () => {
  it('throws when discountTiers is supplied instead of discounts', () => {
    expect(() => renderProductPromotion({
      promotionId:        'test',
      name:               'Test',
      exclusivity:        'no',
      qualifyingProducts: { type: 'price' },
      discountTiers: [
        { threshold: 100, discountType: 'percentage', discountValue: 10 },
      ],
    })).toThrow('"discounts"');
  });

  it('throws when both discountTiers and discounts are absent', () => {
    expect(() => renderProductPromotion({
      promotionId:        'test',
      name:               'Test',
      exclusivity:        'no',
      qualifyingProducts: { type: 'price' },
    })).toThrow('"discounts"');
  });

  it('does not fall back to discountTiers when discounts is missing', () => {
    const input = {
      promotionId:        'test',
      name:               'Test',
      exclusivity:        'no',
      qualifyingProducts: { type: 'price' },
      discountTiers:      [{ threshold: 0, discountType: 'percentage', discountValue: 20 }],
    };
    expect(() => renderProductPromotion(input)).toThrow();
    // Must NOT silently succeed by reading discountTiers
    let xml;
    try { xml = renderProductPromotion(input); } catch (_) {}
    expect(xml).toBeUndefined();
  });
});

// ─── 14. Optional: max-applications ──────────────────────────────────────────

describe('max-applications', () => {
  it('renders max-applications when supplied', () => {
    const xml = renderProductPromotion(CATEGORY_AMOUNT_MAX);
    expect(xml).toContain('<max-applications>1</max-applications>');
  });

  it('omits max-applications when not supplied', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).not.toContain('<max-applications>');
  });

  it('max-applications appears after discounts inside product-promotion-rule', () => {
    const xml      = renderProductPromotion(CATEGORY_AMOUNT_MAX);
    const ruleBody = xml.slice(
      xml.indexOf('<product-promotion-rule>'),
      xml.indexOf('</product-promotion-rule>'),
    );
    expect(ruleBody.indexOf('<discounts')).toBeLessThan(ruleBody.indexOf('<max-applications>'));
  });
});

// ─── 15. Prohibited nodes ─────────────────────────────────────────────────────

describe('prohibited nodes — absent from all real exports', () => {
  const inputs = [PRICE_GATE_PERCENTAGE, CATEGORY_AMOUNT_MAX, TIERED_PRODUCT];

  inputs.forEach((input, idx) => {
    describe(`fixture ${idx + 1}`, () => {
      let xml;
      beforeEach(() => { xml = renderProductPromotion(input); });

      it('does NOT render <product-rule> (old incorrect element name)', () => {
        expect(xml).not.toContain('<product-rule>');
        expect(xml).not.toContain('</product-rule>');
      });

      it('does NOT render <rule> wrapper', () => {
        expect(xml).not.toContain('<rule>');
        expect(xml).not.toContain('</rule>');
      });

      it('does NOT render <promotion-class> (invented node)', () => {
        expect(xml).not.toContain('<promotion-class>');
      });

      it('does NOT render <campaign-id> inside promotion', () => {
        const promoBlock = xml.slice(xml.indexOf('<promotion '), xml.indexOf('</promotion>'));
        expect(promoBlock).not.toContain('<campaign-id>');
      });

      it('does NOT render <schedule> inside promotion', () => {
        const promoBlock = xml.slice(xml.indexOf('<promotion '), xml.indexOf('</promotion>'));
        expect(promoBlock).not.toContain('<schedule>');
      });

      it('does NOT render <customer-groups> inside promotion', () => {
        const promoBlock = xml.slice(xml.indexOf('<promotion '), xml.indexOf('</promotion>'));
        expect(promoBlock).not.toContain('<customer-groups');
      });

      it('does NOT render <coupons> inside promotion', () => {
        const promoBlock = xml.slice(xml.indexOf('<promotion '), xml.indexOf('</promotion>'));
        expect(promoBlock).not.toContain('<coupons>');
      });

      it('does NOT render <fixed-price> (incorrect discount node name)', () => {
        expect(xml).not.toContain('<fixed-price');
      });

      it('does NOT render <tiered-discount> wrapper (incorrect tier structure)', () => {
        expect(xml).not.toContain('<tiered-discount>');
      });

      it('does NOT render <tier> element (incorrect tier structure)', () => {
        expect(xml).not.toContain('<tier>');
      });

      it('does NOT render <free-shipping/> (shipping-only node)', () => {
        expect(xml).not.toContain('<free-shipping');
      });

      it('does NOT render <order-promotion-rule>', () => {
        expect(xml).not.toContain('<order-promotion-rule>');
      });

      it('does NOT render <shipping-promotion-rule>', () => {
        expect(xml).not.toContain('<shipping-promotion-rule>');
      });
    });
  });
});

// ─── 16. XML character escaping ───────────────────────────────────────────────

describe('XML character escaping', () => {
  it('escapes & in name', () => {
    const xml = renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, name: 'Summer & Fall' });
    expect(xml).toContain('Summer &amp; Fall');
    expect(xml).not.toContain('Summer & Fall');
  });

  it('escapes < and > in name', () => {
    const xml = renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, name: 'Buy <X> Get Y' });
    expect(xml).toContain('Buy &lt;X&gt; Get Y');
  });

  it('escapes " in promotionId attribute', () => {
    const xml = renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, promotionId: 'promo"id' });
    expect(xml).toContain('promotion-id="promo&quot;id"');
  });

  it('escapes & in calloutMsg', () => {
    const xml = renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, calloutMsg: 'Save 20% on shoes & bags' });
    expect(xml).toContain('Save 20% on shoes &amp; bags');
  });

  it('escapes special chars in category-id', () => {
    const xml = renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      qualifyingProducts: { type: 'category', categoryIds: ['shoes&bags'] },
    });
    expect(xml).toContain('<category-id>shoes&amp;bags</category-id>');
  });

  it('escapes & in exclusivity (defensive)', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, exclusivity: 'no&bad' }))
      .toThrow('exclusivity');
  });
});

// ─── 17. Validation — required fields ─────────────────────────────────────────

describe('validation: required fields', () => {
  it('throws for null input', () => {
    expect(() => renderProductPromotion(null)).toThrow('non-null object');
  });

  it('throws for array input', () => {
    expect(() => renderProductPromotion([])).toThrow();
  });

  it('throws for missing promotionId', () => {
    const { promotionId: _, ...rest } = PRICE_GATE_PERCENTAGE;
    expect(() => renderProductPromotion(rest)).toThrow('"promotionId"');
  });

  it('throws for empty-string promotionId', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, promotionId: '' }))
      .toThrow('"promotionId"');
  });

  it('throws for missing name', () => {
    const { name: _, ...rest } = PRICE_GATE_PERCENTAGE;
    expect(() => renderProductPromotion(rest)).toThrow('"name"');
  });

  it('throws for missing exclusivity', () => {
    const { exclusivity: _, ...rest } = PRICE_GATE_PERCENTAGE;
    expect(() => renderProductPromotion(rest)).toThrow('exclusivity');
  });

  it('throws for invalid exclusivity value', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, exclusivity: 'only' }))
      .toThrow('exclusivity');
  });

  it('accepts all valid exclusivity values', () => {
    ['no', 'class', 'global'].forEach(ex => {
      expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, exclusivity: ex }))
        .not.toThrow();
    });
  });

  it('throws for missing qualifyingProducts', () => {
    const { qualifyingProducts: _, ...rest } = PRICE_GATE_PERCENTAGE;
    expect(() => renderProductPromotion(rest)).toThrow('"qualifyingProducts"');
  });

  it('throws for unknown qualifyingProducts type', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      qualifyingProducts: { type: 'range' },
    })).toThrow('"qualifyingProducts.type"');
  });

  it('throws when category type has empty categoryIds', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      qualifyingProducts: { type: 'category', categoryIds: [] },
    })).toThrow('"qualifyingProducts.categoryIds"');
  });

  it('throws when category type has no categoryIds', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      qualifyingProducts: { type: 'category' },
    })).toThrow('"qualifyingProducts.categoryIds"');
  });
});

// ─── 18. Validation — discounts[] field ───────────────────────────────────────

describe('validation: discounts[] field', () => {
  it('throws when discounts is missing entirely', () => {
    const { discounts: _, ...rest } = PRICE_GATE_PERCENTAGE;
    expect(() => renderProductPromotion(rest)).toThrow('"discounts"');
  });

  it('throws when discounts is an empty array', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, discounts: [] }))
      .toThrow('"discounts"');
  });

  it('throws when discounts is not an array', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, discounts: {} }))
      .toThrow('"discounts"');
  });

  it('throws when discounts is null', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, discounts: null }))
      .toThrow('"discounts"');
  });

  it('throws when discounts[0].threshold is not a number', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: '50', discountType: 'percentage', discountValue: 20 }],
    })).toThrow('discounts[0].threshold');
  });

  it('throws when discounts[0].threshold is missing', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ discountType: 'percentage', discountValue: 20 }],
    })).toThrow('discounts[0].threshold');
  });

  it('throws when discounts[0].discountType is invalid', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 0.01, discountType: 'free-shipping', discountValue: 0 }],
    })).toThrow('discounts[0].discountType');
  });

  it('throws when discounts[0].discountType is missing', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 0.01, discountValue: 20 }],
    })).toThrow('discounts[0].discountType');
  });

  it('throws when discounts[0].discountValue is not a number', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 0.01, discountType: 'percentage', discountValue: '20' }],
    })).toThrow('discounts[0].discountValue');
  });

  it('throws when discounts[0].discountValue is missing', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 0.01, discountType: 'percentage' }],
    })).toThrow('discounts[0].discountValue');
  });

  it('error message includes the correct index for second tier violation', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [
        { threshold: 100, discountType: 'percentage', discountValue: 10 },
        { threshold: 'big', discountType: 'percentage', discountValue: 20 },
      ],
    })).toThrow('discounts[1].threshold');
  });

  it('accepts both valid discountType values in discounts[]', () => {
    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 0.01, discountType: 'percentage', discountValue: 20 }],
    })).not.toThrow();

    expect(() => renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 0.01, discountType: 'amount', discountValue: 20 }],
    })).not.toThrow();
  });
});

// ─── 19. Validation — optional field constraints ──────────────────────────────

describe('validation: optional field constraints', () => {
  it('throws when maxApplications is 0', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, maxApplications: 0 }))
      .toThrow('"maxApplications"');
  });

  it('throws when maxApplications is a float', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, maxApplications: 1.5 }))
      .toThrow('"maxApplications"');
  });

  it('throws when maxApplications is negative', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, maxApplications: -1 }))
      .toThrow('"maxApplications"');
  });

  it('accepts maxApplications of 1 or greater', () => {
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, maxApplications: 1 })).not.toThrow();
    expect(() => renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, maxApplications: 5 })).not.toThrow();
  });
});

// ─── 20. Deterministic output ─────────────────────────────────────────────────

describe('deterministic output', () => {
  it('produces byte-identical output on repeated calls with the same input', () => {
    expect(renderProductPromotion(PRICE_GATE_PERCENTAGE)).toBe(renderProductPromotion(PRICE_GATE_PERCENTAGE));
  });

  it('produces byte-identical output for complex promotion on repeated calls', () => {
    expect(renderProductPromotion(CATEGORY_AMOUNT_MAX)).toBe(renderProductPromotion(CATEGORY_AMOUNT_MAX));
  });

  it('produces byte-identical output for tiered promotion on repeated calls', () => {
    expect(renderProductPromotion(TIERED_PRODUCT)).toBe(renderProductPromotion(TIERED_PRODUCT));
  });

  it('produces different output for different promotion IDs', () => {
    const a = renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, promotionId: 'promo-a' });
    const b = renderProductPromotion({ ...PRICE_GATE_PERCENTAGE, promotionId: 'promo-b' });
    expect(a).not.toBe(b);
  });

  it('produces different output for different discount types', () => {
    const pct = renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 0.01, discountType: 'percentage', discountValue: 20 }],
    });
    const amt = renderProductPromotion({
      ...PRICE_GATE_PERCENTAGE,
      discounts: [{ threshold: 0.01, discountType: 'amount', discountValue: 20 }],
    });
    expect(pct).not.toBe(amt);
  });

  it('produces different output when number of discounts[] entries differs', () => {
    const one   = renderProductPromotion(PRICE_GATE_PERCENTAGE);
    const three = renderProductPromotion(TIERED_PRODUCT);
    expect(one).not.toBe(three);
  });
});
