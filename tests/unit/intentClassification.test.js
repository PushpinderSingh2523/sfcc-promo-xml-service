'use strict';

/**
 * intentClassification.test.js
 *
 * Deterministic intent classification tests — Phase 7 bug fix validation.
 *
 * Covers the exact 7 scenarios (A–G) that verified the precedence-rule fix and
 * the dynamic category slug extraction added in Phase 7.
 *
 * Key invariants under test:
 *   1. Category qualifier ALWAYS overrides minimum-amount threshold for rule-type
 *      classification.  Presence of "spend $X" does NOT make a category-scoped
 *      promo an order promotion.
 *   2. Dynamic slug extraction captures arbitrary identifiers (hyphenated,
 *      uppercased, raw slugs) that are not in the static CATEGORY_RULES list.
 *   3. The basket threshold IS still applied to the discount tier even when
 *      ruleType resolves to 'product'.
 *   4. No category warning is emitted when a category was successfully extracted.
 *   5. Qualifying products use categoryCondition (not priceCondition) when a
 *      category was extracted.
 *
 * NO AI, NO fuzzy inference — only deterministic extraction.
 */

const { parseIntent }              = require('../../src/services/localParser');
const { parse: parseCategory }     = require('../../src/services/parserStrategies/categoryParser');

const NOW = new Date('2026-06-15T12:00:00.000Z');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pull out the categoryCondition categoryIds from the first conditionGroup, or []. */
function getCategoryIds(doc) {
  return (
    doc.promotion.qualifyingProducts
      ?.conditionGroups?.[0]
      ?.categoryCondition
      ?.categoryIds ?? []
  );
}

/** Return true if qualifying products use categoryCondition (not priceCondition). */
function usesCategoryCondition(doc) {
  const cg = doc.promotion.qualifyingProducts?.conditionGroups ?? [];
  return cg.length > 0 && 'categoryCondition' in cg[0];
}

/** Collect all [category] warnings from the full result. */
function getCategoryWarnings(result) {
  return result.warnings.filter(w => w.startsWith('[category]'));
}

// ─── Scenario A ───────────────────────────────────────────────────────────────
//
// The primary failing case that triggered Phase 7.
// "products in the summer-sale category" + "after spending $100"
// → must be product, not order.

describe('Scenario A — product promotion with dynamic category slug + threshold', () => {
  const TEXT =
    'Create a product promotion giving 20% off products in the summer-sale category after spending $100';

  let result;
  beforeAll(() => { result = parseIntent(TEXT, NOW); });

  test('ruleType is product', () => {
    expect(result.document.promotion.ruleType).toBe('product');
  });

  test('categoryId contains summer-sale', () => {
    expect(getCategoryIds(result.document)).toContain('summer-sale');
  });

  test('discount is 20 percent', () => {
    const tier = result.document.promotion.discounts[0];
    expect(tier.discountType).toBe('percentage');
    expect(tier.discountValue).toBe(20);
  });

  test('threshold is 100 (basket minimum preserved)', () => {
    expect(result.document.promotion.discounts[0].threshold).toBe(100);
  });

  test('no category warning emitted', () => {
    expect(getCategoryWarnings(result)).toHaveLength(0);
  });

  test('qualifying products use categoryCondition, not priceCondition', () => {
    expect(usesCategoryCondition(result.document)).toBe(true);
  });

  test('discountConditionType is product-amount', () => {
    expect(result.document.promotion.discountConditionType).toBe('product-amount');
  });
});

// ─── Scenario B ───────────────────────────────────────────────────────────────
//
// Static category (handbags) + threshold → product rule.
// "items from handbags" also exercises the dynamic "items from <slug>" pattern
// (handbags is also in the static list, so it's a determinism check).

describe('Scenario B — static category (handbags) + threshold → product rule', () => {
  const TEXT = '30% off items from handbags over $250';

  let result;
  beforeAll(() => { result = parseIntent(TEXT, NOW); });

  test('ruleType is product', () => {
    expect(result.document.promotion.ruleType).toBe('product');
  });

  test('categoryId contains handbags', () => {
    expect(getCategoryIds(result.document)).toContain('handbags');
  });

  test('discount is 30 percent', () => {
    const tier = result.document.promotion.discounts[0];
    expect(tier.discountType).toBe('percentage');
    expect(tier.discountValue).toBe(30);
  });

  test('threshold is 250', () => {
    expect(result.document.promotion.discounts[0].threshold).toBe(250);
  });

  test('no category warning emitted', () => {
    expect(getCategoryWarnings(result)).toHaveLength(0);
  });

  test('qualifying products use categoryCondition', () => {
    expect(usesCategoryCondition(result.document)).toBe(true);
  });
});

// ─── Scenario C ───────────────────────────────────────────────────────────────
//
// Pure shipping promotion — shipping must always take highest precedence.

describe('Scenario C — free shipping over $100 → shipping rule', () => {
  const TEXT = 'Free shipping over $100';

  let result;
  beforeAll(() => { result = parseIntent(TEXT, NOW); });

  test('ruleType is shipping', () => {
    expect(result.document.promotion.ruleType).toBe('shipping');
  });

  test('discount tier kind is free', () => {
    expect(result.document.promotion.discounts[0].discountType).toBe('free-shipping');
  });
});

// ─── Scenario D ───────────────────────────────────────────────────────────────
//
// Threshold with NO category → order rule (threshold-only path preserved).

describe('Scenario D — threshold only, no category → order rule', () => {
  const TEXT = '20% off orders over $100';

  let result;
  beforeAll(() => { result = parseIntent(TEXT, NOW); });

  test('ruleType is order', () => {
    expect(result.document.promotion.ruleType).toBe('order');
  });

  test('discountConditionType is order-total', () => {
    expect(result.document.promotion.discountConditionType).toBe('order-total');
  });

  test('discount is 20 percent', () => {
    const tier = result.document.promotion.discounts[0];
    expect(tier.discountType).toBe('percentage');
    expect(tier.discountValue).toBe(20);
  });
});

// ─── Scenario E ───────────────────────────────────────────────────────────────
//
// Hyphenated + mixed-case slug: "Sale-viewAll" — not in static CATEGORY_RULES.
// Must be extracted dynamically via the "<slug> category" pattern.

describe('Scenario E — dynamic slug: Sale-viewAll category', () => {
  const TEXT = '50% off Sale-viewAll category';

  test('categoryParser extracts Sale-viewAll', () => {
    const r = parseCategory(TEXT);
    expect(r.value.qualifyingCategoryIds).toContain('Sale-viewAll');
  });

  test('no category warning emitted from categoryParser', () => {
    const r = parseCategory(TEXT);
    expect(r.warnings).toHaveLength(0);
  });

  test('parseIntent — ruleType is product', () => {
    const result = parseIntent(TEXT, NOW);
    expect(result.document.promotion.ruleType).toBe('product');
  });

  test('parseIntent — categoryIds contain Sale-viewAll', () => {
    const result = parseIntent(TEXT, NOW);
    expect(getCategoryIds(result.document)).toContain('Sale-viewAll');
  });

  test('parseIntent — no category warning', () => {
    const result = parseIntent(TEXT, NOW);
    expect(getCategoryWarnings(result)).toHaveLength(0);
  });
});

// ─── Scenario F ───────────────────────────────────────────────────────────────
//
// Hyphenated slug with common-word prefix: "accessories-masks".
// Not in the static list as a standalone entry.  Must be extracted dynamically.

describe('Scenario F — dynamic slug: accessories-masks (hyphenated)', () => {
  const TEXT = 'products in accessories-masks';

  test('categoryParser extracts accessories-masks', () => {
    const r = parseCategory(TEXT);
    expect(r.value.qualifyingCategoryIds).toContain('accessories-masks');
  });

  test('confidence is high when category found', () => {
    const r = parseCategory(TEXT);
    expect(r.confidence).toBeGreaterThanOrEqual(0.80);
  });

  test('no category warning when slug extracted', () => {
    const r = parseCategory(TEXT);
    expect(r.warnings).toHaveLength(0);
  });

  test('matchedPatterns includes dynamic entry', () => {
    const r = parseCategory(TEXT);
    const hasDynamic = r.matchedPatterns.some(p => p.includes('dynamic'));
    expect(hasDynamic).toBe(true);
  });
});

// ─── Scenario G ───────────────────────────────────────────────────────────────
//
// All-uppercase raw slug: "RTW" — original casing must be preserved in the output.
// Common in retail systems (Ready-To-Wear).

describe('Scenario G — dynamic slug: RTW (uppercase preserved)', () => {
  const TEXT = 'products in RTW';

  test('categoryParser extracts RTW with uppercase preserved', () => {
    const r = parseCategory(TEXT);
    expect(r.value.qualifyingCategoryIds).toContain('RTW');
  });

  test('RTW is NOT lowercased to rtw', () => {
    const r = parseCategory(TEXT);
    expect(r.value.qualifyingCategoryIds).not.toContain('rtw');
  });

  test('no category warning when slug extracted', () => {
    const r = parseCategory(TEXT);
    expect(r.warnings).toHaveLength(0);
  });

  test('confidence is high when RTW found', () => {
    const r = parseCategory(TEXT);
    expect(r.confidence).toBeGreaterThanOrEqual(0.80);
  });
});

// ─── Cross-cutting: categoryParser dynamic extraction unit tests ───────────────

describe('categoryParser — dynamic extraction patterns', () => {
  test.each([
    ['products in summer-sale category after spending $100', 'summer-sale'],
    ['items from summer-sale',                               'summer-sale'],
    ['in the sale-new-arrivals category',                   'sale-new-arrivals'],
    ['50% off clearance-2026 category',                     'clearance-2026'],
    ['products in RTW',                                     'RTW'],
    ['products in Sale-viewAll category',                   'Sale-viewAll'],
    ['products in accessories-masks',                       'accessories-masks'],
  ])('%s → qualifyingCategoryIds contains %s', (text, expected) => {
    const r = parseCategory(text);
    expect(r.value.qualifyingCategoryIds).toContain(expected);
  });

  test('stop-words (products, items, all) are not extracted as slugs', () => {
    const r = parseCategory('discount on products');
    // 'products' alone should NOT appear as a category slug
    expect(r.value.qualifyingCategoryIds).not.toContain('products');
  });

  test('dynamic extraction does not duplicate a static category ID', () => {
    // "items from handbags" — static rule catches handbags, dynamic should not add it again
    const r = parseCategory('items from handbags');
    const handbagEntries = r.value.qualifyingCategoryIds.filter(id => id === 'handbags');
    expect(handbagEntries).toHaveLength(1);
  });

  test('original casing is preserved (Sale-viewAll, not sale-viewall)', () => {
    const r = parseCategory('50% off Sale-viewAll category');
    const ids = r.value.qualifyingCategoryIds;
    expect(ids).toContain('Sale-viewAll');
    expect(ids).not.toContain('sale-viewall');
  });
});

// ─── Precedence rule validation ───────────────────────────────────────────────

describe('resolveRuleType precedence', () => {
  test('shipping always wins over category + threshold', () => {
    const r = parseIntent('Free shipping for handbag orders over $50', NOW);
    expect(r.document.promotion.ruleType).toBe('shipping');
  });

  test('category wins over threshold-only (no category = order)', () => {
    const withCategory    = parseIntent('20% off shoes over $100', NOW);
    const withoutCategory = parseIntent('20% off over $100',       NOW);
    expect(withCategory.document.promotion.ruleType).toBe('product');
    expect(withoutCategory.document.promotion.ruleType).toBe('order');
  });

  test('threshold is applied to product tiers when category present', () => {
    const r = parseIntent('20% off products in summer-sale after spending $150', NOW);
    expect(r.document.promotion.discounts[0].threshold).toBe(150);
    expect(r.document.promotion.ruleType).toBe('product');
  });

  test('threshold-only (no category) produces order with threshold in tier', () => {
    const r = parseIntent('20% off on orders over $200', NOW);
    expect(r.document.promotion.ruleType).toBe('order');
    expect(r.document.promotion.discounts[0].threshold).toBe(200);
  });
});
