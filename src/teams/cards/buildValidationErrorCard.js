'use strict';

// ─── Validation Error Summary Adaptive Card Builder ───────────────────────────
//
// A standalone card listing all current validation failures in a session.
//
// Unlike the retry banner inside buildQuestionCard (which shows errors inline
// on a single field's re-ask), this card aggregates ALL invalid fields —
// useful after a bulk-submit attempt or a premature review request reveals
// multiple invalid fields.
//
// Adaptive Card schema v1.5 compliant.
// Deterministic: same inputs → same card.
//
// ──────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json';
const CARD_VERSION = '1.5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an individual invalid-field block.
 *
 * @param {object} field
 * @param {string} field.key     - Question queue key
 * @param {string} field.fieldId - Schema field ID
 * @param {string} field.label   - Human-readable label
 * @param {object[]} field.errors - Array of { message, code?, ... }
 * @returns {object} Adaptive Card Container element
 */
function buildInvalidFieldBlock(field) {
  const label  = field.label  || field.fieldId || field.key || 'Unknown field';
  const errors = Array.isArray(field.errors) ? field.errors : [];

  const errorMessages = errors
    .map(e => (typeof e === 'string' ? e : (e.message || JSON.stringify(e))))
    .filter(Boolean)
    .join(' · ');

  return {
    type:    'Container',
    style:   'attention',
    spacing: 'Small',
    items: [
      {
        type:    'TextBlock',
        text:    `❌ ${label}`,
        weight:  'Bolder',
        wrap:    true,
        color:   'Attention',
        spacing: 'None',
      },
      {
        type:     'TextBlock',
        text:     errorMessages || 'Validation failed — please correct this field.',
        wrap:     true,
        isSubtle: true,
        spacing:  'ExtraSmall',
      },
    ],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a validation error summary Adaptive Card.
 *
 * @param {object}   options
 * @param {string}   options.sessionId      - Session ID
 * @param {object[]} options.invalidFields  - Invalid field descriptors
 * @returns {object} Adaptive Card v1.5 payload
 */
function buildValidationErrorCard({ sessionId, invalidFields = [] } = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('buildValidationErrorCard: sessionId must be a non-empty string');
  }

  const count     = Array.isArray(invalidFields) ? invalidFields.length : 0;
  const fieldList = Array.isArray(invalidFields) ? invalidFields : [];

  const body = [
    // Header
    {
      type:    'TextBlock',
      text:    `❌ ${count} Validation Error${count === 1 ? '' : 's'}`,
      weight:  'Bolder',
      size:    'Large',
      color:   'Attention',
      spacing: 'None',
    },
    // Subtitle
    {
      type:    'TextBlock',
      text:    count > 0
        ? 'The following fields have validation errors. Please correct them before requesting review.'
        : 'No validation errors found.',
      wrap:    true,
      spacing: 'Small',
    },
    // Per-field error blocks
    ...fieldList.map(buildInvalidFieldBlock),
  ];

  const actions = [
    {
      type:  'Action.Submit',
      title: 'Review session progress',
      data:  { action: 'REQUEST_REVIEW', sessionId },
    },
  ];

  return {
    $schema: CARD_SCHEMA,
    type:    'AdaptiveCard',
    version: CARD_VERSION,
    body,
    actions,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { buildValidationErrorCard, _internals: { buildInvalidFieldBlock } };
