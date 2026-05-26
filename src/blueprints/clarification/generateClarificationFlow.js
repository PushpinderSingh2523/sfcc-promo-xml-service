'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { classifyEditableFields } = require('../classification/classifyEditableFields');
const { GROUP_ORDER }            = require('../fieldRegistry/sasEditableFieldRegistry');

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ClarificationQuestion
 * @property {string}      fieldId       — Registry field identifier
 * @property {string}      group         — Question group (from GROUP_ORDER)
 * @property {string}      label         — Human-readable label
 * @property {string}      question      — Deterministic question text
 * @property {boolean}     required      — Whether a non-empty answer is mandatory
 * @property {*}           currentValue  — Current value extracted from the blueprint
 * @property {string|null} xmlLang       — Locale tag when field is localized
 * @property {object}      slotContext   — { slotType, slotIndex }
 * @property {object|null} validation    — Declarative validation rules
 * @property {boolean}     replayCritical — Whether mutation needs escalation
 */

// ─── Validation ───────────────────────────────────────────────────────────────

function validateInput(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }
}

// ─── Core builder ─────────────────────────────────────────────────────────────

/**
 * Convert a ClassifiedField from the classification engine into a
 * ClarificationQuestion object.
 *
 * @param {import('../classification/classifyEditableFields').ClassifiedField} cf
 * @returns {ClarificationQuestion}
 */
function buildQuestion(cf) {
  const reg = cf.registryEntry;

  return {
    fieldId:        cf.fieldId,
    group:          reg.group,
    label:          reg.label,
    question:       reg.question,
    required:       reg.required,
    currentValue:   cf.currentValue,
    xmlLang:        cf.xmlLang,
    slotContext:    { slotType: cf.slotType, slotIndex: cf.slotIndex },
    validation:     reg.validation,
    replayCritical: reg.replayCritical,
  };
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate a deterministic, ordered clarification flow from a SAS blueprint.
 *
 * The flow contains one entry per editable field per slot — each entry is a
 * self-contained question object that carries everything needed to present
 * the field to a business user without additional lookups.
 *
 * Ordering rules:
 *   1. Group order follows GROUP_ORDER canonical sequence.
 *   2. Within a group: campaign slots first, then promotions (source order),
 *      then assignments (source order).
 *   3. Within a slot: alphabetical by fieldId (secondary stable sort).
 *
 * Non-editable fields (editable: false in the registry) are NOT included in
 * the clarification flow.  They remain classified in classifyEditableFields
 * output but are never surfaced as questions.
 *
 * This function is a pure transformer:
 *   - It does NOT call any LLM or AI service.
 *   - It does NOT infer or generate question text — questions come from the registry.
 *   - It does NOT hardcode conversational branching.
 *   - It does NOT modify the blueprint input.
 *   - It IS deterministic: same blueprint → same flow, every call.
 *
 * @param {object} blueprint - Canonical SAS blueprint record
 * @returns {ClarificationQuestion[]}
 */
function generateClarificationFlow(blueprint) {
  validateInput(blueprint);

  const { orderedQuestions } = classifyEditableFields(blueprint);

  return orderedQuestions.map(buildQuestion);
}

/**
 * Generate a clarification flow pre-grouped by GROUP_ORDER.
 *
 * Useful when the caller needs to render one group at a time (e.g. one card
 * per section in a future UI), rather than a flat ordered list.
 *
 * @param {object} blueprint
 * @returns {object} Map from group name → ClarificationQuestion[]
 */
function generateGroupedClarificationFlow(blueprint) {
  validateInput(blueprint);

  const flow = generateClarificationFlow(blueprint);

  const grouped = {};
  GROUP_ORDER.forEach(g => { grouped[g] = []; });

  flow.forEach(q => {
    if (grouped[q.group]) {
      grouped[q.group].push(q);
    }
  });

  return grouped;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generateClarificationFlow,
  generateGroupedClarificationFlow,
  // Internal helper exported for testing
  _internals: { buildQuestion },
};
