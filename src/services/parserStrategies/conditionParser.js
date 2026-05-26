'use strict';

/**
 * conditionParser.js
 *
 * Extracts the qualifying condition for a promotion:
 *   - coupon / promo code
 *   - minimum order amount
 *   - minimum quantity
 *   - none (open / no condition)
 *
 * parse() → {
 *   value: { conditionType, conditionValue, couponCode },
 *   confidence, matchedPatterns, warnings
 * }
 *
 * Also used by the shipping rule to determine the discount threshold.
 */

// ─── Pattern tables ────────────────────────────────────────────────────────────

const CONDITION_RULES = [
  // 1. Coupon / promo code — check first (higher priority)
  {
    type: 'coupon',
    trigger: /\b(?:coupon|promo(?:\s*code)?|code|voucher|discount\s+code|with\s+code|enter\s+code)\b/i,
    codePattern: /\b([A-Z][A-Z0-9\-]{3,49})\b/,
    // Words to exclude from code extraction
    codeBlacklist: /^(A|I|THE|AND|FOR|OFF|ON|GET|BUY|USE|VIP|SAVE|FREE|PROMO|CODE|COUPON|OVER|ABOVE|ALL|WHEN|WITH|ONLY|PLUS|EARN|SPEND|VALID|ORDERS?|ITEMS?|EACH|PER|ANY|ONE|TWO)$/i,
  },

  // 2. Minimum order amount
  {
    type: 'minimum-amount',
    pattern: /(?:orders?\s+(?:over|above|of|exceeding)|spend(?:ing)?\s+(?:over|above)?|minimum\s+(?:order|purchase|spend|amount)(?:\s+of)?|(?:over|above)\s+\$)\s*\$?\s*(\d+(?:\.\d+)?)/i,
    valueGroup: 1,
  },
  {
    type: 'minimum-amount',
    pattern: /\$\s*(\d+(?:\.\d+)?)\s+(?:or\s+more|minimum|min\b|\+)/i,
    valueGroup: 1,
  },
  {
    type: 'minimum-amount',
    pattern: /spend\s+\$?(\d+(?:\.\d+)?)\b/i,
    valueGroup: 1,
  },

  // 3. Minimum quantity
  {
    type: 'minimum-quantity',
    pattern: /buy\s+(\d+)\s*(?:or\s+more|\+|items?|units?|pairs?|pieces?)?/i,
    valueGroup: 1,
    minValue: 2,
  },
  {
    type: 'minimum-quantity',
    pattern: /(?:purchase|get|order)\s+(\d+)\s*(?:or\s+more|\+|items?|units?)/i,
    valueGroup: 1,
    minValue: 2,
  },
];

// ─── Backward-compat export ────────────────────────────────────────────────────

function parseCondition(text) {
  return parse(text).value;
}

// ─── Main export ───────────────────────────────────────────────────────────────

function parse(text) {
  const matchedPatterns = [];
  const warnings = [];

  for (const rule of CONDITION_RULES) {
    if (rule.type === 'coupon') {
      if (!rule.trigger.test(text)) continue;
      // Try to find the coupon code
      const words = [];
      const re = new RegExp(rule.codePattern.source, 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        if (!rule.codeBlacklist.test(m[1])) words.push(m[1]);
      }
      const couponCode = words.length ? words[words.length - 1] : null;
      matchedPatterns.push('coupon-condition');
      if (!couponCode) {
        warnings.push('Coupon/code keyword found but no specific code extracted — will need clarification.');
      }
      return {
        value: { conditionType: 'coupon', conditionValue: null, couponCode: couponCode || 'PROMO10' },
        confidence: couponCode ? 0.90 : 0.55,
        matchedPatterns,
        warnings,
      };
    }

    if (rule.pattern) {
      const m = text.match(rule.pattern);
      if (!m) continue;
      const val = parseFloat(m[rule.valueGroup]);
      if (isNaN(val)) continue;
      if (rule.minValue && val < rule.minValue) continue;
      matchedPatterns.push(rule.type);
      return {
        value: { conditionType: rule.type, conditionValue: val, couponCode: null },
        confidence: 0.88,
        matchedPatterns,
        warnings,
      };
    }
  }

  // No condition — open promotion
  return {
    value: { conditionType: 'none', conditionValue: null, couponCode: null },
    confidence: 0.70,
    matchedPatterns: ['open-condition'],
    warnings: [],
  };
}

module.exports = { parse, parseCondition };
