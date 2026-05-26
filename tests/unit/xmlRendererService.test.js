'use strict';

const { renderPromotionXML } = require('../../src/services/xmlRendererService');

// ─── Shared base fixtures ─────────────────────────────────────────────────────

const ORDER_BASE = {
  promotionType: 'order',
  promotionId:   'order-promo-001',
  name:          'Order Discount',
  campaignId:    'spring-2024',
  discountType:  'percentage',
  discountValue: 10,
};

const PRODUCT_BASE = {
  promotionType: 'product',
  promotionId:   'product-promo-001',
  name:          'Product Discount',
  campaignId:    'spring-2024',
  discountType:  'percentage',
  discountValue: 20,
};

const SHIPPING_BASE = {
  promotionType: 'shipping',
  promotionId:   'shipping-promo-001',
  name:          'Free Shipping',
  campaignId:    'spring-2024',
  discountType:  'free-shipping',
};

// ─── 1. ORDER promotion — correct rule element ────────────────────────────────

describe('order promotion', () => {
  it('uses <order-rule> element — never product-rule or shipping-rule', () => {
    const xml = renderPromotionXML(ORDER_BASE);
    expect(xml).toContain('<order-rule>');
    expect(xml).toContain('</order-rule>');
    expect(xml).not.toContain('product-rule');
    expect(xml).not.toContain('shipping-rule');
  });

  it('sets <promotion-class>order</promotion-class>', () => {
    expect(renderPromotionXML(ORDER_BASE)).toContain('<promotion-class>order</promotion-class>');
  });

  it('renders percentage discount inside order-rule', () => {
    const xml = renderPromotionXML(ORDER_BASE);
    expect(xml).toContain('<percentage>10</percentage>');
  });

  it('renders fixed-price discount inside order-rule', () => {
    const xml = renderPromotionXML({
      ...ORDER_BASE, discountType: 'fixed-price', discountValue: 15, currency: 'USD',
    });
    expect(xml).toContain('<fixed-price currency="USD">15</fixed-price>');
    expect(xml).toContain('<order-rule>');
  });

  it('renders single threshold condition inside order-rule when no tiers', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, threshold: 50, currency: 'USD' });
    expect(xml).toContain('<subtotal-condition operator="greater-than-or-equal">');
    expect(xml).toContain('<amount currency="USD">50</amount>');
    expect(xml).toContain('<order-rule>');
  });
});

// ─── 2. PRODUCT promotion — correct rule element ──────────────────────────────

describe('product promotion', () => {
  it('uses <product-rule> element — never order-rule or shipping-rule', () => {
    const xml = renderPromotionXML(PRODUCT_BASE);
    expect(xml).toContain('<product-rule>');
    expect(xml).toContain('</product-rule>');
    expect(xml).not.toContain('order-rule');
    expect(xml).not.toContain('shipping-rule');
  });

  it('sets <promotion-class>product</promotion-class>', () => {
    expect(renderPromotionXML(PRODUCT_BASE)).toContain('<promotion-class>product</promotion-class>');
  });

  it('renders percentage discount inside product-rule', () => {
    expect(renderPromotionXML(PRODUCT_BASE)).toContain('<percentage>20</percentage>');
  });
});

// ─── 3. SHIPPING promotion — correct rule element ─────────────────────────────

describe('shipping promotion', () => {
  it('uses <shipping-rule> element — never order-rule or product-rule', () => {
    const xml = renderPromotionXML(SHIPPING_BASE);
    expect(xml).toContain('<shipping-rule>');
    expect(xml).toContain('</shipping-rule>');
    expect(xml).not.toContain('order-rule');
    expect(xml).not.toContain('product-rule');
  });

  it('sets <promotion-class>shipping</promotion-class>', () => {
    expect(renderPromotionXML(SHIPPING_BASE)).toContain('<promotion-class>shipping</promotion-class>');
  });

  it('renders <free-shipping/> for free-shipping discountType', () => {
    expect(renderPromotionXML(SHIPPING_BASE)).toContain('<free-shipping/>');
  });

  it('renders percentage discount inside shipping-rule', () => {
    const xml = renderPromotionXML({ ...SHIPPING_BASE, discountType: 'percentage', discountValue: 50 });
    expect(xml).toContain('<percentage>50</percentage>');
    expect(xml).toContain('<shipping-rule>');
  });

  it('renders threshold inside shipping-rule when specified', () => {
    const xml = renderPromotionXML({ ...SHIPPING_BASE, threshold: 75, currency: 'USD' });
    expect(xml).toContain('<shipping-rule>');
    expect(xml).toContain('<amount currency="USD">75</amount>');
  });
});

// ─── 4. Tiered discounts ──────────────────────────────────────────────────────

describe('tiered discounts', () => {
  const TIERS = [
    { threshold: 250, discountType: 'percentage', discountValue: 20 },
    { threshold: 350, discountType: 'percentage', discountValue: 30 },
  ];

  const TIERED_ORDER = {
    promotionType: 'order',
    promotionId:   'tiered-order',
    name:          'Tiered Order Discount',
    campaignId:    'spring-2024',
    currency:      'USD',
    discounts: TIERS,
  };

  it('renders <tiered-discount> wrapper', () => {
    const xml = renderPromotionXML(TIERED_ORDER);
    expect(xml).toContain('<tiered-discount>');
    expect(xml).toContain('</tiered-discount>');
  });

  it('renders every tier — none are lost', () => {
    const xml = renderPromotionXML(TIERED_ORDER);
    const tierCount = (xml.match(/<tier>/g) || []).length;
    expect(tierCount).toBe(2);
  });

  it('renders correct threshold for each tier', () => {
    const xml = renderPromotionXML(TIERED_ORDER);
    expect(xml).toContain('<amount currency="USD">250</amount>');
    expect(xml).toContain('<amount currency="USD">350</amount>');
  });

  it('renders correct discount value for each tier', () => {
    const xml = renderPromotionXML(TIERED_ORDER);
    expect(xml).toContain('<percentage>20</percentage>');
    expect(xml).toContain('<percentage>30</percentage>');
  });

  it('tiers appear inside order-rule for order promotions', () => {
    const xml = renderPromotionXML(TIERED_ORDER);
    const orderRuleStart = xml.indexOf('<order-rule>');
    const tierStart      = xml.indexOf('<tiered-discount>');
    const orderRuleEnd   = xml.indexOf('</order-rule>');
    expect(orderRuleStart).toBeGreaterThan(-1);
    expect(tierStart).toBeGreaterThan(orderRuleStart);
    expect(tierStart).toBeLessThan(orderRuleEnd);
  });

  it('does NOT emit a top-level single condition when tiers are used', () => {
    // Tiers carry their own conditions; the order-rule must not also emit a
    // separate <condition> block at the rule level
    const xml = renderPromotionXML(TIERED_ORDER);
    const ruleBlock = xml.slice(xml.indexOf('<order-rule>'), xml.indexOf('</order-rule>'));
    // The only <condition> blocks should be inside <tier> elements
    const conditionCount   = (ruleBlock.match(/<condition>/g) || []).length;
    const tierCount        = (ruleBlock.match(/<tier>/g) || []).length;
    expect(conditionCount).toBe(tierCount);
  });

  it('supports three or more tiers', () => {
    const threeTiers = {
      ...TIERED_ORDER,
      discounts: [
        { threshold: 100, discountType: 'percentage', discountValue: 10 },
        { threshold: 200, discountType: 'percentage', discountValue: 15 },
        { threshold: 300, discountType: 'percentage', discountValue: 20 },
      ],
    };
    const xml = renderPromotionXML(threeTiers);
    expect((xml.match(/<tier>/g) || []).length).toBe(3);
  });

  it('supports fixed-price discount type inside tiers', () => {
    const xml = renderPromotionXML({
      ...TIERED_ORDER,
      discounts: [
        { threshold: 100, discountType: 'fixed-price', discountValue: 10 },
      ],
    });
    expect(xml).toContain('<fixed-price currency="USD">10</fixed-price>');
  });
});

// ─── 5. Category conditions ───────────────────────────────────────────────────

describe('category conditions', () => {
  it('renders qualifying-products with single category for product promotions', () => {
    const xml = renderPromotionXML({ ...PRODUCT_BASE, categoryConditions: ['shoes'] });
    expect(xml).toContain('<qualifying-products>');
    expect(xml).toContain('<category-id>shoes</category-id>');
  });

  it('renders all category IDs when multiple categories supplied', () => {
    const xml = renderPromotionXML({
      ...PRODUCT_BASE,
      categoryConditions: ['shoes', 'handbags', 'Sale-viewAll'],
    });
    expect(xml).toContain('<category-id>shoes</category-id>');
    expect(xml).toContain('<category-id>handbags</category-id>');
    expect(xml).toContain('<category-id>Sale-viewAll</category-id>');
    expect((xml.match(/<category-id>/g) || []).length).toBe(3);
  });

  it('categoryConditions inside product-rule — never outside or in order-rule', () => {
    const xml = renderPromotionXML({
      ...PRODUCT_BASE, categoryConditions: ['shoes'],
    });
    const productRuleBlock = xml.slice(
      xml.indexOf('<product-rule>'), xml.indexOf('</product-rule>')
    );
    expect(productRuleBlock).toContain('<qualifying-products>');
  });

  it('omits qualifying-products when no categoryConditions supplied', () => {
    expect(renderPromotionXML(PRODUCT_BASE)).not.toContain('qualifying-products');
  });

  it('throws when categoryConditions supplied for order promotion', () => {
    expect(() => renderPromotionXML({
      ...ORDER_BASE, categoryConditions: ['shoes'],
    })).toThrow('categoryConditions');
  });

  it('throws when categoryConditions supplied for shipping promotion', () => {
    expect(() => renderPromotionXML({
      ...SHIPPING_BASE, categoryConditions: ['shoes'],
    })).toThrow('categoryConditions');
  });
});

// ─── 6. Customer groups ───────────────────────────────────────────────────────

describe('customer groups', () => {
  it('renders customer-groups block for single group string', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, customerGroups: 'VIP' });
    expect(xml).toContain('<customer-groups operator="is-member-of">');
    expect(xml).toContain('<customer-group group-id="VIP"/>');
  });

  it('renders customer-groups block for multiple groups array', () => {
    const xml = renderPromotionXML({
      ...ORDER_BASE, customerGroups: ['VIP', 'Employees', 'Gold'],
    });
    expect(xml).toContain('<customer-group group-id="VIP"/>');
    expect(xml).toContain('<customer-group group-id="Employees"/>');
    expect(xml).toContain('<customer-group group-id="Gold"/>');
    expect((xml.match(/<customer-group /g) || []).length).toBe(3);
  });

  it('omits customer-groups when not supplied', () => {
    expect(renderPromotionXML(ORDER_BASE)).not.toContain('customer-groups');
  });
});

// ─── 7. Coupons ───────────────────────────────────────────────────────────────

describe('coupons', () => {
  it('renders coupons block for a single coupon string', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, coupons: 'PushpindersAgent' });
    expect(xml).toContain('<coupons>');
    expect(xml).toContain('<coupon coupon-id="PushpindersAgent"/>');
  });

  it('renders all coupons when an array is supplied', () => {
    const xml = renderPromotionXML({
      ...ORDER_BASE, coupons: ['CODE1', 'CODE2'],
    });
    expect(xml).toContain('<coupon coupon-id="CODE1"/>');
    expect(xml).toContain('<coupon coupon-id="CODE2"/>');
    expect((xml.match(/<coupon /g) || []).length).toBe(2);
  });

  it('omits coupons block when not supplied', () => {
    expect(renderPromotionXML(ORDER_BASE)).not.toContain('<coupons>');
  });
});

// ─── 8. Coupons and customer groups are always separate ───────────────────────

describe('coupons and customerGroups are separate XML blocks', () => {
  it('both are present in the same promotion without interference', () => {
    const xml = renderPromotionXML({
      ...ORDER_BASE,
      customerGroups: 'VIP',
      coupons:        'PushpindersAgent',
    });
    expect(xml).toContain('<customer-groups operator="is-member-of">');
    expect(xml).toContain('<customer-group group-id="VIP"/>');
    expect(xml).toContain('<coupons>');
    expect(xml).toContain('<coupon coupon-id="PushpindersAgent"/>');
  });

  it('customer-group group-id is never the coupon value', () => {
    const xml = renderPromotionXML({
      ...ORDER_BASE, customerGroups: 'VIP', coupons: 'PushpindersAgent',
    });
    expect(xml).not.toContain('<customer-group group-id="PushpindersAgent"/>');
    expect(xml).not.toContain('<coupon coupon-id="VIP"/>');
  });
});

// ─── 9. Schedule ──────────────────────────────────────────────────────────────

describe('schedule', () => {
  it('renders <schedule> block when startDate and endDate are present', () => {
    const xml = renderPromotionXML({
      ...ORDER_BASE, startDate: '2024-05-09', endDate: '2024-05-11',
    });
    expect(xml).toContain('<schedule>');
    expect(xml).toContain('<start-date>2024-05-09</start-date>');
    expect(xml).toContain('<end-date>2024-05-11</end-date>');
  });

  it('renders dates as supplied — no conversion or reformatting', () => {
    const xml = renderPromotionXML({
      ...ORDER_BASE, startDate: '05/09', endDate: '05/11',
    });
    expect(xml).toContain('<start-date>05/09</start-date>');
    expect(xml).toContain('<end-date>05/11</end-date>');
  });

  it('omits <schedule> when neither date is present', () => {
    expect(renderPromotionXML(ORDER_BASE)).not.toContain('<schedule>');
  });

  it('throws when startDate is present but endDate is absent', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, startDate: '2024-05-09' }))
      .toThrow('startDate and endDate');
  });

  it('throws when endDate is present but startDate is absent', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, endDate: '2024-05-11' }))
      .toThrow('startDate and endDate');
  });
});

// ─── 10. XML character escaping ───────────────────────────────────────────────

describe('XML character escaping', () => {
  it('escapes & in name', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, name: 'Summer & Fall Sale' });
    expect(xml).toContain('Summer &amp; Fall Sale');
    expect(xml).not.toContain('Summer & Fall Sale');
  });

  it('escapes < and > in name', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, name: 'Buy <X> Get Y' });
    expect(xml).toContain('Buy &lt;X&gt; Get Y');
  });

  it('escapes " in promotionId attribute', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, promotionId: 'promo"id' });
    expect(xml).toContain('promotion-id="promo&quot;id"');
  });

  it('escapes & in coupon-id attribute', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, coupons: 'SAVE&10' });
    expect(xml).toContain('coupon-id="SAVE&amp;10"');
  });

  it('escapes & in customer-group group-id attribute', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, customerGroups: 'VIP&Gold' });
    expect(xml).toContain('group-id="VIP&amp;Gold"');
  });

  it('escapes special characters in category-id', () => {
    const xml = renderPromotionXML({ ...PRODUCT_BASE, categoryConditions: ['shoes&bags'] });
    expect(xml).toContain('<category-id>shoes&amp;bags</category-id>');
  });
});

// ─── 11. Optional structural fields ──────────────────────────────────────────

describe('optional structural fields', () => {
  it('renders <description> when supplied', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, description: 'A great offer' });
    expect(xml).toContain('<description xml:lang="x-default">A great offer</description>');
  });

  it('omits <description> when absent', () => {
    expect(renderPromotionXML(ORDER_BASE)).not.toContain('<description');
  });

  it('renders <exclusivity> when supplied', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, exclusivity: 'no' });
    expect(xml).toContain('<exclusivity>no</exclusivity>');
  });

  it('omits <exclusivity> when absent', () => {
    expect(renderPromotionXML(ORDER_BASE)).not.toContain('<exclusivity>');
  });

  it('renders enabled-flag as false when enabledFlag: false', () => {
    const xml = renderPromotionXML({ ...ORDER_BASE, enabledFlag: false });
    expect(xml).toContain('<enabled-flag>false</enabled-flag>');
  });

  it('defaults enabled-flag to true when enabledFlag is absent', () => {
    expect(renderPromotionXML(ORDER_BASE)).toContain('<enabled-flag>true</enabled-flag>');
  });
});

// ─── 12. Invalid combination enforcement ──────────────────────────────────────

describe('invalid combination enforcement', () => {
  it('throws for free-shipping discountType on order promotion', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, discountType: 'free-shipping' }))
      .toThrow('free-shipping');
  });

  it('throws for free-shipping discountType on product promotion', () => {
    expect(() => renderPromotionXML({ ...PRODUCT_BASE, discountType: 'free-shipping' }))
      .toThrow('free-shipping');
  });

  it('throws for categoryConditions on order promotions', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, categoryConditions: ['shoes'] }))
      .toThrow('categoryConditions');
  });

  it('throws when threshold is present without currency', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, threshold: 100 }))
      .toThrow('currency');
  });

  it('throws when fixed-price discount is used without currency', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, discountType: 'fixed-price', discountValue: 10 }))
      .toThrow('currency');
  });

  it('throws when discounts are used without currency', () => {
    expect(() => renderPromotionXML({
      ...ORDER_BASE,
      discountType: undefined,
      discountValue: undefined,
      discounts: [{ threshold: 100, discountType: 'percentage', discountValue: 10 }],
    })).toThrow('currency');
  });

  it('throws for invalid promotionType', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, promotionType: 'INVALID' }))
      .toThrow('promotionType');
  });

  it('throws for invalid exclusivity value', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, exclusivity: 'only' }))
      .toThrow('exclusivity');
  });
});

// ─── 13. Missing required field enforcement ───────────────────────────────────

describe('missing required fields', () => {
  it('throws for missing promotionId', () => {
    const { promotionId: _, ...rest } = ORDER_BASE;
    expect(() => renderPromotionXML(rest)).toThrow('"promotionId"');
  });

  it('throws for missing name', () => {
    const { name: _, ...rest } = ORDER_BASE;
    expect(() => renderPromotionXML(rest)).toThrow('"name"');
  });

  it('throws for missing promotionType', () => {
    const { promotionType: _, ...rest } = ORDER_BASE;
    expect(() => renderPromotionXML(rest)).toThrow('"promotionType"');
  });

  it('throws for missing campaignId', () => {
    const { campaignId: _, ...rest } = ORDER_BASE;
    expect(() => renderPromotionXML(rest)).toThrow('"campaignId"');
  });

  it('throws when no discount information is supplied at all', () => {
    const { discountType: _t, discountValue: _v, ...rest } = ORDER_BASE;
    expect(() => renderPromotionXML(rest)).toThrow('discount');
  });

  it('throws for invalid discountType', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, discountType: 'buy-one-get-one' }))
      .toThrow('discountType');
  });

  it('throws when discountValue is non-numeric', () => {
    expect(() => renderPromotionXML({ ...ORDER_BASE, discountValue: '20' }))
      .toThrow('discountValue');
  });

  it('throws for a tier with a non-numeric threshold', () => {
    expect(() => renderPromotionXML({
      ...ORDER_BASE,
      discountType: undefined,
      discountValue: undefined,
      currency: 'USD',
      discounts: [{ threshold: 'big', discountType: 'percentage', discountValue: 10 }],
    })).toThrow('threshold');
  });

  it('throws for a tier with an invalid discountType', () => {
    expect(() => renderPromotionXML({
      ...ORDER_BASE,
      discountType: undefined,
      discountValue: undefined,
      currency: 'USD',
      discounts: [{ threshold: 100, discountType: 'bad', discountValue: 10 }],
    })).toThrow('discountType');
  });

  it('throws for null input', () => {
    expect(() => renderPromotionXML(null)).toThrow('non-null object');
  });

  it('throws for array input', () => {
    expect(() => renderPromotionXML([])).toThrow();
  });
});

// ─── 14. Deterministic output consistency ─────────────────────────────────────

describe('deterministic output consistency', () => {
  it('produces byte-identical XML on repeated calls with the same input', () => {
    const full = {
      ...ORDER_BASE,
      description:    'A great offer',
      exclusivity:    'no',
      startDate:      '2024-05-09',
      endDate:        '2024-05-11',
      customerGroups: ['VIP', 'Employees'],
      coupons:        ['SAVE10'],
      threshold:      50,
      currency:       'USD',
    };
    expect(renderPromotionXML(full)).toBe(renderPromotionXML(full));
  });

  it('produces different output for different promotion types', () => {
    const order   = renderPromotionXML(ORDER_BASE);
    const product = renderPromotionXML(PRODUCT_BASE);
    expect(order).not.toBe(product);
  });

  it('produces different output when tiered vs single discount', () => {
    const single = renderPromotionXML(ORDER_BASE);
    const tiered = renderPromotionXML({
      promotionType: 'order',
      promotionId:   'order-promo-001',
      name:          'Order Discount',
      campaignId:    'spring-2024',
      currency:      'USD',
      discounts: [{ threshold: 100, discountType: 'percentage', discountValue: 10 }],
    });
    expect(single).not.toBe(tiered);
  });
});

// ─── 15. XML structure correctness ────────────────────────────────────────────

describe('XML structure correctness', () => {
  it('starts with XML 1.0 UTF-8 declaration', () => {
    expect(renderPromotionXML(ORDER_BASE).startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('includes SFCC promotions namespace', () => {
    expect(renderPromotionXML(ORDER_BASE))
      .toContain('xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31"');
  });

  it('closes every opened tag for a full promotion', () => {
    const xml = renderPromotionXML({
      ...ORDER_BASE,
      startDate:      '2024-05-09',
      endDate:        '2024-05-11',
      customerGroups: 'VIP',
      coupons:        'CODE1',
      threshold:      50,
      currency:       'USD',
    });
    expect(xml).toContain('</promotion>');
    expect(xml).toContain('</promotions>');
    expect(xml).toContain('</rule>');
    expect(xml).toContain('</order-rule>');
    expect(xml).toContain('</schedule>');
    expect(xml).toContain('</customer-groups>');
    expect(xml).toContain('</coupons>');
  });
});
