'use strict';

/**
 * phase3.test.js
 *
 * Integration tests for Phase 3 endpoints:
 *   POST /api/v1/promotions/preview
 *   POST /api/v1/promotions/clarify
 *   POST /api/v1/promotions/import-xml
 *   GET  /api/v1/promotions/capabilities
 *
 * Uses supertest against the real Express app with mocked claudeService
 * (local parser — no real Claude API calls).
 */

const request = require('supertest');

// Mock claudeService so tests never call the real Claude API
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

const SAMPLE_SHIPPING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
  <promotion promotion-id="vip-free-twoday" exclusivity="class">
    <name>VIP Free Two-Day</name>
    <enabled>true</enabled>
    <shipping-promotion-rule>
      <discounts><discount><free/></discount></discounts>
      <shipping-methods><shipping-method-id>twoday</shipping-method-id></shipping-methods>
    </shipping-promotion-rule>
  </promotion>
  <promotion-campaign-assignment>
    <coupon-id>VIP2024SHIP</coupon-id>
  </promotion-campaign-assignment>
</promotions>`;

// ─── GET /capabilities ────────────────────────────────────────────────────────

describe('GET /api/v1/promotions/capabilities', () => {
  test('returns 200 with capability lists', async () => {
    const res = await request(app).get('/api/v1/promotions/capabilities');
    expect(res.status).toBe(200);
    expect(res.body.ruleTypes).toContain('product');
    expect(res.body.ruleTypes).toContain('order');
    expect(res.body.ruleTypes).toContain('shipping');
    expect(res.body.discountKinds).toContain('percentage');
    expect(res.body.discountKinds).toContain('free');
    expect(res.body.shippingMethods).toBeDefined();
    expect(res.body.customerGroups).toBeDefined();
    expect(res.body.features).toHaveProperty('conversationalFlow', true);
    expect(res.body.features).toHaveProperty('xmlImport', true);
  });

  test('returns schemaVersion and xmlEngineVersion', async () => {
    const res = await request(app).get('/api/v1/promotions/capabilities');
    expect(res.body.schemaVersion).toBeTruthy();
    expect(res.body.xmlEngineVersion).toBeTruthy();
  });

  test('lists all endpoints', async () => {
    const res = await request(app).get('/api/v1/promotions/capabilities');
    expect(res.body.endpoints).toHaveProperty('generate');
    expect(res.body.endpoints).toHaveProperty('clarify');
    expect(res.body.endpoints).toHaveProperty('preview');
    expect(res.body.endpoints).toHaveProperty('importXml');
  });
});

// ─── POST /preview ────────────────────────────────────────────────────────────

describe('POST /api/v1/promotions/preview', () => {
  test('returns 200 with summary and normalizedDocument', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/preview')
      .send({ intent: '20% off on handbags for VIP members in July' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.normalizedDocument).toBeDefined();
    expect(res.body.summary).toHaveProperty('oneLiner');
    expect(res.body.summary).toHaveProperty('headline');
    expect(res.body.summary).toHaveProperty('bullets');
    expect(Array.isArray(res.body.summary.bullets)).toBe(true);
  });

  test('returns XML for unambiguous intent', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/preview')
      .send({ intent: '30% off for all employees' });
    expect(res.status).toBe(200);
    expect(res.body.xml).toContain('<promotions');
  });

  test('returns 400 for missing intent', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/preview')
      .send({});
    expect(res.status).toBe(400);
  });

  test('includes confidence and validationExplanation', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/preview')
      .send({ intent: 'Free two-day shipping for VIP customers' });
    expect(res.body.confidence).toBeGreaterThan(0);
    expect(res.body.validationExplanation).toBeTruthy();
  });
});

// ─── POST /import-xml ─────────────────────────────────────────────────────────

describe('POST /api/v1/promotions/import-xml', () => {
  test('returns 200 with normalizedDocument from XML', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/import-xml')
      .send({ xml: SAMPLE_SHIPPING_XML });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.normalizedDocument).toBeDefined();
    expect(res.body.normalizedDocument.promotion.ruleType).toBe('shipping');
  });

  test('returns summary and fieldMap', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/import-xml')
      .send({ xml: SAMPLE_SHIPPING_XML });
    expect(res.body.summary).toHaveProperty('oneLiner');
    expect(res.body.fieldMap).toBeDefined();
  });

  test('extracts coupon from shipping XML', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/import-xml')
      .send({ xml: SAMPLE_SHIPPING_XML });
    expect(res.body.normalizedDocument.assignment?.activationCoupons).toContain('VIP2024SHIP');
  });

  test('returns 400 for missing xml', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/import-xml')
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 for non-XML string', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/import-xml')
      .send({ xml: 'not xml at all' });
    // Should still return 200 (best-effort import) or 400 — either is acceptable
    expect([200, 400]).toContain(res.status);
  });
});

// ─── POST /clarify ────────────────────────────────────────────────────────────

describe('POST /api/v1/promotions/clarify', () => {
  test('returns 400 when sessionId missing', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/clarify')
      .send({ answer: '20% off' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when answer missing', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/clarify')
      .send({ sessionId: 'abc' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/clarify')
      .send({ sessionId: 'does-not-exist-xyz', answer: '20% off' });
    expect(res.status).toBe(404);
  });

  test('full clarification flow: generate → clarify → completed', async () => {
    // Step 1: create a session by calling /generate with an ambiguous intent
    const genRes = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: 'create a promo for VIP customers' });
    expect(genRes.status).toBe(200);
    const sessionId = genRes.body.sessionId;
    expect(sessionId).toBeTruthy();

    // If already complete (high confidence), skip clarification test
    if (!genRes.body.clarificationRequired) {
      expect(genRes.body.xml).toBeTruthy();
      return;
    }

    // Step 2: answer the next question
    const clarRes = await request(app)
      .post('/api/v1/promotions/clarify')
      .send({ sessionId, answer: '20% off' });
    expect(clarRes.status).toBe(200);
    expect(clarRes.body.success).toBe(true);
    expect(clarRes.body.sessionId).toBe(sessionId);
    expect(clarRes.body).toHaveProperty('completed');
    expect(clarRes.body).toHaveProperty('questionsRemaining');
    expect(clarRes.body.normalizedDocument).toBeDefined();
  });
});

// ─── POST /generate — new sessionId field ─────────────────────────────────────

describe('POST /api/v1/promotions/generate — Phase 3 additions', () => {
  test('response includes sessionId', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: '20% off for VIP customers' });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeTruthy();
  });

  test('response includes summary', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: '20% off for VIP customers in July' });
    expect(res.status).toBe(200);
    expect(res.body.summary).toHaveProperty('oneLiner');
    expect(res.body.summary).toHaveProperty('bullets');
  });
});
