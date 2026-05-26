'use strict';

/**
 * exclusionParser.js
 *
 * Detects promotion-level excluded product categories from natural language.
 * These map to SFCC <excluded-products> inside the promotion rule.
 *
 * parse() → {
 *   value: {
 *     excludedCategoryIds: string[],
 *     catalogId: string
 *   },
 *   confidence, matchedPatterns, warnings
 * }
 */

const DEFAULT_CATALOG_ID = process.env.SFCC_CATALOG_ID || 'siteCatalog_ToryUS';

// Exclusion trigger phrases
const EXCLUSION_TRIGGER = /\b(?:exclud(?:ing|es?|ed)|except(?:ing)?|not\s+(?:valid|applicable)\s+on|does\s+not\s+apply\s+to|excluding)\b/i;

// Exclusion category rules — checked after trigger confirmed
const EXCLUSION_CATEGORY_RULES = [
  { categoryId: 'sale',             pattern: /\bsale\b/i },
  { categoryId: 'clearance',        pattern: /\bclearance\b/i },
  { categoryId: 'markdown',         pattern: /\bmarkdown\b/i },
  { categoryId: 'private-sale',     pattern: /\bprivate[\s-]sale\b/i },
  { categoryId: 'preorder',         pattern: /\bpre[\s-]?order\b/i },
  { categoryId: 'gift-cards',       pattern: /\bgift[\s-]?cards?\b/i },
  { categoryId: 'foundation',       pattern: /\bfoundation\s+products?\b/i },
  { categoryId: 'monogrammed',      pattern: /\bmonogram(?:med|ming)?\b/i },
  { categoryId: 'hazmat',           pattern: /\bhazmat\b/i },
  { categoryId: 'final-sale',       pattern: /\bfinal[\s-]sale\b/i },
  { categoryId: 'accessories-masks',pattern: /\bmasks?\b/i },
];

// Direct exclusion phrases (trigger + category together)
const DIRECT_EXCLUSION_PHRASES = [
  { categoryId: 'sale',         pattern: /\bexclud(?:ing|es?)\s+(?:all\s+)?sale\s+items?\b/i },
  { categoryId: 'gift-cards',   pattern: /\bnot\s+valid\s+(?:on|for)\s+gift\s+cards?\b/i },
  { categoryId: 'private-sale', pattern: /\bexclud(?:ing|es?)\s+private\s+sale\b/i },
  { categoryId: 'preorder',     pattern: /\bexclud(?:ing|es?)\s+pre[\s-]?orders?\b/i },
  { categoryId: 'clearance',    pattern: /\bexclud(?:ing|es?)\s+clearance\b/i },
  { categoryId: 'foundation',   pattern: /\bnot\s+valid\s+on\s+(?:tory\s+burch\s+)?foundation\b/i },
];

// ─── Main export ───────────────────────────────────────────────────────────────

function parse(text) {
  const matchedPatterns = [];
  const warnings = [];
  const seen = new Set();
  const excludedCategoryIds = [];

  // 1. Direct phrases (no trigger needed — pattern is self-contained)
  for (const rule of DIRECT_EXCLUSION_PHRASES) {
    if (rule.pattern.test(text) && !seen.has(rule.categoryId)) {
      seen.add(rule.categoryId);
      excludedCategoryIds.push(rule.categoryId);
      matchedPatterns.push(`direct-exclude:${rule.categoryId}`);
    }
  }

  // 2. Trigger + category scan
  if (EXCLUSION_TRIGGER.test(text)) {
    for (const rule of EXCLUSION_CATEGORY_RULES) {
      if (rule.pattern.test(text) && !seen.has(rule.categoryId)) {
        seen.add(rule.categoryId);
        excludedCategoryIds.push(rule.categoryId);
        matchedPatterns.push(`trigger-exclude:${rule.categoryId}`);
      }
    }
  }

  const confidence = excludedCategoryIds.length > 0 ? 0.80 : 0.10;

  return {
    value: { excludedCategoryIds, catalogId: DEFAULT_CATALOG_ID },
    confidence,
    matchedPatterns,
    warnings,
  };
}

module.exports = { parse };
