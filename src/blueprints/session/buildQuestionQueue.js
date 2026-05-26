'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { generateClarificationFlow } = require('../clarification/generateClarificationFlow');

// ─── Answer key ───────────────────────────────────────────────────────────────

/**
 * Build a stable, deterministic answer key for a question slot.
 *
 * The key uniquely identifies one answer across all slots in a session.
 * It encodes all four dimensions that distinguish slots:
 *
 *   fieldId   — which registry field
 *   slotType  — campaign | promotion | assignment
 *   slotIndex — source-order position; '_' for campaign (null)
 *   xmlLang   — locale tag; '_' for non-localized fields
 *
 * Format:  ${fieldId}::${slotType}::${slotIndex ?? '_'}::${xmlLang ?? '_'}
 *
 * Examples:
 *   campaignId                  → 'campaignId::campaign::_::_'
 *   promotionId slot 2          → 'promotionId::promotion::2::_'
 *   name slot 1, en locale      → 'name::promotion::1::en'
 *   endDate assignment 3        → 'endDate::assignment::3::_'
 *
 * @param {string}      fieldId
 * @param {string}      slotType
 * @param {number|null} slotIndex
 * @param {string|null} xmlLang
 * @returns {string}
 */
function buildAnswerKey(fieldId, slotType, slotIndex, xmlLang) {
  const idxPart  = slotIndex  !== null && slotIndex  !== undefined ? String(slotIndex)  : '_';
  const langPart = xmlLang    !== null && xmlLang    !== undefined ? String(xmlLang)    : '_';
  return `${fieldId}::${slotType}::${idxPart}::${langPart}`;
}

// ─── Queue item ───────────────────────────────────────────────────────────────

/**
 * @typedef {object} QueueItem
 * @property {string}      key           — Stable answer key
 * @property {string}      fieldId
 * @property {string}      slotType      — 'campaign' | 'promotion' | 'assignment'
 * @property {number|null} slotIndex
 * @property {string|null} xmlLang
 * @property {string}      group         — From GROUP_ORDER
 * @property {string}      label         — Human-readable label
 * @property {string}      question      — Deterministic question text
 * @property {boolean}     required
 * @property {*}           currentValue  — Prior-season value
 * @property {object|null} validation    — Validation spec from registry
 * @property {boolean}     replayCritical
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a deterministic, ordered question queue from a SAS blueprint.
 *
 * The queue is the session's source of truth for question ordering,
 * answer key enumeration, and progress tracking.  It is computed once at
 * session creation and stored in the session object for resumability.
 *
 * Ordering follows GROUP_ORDER → slot rank → slotIndex → fieldId (the
 * same ordering as generateClarificationFlow).
 *
 * @param {object} blueprint - Canonical SAS blueprint record
 * @returns {QueueItem[]}
 */
function buildQuestionQueue(blueprint) {
  const flow = generateClarificationFlow(blueprint);

  return flow.map(q => ({
    key:            buildAnswerKey(
      q.fieldId,
      q.slotContext.slotType,
      q.slotContext.slotIndex,
      q.xmlLang
    ),
    fieldId:        q.fieldId,
    slotType:       q.slotContext.slotType,
    slotIndex:      q.slotContext.slotIndex,
    xmlLang:        q.xmlLang,
    group:          q.group,
    label:          q.label,
    question:       q.question,
    required:       q.required,
    currentValue:   q.currentValue,
    validation:     q.validation,
    replayCritical: q.replayCritical,
  }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { buildQuestionQueue, buildAnswerKey };
