'use strict';

/**
 * categoryParser.js
 *
 * Extracts product category conditions from natural language.
 * Maps human category names → SFCC category IDs.
 *
 * parse() → {
 *   value: {
 *     qualifyingCategoryIds: string[],
 *     catalogId: string
 *   },
 *   confidence, matchedPatterns, warnings
 * }
 */

// Human label → SFCC category ID + raw word patterns
const CATEGORY_RULES = [
  { categoryId: 'handbags',    rawWords: ['handbag', 'handbags', 'bag', 'bags', 'purse', 'purses', 'tote', 'totes'],  pattern: /\b(?:handbag|handbags?|bag|bags?|purse|purses?|tote|totes?)\b/i },
  { categoryId: 'watches',     rawWords: ['watch', 'watches'],                                                          pattern: /\b(?:watch|watches?|timepiece)\b/i },
  { categoryId: 'shoes',       rawWords: ['shoes', 'shoe', 'sneakers', 'boots', 'sandals', 'footwear'],                pattern: /\b(?:shoe|shoes|sneaker|sneakers?|boot|boots?|sandal|sandals?|footwear|heels?|flat|flats)\b/i },
  { categoryId: 'accessories', rawWords: ['accessories', 'accessory', 'jewelry', 'jewellery'],                         pattern: /\b(?:accessor(?:y|ies)|jewelry|jewellery|jewel(?:le?ry)|belt|belts?|scarf|scarves|sunglasses?|hat|hats?)\b/i },
  { categoryId: 'apparel',     rawWords: ['apparel', 'clothing', 'jacket', 'jackets', 'shirt', 'pants', 'dress', 'denim', 'jeans'], pattern: /\b(?:apparel|cloth(?:es|ing)|shirt|shirts?|pant|pants?|jacket|jackets?|dress|dresses|skirt|skirts?|top|tops?|blouse|sweater|knit|knitwear|denim|jeans?)\b/i },
  { categoryId: 'sportswear',  rawWords: ['sportswear', 'activewear'],                                                 pattern: /\b(?:sportswear|activewear|athletic|gym\s+wear|yoga|workout\s+gear|leggings?)\b/i },
  { categoryId: 'beauty',      rawWords: ['beauty', 'skincare', 'fragrance', 'makeup'],                                pattern: /\b(?:beauty|skincare|fragrance|perfume|makeup|cosmetics?)\b/i },
  { categoryId: 'home',        rawWords: ['home'],                                                                      pattern: /\b(?:home\s+goods?|furniture|decor|bedding|kitchenware)\b/i },
  { categoryId: 'electronics', rawWords: ['electronics', 'laptop', 'phone', 'tablet'],                                 pattern: /\b(?:electronics?|laptop|laptops?|phone|phones?|tablet|tablets?|gadget)\b/i },
  { categoryId: 'gift-cards',  rawWords: ['gift-cards', 'gift-card'],                                                  pattern: /\b(?:gift\s+cards?|e[\s-]?gift\s+cards?)\b/i },
];

const DEFAULT_CATALOG_ID = process.env.SFCC_CATALOG_ID || 'siteCatalog_ToryUS';

// ─── Dynamic slug extraction ───────────────────────────────────────────────────
//
// These patterns capture arbitrary category slugs (hyphenated, uppercased, raw IDs)
// that are NOT in the static CATEGORY_RULES list.  They are applied after the static
// loop so that static matches always take precedence.
//
// Captured group 1 is the raw slug — original casing is preserved in the output.
//
const DYNAMIC_SLUG_PATTERNS = [
  // "products in summer-sale", "products in the RTW", "products in the summer-sale category"
  /\bproducts?\s+in\s+(?:the\s+)?([\w][\w\-_]*)\b/i,
  // "items from summer-sale", "items from the RTW"
  /\bitems?\s+from\s+(?:the\s+)?([\w][\w\-_]*)\b/i,
  // "in the summer-sale category", "in summer-sale category"
  /\bin\s+(?:the\s+)?([\w][\w\-_]+)\s+category\b/i,
  // "Sale-viewAll category", "summer-sale category" (hyphenated slug before "category")
  /\b([\w][\w\-_]+)\s+category\b/i,
];

// Words that look like slugs but are not valid category identifiers
const DYNAMIC_STOP_WORDS = new Set([
  'the', 'a', 'an', 'all', 'any', 'our', 'their', 'your', 'my', 'its',
  'every', 'each', 'some', 'most', 'many', 'other', 'another',
  'product', 'products', 'item', 'items', 'order', 'orders',
  'customer', 'customers', 'member', 'members',
  'this', 'that', 'these', 'those',
  'new', 'old', 'more', 'less', 'top', 'best', 'good', 'full',
  'online', 'store', 'site',
]);

// ─── Backward-compat export ────────────────────────────────────────────────────

/**
 * Returns v1-compatible array of raw matched category words (e.g. 'shoes', 'jackets').
 * These are the actual words found in the text, not SFCC category IDs.
 */
function parseProductKeywords(text) {
  const seen = new Set();
  const words = [];
  for (const rule of CATEGORY_RULES) {
    if (!rule.pattern.test(text)) continue;
    // Find which raw word actually appears in the text
    const found = rule.rawWords.find(w => new RegExp(`\\b${w.replace('-', '[\\s-]?')}\\b`, 'i').test(text));
    const key = found ? found.toLowerCase().replace(/\s+/g, '-') : rule.categoryId;
    if (!seen.has(key)) { seen.add(key); words.push(key); }
  }
  return words;
}

// ─── Main export ───────────────────────────────────────────────────────────────

function parse(text) {
  const matchedPatterns = [];
  const warnings = [];

  // `seen` is keyed by normalized (lowercase) slug to prevent duplicates across
  // static and dynamic extraction paths.
  const seen = new Set();
  const qualifyingCategoryIds = [];

  // ── Phase 1: Static rules ──────────────────────────────────────────────────
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text) && !seen.has(rule.categoryId)) {
      seen.add(rule.categoryId);
      qualifyingCategoryIds.push(rule.categoryId);
      matchedPatterns.push(`category:${rule.categoryId}`);
    }
  }

  // ── Phase 2: Dynamic slug extraction ──────────────────────────────────────
  // Catches arbitrary identifiers not in the static list (e.g. "summer-sale",
  // "Sale-viewAll", "RTW", "accessories-masks").
  for (const pattern of DYNAMIC_SLUG_PATTERNS) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;

    const rawSlug  = match[1];
    const normalized = rawSlug.toLowerCase();

    // Skip generic stop-words
    if (DYNAMIC_STOP_WORDS.has(normalized)) continue;
    // Skip if already captured (static or earlier dynamic pass)
    if (seen.has(normalized)) continue;
    // Skip single-letter tokens (too ambiguous)
    if (rawSlug.length < 2) continue;
    // Skip if this maps to an existing static categoryId (static loop handles it)
    if (CATEGORY_RULES.some(r => r.categoryId === normalized)) continue;

    seen.add(normalized);
    qualifyingCategoryIds.push(rawSlug); // preserve original casing
    matchedPatterns.push(`category:dynamic:${rawSlug}`);
  }

  const confidence = qualifyingCategoryIds.length > 0 ? 0.80 : 0.10;

  if (qualifyingCategoryIds.length === 0) {
    warnings.push('No product category detected — qualifying products will not be scoped to a category.');
  }

  return {
    value: { qualifyingCategoryIds, catalogId: DEFAULT_CATALOG_ID },
    confidence,
    matchedPatterns,
    warnings,
  };
}

module.exports = { parse, parseProductKeywords };
