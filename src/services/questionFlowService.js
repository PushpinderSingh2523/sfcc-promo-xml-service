'use strict';

/**
 * questionFlowService.js
 *
 * Conversational UX layer for resolving ambiguous promotions.
 *
 * Responsibilities:
 *   1. Receive a parser result + optional prior answers
 *   2. Return the NEXT single question the user must answer
 *   3. Merge a user answer into the partial PromotionDocumentV2
 *   4. Re-run ambiguity detection to find what's still missing
 *
 * Design principles (per spec):
 *   - Ask ONE question at a time
 *   - Language a child could understand
 *   - Never hallucinate values
 *   - Progressively complete missing fields
 */

// ─── Question catalogue ────────────────────────────────────────────────────────

const QUESTION_CATALOGUE = {
  'discounts': {
    id: 'discounts',
    field: 'discounts',
    question: 'What discount should customers get?',
    hint: 'Examples: "20% off", "$10 off", "free shipping"',
    type: 'text',
    severity: 'critical',
  },
  'shippingRuleOptions.methodIds': {
    id: 'shippingMethods',
    field: 'shippingRuleOptions.methodIds',
    question: 'Which shipping methods should be free or discounted?',
    hint: 'Choose one or more: standard, two-day, overnight',
    type: 'choice',
    choices: ['standard', 'twoday', 'overnight', 'express', 'standard-hazmat', 'surepost'],
    severity: 'critical',
  },
  'schedule': {
    id: 'schedule',
    field: 'schedule',
    question: 'When should this promotion run?',
    hint: 'Examples: "in July", "from June 1 to June 30", "this weekend", "for 30 days"',
    type: 'text',
    severity: 'recommended',
  },
  'qualifyingProducts': {
    id: 'qualifyingProducts',
    field: 'qualifyingProducts',
    question: 'Which products should this promotion apply to?',
    hint: 'Examples: "handbags", "shoes", "all products"',
    type: 'text',
    severity: 'recommended',
  },
  'activationCoupons': {
    id: 'activationCoupons',
    field: 'activationCoupons',
    question: 'What coupon code should customers enter?',
    hint: 'Examples: "SAVE20", "SUMMER2024", "VIP10"',
    type: 'text',
    severity: 'critical',
  },
  'campaign.customerGroups': {
    id: 'customerGroups',
    field: 'campaign.customerGroups',
    question: 'Who should this promotion be for?',
    hint: 'Examples: "everyone", "VIP customers", "members", "employees"',
    type: 'text',
    severity: 'recommended',
  },
};

// ─── Answer merger ─────────────────────────────────────────────────────────────

/**
 * Merge a text answer for a specific field into the partial document.
 * Returns the updated text so localParser can re-parse it cleanly.
 *
 * @param {string} originalIntent — the original raw intent text
 * @param {string} fieldId        — which field was answered (matches question id)
 * @param {string} answerText     — what the user typed
 * @returns {string}              — augmented intent text to re-parse
 */
function mergeAnswer(originalIntent, fieldId, answerText) {
  const merged = `${originalIntent.trim()}. ${answerText.trim()}`;
  return merged;
}

// ─── Clarification question ordering ──────────────────────────────────────────

const PRIORITY_ORDER = [
  'discounts',
  'shippingRuleOptions.methodIds',
  'activationCoupons',
  'schedule',
  'qualifyingProducts',
  'campaign.customerGroups',
];

/**
 * Pick the single most important clarification question to ask next.
 *
 * @param {Array<{field, severity}>} clarificationQuestions — from parser result
 * @returns {{ question: object, totalRemaining: number } | null}
 */
function getNextQuestion(clarificationQuestions) {
  if (!clarificationQuestions || !clarificationQuestions.length) return null;

  // Sort by severity (critical first) then by priority order
  const sorted = [...clarificationQuestions].sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (b.severity === 'critical' && a.severity !== 'critical') return 1;
    const ai = PRIORITY_ORDER.indexOf(a.field);
    const bi = PRIORITY_ORDER.indexOf(b.field);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const next = sorted[0];
  const template = QUESTION_CATALOGUE[next.field];

  return {
    question: {
      fieldId: next.field,
      severity: next.severity,
      text: template ? template.question : next.question,
      hint: template ? template.hint : null,
      type: template ? template.type : 'text',
      choices: template ? (template.choices || null) : null,
    },
    totalRemaining: clarificationQuestions.length,
    criticalRemaining: clarificationQuestions.filter(q => q.severity === 'critical').length,
  };
}

/**
 * Build the full question flow state for an API response.
 *
 * @param {object} parserResult — return value of localParser.parseIntent()
 * @returns {object}
 */
function buildFlowState(parserResult) {
  const { clarificationRequired, clarificationQuestions } = parserResult;
  const next = getNextQuestion(clarificationQuestions);

  return {
    clarificationRequired,
    nextQuestion: next ? next.question : null,
    totalQuestionsRemaining: clarificationQuestions.length,
    criticalQuestionsRemaining: next ? next.criticalRemaining : 0,
    allQuestions: clarificationQuestions,
  };
}

module.exports = { getNextQuestion, buildFlowState, mergeAnswer, QUESTION_CATALOGUE };
