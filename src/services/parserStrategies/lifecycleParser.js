'use strict';

/**
 * lifecycleParser.js
 *
 * Extracts lifecycle flags and exclusivity from natural language.
 *
 * parse() → {
 *   value: {
 *     lifecycle: { enabled, archived, searchable, refinable, preventRequalifying, prorateAcrossEligibleItems },
 *     exclusivity: 'no' | 'class' | 'global'
 *   },
 *   confidence, matchedPatterns, warnings
 * }
 */

// Exclusivity signals
const EXCLUSIVITY_RULES = [
  { value: 'global', pattern: /\b(?:sitewide|site[\s-]wide|all\s+customers?|everyone|global)\b/i },
  { value: 'class',  pattern: /\b(?:vip|members?|loyalty|premium|exclusive|registered|subscribers?|employees?|staff|partners?|birthday|new\s+customers?|welcome)\b/i },
];

// Explicit lifecycle signals
const DISABLED_PATTERNS = [
  /\b(?:disabled?|inactive|turned\s+off|not\s+active)\b/i,
];

const ARCHIVED_PATTERNS = [
  /\b(?:archived?|past|historical|old\s+promo|expired\s+promo)\b/i,
];

const SEARCHABLE_PATTERNS = [
  /\b(?:searchable|visible\s+in\s+search|show\s+in\s+search|discoverable)\b/i,
];

const REFINABLE_PATTERNS = [
  /\b(?:refinable|show\s+in\s+filter|filter(?:able)?|refinement)\b/i,
];

// ─── Backward-compat export ────────────────────────────────────────────────────

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

  // Exclusivity
  let exclusivity = 'no';
  for (const rule of EXCLUSIVITY_RULES) {
    if (rule.pattern.test(text)) {
      exclusivity = rule.value;
      matchedPatterns.push(`exclusivity:${rule.value}`);
      break;
    }
  }

  // Enabled (default true unless disabled signals present)
  let enabled = true;
  for (const p of DISABLED_PATTERNS) {
    if (p.test(text)) { enabled = false; matchedPatterns.push('flag:disabled'); break; }
  }

  // Archived (default false)
  let archived = false;
  for (const p of ARCHIVED_PATTERNS) {
    if (p.test(text)) { archived = true; matchedPatterns.push('flag:archived'); break; }
  }

  // Searchable (default false — most promos not searchable)
  let searchable = false;
  for (const p of SEARCHABLE_PATTERNS) {
    if (p.test(text)) { searchable = true; matchedPatterns.push('flag:searchable'); break; }
  }

  // Refinable (default false)
  let refinable = false;
  for (const p of REFINABLE_PATTERNS) {
    if (p.test(text)) { refinable = true; matchedPatterns.push('flag:refinable'); break; }
  }

  // preventRequalifying (default false — allow re-qualifying each visit)
  // prorateAcrossEligibleItems (default false)
  const lifecycle = {
    enabled,
    archived,
    searchable,
    refinable,
    preventRequalifying: false,
    prorateAcrossEligibleItems: false,
  };

  // One-time-use signal → prevent re-qualifying
  if (/\b(?:one[\s-]time(?:\s+use)?|single[\s-]use|use\s+once)\b/i.test(text)) {
    lifecycle.preventRequalifying = true;
    matchedPatterns.push('flag:prevent-requalifying');
  }

  const confidence = matchedPatterns.length > 0 ? 0.75 : 0.50;

  return {
    value: { lifecycle, exclusivity },
    confidence,
    matchedPatterns,
    warnings,
  };
}

module.exports = { parse, parseExclusivity };
