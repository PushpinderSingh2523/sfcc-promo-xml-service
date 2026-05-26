'use strict';

/**
 * localParser.js — v2 Orchestrator
 *
 * Converts a plain-English promotion intent into a full PromotionDocumentV2.
 * This module orchestrates 8 parser strategy modules and does NOT generate XML.
 *
 * Architecture:
 *   intent text
 *   → 8 parser strategies (each returns { value, confidence, matchedPatterns, warnings })
 *   → rule-type resolution
 *   → PromotionDocumentV2 assembly
 *   → ambiguity detection → clarificationQuestions[]
 *   → { document, confidence, clarificationRequired, clarificationQuestions, warnings, parserTrace }
 *
 * Backward-compat re-exports preserved so existing unit tests keep working
 * without import-path changes.
 */

const { slugify } = require('../utils/helpers');

const discountParser  = require('./parserStrategies/discountParser');
const scheduleParser  = require('./parserStrategies/scheduleParser');
const qualifierParser = require('./parserStrategies/qualifierParser');
const shippingParser  = require('./parserStrategies/shippingParser');
const categoryParser  = require('./parserStrategies/categoryParser');
const exclusionParser = require('./parserStrategies/exclusionParser');
const lifecycleParser = require('./parserStrategies/lifecycleParser');
const conditionParser = require('./parserStrategies/conditionParser');
const currencyParser  = require('./parserStrategies/currencyParser');

const DEFAULT_CATALOG_ID         = process.env.SFCC_CATALOG_ID || 'siteCatalog_ToryUS';
const DEFAULT_EXCLUDED_CATS      = ['Exclusions-Always', 'accessories-seedbox-foundation', 'accessories-masks'];
const DEFAULT_EXCLUDED_OPTIONS   = ['monogramming'];

// ─── Rule-type resolution ──────────────────────────────────────────────────────

/**
 * Determines ruleType, discountConditionType, and orderRuleOptions
 * from strategy outputs.
 */
function resolveRuleType(discountResult, shippingResult, categoryResult, conditionResult) {
  const { ruleTypeHint } = discountResult.value;
  const { isShippingPromo } = shippingResult.value;
  const { qualifyingCategoryIds } = categoryResult.value;
  const { conditionType, conditionValue } = conditionResult.value;

  // Shipping promo takes precedence when discount is 'free' or shipping signals present
  if (isShippingPromo || ruleTypeHint === 'shipping') {
    return {
      ruleType: 'shipping',
      discountConditionType: 'shipment-total',
      orderRuleOptions: null,
    };
  }

  // Order-level when there's an order-total threshold or tiered hints
  if (ruleTypeHint === 'order') {
    return {
      ruleType: 'order',
      discountConditionType: 'order-total',
      orderRuleOptions: {
        discountOnlyQualifyingProducts: qualifyingCategoryIds.length > 0,
        excludeDiscountedProducts: false,
      },
    };
  }

  // Category or product qualifier present — always product-level regardless of threshold.
  // A "spend $X" phrase scopes the basket but does NOT make it an order promotion when
  // the intent is clearly tied to a product category (e.g. "products in summer-sale
  // after spending $100").  The threshold is still applied to the discount tier below.
  if (qualifyingCategoryIds.length > 0) {
    return {
      ruleType: 'product',
      discountConditionType: 'product-amount',
      orderRuleOptions: null,
    };
  }

  // Order-level when condition is minimum-amount with no category scope
  // (e.g. "20% off on orders over $100")
  if (conditionType === 'minimum-amount') {
    return {
      ruleType: 'order',
      discountConditionType: 'order-total',
      orderRuleOptions: {
        discountOnlyQualifyingProducts: false,
        excludeDiscountedProducts: false,
      },
    };
  }

  // Product-level by default (product-specific discount or fallback)
  return {
    ruleType: 'product',
    discountConditionType: 'product-amount',
    orderRuleOptions: null,
  };
}

// ─── Qualifying products builder ───────────────────────────────────────────────

function buildQualifyingProducts(categoryResult, conditionResult) {
  const { qualifyingCategoryIds, catalogId } = categoryResult.value;
  const { conditionType, conditionValue } = conditionResult.value;

  const conditionGroups = [];

  if (qualifyingCategoryIds.length > 0) {
    conditionGroups.push({
      categoryCondition: {
        catalogId,
        operator: 'is equal',
        categoryIds: qualifyingCategoryIds,
      },
    });
  }

  // Price gate is used when no category (open product scope) OR as supplement
  if (conditionGroups.length === 0) {
    conditionGroups.push({
      priceCondition: { operator: 'greater than', price: 0.01 },
    });
  }

  return { conditionGroups };
}

// ─── Excluded products builder ─────────────────────────────────────────────────

function buildExcludedProducts(exclusionResult) {
  const { excludedCategoryIds, catalogId } = exclusionResult.value;
  if (!excludedCategoryIds.length) return null;

  return {
    conditionGroups: [{
      categoryCondition: {
        catalogId,
        operator: 'is equal',
        categoryIds: excludedCategoryIds,
      },
    }],
  };
}

// ─── Discount shape conversion ─────────────────────────────────────────────────

/**
 * Convert a parser-internal tier { kind, value, threshold } to the canonical
 * PromotionDocumentV2 discount shape { threshold, discountType, discountValue }.
 *
 * `kind: 'free'` → `discountType: 'free-shipping'` so the downstream renderers
 * can use a single consistent type string.  xmlServiceV2 maps 'free-shipping'
 * back to the <free/> XML element it has always produced.
 *
 * @param {{ kind: string, value: number, threshold: number }} tier
 * @returns {{ threshold: number, discountType: string, discountValue: number }}
 */
function _toCanonicalDiscount(tier) {
  return {
    threshold:    tier.threshold,
    discountType: tier.kind === 'free' ? 'free-shipping' : tier.kind,
    discountValue: tier.value,
  };
}

// ─── Discount tiers — apply minimum-amount condition as threshold ──────────────

function applyConditionToTiers(tiers, conditionResult, ruleType) {
  const { conditionType, conditionValue } = conditionResult.value;
  if (conditionType !== 'minimum-amount' || conditionValue == null) return tiers;

  // Apply the basket minimum as a tier threshold for both order and product promotions.
  // For product promotions scoped to a category (e.g. "20% off summer-sale after spending
  // $100") the threshold still represents the qualifying basket size and must be preserved.
  return tiers.map(t => ({ ...t, threshold: t.threshold <= 0.01 ? conditionValue : t.threshold }));
}

// ─── Confidence aggregation ────────────────────────────────────────────────────

function aggregateConfidence(results) {
  const scores = results.map(r => r.confidence).filter(c => c != null);
  if (!scores.length) return 0;
  // Weighted average, pulling down hard by low-confidence results
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  // If any strategy is very low confidence, penalise overall
  return parseFloat(((avg * 0.7 + min * 0.3)).toFixed(2));
}

// ─── Ambiguity detection ───────────────────────────────────────────────────────

function detectAmbiguities(doc, strategyResults, text) {
  const questions = [];

  // No discount amount
  const disc = strategyResults.discount;
  if (disc.confidence < 0.40) {
    questions.push({
      field: 'discounts',
      question: 'What discount should customers get? For example: "20% off", "$10 off", or "free shipping".',
      severity: 'critical',
    });
  }

  // Free shipping with no methods
  if (doc.promotion.ruleType === 'shipping') {
    const opts = doc.promotion.shippingRuleOptions;
    if (!opts || !opts.methodIds || !opts.methodIds.length) {
      questions.push({
        field: 'shippingRuleOptions.methodIds',
        question: 'Which shipping methods should be free? For example: "standard", "two-day", or "overnight".',
        severity: 'critical',
      });
    }
  }

  // No schedule
  const sched = strategyResults.schedule;
  if (sched.confidence < 0.20) {
    questions.push({
      field: 'schedule',
      question: 'When should this promotion run? For example: "in July", "from June 1 to June 30", or "this weekend".',
      severity: 'recommended',
    });
  }

  // No qualifying products for product/order rule
  if (doc.promotion.ruleType !== 'shipping') {
    const cat = strategyResults.category;
    if (cat.confidence < 0.30 && !text.match(/\b(?:all|everything|all\s+products?|entire\s+site)\b/i)) {
      questions.push({
        field: 'qualifyingProducts',
        question: 'Which products should this promotion apply to? For example: "handbags", "shoes", or "all products".',
        severity: 'recommended',
      });
    }
  }

  // Coupon keyword but no code extracted
  if (strategyResults.qualifier.warnings.some(w => w.includes('no code extracted'))) {
    questions.push({
      field: 'activationCoupons',
      question: 'What is the coupon code customers need to enter? For example: "SAVE20" or "SUMMER2024".',
      severity: 'critical',
    });
  }

  return questions;
}

// ─── PromotionDocumentV2 assembler ─────────────────────────────────────────────

function assembleDocument(text, strategyResults, ruleResolution, now) {
  const { ruleType, discountConditionType, orderRuleOptions } = ruleResolution;
  const qualRes  = strategyResults.qualifier;
  const schedRes = strategyResults.schedule;
  const discRes  = strategyResults.discount;
  const shipRes  = strategyResults.shipping;
  const catRes   = strategyResults.category;
  const excRes   = strategyResults.exclusion;
  const lcRes    = strategyResults.lifecycle;
  const condRes  = strategyResults.condition;

  const promotionId = slugify(text.trim()).slice(0, 80) || 'promotion';
  const campaignId  = `campaign-${promotionId}`;
  const name        = text.trim().length > 100 ? text.trim().slice(0, 97) + '...' : text.trim();

  const hasCampaign = qualRes.value.customerGroupIds.length > 0
    || qualRes.value.activationCoupons.length > 0
    || schedRes.value.level === 'campaign';

  // Adjust tiers with condition-based threshold (parser-internal shape: {kind, value, threshold})
  let adjustedTiers = applyConditionToTiers(discRes.value.tiers, condRes, ruleType);

  // Shipping promotions are always free-discount; override any mis-parsed kind
  if (ruleType === 'shipping') {
    if (!adjustedTiers.length || !adjustedTiers.some(t => t.kind === 'free')) {
      adjustedTiers = [{ kind: 'free', value: 0, threshold: 0 }];
    } else {
      adjustedTiers = adjustedTiers.map(t => ({ ...t, kind: 'free' }));
    }
  }

  // Convert to canonical PromotionDocumentV2 shape before writing to the document
  const discounts = adjustedTiers.map(_toCanonicalDiscount);

  // Build qualifying products
  const qualifyingProducts = buildQualifyingProducts(catRes, condRes);

  // Build promotion exclusions
  const excludedProducts = buildExcludedProducts(excRes);

  // Shipping rule options
  let shippingRuleOptions = null;
  if (ruleType === 'shipping') {
    shippingRuleOptions = {
      methodIds: shipRes.value.methodIds.length ? shipRes.value.methodIds : [],
      disableGlobalExcludedProducts: shipRes.value.disableGlobalExcludedProducts,
    };
    if (shipRes.value.upsellThreshold != null) {
      shippingRuleOptions.upsellThreshold = shipRes.value.upsellThreshold;
    }
  }

  const doc = {
    globalSettings: {
      catalogId: DEFAULT_CATALOG_ID,
      excludedCategoryIds: DEFAULT_EXCLUDED_CATS,
      excludedProductOptionIds: DEFAULT_EXCLUDED_OPTIONS,
    },

    promotion: {
      id:   promotionId,
      name,
      lifecycle: lcRes.value.lifecycle,
      exclusivity: lcRes.value.exclusivity,
      ruleType,
      discountConditionType,
      discounts,
      qualifyingProducts,
      customAttributes: { gwp: false, isExcludeTranslate: false },
    },
  };

  // Add excluded products if any
  if (excludedProducts) {
    doc.promotion.excludedProducts = excludedProducts;
  }

  // Add rule-specific options
  if (ruleType === 'product' && condRes.value.conditionType === 'coupon') {
    doc.promotion.productRuleOptions = { maxApplications: 1 };
  }
  if (ruleType === 'order' && orderRuleOptions) {
    doc.promotion.orderRuleOptions = orderRuleOptions;
  }
  if (ruleType === 'shipping' && shippingRuleOptions) {
    doc.promotion.shippingRuleOptions = shippingRuleOptions;
  }

  // Campaign block
  if (hasCampaign) {
    doc.campaign = {
      id: campaignId,
      enabled: true,
      scope: 'online',
    };

    if (schedRes.value.level === 'campaign') {
      doc.campaign.startDate = schedRes.value.startDate;
      doc.campaign.endDate   = schedRes.value.endDate;
    }

    if (qualRes.value.customerGroupIds.length > 0) {
      doc.campaign.customerGroups = {
        matchMode: 'any',
        groupIds: qualRes.value.customerGroupIds,
      };
    }

    // Assignment block
    doc.assignment = {
      promotionId,
      campaignId,
      qualifiers: {
        matchMode: 'any',
        customerGroupIds: qualRes.value.customerGroupIds,
        sourceCodes:      qualRes.value.sourceCodes,
        qualifierCouponIds: [],
      },
      activationCoupons: qualRes.value.activationCoupons,
    };

    if (schedRes.value.level === 'assignment') {
      doc.assignment.schedule = {
        startDate: schedRes.value.startDate,
        endDate:   schedRes.value.endDate,
      };
    }
  }

  return doc;
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse natural language promotion intent into a PromotionDocumentV2.
 *
 * @param {string} intent
 * @param {Date}   [now]      Override current date (for testing)
 * @returns {object}          Full parser result with document, confidence, clarification
 */
function parseIntent(intent, now = new Date()) {
  const text = (intent || '').trim();

  // Run all strategies
  const strategyResults = {
    discount:  discountParser.parse(text),
    schedule:  scheduleParser.parse(text, now),
    qualifier: qualifierParser.parse(text),
    shipping:  shippingParser.parse(text),
    category:  categoryParser.parse(text),
    exclusion: exclusionParser.parse(text),
    lifecycle: lifecycleParser.parse(text),
    condition: conditionParser.parse(text),
    currency:  currencyParser.parse(text),
  };

  // Resolve rule type
  const ruleResolution = resolveRuleType(
    strategyResults.discount,
    strategyResults.shipping,
    strategyResults.category,
    strategyResults.condition,
  );

  // Assemble document
  const document = assembleDocument(text, strategyResults, ruleResolution, now);

  // Confidence + warnings
  const relevantResults = Object.values(strategyResults).filter(r =>
    r.matchedPatterns.length > 0 || r.confidence > 0.4
  );
  const confidence = aggregateConfidence(Object.values(strategyResults));

  const allWarnings = Object.entries(strategyResults).flatMap(([name, r]) =>
    r.warnings.map(w => `[${name}] ${w}`)
  );

  // Ambiguity detection
  const clarificationQuestions = detectAmbiguities(document, strategyResults, text);
  const clarificationRequired  = clarificationQuestions.some(q => q.severity === 'critical');

  // Parser trace (logged, not written to XML)
  const parserTrace = Object.fromEntries(
    Object.entries(strategyResults).map(([name, r]) => [name, {
      confidence: r.confidence,
      matchedPatterns: r.matchedPatterns,
      warnings: r.warnings,
    }])
  );
  parserTrace.ruleType = ruleResolution.ruleType;

  return {
    document,
    confidence,
    clarificationRequired,
    clarificationQuestions,
    warnings: allWarnings,
    parserTrace,
  };
}

// ─── Backward-compat re-exports ────────────────────────────────────────────────
// Keep old named exports so localParser.test.js imports keep working.

const { parseDiscount }       = discountParser;
const { parseDates }          = scheduleParser;
const { parseExclusivity }    = lifecycleParser;
const { parseCurrency }       = currencyParser;
const { parseProductKeywords }= categoryParser;
const { parseCondition }      = conditionParser;

module.exports = {
  parseIntent,
  // Backward-compat
  parseDiscount,
  parseCondition,
  parseDates,
  parseExclusivity,
  parseCurrency,
  parseProductKeywords,
};
