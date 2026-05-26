'use strict';

// ─── Review Adaptive Card Builder ─────────────────────────────────────────────
//
// Converts a "review" presentation object into an Adaptive Card v1.5 payload.
//
// Renders:
//   - Grouped before/after comparison (prior vs new value per field)
//   - changed / unchanged / unanswered badges
//   - replayCritical indicators
//   - Embedded replay warnings summary
//   - Confirm and cancel actions
//
// Consumes ONLY the presentation object — never orchestration state directly.
//
// Key rules:
//   - changed: null   → "Not answered" badge (NOT false)
//   - changed: false  → no badge (answered, no change)
//   - changed: true   → "Changed" badge, highlighted
//   - replayCritical  → ⚠ icon beside field label
//
// ──────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json';
const CARD_VERSION = '1.5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a badge string for a field's change state.
 *
 * @param {boolean|null} changed
 * @param {boolean} answered
 * @returns {string}
 */
function changeBadge(changed, answered) {
  if (!answered)      return ' ⬜ *Not answered*';
  if (changed === true)  return ' 🔄 *Changed*';
  return '';  // answered + unchanged: no badge
}

/**
 * Format a value for display (handles null, arrays, etc.).
 *
 * @param {*} value
 * @returns {string}
 */
function displayValue(value) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Build the fact-set row for a single field entry.
 *
 * @param {object} field - Field entry from a review presentation group
 * @returns {object[]} Array of Adaptive Card body elements
 */
function buildFieldRow(field) {
  const {
    label, slotContext, replayCritical, xmlLang,
    priorValue, newValue, changed, answered, valid, validationErrors,
  } = field;

  // Slot suffix
  const slotSuffix = (slotContext && slotContext.slotIndex !== null && slotContext.slotIndex !== undefined)
    ? ` (Slot ${slotContext.slotIndex})`
    : '';

  const replayIcon = replayCritical ? ' ⚠' : '';
  const localeTag  = xmlLang ? ` 🌐 \`${xmlLang}\`` : '';
  const badge      = changeBadge(changed, answered);

  const labelText = `${label}${slotSuffix}${replayIcon}${localeTag}${badge}`;

  const facts = [
    { title: 'Prior value:', value: displayValue(priorValue) },
    { title: 'New value:',   value: answered ? displayValue(newValue) : '*(will keep prior value)*' },
  ];

  const items = [
    {
      type:    'TextBlock',
      text:    labelText,
      wrap:    true,
      weight:  changed === true ? 'Bolder' : 'Default',
      color:   (!valid && answered) ? 'Attention' : 'Default',
      spacing: 'Small',
    },
    {
      type:    'FactSet',
      facts,
      spacing: 'ExtraSmall',
    },
  ];

  // Validation errors (if any)
  if (!valid && Array.isArray(validationErrors) && validationErrors.length > 0) {
    validationErrors.forEach(e => {
      items.push({
        type:    'TextBlock',
        text:    `❌ ${e.message || String(e)}`,
        color:   'Attention',
        size:    'Small',
        wrap:    true,
        spacing: 'ExtraSmall',
      });
    });
  }

  return items;
}

/**
 * Build a group section (group heading + field rows).
 *
 * @param {object} groupEntry - { group, fields[] }
 * @returns {object[]} Array of Adaptive Card body elements
 */
function buildGroupSection(groupEntry) {
  const { group, fields } = groupEntry;

  const elements = [
    {
      type:      'TextBlock',
      text:      group,
      weight:    'Bolder',
      size:      'Medium',
      separator: true,
      spacing:   'Medium',
    },
  ];

  (fields || []).forEach(f => {
    elements.push(...buildFieldRow(f));
  });

  return elements;
}

/**
 * Build the replay warnings summary block for the review card footer.
 *
 * @param {object[]} replayWarnings
 * @returns {object[]}
 */
function buildWarningsSummary(replayWarnings) {
  if (!replayWarnings || replayWarnings.length === 0) return [];

  const items = [
    {
      type:      'TextBlock',
      text:      `⚠ Replay Warnings (${replayWarnings.length})`,
      weight:    'Bolder',
      color:     'Attention',
      separator: true,
      spacing:   'Medium',
    },
  ];

  replayWarnings.forEach(w => {
    items.push({
      type:    'TextBlock',
      text:    w.message || `Changed: ${w.fieldId}`,
      wrap:    true,
      color:   'Attention',
      size:    'Small',
      spacing: 'ExtraSmall',
    });
  });

  return items;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an Adaptive Card v1.5 payload from a "review" presentation object.
 *
 * @param {object} presentation - Output of buildReviewPresentation()
 * @returns {object} Adaptive Card JSON payload
 */
function buildReviewCard(presentation) {
  if (!presentation || typeof presentation !== 'object') {
    throw new Error('presentation must be a non-null object');
  }
  if (presentation.type !== 'review') {
    throw new Error(`buildReviewCard expects type "review"; got "${presentation.type}"`);
  }

  const {
    sessionStatus,
    completionPercentage,
    groups,
    replayWarnings,
    reviewRequired,
  } = presentation;

  const body = [
    // Header
    {
      type:    'TextBlock',
      text:    '📋 Review Changes',
      weight:  'Bolder',
      size:    'Large',
      spacing: 'None',
    },
    {
      type:     'TextBlock',
      text:     `Session ${sessionStatus} · ${completionPercentage}% complete`,
      isSubtle: true,
      spacing:  'ExtraSmall',
    },
  ];

  // Group sections
  (groups || []).forEach(g => {
    body.push(...buildGroupSection(g));
  });

  // Replay warnings summary
  body.push(...buildWarningsSummary(replayWarnings || []));

  // Actions
  const actions = [];

  if (reviewRequired) {
    actions.push({
      type:  'Action.Submit',
      title: 'Confirm and complete',
      style: 'positive',
      data:  { action: 'CONFIRM_GENERATION' },
    });
  } else {
    actions.push({
      type:  'Action.Submit',
      title: 'Confirm and generate XML',
      style: 'positive',
      data:  { action: 'CONFIRM_GENERATION' },
    });
  }

  actions.push({
    type:  'Action.Submit',
    title: 'Cancel session',
    style: 'destructive',
    data:  { action: 'CANCEL_SESSION' },
  });

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
  buildReviewCard,
  _internals: { buildFieldRow, buildGroupSection, buildWarningsSummary, changeBadge, displayValue },
};
