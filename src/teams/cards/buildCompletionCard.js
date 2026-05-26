'use strict';

// ─── Completion Adaptive Card Builder ─────────────────────────────────────────
//
// Converts a "completion" presentation object into an Adaptive Card v1.5 payload.
//
// Renders:
//   - Session complete header
//   - Blueprint / session metadata (sessionId, blueprintId, status)
//   - Field counts (answered / total)
//   - Slot counts (promotions, assignments)
//   - Payload readiness indicator
//   - Warning acknowledgement status
//   - Changed fields list (before/after)
//   - XML generation action (when payloadReady)
//
// Consumes ONLY the presentation object — never orchestration state directly.
//
// ──────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json';
const CARD_VERSION = '1.5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a changed field as a FactSet row.
 *
 * @param {object} cf - changedField entry
 * @returns {object}
 */
function buildChangedFieldFact(cf) {
  const slotSuffix = (cf.slotContext && cf.slotContext.slotIndex !== null && cf.slotContext.slotIndex !== undefined)
    ? ` (Slot ${cf.slotContext.slotIndex})`
    : '';
  const prior = cf.priorValue !== null && cf.priorValue !== undefined ? String(cf.priorValue) : '—';
  const next  = cf.newValue   !== null && cf.newValue   !== undefined ? String(cf.newValue)   : '—';
  return {
    title: `${cf.label}${slotSuffix}:`,
    value: `${prior} → ${next}`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an Adaptive Card v1.5 payload from a "completion" presentation object.
 *
 * @param {object} presentation - Output of buildCompletionPresentation()
 * @returns {object} Adaptive Card JSON payload
 */
function buildCompletionCard(presentation) {
  if (!presentation || typeof presentation !== 'object') {
    throw new Error('presentation must be a non-null object');
  }
  if (presentation.type !== 'completion') {
    throw new Error(`buildCompletionCard expects type "completion"; got "${presentation.type}"`);
  }

  const {
    sessionId,
    blueprintId,
    status,
    completionPercentage,
    promotionCount,
    assignmentCount,
    answeredFields,
    totalFields,
    payloadReady,
    warningsAcknowledged,
    replayWarnings,
    changedFields,
  } = presentation;

  const body = [
    // Header
    {
      type:    'TextBlock',
      text:    payloadReady ? '✅ Session Complete' : `⏳ Session ${status}`,
      weight:  'Bolder',
      size:    'Large',
      color:   payloadReady ? 'Good' : 'Default',
      spacing: 'None',
    },
    // Metadata facts
    {
      type:    'FactSet',
      spacing: 'Small',
      facts: [
        { title: 'Session ID:',  value: sessionId   || '—' },
        { title: 'Blueprint:',   value: blueprintId  || '—' },
        { title: 'Status:',      value: status       || '—' },
        { title: 'Fields:',      value: `${answeredFields} of ${totalFields} answered (${completionPercentage}%)` },
        { title: 'Promotions:',  value: `${promotionCount} slot${promotionCount === 1 ? '' : 's'}` },
        { title: 'Assignments:', value: `${assignmentCount} slot${assignmentCount === 1 ? '' : 's'}` },
        {
          title: 'Warnings:',
          value: warningsAcknowledged
            ? '✅ All acknowledged'
            : '⚠ Pending acknowledgement',
        },
        {
          title: 'Payload:',
          value: payloadReady ? '✅ Ready for XML generation' : '⏳ Not ready',
        },
      ],
    },
  ];

  // Changed fields section
  if (Array.isArray(changedFields) && changedFields.length > 0) {
    body.push({
      type:      'TextBlock',
      text:      `Changed Fields (${changedFields.length})`,
      weight:    'Bolder',
      separator: true,
      spacing:   'Medium',
    });
    body.push({
      type:  'FactSet',
      facts: changedFields.map(buildChangedFieldFact),
    });
  } else {
    body.push({
      type:      'TextBlock',
      text:      'No fields changed from prior values.',
      isSubtle:  true,
      separator: true,
      spacing:   'Medium',
    });
  }

  // Replay warnings summary (if any remain)
  if (Array.isArray(replayWarnings) && replayWarnings.length > 0) {
    body.push({
      type:    'TextBlock',
      text:    `⚠ ${replayWarnings.length} replay warning${replayWarnings.length === 1 ? '' : 's'} acknowledged`,
      color:   'Attention',
      size:    'Small',
      spacing: 'Small',
    });
  }

  // Actions
  const actions = [];

  if (payloadReady) {
    actions.push({
      type:  'Action.Submit',
      title: '⬇ Generate and download XML',
      style: 'positive',
      data:  { action: 'CONFIRM_GENERATION' },
    });
  }

  actions.push({
    type:    'Action.ShowCard',
    title:   'View progress breakdown',
    card: {
      type:    'AdaptiveCard',
      version: CARD_VERSION,
      body: [
        {
          type:    'TextBlock',
          text:    'Request a progress card via the orchestration flow to see the full group breakdown.',
          wrap:    true,
          isSubtle: true,
        },
      ],
    },
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

module.exports = { buildCompletionCard, _internals: { buildChangedFieldFact } };
