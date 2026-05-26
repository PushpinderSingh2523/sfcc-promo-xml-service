'use strict';

/**
 * Deterministic field extraction from raw user input text.
 *
 * Rules:
 * - Regex/pattern matching only — no AI, no NLP, no fuzzy matching
 * - Returns only fields that are explicitly present in the text
 * - Never infers, assumes, or fabricates values
 * - Never throws — returns {} for any unrecognisable input
 */

// Customer group terms recognised by name. Checked case-insensitively.
const KNOWN_CUSTOMER_GROUP_RE = /\b(VIP|employees?|members?|gold|silver|wholesale)\b/i;

// Words that look like categories but are actually customer group labels.
// Used to prevent "for VIP" from being captured as a category.
const KNOWN_GROUP_WORDS = new Set(['vip', 'employee', 'employees', 'member', 'members', 'gold', 'silver', 'wholesale']);

/**
 * Extract structured promotion fields from a plain-text user input string.
 *
 * @param {string} userInput
 * @returns {Object} Partial canonical promotion object — only fields present in the input.
 */
function extractFields(userInput) {
  if (!userInput || typeof userInput !== 'string') return {};

  const text = userInput.trim();
  if (!text) return {};

  const result = {};

  // ── A. Percentage discount ────────────────────────────────────────────────
  // Matches: "20% off", "15 percent discount", "15 percent off", "10%"
  // Note: \b is placed inside the alternation so it only applies to "percent"
  // (a word), not to "%" (a non-word character that never satisfies \b).
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent\b)/i);
  if (pctMatch) {
    result.discountType  = 'percentage';
    result.discountValue = parseFloat(pctMatch[1]);
  }

  // ── B. Fixed amount discount ──────────────────────────────────────────────
  // Matches: "$20 off", "20 dollars off"
  // Only attempted when a percentage was not already found.
  if (!result.discountType) {
    const amtMatch =
      text.match(/\$(\d+(?:\.\d+)?)\s*off\b/i) ||
      text.match(/(\d+(?:\.\d+)?)\s*dollars?\s*off\b/i);

    if (amtMatch) {
      result.discountType  = 'amount';
      result.discountValue = parseFloat(amtMatch[1]);
    }
  }

  // ── C. Threshold extraction ───────────────────────────────────────────────
  // Matches: "above $100", "over $50", "minimum order $200"
  const thresholdMatch = text.match(
    /(?:above|over|minimum\s+order)\s+\$(\d+(?:\.\d+)?)\b/i
  );
  if (thresholdMatch) {
    result.threshold = parseFloat(thresholdMatch[1]);
  }

  // ── D. Customer group extraction ──────────────────────────────────────────
  // Matches: "VIP users", "employees only", "members", "gold customers"
  const groupMatch = text.match(KNOWN_CUSTOMER_GROUP_RE);
  if (groupMatch) {
    result.customerGroup = groupMatch[1];
  }

  // ── E. Category extraction ────────────────────────────────────────────────
  // Matches: "on shoes", "for handbags"
  // Single word only; known group terms are excluded.
  const catMatch =
    text.match(/\bon\s+([a-z]+)\b/i) ||
    text.match(/\bfor\s+([a-z]+)\b/i);

  if (catMatch) {
    const word = catMatch[1].toLowerCase();
    if (!KNOWN_GROUP_WORDS.has(word)) {
      result.category = word;
    }
  }

  return result;
}

module.exports = { extractFields };
