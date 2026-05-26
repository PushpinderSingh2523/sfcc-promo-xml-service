'use strict';

/**
 * qualifierParser.js
 *
 * Extracts customer group qualifiers, coupon codes, and source codes.
 *
 * parse() → {
 *   value: {
 *     customerGroupIds: string[],
 *     activationCoupons: string[],
 *     qualifierCouponIds: string[],
 *     sourceCodes: string[],
 *     exclusivityHint: 'no' | 'class' | 'global'
 *   },
 *   confidence, matchedPatterns, warnings
 * }
 */

// Customer group signals → maps to SFCC group IDs
const CUSTOMER_GROUP_RULES = [
  { groupId: 'VIP',            pattern: /\bvip\b/i },
  { groupId: 'Loyalty',        pattern: /\b(?:loyalty|rewards?\s+members?)\b/i },
  { groupId: 'Members',        pattern: /\b(?:members?|membership)\b(?!\s+only\s+gets\s+free\s+shipping)/i },
  { groupId: 'Employees',      pattern: /\b(?:employees?|staff|team\s+members?)\b/i },
  { groupId: 'Subscribers',    pattern: /\b(?:subscribers?|email\s+subscribers?)\b/i },
  { groupId: 'Everyone',       pattern: /\b(?:everyone|all\s+customers?|sitewide|site[\s-]wide|public)\b/i },
  { groupId: 'RegisteredUsers',pattern: /\b(?:registered|logged[\s-]in|account\s+holders?)\b/i },
  { groupId: 'Partners',       pattern: /\b(?:partners?|affiliates?)\b/i },
  { groupId: 'Birthday',       pattern: /\bbirthday\b/i },
  { groupId: 'Welcome',        pattern: /\b(?:new\s+customers?|first[\s-]time|welcome)\b/i },
];

// Exclusivity based on customer group signals
const EXCLUSIVITY_RULES = [
  { value: 'global', pattern: /\b(?:sitewide|site[\s-]wide|all\s+customers?|everyone|global|public)\b/i },
  { value: 'class',  pattern: /\b(?:vip|members?|loyalty|premium|exclusive|registered|subscribers?|employees?|staff|partners?|birthday|welcome|new\s+customers?)\b/i },
];

// Coupon / promo code detection
// Upper-case sequence 4-30 chars (PROMO10, VIP-2024-Free-Two-Day-Shipping, etc.)
const COUPON_CODE_WORD   = /\b([A-Z][A-Z0-9\-]{3,49})\b/g;
const COUPON_TRIGGER     = /\b(?:coupon|promo(?:\s*code)?|code|voucher|discount\s+code|activation\s+code)\b/i;

// Source code detection (UTM-like or SFCC source codes)
const SOURCE_CODE_TRIGGER = /\b(?:source\s+code|utm_source|referral\s+code)\b/i;
const SOURCE_CODE_WORD    = /\b([A-Z][A-Z0-9_\-]{2,29})\b/g;

// ─── Backward-compat export ────────────────────────────────────────────────────

/** Returns v1-compatible exclusivity string. */
function parseExclusivity(text) {
  for (const rule of EXCLUSIVITY_RULES) {
    if (rule.pattern.test(text)) return rule.value;
  }
  return 'no';
}

// ─── Main export ───────────────────────────────────────────────────────────────

function parse(text) {
  const matchedPatterns = [];
  const warnings = [];

  // 1. Customer groups
  const customerGroupIds = [];
  for (const rule of CUSTOMER_GROUP_RULES) {
    if (rule.pattern.test(text)) {
      customerGroupIds.push(rule.groupId);
      matchedPatterns.push(`group:${rule.groupId.toLowerCase()}`);
    }
  }

  // 2. Exclusivity hint
  let exclusivityHint = 'no';
  for (const rule of EXCLUSIVITY_RULES) {
    if (rule.pattern.test(text)) {
      exclusivityHint = rule.value;
      break;
    }
  }

  // 3. Coupon codes (activation coupons — fire the promo)
  const activationCoupons = [];
  if (COUPON_TRIGGER.test(text)) {
    const words = [];
    let m;
    COUPON_CODE_WORD.lastIndex = 0;
    // Reset the regex properly
    const re = new RegExp(COUPON_CODE_WORD.source, 'g');
    while ((m = re.exec(text)) !== null) {
      // Filter out common English words that look like codes
      const w = m[1];
      if (!/^(A|I|THE|AND|FOR|OFF|ON|GET|BUY|USE|VIP|SAVE|FREE|PROMO|CODE|COUPON|OVER|ABOVE|ALL|WHEN|WITH|ONLY|PLUS|EARN|SPEND|VALID|ORDERS?|ITEMS?|EACH|PER|ANY|ONE|TWO|SPEND|DURING)$/i.test(w)) {
        words.push(w);
      }
    }
    if (words.length) {
      activationCoupons.push(...words);
      matchedPatterns.push('activation-coupon');
    } else {
      warnings.push('Coupon/code keyword detected but no code extracted — clarification needed.');
    }
  }

  // 4. Source codes
  const sourceCodes = [];
  if (SOURCE_CODE_TRIGGER.test(text)) {
    const re = new RegExp(SOURCE_CODE_WORD.source, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      sourceCodes.push(m[1]);
    }
    if (sourceCodes.length) matchedPatterns.push('source-code');
  }

  // Confidence: high if we found specific qualifiers
  const hasSpecificQualifier = customerGroupIds.length > 0 || activationCoupons.length > 0;
  const confidence = hasSpecificQualifier ? 0.85 : (COUPON_TRIGGER.test(text) ? 0.50 : 0.30);

  return {
    value: {
      customerGroupIds,
      activationCoupons,
      qualifierCouponIds: [],  // placeholder — orchestrator decides qualifier vs activation
      sourceCodes,
      exclusivityHint,
    },
    confidence,
    matchedPatterns,
    warnings,
  };
}

module.exports = { parse, parseExclusivity };
