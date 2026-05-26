'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app     = require('../../src/app');

// ─── Mock claudeService to return v2 parser result shape ──────────────────────
// Note: jest.mock() is hoisted — keep MOCK_DOCUMENT inside the factory function.

jest.mock('../../src/services/claudeService', () => ({
  parseIntent: jest.fn().mockResolvedValue({
    document: {
      globalSettings: {
        catalogId: 'siteCatalog_ToryUS',
        excludedCategoryIds: ['Exclusions-Always', 'accessories-seedbox-foundation', 'accessories-masks'],
        excludedProductOptionIds: ['monogramming'],
      },
      promotion: {
        id: 'summer-10pct-off',
        name: 'Summer Sale - 10% Off Orders Over $50',
        lifecycle: {
          enabled: true, archived: false, searchable: false,
          refinable: false, preventRequalifying: false, prorateAcrossEligibleItems: false,
        },
        exclusivity: 'no',
        ruleType: 'order',
        discountConditionType: 'order-total',
        discounts: [{ threshold: 50, discountType: 'percentage', discountValue: 10 }],
        qualifyingProducts: {
          conditionGroups: [{ priceCondition: { operator: 'greater than', price: 0.01 } }],
        },
        orderRuleOptions: { discountOnlyQualifyingProducts: false, excludeDiscountedProducts: false },
        customAttributes: { gwp: false, isExcludeTranslate: false },
      },
    },
    confidence: 0.88,
    clarificationRequired: false,
    clarificationQuestions: [],
    warnings: [],
    parserTrace: { ruleType: 'order', discount: { confidence: 0.88, matchedPatterns: ['percentage'] } },
    source: 'local',
  }),
  USE_AI: false,
}));

// Helper for /validate tests
const MOCK_DOCUMENT = {
  globalSettings: {
    catalogId: 'siteCatalog_ToryUS',
    excludedCategoryIds: ['Exclusions-Always'],
    excludedProductOptionIds: ['monogramming'],
  },
  promotion: {
    id: 'test-promo', name: 'Test',
    lifecycle: { enabled: true, archived: false, searchable: false, refinable: false, preventRequalifying: false, prorateAcrossEligibleItems: false },
    exclusivity: 'no', ruleType: 'order', discountConditionType: 'order-total',
    discounts: [{ threshold: 50, discountType: 'percentage', discountValue: 10 }],
    orderRuleOptions: { discountOnlyQualifyingProducts: false, excludeDiscountedProducts: false },
    customAttributes: { gwp: false },
  },
};

// ─── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('sfcc-promo-xml-service');
  });
});

// ─── POST /generate ────────────────────────────────────────────────────────────

describe('POST /api/v1/promotions/generate', () => {
  it('generates XML from a valid intent', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: '10% off orders over $50 in summer 2025' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.xml).toContain('<?xml version="1.0"');
    expect(res.body.xml).toContain('http://www.demandware.com/xml/impex/promotion/2008-01-31');
    expect(res.body.normalizedDocument).toBeDefined();
    expect(res.body.requestId).toBeDefined();
    expect(res.body.confidence).toBeDefined();
    expect(res.body).toHaveProperty('clarificationRequired');
  });

  it('response includes validation object', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: '10% off orders over $50' });
    expect(res.status).toBe(200);
    expect(res.body.validation).toBeDefined();
    expect(res.body.validation.document).toBeDefined();
    expect(res.body.validation.xml).toBeDefined();
  });

  it('returns 400 when intent is missing', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });

  it('returns 400 when intent is empty string', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: '   ' });
    expect(res.status).toBe(400);
  });
});

// ─── POST /parse ───────────────────────────────────────────────────────────────

describe('POST /api/v1/promotions/parse', () => {
  it('returns normalizedDocument without xml field', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/parse')
      .send({ intent: '10% off orders over $50' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.normalizedDocument).toBeDefined();
    expect(res.body.xml).toBeUndefined();
    expect(res.body.validation).toBeDefined();
  });

  it('returns 400 for missing intent', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/parse')
      .send({});
    expect(res.status).toBe(400);
  });
});

// ─── POST /validate ────────────────────────────────────────────────────────────

describe('POST /api/v1/promotions/validate', () => {
  const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
  <promotion promotion-id="summer-10pct-off">
    <enabled-flag>true</enabled-flag>
    <order-promotion-rule>
      <discount-only-qualifying-products>false</discount-only-qualifying-products>
      <discounts condition-type="order-total">
        <discount><threshold>50</threshold><percentage>10</percentage></discount>
      </discounts>
      <exclude-discounted-products>false</exclude-discounted-products>
    </order-promotion-rule>
  </promotion>
</promotions>`;

  it('validates correct SFCC v2 XML', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/validate')
      .send({ xml: validXml });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('returns invalid for malformed XML', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/validate')
      .send({ xml: '<broken xml>' });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  it('validates a PromotionDocumentV2 JSON object', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/validate')
      .send({ document: MOCK_DOCUMENT });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('returns 400 when neither xml nor document is provided', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/validate')
      .send({});
    expect(res.status).toBe(400);
  });
});
