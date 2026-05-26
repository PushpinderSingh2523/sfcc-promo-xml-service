'use strict';

/**
 * shippingParser.js
 *
 * Detects shipping method IDs and shipping-rule options from natural language.
 *
 * parse() → {
 *   value: {
 *     isShippingPromo: boolean,
 *     methodIds: string[],
 *     disableGlobalExcludedProducts: boolean,
 *     upsellThreshold: number | null
 *   },
 *   confidence, matchedPatterns, warnings
 * }
 */

// Shipping method name → SFCC method ID mapping
const METHOD_RULES = [
  { methodId: 'standard',        pattern: /\b(?:standard|ground)\s+shipping\b/i },
  { methodId: 'standard',        pattern: /\bstandard\b(?!\s*-hazmat)/i },
  { methodId: 'twoday',          pattern: /\b(?:two[\s-]?day|2[\s-]?day)\s+shipping\b/i },
  { methodId: 'twoday',          pattern: /\b(?:two[\s-]?day|2[\s-]?day)\b/i },
  { methodId: 'overnight',       pattern: /\b(?:overnight|next[\s-]?day|next\s+business\s+day)\b/i },
  { methodId: 'express',         pattern: /\b(?:express|rush)\s+shipping\b/i },
  { methodId: 'standard-hazmat', pattern: /\bhazmat\b/i },
  { methodId: 'surepost',        pattern: /\bsurepost\b/i },
  { methodId: 'economy',         pattern: /\b(?:economy|budget|cheapest)\s+shipping\b/i },
];

// Signals that this is a shipping-type promotion even without explicit method
const SHIPPING_PROMO_SIGNALS = [
  /\bfree\s+(?:shipping|delivery)\b/i,
  /\bfree\s+ground\b/i,
  /\bship(?:ping)?\s+(?:is\s+)?free\b/i,
  /\bno\s+shipping\s+(?:cost|fee|charge)\b/i,
  /\bwaive(?:d|s)?\s+shipping\b/i,
  /\bship\s+for\s+free\b/i,
  // "free standard shipping", "free two-day shipping", "free standard, surepost and hazmat shipping"
  /\bfree\s+\w[\w,\s-]*\bshipping\b/i,
];

// Disable-global-exclusions signals (e.g. "including sale items")
const DISABLE_GLOBAL_EXCLUSION_SIGNALS = [
  /\bincluding\s+(?:all\s+)?(?:sale|clearance|markdown)\s+items?\b/i,
  /\bno\s+exclusions?\b/i,
  /\bworks?\s+on\s+everything\b/i,
  /\bapplies?\s+to\s+all\s+items?\b/i,
];

// Upsell threshold: "spend $X for free shipping"
const UPSELL_THRESHOLD_RE = /\bspend\s+\$?(\d+(?:\.\d+)?)\s+(?:or\s+more\s+)?(?:for|to\s+get|and\s+get)\s+free\s+(?:shipping|delivery)\b/i;

// ─── Main export ───────────────────────────────────────────────────────────────

function parse(text) {
  const matchedPatterns = [];
  const warnings = [];

  // 1. Check if this is a shipping promo
  let isShippingPromo = false;
  for (const sig of SHIPPING_PROMO_SIGNALS) {
    if (sig.test(text)) {
      isShippingPromo = true;
      matchedPatterns.push('shipping-promo-signal');
      break;
    }
  }

  // 2. Extract explicit method IDs (de-duped, preserving order)
  const seen = new Set();
  const methodIds = [];
  for (const rule of METHOD_RULES) {
    if (rule.pattern.test(text) && !seen.has(rule.methodId)) {
      seen.add(rule.methodId);
      methodIds.push(rule.methodId);
      matchedPatterns.push(`method:${rule.methodId}`);
    }
  }

  // 3. Disable global excluded products
  let disableGlobalExcludedProducts = false;
  for (const sig of DISABLE_GLOBAL_EXCLUSION_SIGNALS) {
    if (sig.test(text)) {
      disableGlobalExcludedProducts = true;
      matchedPatterns.push('disable-global-exclusions');
      break;
    }
  }

  // 4. Upsell threshold
  let upsellThreshold = null;
  const upsellMatch = text.match(UPSELL_THRESHOLD_RE);
  if (upsellMatch) {
    upsellThreshold = parseFloat(upsellMatch[1]);
    matchedPatterns.push('upsell-threshold');
  }

  // 5. If no explicit methods and this is a shipping promo, add warnings
  if (isShippingPromo && methodIds.length === 0) {
    warnings.push('Free shipping detected but no shipping method specified. Please clarify which methods apply (standard, twoday, overnight, etc.).');
  }

  const confidence = isShippingPromo
    ? (methodIds.length > 0 ? 0.92 : 0.60)
    : 0.10;

  return {
    value: { isShippingPromo, methodIds, disableGlobalExcludedProducts, upsellThreshold },
    confidence,
    matchedPatterns,
    warnings,
  };
}

module.exports = { parse };
