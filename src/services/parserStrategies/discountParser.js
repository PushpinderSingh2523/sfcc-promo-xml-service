'use strict';

/**
 * discountParser.js
 *
 * Extracts discount tiers from natural language.
 * Supports: percentage, amount, fixed-price, free (shipping).
 * Supports tiered patterns: "10% off over $500 and 20% off over $2000".
 *
 * parse() → { value: { tiers, ruleTypeHint }, confidence, matchedPatterns, warnings }
 *
 * tiers: Array<{ threshold, kind, value? }>
 * ruleTypeHint: 'shipping' | 'product' | 'order' | null  (advisory, orchestrator decides)
 */

// ─── Pattern tables ────────────────────────────────────────────────────────────

// Tiered pattern: "X% off on/over $N and Y% off on/over $M"
const TIERED_PERCENTAGE = /(\d+(?:\.\d+)?)\s*%\s*off\s+(?:on\s+orders?\s+)?(?:over|above|of|exceeding|\+)?\s*\$?\s*(\d+(?:\.\d+)?)/gi;
const TIERED_AMOUNT     = /\$\s*(\d+(?:\.\d+)?)\s*off\s+(?:on\s+orders?\s+)?(?:over|above|of|exceeding|\+)?\s*\$?\s*(\d+(?:\.\d+)?)/gi;

// Single-value patterns (checked when tiered doesn't fire)
const SINGLE_PATTERNS = [
  // free shipping — must come before generic percentage/amount
  { kind: 'free',        pattern: /free\s+shipping/i,                                                                    group: null, threshold: 0.01 },
  { kind: 'free',        pattern: /\bfree\s+delivery/i,                                                                  group: null, threshold: 0.01 },

  // bonus / GWP — treated as free (no monetary value)
  { kind: 'free',        pattern: /\b(?:bonus|free\s+gift|gift\s+with\s+purchase|gwp)\b/i,                               group: null, threshold: 0.01 },

  // percentage
  { kind: 'percentage',  pattern: /(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?)\s*off/i,                                     group: 1 },
  { kind: 'percentage',  pattern: /save\s+(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?)/i,                                     group: 1 },
  { kind: 'percentage',  pattern: /get\s+(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?)\s*off/i,                                group: 1 },
  { kind: 'percentage',  pattern: /(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?)\s+discount/i,                                 group: 1 },

  // fixed price
  { kind: 'fixed-price', pattern: /fixed[\s-]price\s+\$?(\d+(?:\.\d+)?)/i,                                              group: 1 },
  { kind: 'fixed-price', pattern: /(?:for|at)\s+\$(\d+(?:\.\d+)?)\s+(?:each|flat)/i,                                    group: 1 },

  // amount off
  { kind: 'amount',      pattern: /[£$€¥]?\s*(\d+(?:\.\d+)?)\s+(?:dollars?|pounds?|euros?)?\s*off/i,                   group: 1 },
  { kind: 'amount',      pattern: /save\s+[£$€](\d+(?:\.\d+)?)/i,                                                       group: 1 },
  { kind: 'amount',      pattern: /(\d+(?:\.\d+)?)\s+(?:dollars?|pounds?|euros?)\s+off/i,                               group: 1 },
  { kind: 'amount',      pattern: /\$(\d+(?:\.\d+)?)\s+off/i,                                                            group: 1 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function resetRegex(re) { re.lastIndex = 0; }

function parseTieredPercentage(text) {
  const tiers = [];
  let m;
  TIERED_PERCENTAGE.lastIndex = 0;
  while ((m = TIERED_PERCENTAGE.exec(text)) !== null) {
    tiers.push({ threshold: parseFloat(m[2]), kind: 'percentage', value: parseFloat(m[1]) });
  }
  return tiers.length >= 2 ? tiers.sort((a, b) => a.threshold - b.threshold) : null;
}

function parseTieredAmount(text) {
  const tiers = [];
  let m;
  TIERED_AMOUNT.lastIndex = 0;
  while ((m = TIERED_AMOUNT.exec(text)) !== null) {
    tiers.push({ threshold: parseFloat(m[2]), kind: 'amount', value: parseFloat(m[1]) });
  }
  return tiers.length >= 2 ? tiers.sort((a, b) => a.threshold - b.threshold) : null;
}

// ─── Backward-compat helper (used by localParser tests) ───────────────────────

/**
 * Returns v1-compatible { discountType, discountValue }.
 * discountType maps: 'free' → 'free-shipping', others stay the same.
 */
function parseDiscount(text) {
  const result = parse(text);
  const tier = result.value.tiers[0];

  // Map internal kind to legacy v1 discountType names
  const kindMap = { 'amount': 'amount-off', 'fixed-price': 'fixed-price', 'percentage': 'percentage', 'free': 'free-shipping' };
  let discountType = kindMap[tier.kind] || tier.kind;

  if (discountType === 'free-shipping' && /\b(?:bonus|free\s+gift|gift\s+with\s+purchase|gwp)\b/i.test(text)) {
    discountType = 'bonus-product';
  }
  return { discountType, discountValue: tier.value || 0 };
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {{ value: { tiers: Array, ruleTypeHint: string|null }, confidence: number, matchedPatterns: string[], warnings: string[] }}
 */
function parse(text) {
  const matchedPatterns = [];
  const warnings = [];
  let ruleTypeHint = null;

  // 1. Try tiered percentage
  const tieredPct = parseTieredPercentage(text);
  if (tieredPct) {
    matchedPatterns.push('tiered-percentage');
    return {
      value: { tiers: tieredPct, ruleTypeHint: 'order' },
      confidence: 0.92,
      matchedPatterns,
      warnings,
    };
  }

  // 2. Try tiered amount
  const tieredAmt = parseTieredAmount(text);
  if (tieredAmt) {
    matchedPatterns.push('tiered-amount');
    return {
      value: { tiers: tieredAmt, ruleTypeHint: 'order' },
      confidence: 0.90,
      matchedPatterns,
      warnings,
    };
  }

  // 3. Single-value patterns
  for (const rule of SINGLE_PATTERNS) {
    const m = text.match(rule.pattern);
    if (!m) continue;

    const val = rule.group ? parseFloat(m[rule.group]) : 0;
    if (rule.group && isNaN(val)) continue;

    if (rule.kind === 'free') {
      // Distinguish shipping vs bonus-product
      const isGwp = /\b(?:bonus|free\s+gift|gift\s+with\s+purchase|gwp)\b/i.test(text);
      matchedPatterns.push(isGwp ? 'free-gift' : 'free-shipping');
      ruleTypeHint = isGwp ? 'product' : 'shipping';
      return {
        value: {
          tiers: [{ threshold: rule.threshold || 0.01, kind: 'free' }],
          ruleTypeHint,
          isGwp,
        },
        confidence: 0.90,
        matchedPatterns,
        warnings,
      };
    }

    matchedPatterns.push(rule.kind);
    return {
      value: {
        tiers: [{ threshold: 0.01, kind: rule.kind, value: val }],
        ruleTypeHint: null,
      },
      confidence: 0.88,
      matchedPatterns,
      warnings,
    };
  }

  // 4. Fallback: no recognisable discount
  warnings.push('No discount pattern matched — defaulting to 10% off. Clarification needed.');
  return {
    value: {
      tiers: [{ threshold: 0.01, kind: 'percentage', value: 10 }],
      ruleTypeHint: null,
    },
    confidence: 0.20,
    matchedPatterns: ['fallback-default'],
    warnings,
  };
}

module.exports = { parse, parseDiscount };
