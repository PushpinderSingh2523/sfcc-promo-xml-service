'use strict';

/**
 * claudeService.js
 *
 * Intent parsing router.
 *
 * Routing logic (evaluated once at startup):
 *   FEATURE_FLAG_USE_AI=true  AND  valid ANTHROPIC_API_KEY  →  Claude AI (produces v2 document)
 *   anything else                                            →  localParser (deterministic, zero deps)
 *
 * Both paths return the same shape:
 *   {
 *     document:               PromotionDocumentV2,
 *     confidence:             number (0.0 – 1.0),
 *     clarificationRequired:  boolean,
 *     clarificationQuestions: Array,
 *     warnings:               string[],
 *     parserTrace:            object,
 *     source:                 'local' | 'claude'
 *   }
 */

const logger = require('../utils/logger');
const localParser = require('./localParser');
const { slugify, toISODate } = require('../utils/helpers');

// ─── Feature flag resolution ───────────────────────────────────────────────────

const AI_REQUESTED  = process.env.FEATURE_FLAG_USE_AI === 'true';
const KEY           = process.env.ANTHROPIC_API_KEY || '';
const KEY_LOOKS_VALID = KEY.length > 20 && !KEY.startsWith('sk-ant-xxx');
const USE_AI        = AI_REQUESTED && KEY_LOOKS_VALID;

if (AI_REQUESTED && !KEY_LOOKS_VALID) {
  logger.warn(
    'FEATURE_FLAG_USE_AI=true but ANTHROPIC_API_KEY is missing or a placeholder. ' +
    'Falling back to local deterministic parser.'
  );
}

logger.info(`Intent parser mode: ${USE_AI ? 'Claude AI' : 'local (deterministic)'}`);

// ─── Claude system prompt (v2 — produces PromotionDocumentV2) ─────────────────

function buildSystemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are an SFCC (Salesforce Commerce Cloud) promotion configuration expert.
Your ONLY job is to extract structured promotion data from a natural language description and return it as a valid JSON PromotionDocumentV2 object.

DO NOT generate XML. DO NOT add commentary. Return ONLY a raw JSON object — no markdown fences, no explanation.

Today's date: ${today}

Return a JSON object with this exact structure (all fields except marked [optional] are required):

{
  "globalSettings": {
    "catalogId": "siteCatalog_ToryUS",
    "excludedCategoryIds": ["Exclusions-Always", "accessories-seedbox-foundation", "accessories-masks"],
    "excludedProductOptionIds": ["monogramming"]
  },
  "campaign": {                          // [optional] include only if there are customer groups or coupons
    "id": "kebab-case-id",
    "enabled": true,
    "scope": "online"
  },
  "promotion": {
    "id": "kebab-case-id (max 80 chars)",
    "name": "Human readable name (max 100 chars)",
    "lifecycle": {
      "enabled": true,
      "archived": false,
      "searchable": false,
      "refinable": false,
      "preventRequalifying": false,
      "prorateAcrossEligibleItems": false
    },
    "exclusivity": "no" | "class" | "global",
    "ruleType": "product" | "order" | "shipping",
    "discountConditionType": "product-amount" | "order-total" | "shipment-total",
    "discounts": [{ "threshold": number, "discountType": "percentage"|"amount"|"free-shipping"|"fixed-price", "discountValue": number }],
    "qualifyingProducts": {              // [optional]
      "conditionGroups": [{ "priceCondition": { "operator": "greater than", "price": 0.01 } }]
    },
    "shippingRuleOptions": {             // [required when ruleType=shipping]
      "methodIds": ["standard"],
      "disableGlobalExcludedProducts": false
    },
    "orderRuleOptions": {                // [required when ruleType=order]
      "discountOnlyQualifyingProducts": false,
      "excludeDiscountedProducts": false
    },
    "customAttributes": { "gwp": false, "isExcludeTranslate": false }
  },
  "assignment": {                        // [optional] include only when campaign is present
    "promotionId": "same as promotion.id",
    "campaignId": "same as campaign.id",
    "qualifiers": { "matchMode": "any", "customerGroupIds": [], "sourceCodes": [], "qualifierCouponIds": [] },
    "activationCoupons": []
  }
}

Rules:
- ruleType=shipping requires shippingRuleOptions with at least one methodId
- ruleType=order requires orderRuleOptions
- discountConditionType must match ruleType: product→product-amount, order→order-total, shipping→shipment-total
- threshold=0.01 means "no minimum" (effectively open)
- If dates mentioned, put them in campaign.startDate/endDate or assignment.schedule.startDate/endDate
- If coupon code mentioned, put it in assignment.activationCoupons
- If customer groups mentioned, put groupIds in campaign.customerGroups AND assignment.qualifiers.customerGroupIds
- Never hallucinate product or category IDs — only use: handbags, watches, shoes, accessories, apparel, beauty
- Return valid JSON only`;
}

// ─── Claude path ───────────────────────────────────────────────────────────────

async function parseWithClaude(intent) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: KEY });
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

  logger.debug('Calling Claude API for v2 document', { model, intentLength: intent.length });

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: buildSystemPrompt(),
    messages: [{
      role: 'user',
      content: `Extract SFCC promotion data from this description and return a PromotionDocumentV2 JSON:\n\n"${intent}"`,
    }],
  });

  const raw = response.content[0]?.text?.trim();
  if (!raw) throw new Error('Claude returned an empty response.');

  let doc;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    doc = JSON.parse(cleaned);
  } catch {
    logger.error('Failed to parse Claude JSON response', { raw: raw.slice(0, 200) });
    throw new Error(`Claude returned non-JSON content: ${raw.slice(0, 200)}`);
  }

  // Ensure required promotion.id is slugified
  if (doc.promotion) {
    doc.promotion.id = doc.promotion.id || slugify(doc.promotion.name || intent);
  }

  return {
    document: doc,
    confidence: 0.85,
    clarificationRequired: false,
    clarificationQuestions: [],
    warnings: [],
    parserTrace: { source: 'claude', model },
    source: 'claude',
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse intent into a PromotionDocumentV2 result object.
 *
 * @param {string} intent
 * @param {object} [options]
 * @returns {Promise<object>}  Full parser result with document, confidence, etc.
 */
async function parseIntent(intent, options = {}) {
  if (USE_AI) {
    return parseWithClaude(intent);
  }

  const start = Date.now();
  logger.info('[LOCAL] Parsing intent with v2 deterministic rule engine', {
    intentLength: intent.length,
  });

  const result = localParser.parseIntent(intent, options.now);
  const elapsed = Date.now() - start;

  logger.debug('[LOCAL] Parse complete', {
    confidence: result.confidence,
    ruleType: result.document?.promotion?.ruleType,
    clarificationRequired: result.clarificationRequired,
    elapsedMs: elapsed,
  });

  return { ...result, source: 'local' };
}

module.exports = { parseIntent, USE_AI };
