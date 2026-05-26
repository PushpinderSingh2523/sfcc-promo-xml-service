'use strict';

/**
 * currencyParser.js
 *
 * Detects currency from natural language (advisory — SFCC promotions are per-site-currency).
 * parse() → { value: { currency }, confidence, matchedPatterns, warnings }
 */

const CURRENCY_RULES = [
  { currency: 'GBP', pattern: /£|GBP|pounds?/i },
  { currency: 'EUR', pattern: /€|EUR|euros?/i },
  { currency: 'CAD', pattern: /CAD|CA\$|canadian\s+dollars?/i },
  { currency: 'AUD', pattern: /AUD|AU\$|australian\s+dollars?/i },
];

function parseCurrency(text) {
  return parse(text).value.currency;
}

function parse(text) {
  for (const rule of CURRENCY_RULES) {
    if (rule.pattern.test(text)) {
      return {
        value: { currency: rule.currency },
        confidence: 0.90,
        matchedPatterns: [`currency:${rule.currency}`],
        warnings: [],
      };
    }
  }
  return {
    value: { currency: 'USD' },
    confidence: 0.60,
    matchedPatterns: ['currency:USD-default'],
    warnings: [],
  };
}

module.exports = { parse, parseCurrency };
