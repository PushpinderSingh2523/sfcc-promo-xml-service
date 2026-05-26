'use strict';

const { importXml } = require('../../src/services/xmlImportService');
const { buildDocument } = require('../../src/services/xmlServiceV2');

// Fixtures ────────────────────────────────────────────────────────────────────

const PRODUCT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
  <promotion promotion-id="birthday-vip-50off" exclusivity="class">
    <name>Birthday VIP $50 Off</name>
    <enabled>true</enabled>
    <archived>false</archived>
    <searchable>false</searchable>
    <refinable>false</refinable>
    <prevent-requalifying>true</prevent-requalifying>
    <product-promotion-rule>
      <discounts>
        <discount>
          <amount-off><amount>50</amount></amount-off>
        </discount>
      </discounts>
    </product-promotion-rule>
  </promotion>
  <campaign campaign-id="camp-birthday">
    <enabled>true</enabled>
    <start-date>2026-07-01T00:00:00.000Z</start-date>
    <end-date>2026-07-31T23:59:59.000Z</end-date>
    <customer-groups><customer-group-id>VIP</customer-group-id></customer-groups>
  </campaign>
</promotions>`;

const ORDER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
  <promotion promotion-id="tiered-order-discount" exclusivity="no">
    <name>Tiered Order Discount</name>
    <enabled>true</enabled>
    <order-promotion-rule>
      <qualifying-products>
        <condition-groups><condition-group>
          <category-condition><category-id>handbags</category-id><category-id>watches</category-id></category-condition>
        </condition-group></condition-groups>
      </qualifying-products>
      <discounts>
        <discount><percentage>20</percentage></discount>
      </discounts>
    </order-promotion-rule>
  </promotion>
</promotions>`;

const SHIPPING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
  <promotion promotion-id="vip-free-twoday">
    <name>VIP Free Two-Day Shipping</name>
    <shipping-promotion-rule>
      <discounts><discount><free/></discount></discounts>
      <shipping-methods><shipping-method-id>twoday</shipping-method-id></shipping-methods>
    </shipping-promotion-rule>
  </promotion>
  <promotion-campaign-assignment>
    <coupon-id>VIP2024SHIP</coupon-id>
  </promotion-campaign-assignment>
</promotions>`;

// Tests ───────────────────────────────────────────────────────────────────────

describe('xmlImportService', () => {

  describe('importXml — input validation', () => {
    test('throws on null', () => {
      expect(() => importXml(null)).toThrow();
    });
    test('throws on empty string', () => {
      expect(() => importXml('')).toThrow();
    });
  });

  describe('importXml — product promotion', () => {
    let result;
    beforeAll(() => { result = importXml(PRODUCT_XML); });

    test('returns document, warnings, fieldMap', () => {
      expect(result).toHaveProperty('document');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('fieldMap');
    });

    test('extracts promotionId', () => {
      expect(result.document.promotion.id).toBe('birthday-vip-50off');
    });

    test('detects product ruleType', () => {
      expect(result.document.promotion.ruleType).toBe('product');
    });

    test('extracts amount discount', () => {
      const tier = result.document.promotion.discounts[0];
      expect(tier.discountType).toBe('amount');
      expect(tier.discountValue).toBe(50);
    });

    test('extracts lifecycle — preventRequalifying', () => {
      expect(result.document.promotion.lifecycle.preventRequalifying).toBe(true);
    });

    test('extracts campaign customer group', () => {
      expect(result.document.campaign?.customerGroups?.groupIds).toContain('VIP');
    });

    test('extracts campaign dates', () => {
      expect(result.document.campaign?.startDate).toContain('2026-07-01');
    });

    test('exclusivity is class', () => {
      expect(result.document.promotion.exclusivity).toBe('class');
    });
  });

  describe('importXml — order promotion', () => {
    let result;
    beforeAll(() => { result = importXml(ORDER_XML); });

    test('detects order ruleType', () => {
      expect(result.document.promotion.ruleType).toBe('order');
    });

    test('extracts percentage discount', () => {
      const tier = result.document.promotion.discounts[0];
      expect(tier.discountType).toBe('percentage');
      expect(tier.discountValue).toBe(20);
    });

    test('extracts qualifying categories', () => {
      const groups = result.document.promotion.qualifyingProducts?.conditionGroups || [];
      const catIds = groups.flatMap(g => g.categoryCondition?.categoryIds || []);
      expect(catIds).toContain('handbags');
      expect(catIds).toContain('watches');
    });
  });

  describe('importXml — shipping promotion', () => {
    let result;
    beforeAll(() => { result = importXml(SHIPPING_XML); });

    test('detects shipping ruleType', () => {
      expect(result.document.promotion.ruleType).toBe('shipping');
    });

    test('extracts free discount tier', () => {
      expect(result.document.promotion.discounts[0].discountType).toBe('free-shipping');
    });

    test('extracts shipping method IDs', () => {
      expect(result.document.promotion.shippingRuleOptions?.methodIds).toContain('twoday');
    });

    test('extracts coupon from assignment', () => {
      expect(result.document.assignment?.activationCoupons).toContain('VIP2024SHIP');
    });
  });

  describe('round-trip: import → re-export XML contains namespace', () => {
    test('product XML round-trip produces valid XML string', () => {
      const { document: doc } = importXml(PRODUCT_XML);
      const xml = buildDocument(doc);
      expect(xml).toContain('http://www.demandware.com/xml/impex/promotion/2008-01-31');
      expect(xml).toContain('<promotion promotion-id=');
    });

    test('shipping XML round-trip produces valid XML string', () => {
      const { document: doc } = importXml(SHIPPING_XML);
      const xml = buildDocument(doc);
      expect(xml).toContain('shipping-promotion-rule');
    });
  });
});
