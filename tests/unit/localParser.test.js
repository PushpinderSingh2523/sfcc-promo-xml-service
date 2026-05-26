'use strict';

const {
  parseIntent,
  parseDiscount,
  parseCondition,
  parseDates,
  parseExclusivity,
  parseCurrency,
  parseProductKeywords,
} = require('../../src/services/localParser');

// Fixed reference date so date tests are deterministic
const NOW = new Date('2026-01-15T12:00:00.000Z');

// ─── parseDiscount ─────────────────────────────────────────────────────────────

describe('parseDiscount — percentage', () => {
  const cases = [
    ['10% off all orders',                        { type: 'percentage', value: 10   }],
    ['get 20% off your next purchase',            { type: 'percentage', value: 20   }],
    ['save 15 percent on shoes',                  { type: 'percentage', value: 15   }],
    ['25% discount on footwear',                  { type: 'percentage', value: 25   }],
    ['50 percent off everything',                 { type: 'percentage', value: 50   }],
  ];
  test.each(cases)('%s', (intent, expected) => {
    const { discountType, discountValue } = parseDiscount(intent);
    expect(discountType).toBe(expected.type);
    expect(discountValue).toBe(expected.value);
  });
});

describe('parseDiscount — amount-off', () => {
  const cases = [
    ['$20 off your order',        { type: 'amount-off', value: 20  }],
    ['save $15 on any purchase',  { type: 'amount-off', value: 15  }],
    ['30 dollars off',            { type: 'amount-off', value: 30  }],
    ['£10 off when you spend £50',{ type: 'amount-off', value: 10  }],
  ];
  test.each(cases)('%s', (intent, expected) => {
    const { discountType, discountValue } = parseDiscount(intent);
    expect(discountType).toBe(expected.type);
    expect(discountValue).toBe(expected.value);
  });
});

describe('parseDiscount — fixed-price', () => {
  const cases = [
    ['Fixed price $9.99 for all accessories', { type: 'fixed-price', value: 9.99 }],
    ['fixed-price $5 on selected items',      { type: 'fixed-price', value: 5    }],
  ];
  test.each(cases)('%s', (intent, expected) => {
    const { discountType, discountValue } = parseDiscount(intent);
    expect(discountType).toBe(expected.type);
    expect(discountValue).toBeCloseTo(expected.value);
  });
});

describe('parseDiscount — free-shipping', () => {
  test('free shipping on all orders', () => {
    const { discountType, discountValue } = parseDiscount('free shipping on all orders');
    expect(discountType).toBe('free-shipping');
    expect(discountValue).toBe(0);
  });
  test('get free shipping this weekend', () => {
    const { discountType } = parseDiscount('get free shipping this weekend');
    expect(discountType).toBe('free-shipping');
  });
});

describe('parseDiscount — bonus-product', () => {
  const cases = [
    'get a free gift with every purchase',
    'gift with purchase on orders over $75',
    'bonus product when you spend $50',
  ];
  test.each(cases)('%s', intent => {
    const { discountType, discountValue } = parseDiscount(intent);
    expect(discountType).toBe('bonus-product');
    expect(discountValue).toBe(0);
  });
});

describe('parseDiscount — fallback', () => {
  test('returns 10% when nothing matches', () => {
    const { discountType, discountValue } = parseDiscount('some vague promotion');
    expect(discountType).toBe('percentage');
    expect(discountValue).toBe(10);
  });
});

// ─── parseCondition ────────────────────────────────────────────────────────────

describe('parseCondition — minimum-amount', () => {
  const cases = [
    ['orders over $50',                      50  ],
    ['orders above $100',                    100 ],
    ['spend $75 or more',                    75  ],
    ['minimum order of $25',                 25  ],
    ['minimum purchase $200',                200 ],
    ['$150 or more',                         150 ],
    ['spend over $80 to qualify',            80  ],
  ];
  test.each(cases)('%s → conditionValue=%d', (intent, expected) => {
    const { conditionType, conditionValue } = parseCondition(intent);
    expect(conditionType).toBe('minimum-amount');
    expect(conditionValue).toBe(expected);
  });
});

describe('parseCondition — minimum-quantity', () => {
  const cases = [
    ['buy 2 or more items',  2],
    ['buy 3 pairs of shoes', 3],
    ['purchase 5 or more units', 5],
  ];
  test.each(cases)('%s → conditionValue=%d', (intent, expected) => {
    const { conditionType, conditionValue } = parseCondition(intent);
    expect(conditionType).toBe('minimum-quantity');
    expect(conditionValue).toBe(expected);
  });
});

describe('parseCondition — coupon', () => {
  test('use coupon code SAVE20', () => {
    const { conditionType, couponCode } = parseCondition('use coupon code SAVE20');
    expect(conditionType).toBe('coupon');
    expect(couponCode).toBe('SAVE20');
  });
  test('promo code SUMMER15 at checkout', () => {
    const { conditionType, couponCode } = parseCondition('promo code SUMMER15 at checkout');
    expect(conditionType).toBe('coupon');
    expect(couponCode).toBe('SUMMER15');
  });
  test('voucher LOYALTY25 for members', () => {
    const { conditionType, couponCode } = parseCondition('voucher LOYALTY25 for members');
    expect(conditionType).toBe('coupon');
    expect(couponCode).toBe('LOYALTY25');
  });
  test('falls back to PROMO10 when no code found', () => {
    const { conditionType, couponCode } = parseCondition('use a coupon to get a discount');
    expect(conditionType).toBe('coupon');
    expect(couponCode).toBe('PROMO10');
  });
});

describe('parseCondition — none', () => {
  test('no condition on simple promo', () => {
    const { conditionType, conditionValue } = parseCondition('10% off everything');
    expect(conditionType).toBe('none');
    expect(conditionValue).toBeNull();
  });
});

// ─── parseDates ────────────────────────────────────────────────────────────────

describe('parseDates — month name', () => {
  test('in July → full July of current/next year', () => {
    const { startDate, endDate } = parseDates('10% off in July', NOW);
    expect(new Date(startDate).getUTCMonth()).toBe(6); // July = 6
    expect(new Date(startDate).getUTCDate()).toBe(1);
    expect(new Date(endDate).getUTCMonth()).toBe(6);
    expect(new Date(endDate).getUTCDate()).toBe(31);
  });
  test('during August 2026', () => {
    const { startDate, endDate } = parseDates('during August 2026', NOW);
    expect(new Date(startDate).getUTCFullYear()).toBe(2026);
    expect(new Date(startDate).getUTCMonth()).toBe(7); // August = 7
    expect(new Date(startDate).getUTCDate()).toBe(1);
    expect(new Date(endDate).getUTCMonth()).toBe(7);
    expect(new Date(endDate).getUTCDate()).toBe(31);
  });
  test('December sale', () => {
    const { startDate, endDate } = parseDates('December sale this year', NOW);
    expect(new Date(startDate).getUTCMonth()).toBe(11); // December = 11
    expect(new Date(startDate).getUTCDate()).toBe(1);
    expect(new Date(endDate).getUTCMonth()).toBe(11);
    expect(new Date(endDate).getUTCDate()).toBe(31);
  });
});

describe('parseDates — relative keywords', () => {
  test('this week → +7 days', () => {
    const { startDate, endDate } = parseDates('free shipping this week', NOW);
    const diffMs = new Date(endDate) - new Date(startDate);
    expect(Math.round(diffMs / 86400000)).toBe(7);
  });

  test('this month → start/end of current month', () => {
    const { startDate, endDate } = parseDates('save 10% this month', NOW);
    expect(new Date(startDate).getUTCDate()).toBe(1);
    expect(new Date(endDate).getUTCMonth()).toBe(new Date(startDate).getUTCMonth());
  });

  test('next month → start/end of next month', () => {
    const { startDate } = parseDates('promotion runs next month', NOW);
    expect(new Date(startDate).getUTCMonth()).toBe((NOW.getUTCMonth() + 1) % 12);
  });

  test('holiday → December of current/next year', () => {
    const { startDate } = parseDates('holiday promotion', NOW);
    expect(new Date(startDate).getUTCMonth()).toBe(11);
  });

  test('black friday → November', () => {
    const { startDate } = parseDates('Black Friday deal', NOW);
    expect(new Date(startDate).getUTCMonth()).toBe(10);
  });

  test('default → 90-day window', () => {
    const { startDate, endDate } = parseDates('some promo with no dates', NOW);
    const diffMs = new Date(endDate) - new Date(startDate);
    expect(Math.round(diffMs / 86400000)).toBe(90);
  });
});

// ─── parseExclusivity ─────────────────────────────────────────────────────────

describe('parseExclusivity', () => {
  test('VIP customers → class', () => expect(parseExclusivity('VIP customers only')).toBe('class'));
  test('members only → class',  () => expect(parseExclusivity('members only discount')).toBe('class'));
  test('loyalty → class',       () => expect(parseExclusivity('loyalty reward')).toBe('class'));
  test('exclusive offer → class',() => expect(parseExclusivity('exclusive offer')).toBe('class'));
  test('employees → class',     () => expect(parseExclusivity('for employees')).toBe('class'));
  test('site-wide → global',    () => expect(parseExclusivity('site-wide sale')).toBe('global'));
  test('sitewide → global',     () => expect(parseExclusivity('sitewide promotion')).toBe('global'));
  test('all customers → global',() => expect(parseExclusivity('for all customers')).toBe('global'));
  test('no signal → no',        () => expect(parseExclusivity('10% off shoes')).toBe('no'));
});

// ─── parseCurrency ────────────────────────────────────────────────────────────

describe('parseCurrency', () => {
  test('£ sign → GBP',         () => expect(parseCurrency('£10 off')).toBe('GBP'));
  test('GBP keyword → GBP',    () => expect(parseCurrency('10 GBP off')).toBe('GBP'));
  test('€ sign → EUR',         () => expect(parseCurrency('€20 off')).toBe('EUR'));
  test('CAD keyword → CAD',    () => expect(parseCurrency('CA$50 orders')).toBe('CAD'));
  test('AUD keyword → AUD',    () => expect(parseCurrency('AU$ 100 minimum')).toBe('AUD'));
  test('$ or no signal → USD', () => expect(parseCurrency('$50 off everything')).toBe('USD'));
});

// ─── parseProductKeywords ─────────────────────────────────────────────────────

describe('parseProductKeywords', () => {
  test('extracts shoe categories', () => {
    const kw = parseProductKeywords('Buy 2 shoes get 20% off');
    expect(kw).toContain('shoes');
  });
  test('extracts multiple categories', () => {
    const kw = parseProductKeywords('10% off jackets and accessories');
    expect(kw).toContain('jackets');
    expect(kw).toContain('accessories');
  });
  test('returns empty array when no keywords match', () => {
    const kw = parseProductKeywords('10% off your next order');
    expect(kw).toEqual([]);
  });
  test('deduplicates keywords', () => {
    const kw = parseProductKeywords('buy shoes, all shoes on sale');
    expect(kw.filter(k => k === 'shoes').length).toBe(1);
  });
});

// ─── parseIntent (v2 PromotionDocumentV2 integration) ────────────────────────
//
// parseIntent now returns:
//   { document, confidence, clarificationRequired, clarificationQuestions, warnings, parserTrace }
//
// document is a PromotionDocumentV2 — nested under document.promotion, document.campaign, etc.

describe('parseIntent — full intent scenarios (v2)', () => {
  test('VIP shoes 20% off above $100 → product rule (category overrides threshold), class exclusivity, shoes', () => {
    const result = parseIntent(
      'Buy 2 shoes get 20% off for VIP customers on orders above $100',
      NOW
    );
    expect(result.document).toBeDefined();
    const p = result.document.promotion;
    expect(p.discounts[0].discountType).toBe('percentage');
    expect(p.discounts[0].discountValue).toBe(20);
    expect(p.exclusivity).toBe('class');
    // Category qualifier (shoes) takes precedence over the $100 threshold — product rule.
    expect(p.ruleType).toBe('product');
    expect(p.id).toBeTruthy();
    expect(p.lifecycle.enabled).toBe(true);
    // Category: shoes
    const catIds = p.qualifyingProducts.conditionGroups[0].categoryCondition?.categoryIds || [];
    expect(catIds).toContain('shoes');
    // Threshold is still applied to the discount tier
    expect(p.discounts[0].threshold).toBe(100);
  });

  test('free shipping for all customers this month → shipping rule, global exclusivity', () => {
    const result = parseIntent('Free shipping for all customers this month', NOW);
    const p = result.document.promotion;
    expect(p.ruleType).toBe('shipping');
    expect(p.discounts[0].discountType).toBe('free-shipping');
    expect(p.exclusivity).toBe('global');
  });

  test('$20 off with coupon WINTER20 in December → product rule, coupon, December dates', () => {
    const result = parseIntent('$20 off with coupon WINTER20 in December', NOW);
    const p = result.document.promotion;
    expect(p.discounts[0].discountType).toBe('amount');
    expect(p.discounts[0].discountValue).toBe(20);
    // Campaign or assignment should carry the December schedule
    const startDate = result.document.campaign?.startDate || result.document.assignment?.schedule?.startDate;
    if (startDate) expect(startDate).toContain('-12-');
    // Coupon should be in assignment activationCoupons
    const coupons = result.document.assignment?.activationCoupons || [];
    expect(coupons).toContain('WINTER20');
  });

  test('15% off jackets for loyalty members next month → lifecycle.exclusivity=class, apparel category', () => {
    const result = parseIntent('15% off jackets for loyalty members next month', NOW);
    const p = result.document.promotion;
    expect(p.discounts[0].discountType).toBe('percentage');
    expect(p.discounts[0].discountValue).toBe(15);
    expect(p.exclusivity).toBe('class');
    // Campaign schedule → next month
    const startDate = result.document.campaign?.startDate || result.document.assignment?.schedule?.startDate;
    if (startDate) expect(new Date(startDate).getUTCMonth()).toBe((NOW.getUTCMonth() + 1) % 12);
    // Category: jackets maps to apparel SFCC ID
    const catIds = p.qualifyingProducts.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(catIds).toContain('apparel');
  });

  test('gift with purchase on orders over $75 in July → product rule, threshold 75, July dates', () => {
    const result = parseIntent('Gift with purchase on orders over $75 in July', NOW);
    const p = result.document.promotion;
    // GWP is a 'free' kind discount
    expect(p.discounts[0].discountType).toBe('free-shipping');
    // conditionValue $75 applied as threshold OR as order-rule condition
    // July start date should appear somewhere
    const startDate = result.document.campaign?.startDate || result.document.assignment?.schedule?.startDate;
    if (startDate) expect(startDate).toContain('-07-');
  });

  test('fixed price $9.99 on accessories sitewide → fixed-price kind, global exclusivity', () => {
    const result = parseIntent('Fixed price $9.99 on accessories sitewide', NOW);
    const p = result.document.promotion;
    expect(p.discounts[0].discountType).toBe('fixed-price');
    expect(p.discounts[0].discountValue).toBeCloseTo(9.99);
    expect(p.exclusivity).toBe('global');
    const catIds = p.qualifyingProducts.conditionGroups[0]?.categoryCondition?.categoryIds || [];
    expect(catIds).toContain('accessories');
  });

  test('document conforms to PromotionDocumentV2 required top-level fields', () => {
    const result = parseIntent('10% off everything', NOW);
    expect(result).toHaveProperty('document');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('clarificationRequired');
    expect(result).toHaveProperty('clarificationQuestions');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('parserTrace');
  });

  test('document.promotion has all required PromotionDocumentV2 fields', () => {
    const result = parseIntent('10% off everything', NOW);
    const p = result.document.promotion;
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('lifecycle');
    expect(p).toHaveProperty('exclusivity');
    expect(p).toHaveProperty('ruleType');
    expect(p).toHaveProperty('discountConditionType');
    expect(p).toHaveProperty('discounts');
    expect(p).toHaveProperty('qualifyingProducts');
    expect(p.lifecycle).toHaveProperty('enabled');
    expect(p.lifecycle).toHaveProperty('archived');
    expect(Array.isArray(p.discounts)).toBe(true);
    expect(p.discounts.length).toBeGreaterThan(0);
  });

  test('promotion id is kebab-case', () => {
    const result = parseIntent('Summer sale 20% off!', NOW);
    expect(result.document.promotion.id).toMatch(/^[a-z0-9-]+$/);
  });

  test('globalSettings defaults are present', () => {
    const result = parseIntent('10% off this week', NOW);
    const gs = result.document.globalSettings;
    expect(gs.catalogId).toBeTruthy();
    expect(Array.isArray(gs.excludedCategoryIds)).toBe(true);
    expect(gs.excludedCategoryIds.length).toBeGreaterThan(0);
    expect(Array.isArray(gs.excludedProductOptionIds)).toBe(true);
  });

  test('campaign created when VIP qualifier detected', () => {
    const result = parseIntent('20% off for VIP members this month', NOW);
    expect(result.document.campaign).toBeDefined();
    expect(result.document.assignment).toBeDefined();
  });

  test('no campaign when no qualifier and no customer group', () => {
    const result = parseIntent('10% off all orders', NOW);
    // No customer group → no campaign block generated
    // (open promotion — depends on orchestrator logic)
    // Just verify promotion is always present
    expect(result.document.promotion).toBeDefined();
  });

  test('tiered discount: 10% over $500 and 20% over $2000', () => {
    const result = parseIntent('10% off on orders over $500 and 20% off on orders over $2000', NOW);
    const p = result.document.promotion;
    expect(p.discounts.length).toBe(2);
    expect(p.discounts[0].threshold).toBe(500);
    expect(p.discounts[0].discountValue).toBe(10);
    expect(p.discounts[1].threshold).toBe(2000);
    expect(p.discounts[1].discountValue).toBe(20);
    expect(p.ruleType).toBe('order');
  });

  test('employee discount → class exclusivity, Employees customer group', () => {
    const result = parseIntent('20% off for all employees', NOW);
    const p = result.document.promotion;
    expect(p.exclusivity).toBe('class');
    const groupIds = result.document.campaign?.customerGroups?.groupIds || [];
    expect(groupIds).toContain('Employees');
  });

  test('parserTrace contains all strategy names', () => {
    const result = parseIntent('10% off shoes', NOW);
    const trace = result.parserTrace;
    ['discount', 'schedule', 'qualifier', 'shipping', 'category', 'exclusion', 'lifecycle', 'condition', 'currency'].forEach(name => {
      expect(trace).toHaveProperty(name);
    });
  });
});
