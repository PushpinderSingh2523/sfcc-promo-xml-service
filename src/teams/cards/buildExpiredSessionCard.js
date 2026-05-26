'use strict';

// ─── Expired Session Adaptive Card Builder ────────────────────────────────────
//
// Shown when a user tries to interact with a session that has exceeded its TTL.
//
// An expired session is immutable — it cannot accept new answers, be confirmed,
// or generate XML. This card surfaces the expiry details so the user understands
// why they cannot proceed and offers a "Start new session" action.
//
// Adaptive Card schema v1.5 compliant.
// Deterministic: same inputs → same card.
//
// ──────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json';
const CARD_VERSION = '1.5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an ISO-8601 timestamp for human display.
 *
 * @param {string|null} iso
 * @returns {string}
 */
function fmtTimestamp(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month:  'short',
      day:    'numeric',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return iso;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an expired-session Adaptive Card.
 *
 * @param {object} options
 * @param {string}  options.sessionId            - Expired session ID
 * @param {string}  [options.expiresAt]          - ISO-8601 expiry timestamp
 * @param {string}  [options.lastInteractionAt]  - ISO-8601 last-active timestamp
 * @param {number}  [options.answeredFields]      - Fields answered before expiry
 * @param {number}  [options.totalFields]         - Total fields in the session
 * @returns {object} Adaptive Card v1.5 payload
 */
function buildExpiredSessionCard({
  sessionId,
  expiresAt,
  lastInteractionAt,
  answeredFields,
  totalFields,
} = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('buildExpiredSessionCard: sessionId must be a non-empty string');
  }

  const progressFact = (answeredFields != null && totalFields != null)
    ? [{ title: 'Progress at expiry:', value: `${answeredFields} of ${totalFields} fields answered` }]
    : [];

  const body = [
    // Header
    {
      type:    'TextBlock',
      text:    '⏱ Session Expired',
      weight:  'Bolder',
      size:    'Large',
      color:   'Attention',
      spacing: 'None',
    },
    // Explanation
    {
      type:    'TextBlock',
      text:    'This session expired due to inactivity. No promotion changes were saved. Please start a new session to continue.',
      wrap:    true,
      spacing: 'Small',
    },
    // Metadata facts
    {
      type:    'FactSet',
      spacing: 'Medium',
      facts: [
        { title: 'Session ID:',   value: sessionId              },
        { title: 'Expired at:',   value: fmtTimestamp(expiresAt) },
        { title: 'Last active:',  value: fmtTimestamp(lastInteractionAt) },
        ...progressFact,
      ],
    },
    // Note about prior data
    {
      type:    'TextBlock',
      text:    'The session record is preserved for audit purposes. You cannot resume this session — start a new one instead.',
      wrap:    true,
      size:    'Small',
      isSubtle: true,
      spacing: 'Medium',
    },
  ];

  const actions = [
    {
      type:  'Action.Submit',
      title: 'Start new session',
      style: 'positive',
      data:  { action: 'START_NEW_SESSION' },
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

module.exports = { buildExpiredSessionCard };
