'use strict';

// ─── Warning Adaptive Card Builder ────────────────────────────────────────────
//
// Converts a "warning" presentation object into an Adaptive Card v1.5 payload.
//
// Renders:
//   - Replay-safety warning header
//   - One row per warning: severity, field, prior vs new value, message
//   - Acknowledgement action (wired to CONFIRM_GENERATION in the runtime)
//   - Cancel action
//
// Consumes ONLY the presentation object — never orchestration state directly.
//
// ──────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json';
const CARD_VERSION = '1.5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an individual warning entry block.
 *
 * @param {object} warning - Single warning from the presentation warnings array
 * @returns {object[]} Array of Adaptive Card body elements for this warning
 */
function buildWarningEntry(warning) {
  const { severity, fieldId, label, message, priorValue, newValue, slotContext } = warning;

  // Slot suffix (e.g. " (Slot 0)" or "")
  const slotSuffix = (slotContext && slotContext.slotIndex !== null && slotContext.slotIndex !== undefined)
    ? ` (Slot ${slotContext.slotIndex})`
    : '';

  const priorDisplay = priorValue !== null && priorValue !== undefined ? String(priorValue) : '—';
  const newDisplay   = newValue   !== null && newValue   !== undefined ? String(newValue)   : '—';

  return [
    {
      type:      'Container',
      style:     'attention',
      spacing:   'Small',
      items: [
        {
          type:   'TextBlock',
          text:   `⚠ ${severity} — ${label || fieldId}${slotSuffix}`,
          weight: 'Bolder',
          wrap:   true,
          color:  'Attention',
        },
        {
          type:    'TextBlock',
          text:    message || '',
          wrap:    true,
          spacing: 'ExtraSmall',
        },
        {
          type:    'FactSet',
          spacing: 'ExtraSmall',
          facts: [
            { title: 'Prior value:', value: priorDisplay },
            { title: 'New value:',   value: newDisplay   },
          ],
        },
      ],
    },
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an Adaptive Card v1.5 payload from a "warning" presentation object.
 *
 * @param {object} presentation - Output of buildReplayWarningPresentation()
 * @returns {object} Adaptive Card JSON payload
 */
function buildWarningCard(presentation) {
  if (!presentation || typeof presentation !== 'object') {
    throw new Error('presentation must be a non-null object');
  }
  if (presentation.type !== 'warning') {
    throw new Error(`buildWarningCard expects type "warning"; got "${presentation.type}"`);
  }

  const { warnings, totalWarnings, acknowledgementRequired } = presentation;

  const body = [
    // Header
    {
      type:    'TextBlock',
      text:    '⚠️ Replay Safety Warning',
      weight:  'Bolder',
      size:    'Large',
      color:   'Attention',
      spacing: 'None',
    },
    {
      type:     'TextBlock',
      text:     `${totalWarnings} replay-critical field${totalWarnings === 1 ? '' : 's'} changed`,
      isSubtle: true,
      spacing:  'ExtraSmall',
    },
  ];

  // Individual warning entries
  (warnings || []).forEach(w => {
    body.push(...buildWarningEntry(w));
  });

  // Acknowledgement note
  if (acknowledgementRequired) {
    body.push({
      type:      'TextBlock',
      text:      'You must acknowledge these changes before completing the session.',
      wrap:      true,
      spacing:   'Medium',
      separator: true,
    });
  }

  const actions = [];

  if (acknowledgementRequired) {
    actions.push({
      type:  'Action.Submit',
      title: 'I understand — continue',
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

module.exports = { buildWarningCard, _internals: { buildWarningEntry } };
