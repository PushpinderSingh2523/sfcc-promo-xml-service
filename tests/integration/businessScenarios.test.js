'use strict';

/**
 * businessScenarios.test.js
 *
 * End-to-end business scenario tests covering realistic merchandising use cases.
 * Each scenario tests the full stack: intent → parse → validate → XML → summary.
 *
 * Scenarios:
 *   1.  VIP handbag event
 *   2.  Employee appreciation sale
 *   3.  Birthday reward
 *   4.  Free shipping weekend
 *   5.  Loyalty tier campaign
 *   6.  Black Friday event
 *   7.  Preorder exclusion launch
 *   8.  Coupon-only influencer promotion
 */

const request = require('supertest');

jest.mock('../../src/services/claudeService', () => {
  const { parseIntent: localParse } = require('../../src/services/localParser');
  return {
    USE_AI: false,
    parseIntent: (intent, _opts) => {
      const result = localParse(intent, new Date('2026-01-15T12:00:00.000Z'));
      return Promise.resolve({ ...result, source: 'local' });
    },
  };
});

const app = require('../../src/app');

// Helper to post /generate and assert common shape
async function generate(intent, label) {
  const res = await request(app)
    .post('/api/v1/promotions/generate')
    .send({ intent, options: { forceGenerate: true } });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.normalizedDocument).toBeDefined();
  expect(res.body.sessionId).toBeTruthy();
  return res.body;
}

// ─── Scenario tests ───────────────────────────────────────────────────────────

describe('Business Scenarios — full stack via API', () => {

  test('Scenario 1: VIP handbag event — 20% off handbags on orders over $200 for VIP in July', async () => {
    const body = await generate(
      '20% off on handbags for VIP customers on orders over $200 in July',
      'VIP handbag event'
    );
    // Category qualifier (handbags) takes precedence over the $200 threshold — product rule.
    // Phase 7 precedence: category present → product, regardless of "orders over $X".
    expect(body.normalizedDocument.promotion.ruleType).toBe('product');
    expect(body.normalizedDocument.promotion.discounts[0].discountType).toBe('percentage');
    expect(body.normalizedDocument.promotion.discounts[0].discountValue).toBe(20);
    expect(body.normalizedDocument.campaign?.customerGroups?.groupIds).toContain('VIP');
    expect(body.xml).toContain('<promotions');
    expect(body.summary.oneLiner).toContain('20%');
  });

  test('Scenario 2: Employee appreciation — 30% off all products', async () => {
    const body = await generate(
      'Employee appreciation: 30% off for all employees this month',
      'Employee appreciation'
    );
    expect(body.normalizedDocument.promotion.discounts[0].discountValue).toBe(30);
    expect(body.normalizedDocument.promotion.exclusivity).toBe('class');
    expect(body.normalizedDocument.campaign?.customerGroups?.groupIds).toContain('Employees');
    expect(body.xml).toContain('<promotion promotion-id=');
  });

  test('Scenario 3: Birthday reward — $50 off, one-time use, excludes gift cards', async () => {
    const body = await generate(
      'Birthday promotion: $50 off orders over $50 for VIP members, one-time use only, not valid on gift cards',
      'Birthday reward'
    );
    const p = body.normalizedDocument.promotion;
    expect(p.discounts[0].discountType).toBe('amount');
    expect(p.discounts[0].discountValue).toBe(50);
    expect(p.lifecycle.preventRequalifying).toBe(true);
    const excluded = p.excludedProducts?.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(excluded).toContain('gift-cards');
    expect(body.summary.bullets.some(b => b.toLowerCase().includes('one-time'))).toBe(true);
  });

  test('Scenario 4: Free shipping weekend — free standard shipping', async () => {
    const body = await generate(
      'Free standard shipping this weekend',
      'Free shipping weekend'
    );
    const p = body.normalizedDocument.promotion;
    expect(p.ruleType).toBe('shipping');
    expect(p.discounts[0].discountType).toBe('free-shipping');
    expect(p.shippingRuleOptions.methodIds).toContain('standard');
    expect(body.xml).toContain('shipping-promotion-rule');
  });

  test('Scenario 5: Loyalty tier campaign — 10% on $500, 20% on $2000', async () => {
    const body = await generate(
      '10% off on orders over $500 and 20% off on orders over $2000 for Loyalty members in September',
      'Loyalty tier campaign'
    );
    const p = body.normalizedDocument.promotion;
    expect(p.ruleType).toBe('order');
    expect(p.discounts).toHaveLength(2);
    expect(p.discounts[0]).toMatchObject({ threshold: 500, discountType: 'percentage', discountValue: 10 });
    expect(p.discounts[1]).toMatchObject({ threshold: 2000, discountType: 'percentage', discountValue: 20 });
  });

  test('Scenario 6: Black Friday event — 25% off everything', async () => {
    const body = await generate(
      '25% off everything for Black Friday',
      'Black Friday event'
    );
    expect(body.normalizedDocument.promotion.discounts[0].discountType).toBe('percentage');
    expect(body.normalizedDocument.promotion.discounts[0].discountValue).toBe(25);
    expect(body.xml).toBeTruthy();
    expect(body.summary.oneLiner).toContain('25%');
  });

  test('Scenario 7: Preorder exclusion launch — 20% off shoes, no preorders or sale', async () => {
    const body = await generate(
      '20% off on all shoes, excluding preorders and sale items',
      'Preorder exclusion launch'
    );
    const p = body.normalizedDocument.promotion;
    expect(p.discounts[0].discountType).toBe('percentage');
    const excluded = p.excludedProducts?.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(excluded).toContain('preorder');
    expect(excluded).toContain('sale');
  });

  test('Scenario 8: Coupon-only influencer promo — 25% off with FLASH25', async () => {
    const body = await generate(
      'Get 25% off when you enter promo code FLASH25',
      'Coupon-only influencer promo'
    );
    expect(body.normalizedDocument.promotion.discounts[0].discountValue).toBe(25);
    const coupons = body.normalizedDocument.assignment?.activationCoupons || [];
    expect(coupons).toContain('FLASH25');
    expect(body.summary.oneLiner).toContain('FLASH25');
  });

  // ── Preview endpoint — scenario spot-checks ─────────────────────────────────

  test('Preview: VIP tiered luxury promo — summary has all key fields', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/preview')
      .send({ intent: '10% off handbags over $500 and 20% off over $2000 for VIP in July' });
    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.oneLiner).toBeTruthy();
    expect(s.headline).toBeTruthy();
    expect(s.bullets.length).toBeGreaterThan(0);
    expect(s.businessNote).toBeTruthy();
  });

  // ── Capabilities — all scenario rule types present ────────────────────────────

  test('GET /capabilities lists all 3 rule types used in scenarios', async () => {
    const res = await request(app).get('/api/v1/promotions/capabilities');
    expect(res.body.ruleTypes).toEqual(expect.arrayContaining(['product', 'order', 'shipping']));
  });

  // ── Import scenario: VIP shipping XML → re-generate ──────────────────────────

  test('Import existing VIP shipping XML and re-generate', async () => {
    const existingXml = `<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
  <promotion promotion-id="vip-shipping-2024" exclusivity="class">
    <name>VIP Free Two-Day Shipping 2024</name>
    <enabled>true</enabled>
    <shipping-promotion-rule>
      <discounts><discount><free/></discount></discounts>
      <shipping-methods><shipping-method-id>twoday</shipping-method-id></shipping-methods>
    </shipping-promotion-rule>
  </promotion>
</promotions>`;

    const importRes = await request(app)
      .post('/api/v1/promotions/import-xml')
      .send({ xml: existingXml });
    expect(importRes.status).toBe(200);
    const doc = importRes.body.normalizedDocument;
    expect(doc.promotion.ruleType).toBe('shipping');

    // Re-generate XML from the imported document via /validate
    const validateRes = await request(app)
      .post('/api/v1/promotions/validate')
      .send({ document: doc });
    expect(validateRes.status).toBe(200);
    expect(validateRes.body.valid).toBe(true);
  });
});
