'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app     = require('../../src/app');

// Top-level mock — jest.mock() is hoisted, inline values only
jest.mock('../../src/services/claudeService', () => ({
  parseIntent: jest.fn(),
  USE_AI: false,
}));

const claudeService = require('../../src/services/claudeService');

// ─── Shared document fixtures ─────────────────────────────────────────────────

const SHIPPING_DOC_INCOMPLETE = {
  globalSettings: { catalogId: 'siteCatalog_ToryUS', excludedCategoryIds: [], excludedProductOptionIds: [] },
  promotion: {
    id: 'free-shipping-promo', name: 'Free Shipping Promotion',
    lifecycle: { enabled: true, archived: false, searchable: false, refinable: false, preventRequalifying: false, prorateAcrossEligibleItems: false },
    exclusivity: 'no', ruleType: 'shipping', discountConditionType: 'order-total',
    discounts: [{ threshold: 0, discountType: 'free-shipping', discountValue: 0 }],
    shippingRuleOptions: { methodIds: [] },
    customAttributes: { gwp: false, isExcludeTranslate: false },
  },
};

const SHIPPING_DOC_COMPLETE = {
  globalSettings: { catalogId: 'siteCatalog_ToryUS', excludedCategoryIds: [], excludedProductOptionIds: [] },
  promotion: {
    id: 'free-shipping-promo', name: 'Free Shipping Promotion',
    lifecycle: { enabled: true, archived: false, searchable: false, refinable: false, preventRequalifying: false, prorateAcrossEligibleItems: false },
    exclusivity: 'no', ruleType: 'shipping', discountConditionType: 'order-total',
    discounts: [{ threshold: 0, discountType: 'free-shipping', discountValue: 0 }],
    shippingRuleOptions: { methodIds: ['standard'] },
    customAttributes: { gwp: false, isExcludeTranslate: false },
  },
};

const ORDER_DOC_INCOMPLETE = {
  globalSettings: { catalogId: 'siteCatalog_ToryUS', excludedCategoryIds: [], excludedProductOptionIds: [] },
  promotion: {
    id: 'ten-pct-off', name: '10% Off',
    lifecycle: { enabled: true, archived: false, searchable: false, refinable: false, preventRequalifying: false, prorateAcrossEligibleItems: false },
    exclusivity: 'no', ruleType: 'order', discountConditionType: 'order-total',
    discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 10 }],
    orderRuleOptions: { discountOnlyQualifyingProducts: false, excludeDiscountedProducts: false },
    customAttributes: { gwp: false, isExcludeTranslate: false },
  },
};

const COUPON_DOC_INCOMPLETE = {
  globalSettings: { catalogId: 'siteCatalog_ToryUS', excludedCategoryIds: [], excludedProductOptionIds: [] },
  promotion: {
    id: 'promo-code-discount', name: 'Promo Code Discount',
    lifecycle: { enabled: true, archived: false, searchable: false, refinable: false, preventRequalifying: false, prorateAcrossEligibleItems: false },
    exclusivity: 'no', ruleType: 'order', discountConditionType: 'order-total',
    discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 25 }],
    couponOptions: { codes: [], singleUse: false },
    orderRuleOptions: { discountOnlyQualifyingProducts: false, excludeDiscountedProducts: false },
    customAttributes: { gwp: false, isExcludeTranslate: false },
  },
};

// ─── Test: incomplete shipping promotion → never 422 ─────────────────────────

describe('POST /generate — incomplete shipping promotion', () => {
  beforeEach(() => {
    claudeService.parseIntent.mockResolvedValue({
      document: SHIPPING_DOC_INCOMPLETE,
      confidence: 0.55,
      clarificationRequired: true,
      clarificationQuestions: [
        { field: 'shippingRuleOptions.methodIds', severity: 'critical' },
      ],
      warnings: [], source: 'claude',
    });
  });

  it('returns 200 — not 422 — with clarificationRequired true and a question', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: 'Create a free shipping promotion' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.clarificationRequired).toBe(true);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.nextQuestionText).toBeTruthy();
    expect(res.body.xml).toBeNull();
    expect(res.body.missingFields).toContain('shippingRuleOptions.methodIds');
    expect(res.body.validation.document.skipped).toBe(true);
  });
});

// ─── Test: ambiguous order promotion ("10% off") → 200 with clarification ─────

describe('POST /generate — ambiguous order promotion', () => {
  beforeEach(() => {
    claudeService.parseIntent.mockResolvedValue({
      document: ORDER_DOC_INCOMPLETE,
      confidence: 0.45,
      clarificationRequired: true,
      clarificationQuestions: [
        { field: 'discounts', severity: 'critical' },
      ],
      warnings: [], source: 'claude',
    });
  });

  it('returns 200 with clarificationRequired true when intent is ambiguous', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: '10% off' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.clarificationRequired).toBe(true);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.nextQuestionText).toBeTruthy();
    expect(res.body.xml).toBeNull();
    expect(res.body.missingFields).toContain('discounts');
    expect(res.body.validation.document.skipped).toBe(true);
  });
});

// ─── Test: coupon promotion missing code → 200 with clarification ─────────────

describe('POST /generate — coupon promotion missing code', () => {
  beforeEach(() => {
    claudeService.parseIntent.mockResolvedValue({
      document: COUPON_DOC_INCOMPLETE,
      confidence: 0.6,
      clarificationRequired: true,
      clarificationQuestions: [
        { field: 'activationCoupons', severity: 'critical' },
      ],
      warnings: [], source: 'claude',
    });
  });

  it('returns 200 with clarificationRequired true when coupon code is missing', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: 'Get 25% off with promo code' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.clarificationRequired).toBe(true);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.nextQuestionText).toBeTruthy();
    expect(res.body.xml).toBeNull();
    expect(res.body.missingFields).toContain('activationCoupons');
  });
});

// ─── Test: full clarification completion flow ─────────────────────────────────

describe('Full clarification flow: generate → clarify → completed with XML', () => {
  let savedSessionId;

  it('step 1 — generate returns clarificationRequired true with sessionId', async () => {
    claudeService.parseIntent.mockResolvedValue({
      document: SHIPPING_DOC_INCOMPLETE,
      confidence: 0.55,
      clarificationRequired: true,
      clarificationQuestions: [
        { field: 'shippingRuleOptions.methodIds', severity: 'critical' },
      ],
      warnings: [], source: 'claude',
    });

    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: 'Free shipping promotion' });

    expect(res.status).toBe(200);
    expect(res.body.clarificationRequired).toBe(true);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.xml).toBeNull();

    savedSessionId = res.body.sessionId;
  });

  it('step 2 — clarify with answer resolves to completed with XML', async () => {
    expect(savedSessionId).toBeTruthy();

    claudeService.parseIntent.mockResolvedValue({
      document: SHIPPING_DOC_COMPLETE,
      confidence: 0.92,
      clarificationRequired: false,
      clarificationQuestions: [],
      warnings: [], source: 'claude',
    });

    const res = await request(app)
      .post('/api/v1/promotions/clarify')
      .send({ sessionId: savedSessionId, answer: 'standard shipping' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.completed).toBe(true);
    expect(res.body.validationFailed).toBe(false);
    expect(res.body.xml).toBeTruthy();
    expect(res.body.xml).toContain('promotion');
  });
});

// ─── Test: 422 gate — only for completed but structurally invalid documents ───

describe('POST /generate — 422 only for completed but invalid documents', () => {
  it('returns 422 when clarificationRequired is false but doc fails AJV schema', async () => {
    claudeService.parseIntent.mockResolvedValue({
      document: { promotion: { ruleType: 'order' } }, // missing required globalSettings etc.
      confidence: 0.3,
      clarificationRequired: false,
      clarificationQuestions: [],
      warnings: [], source: 'claude',
    });

    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: 'something complete but malformed', options: { forceGenerate: true } });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Document Validation Failed');
  });

  it('returns 200 (not 422) when clarificationRequired is true even if doc would fail AJV', async () => {
    claudeService.parseIntent.mockResolvedValue({
      document: { promotion: { ruleType: 'order' } }, // structurally invalid
      confidence: 0.3,
      clarificationRequired: true,
      clarificationQuestions: [
        { field: 'discounts', severity: 'critical' },
      ],
      warnings: [], source: 'claude',
    });

    const res = await request(app)
      .post('/api/v1/promotions/generate')
      .send({ intent: 'some vague discount' });

    expect(res.status).toBe(200);
    expect(res.body.clarificationRequired).toBe(true);
    expect(res.body.xml).toBeNull();
    expect(res.body.validation.document.skipped).toBe(true);
  });
});
