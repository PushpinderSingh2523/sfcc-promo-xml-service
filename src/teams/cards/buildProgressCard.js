'use strict';

// ─── Progress Adaptive Card Builder ───────────────────────────────────────────
//
// Converts a "progress" presentation object into an Adaptive Card v1.5 payload.
//
// Consumes ONLY the presentation object — never orchestration state directly.
//
// Renders:
//   - Overall completion percentage and field counts
//   - Per-group completion breakdown (✅ / ⬜)
//   - Current active group highlight
//   - Continue action
//
// ──────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json';
const CARD_VERSION = '1.5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a single group row for the per-group breakdown.
 *
 * @param {object} groupEntry - { group, total, answered, complete }
 * @param {string|null} currentGroup - The session's active group name
 * @returns {object} Adaptive Card ColumnSet element
 */
function buildGroupRow(groupEntry, currentGroup) {
  const { group, total, answered, complete } = groupEntry;
  const isCurrent  = group === currentGroup;
  const icon       = complete ? '✅' : '⬜';
  const labelText  = isCurrent
    ? `**${icon} ${group}** ◀ current`
    : `${icon} ${group}`;

  return {
    type:    'ColumnSet',
    spacing: 'ExtraSmall',
    columns: [
      {
        type:  'Column',
        width: 'stretch',
        items: [{ type: 'TextBlock', text: labelText, wrap: false }],
      },
      {
        type:  'Column',
        width: 'auto',
        items: [
          {
            type:      'TextBlock',
            text:      `${answered}/${total}`,
            isSubtle:  true,
            horizontalAlignment: 'Right',
          },
        ],
      },
    ],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an Adaptive Card v1.5 payload from a "progress" presentation object.
 *
 * @param {object} presentation - Output of buildProgressPresentation()
 * @returns {object} Adaptive Card JSON payload
 */
function buildProgressCard(presentation) {
  if (!presentation || typeof presentation !== 'object') {
    throw new Error('presentation must be a non-null object');
  }
  if (presentation.type !== 'progress') {
    throw new Error(`buildProgressCard expects type "progress"; got "${presentation.type}"`);
  }

  const {
    currentGroup,
    completedQuestions,
    totalQuestions,
    completionPercentage,
    status,
    groups,
  } = presentation;

  const body = [
    // Header
    {
      type:    'TextBlock',
      text:    '📊 Session Progress',
      weight:  'Bolder',
      size:    'Large',
      spacing: 'None',
    },
    // Summary line
    {
      type:      'TextBlock',
      text:      `${completionPercentage}% complete · ${completedQuestions} of ${totalQuestions} fields answered`,
      isSubtle:  true,
      spacing:   'ExtraSmall',
    },
    // Status badge
    {
      type:      'TextBlock',
      text:      `Status: **${status}**`,
      spacing:   'ExtraSmall',
    },
    // Separator before group breakdown
    {
      type:      'TextBlock',
      text:      'Group breakdown:',
      weight:    'Bolder',
      spacing:   'Medium',
      separator: true,
    },
    // Per-group rows
    ...(groups || []).map(g => buildGroupRow(g, currentGroup)),
  ];

  const actions = [
    {
      type:  'Action.Submit',
      title: 'Continue answering',
      data:  { action: 'SUBMIT_ANSWER' },
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

module.exports = { buildProgressCard, _internals: { buildGroupRow } };
