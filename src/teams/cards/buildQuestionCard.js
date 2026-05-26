'use strict';

// ─── Question Adaptive Card Builder ───────────────────────────────────────────
//
// Converts a "question" presentation object into an Adaptive Card v1.5 payload.
//
// Consumes ONLY the presentation object — never orchestration state directly.
//
// Supports:
//   - text input (choices: null)
//   - choice set (choices: string[])
//   - replay-critical badge
//   - locale badge (xmlLang)
//   - validation hints
//   - retry error banner
//   - progress indicator in footer
//   - optional vs required labelling
//
// Output is a plain JSON-serializable object.
// Same presentation object → same card (deterministic).
//
// ──────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json';
const CARD_VERSION = '1.5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a slot context label fragment.
 * Returns " (Slot N)" for indexed slots, "" for singleton slots.
 *
 * @param {object} slotContext - { slotType, slotIndex }
 * @returns {string}
 */
function slotLabel(slotContext) {
  if (!slotContext) return '';
  const { slotIndex } = slotContext;
  if (slotIndex !== null && slotIndex !== undefined) return ` (Slot ${slotIndex})`;
  return '';
}

/**
 * Build the group / section breadcrumb text block.
 *
 * @param {string} group
 * @returns {object} Adaptive Card TextBlock element
 */
function buildGroupHeader(group) {
  return {
    type:      'TextBlock',
    text:      group || '',
    size:      'Small',
    weight:    'Bolder',
    color:     'Accent',
    spacing:   'None',
  };
}

/**
 * Build the field label row — includes replay-critical and locale badges inline.
 *
 * @param {object} presentation - Question presentation object
 * @returns {object} Adaptive Card element (ColumnSet for complex, TextBlock for simple)
 */
function buildLabelRow(presentation) {
  const { label, slotContext, replayCritical, xmlLang, required } = presentation;

  const labelParts = [];

  // Main label + slot suffix
  labelParts.push(`**${label}${slotLabel(slotContext)}**`);

  // Optional tag
  if (!required) labelParts.push('*(optional)*');

  // Badges (inline markdown)
  if (replayCritical) labelParts.push('⚠ *Replay-critical*');
  if (xmlLang)        labelParts.push(`🌐 \`${xmlLang}\``);

  return {
    type:    'TextBlock',
    text:    labelParts.join('  '),
    wrap:    true,
    spacing: 'Small',
  };
}

/**
 * Build the question prompt text block.
 *
 * @param {string} question
 * @returns {object}
 */
function buildQuestionText(question) {
  return {
    type:    'TextBlock',
    text:    question || '',
    wrap:    true,
    spacing: 'Small',
  };
}

/**
 * Build the current-value display (prior-season reference).
 *
 * @param {*} currentValue
 * @returns {object|null}
 */
function buildCurrentValueBlock(currentValue) {
  if (currentValue === null || currentValue === undefined) return null;
  const display = Array.isArray(currentValue)
    ? currentValue.join(', ')
    : String(currentValue);
  return {
    type:      'TextBlock',
    text:      `Current value: **${display}**`,
    isSubtle:  true,
    wrap:      true,
    spacing:   'ExtraSmall',
  };
}

/**
 * Build the input control — either Input.Text or Input.ChoiceSet.
 *
 * @param {object} presentation - Question presentation object
 * @returns {object} Adaptive Card input element
 */
function buildInputControl(presentation) {
  const { label, choices, retryMetadata, fieldId } = presentation;

  if (Array.isArray(choices) && choices.length > 0) {
    return {
      type:        'Input.ChoiceSet',
      id:          'fieldValue',
      style:       'compact',
      placeholder: `Select ${label}...`,
      choices:     choices.map(c => ({ title: String(c), value: String(c) })),
      // Pre-select prior raw value on retry
      value:       (retryMetadata && retryMetadata.priorRawValue !== null)
        ? String(retryMetadata.priorRawValue)
        : undefined,
    };
  }

  return {
    type:        'Input.Text',
    id:          'fieldValue',
    placeholder: `Enter ${label}...`,
    // Pre-fill invalid value on retry so user can correct rather than retype
    value:       (retryMetadata && retryMetadata.priorRawValue !== null)
      ? String(retryMetadata.priorRawValue)
      : undefined,
  };
}

/**
 * Build validation hint text blocks (one per hint).
 *
 * @param {string[]} hints
 * @returns {object[]}
 */
function buildHintBlocks(hints) {
  if (!Array.isArray(hints) || hints.length === 0) return [];
  return hints.map(hint => ({
    type:      'TextBlock',
    text:      `ℹ ${hint}`,
    isSubtle:  true,
    size:      'Small',
    spacing:   'ExtraSmall',
  }));
}

/**
 * Build the retry error banner shown at the top of the card on re-ask.
 *
 * @param {object} retryMetadata
 * @returns {object|null}
 */
function buildRetryBanner(retryMetadata) {
  if (!retryMetadata || !retryMetadata.isRetry) return null;

  const errors  = (retryMetadata.validationErrors || [])
    .map(e => e.message || String(e))
    .join(' ');
  const prior   = retryMetadata.priorRawValue !== null
    ? `"${retryMetadata.priorRawValue}" is not valid. `
    : '';

  return {
    type:    'TextBlock',
    text:    `❌ ${prior}${errors || 'Please try again.'}`,
    color:   'Attention',
    wrap:    true,
    weight:  'Bolder',
    spacing: 'None',
  };
}

/**
 * Build the compact progress footer.
 *
 * @param {object} progress - { currentGroup, completedInGroup, totalInGroup, overallPercentage }
 * @returns {object}
 */
function buildProgressFooter(progress) {
  if (!progress) {
    return { type: 'TextBlock', text: '', isSubtle: true, size: 'Small' };
  }
  const { completedInGroup, totalInGroup, overallPercentage } = progress;
  return {
    type:     'TextBlock',
    text:     `Progress: ${completedInGroup}/${totalInGroup} in group · ${overallPercentage}% overall`,
    isSubtle:  true,
    size:      'Small',
    spacing:   'Medium',
    separator: true,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an Adaptive Card v1.5 payload from a "question" presentation object.
 *
 * @param {object} presentation - Output of buildQuestionPresentation()
 * @returns {object} Adaptive Card JSON payload
 */
function buildQuestionCard(presentation) {
  if (!presentation || typeof presentation !== 'object') {
    throw new Error('presentation must be a non-null object');
  }
  if (presentation.type !== 'question') {
    throw new Error(`buildQuestionCard expects type "question"; got "${presentation.type}"`);
  }

  const {
    key,
    group,
    question,
    currentValue,
    validationHints,
    retryMetadata,
    progress,
  } = presentation;

  const body = [];

  // Retry error banner (top of card when re-asking after a failed answer)
  const retryBanner = buildRetryBanner(retryMetadata);
  if (retryBanner) body.push(retryBanner);

  // Group breadcrumb
  body.push(buildGroupHeader(group));

  // Field label (with badges)
  body.push(buildLabelRow(presentation));

  // Question prompt
  body.push(buildQuestionText(question));

  // Prior-season reference value
  const cvBlock = buildCurrentValueBlock(currentValue);
  if (cvBlock) body.push(cvBlock);

  // Input control (text or choice set)
  body.push(buildInputControl(presentation));

  // Validation hints
  body.push(...buildHintBlocks(validationHints));

  // Progress footer
  body.push(buildProgressFooter(progress));

  // Submit action — includes key for routing back through the runtime
  const actions = [
    {
      type:  'Action.Submit',
      title: 'Submit',
      data:  { action: 'SUBMIT_ANSWER', fieldKey: key },
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

module.exports = {
  buildQuestionCard,
  _internals: {
    buildGroupHeader,
    buildLabelRow,
    buildQuestionText,
    buildCurrentValueBlock,
    buildInputControl,
    buildHintBlocks,
    buildRetryBanner,
    buildProgressFooter,
    slotLabel,
  },
};
