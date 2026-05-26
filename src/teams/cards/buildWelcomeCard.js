'use strict';

// ─── Welcome / Session-Start Adaptive Card Builder ────────────────────────────
//
// Shown as a session preamble when a new SAS conversation begins.
//
// The welcome card:
//   - Identifies the session and blueprint
//   - Explains the replay-critical field concept
//   - Surfaces the session expiry window so users know how long they have
//   - Provides a single "Begin configuration" action that triggers the
//     first question card in the conversation flow
//
// Adaptive Card schema v1.5 compliant.
// Deterministic: same inputs → same card (no Date.now() internally).
//
// ──────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json';
const CARD_VERSION = '1.5';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a welcome Adaptive Card for a newly started SAS session.
 *
 * @param {object} options
 * @param {string} options.sessionId        - Newly created session ID
 * @param {string} [options.blueprintId]    - Blueprint ID
 * @param {number} [options.totalQuestions] - Total questions in the session
 * @param {string} [options.campaignName]   - Campaign name (if known from blueprint)
 * @param {string} [options.expiresAt]      - Session TTL expiry (ISO-8601)
 * @returns {object} Adaptive Card v1.5 payload
 */
function buildWelcomeCard({
  sessionId,
  blueprintId,
  totalQuestions,
  campaignName,
  expiresAt,
} = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('buildWelcomeCard: sessionId must be a non-empty string');
  }

  // Format expiry time for display (HH:MM AM/PM)
  let expiryDisplay = 'unknown';
  if (expiresAt) {
    try {
      expiryDisplay = new Date(expiresAt).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit',
      });
    } catch (_) {
      expiryDisplay = expiresAt;
    }
  }

  const titleLine = campaignName
    ? `Configuring: **${campaignName}**`
    : 'A new SAS promotion session has been started.';

  const body = [
    // Header
    {
      type:    'TextBlock',
      text:    '🛍 SAS Promotion Configuration',
      weight:  'Bolder',
      size:    'Large',
      spacing: 'None',
    },
    // Subtitle
    {
      type:    'TextBlock',
      text:    titleLine,
      wrap:    true,
      spacing: 'Small',
    },
    // Session metadata
    {
      type:    'FactSet',
      spacing: 'Medium',
      facts: [
        { title: 'Session ID:',       value: sessionId            || '—' },
        { title: 'Blueprint:',        value: blueprintId           || '—' },
        { title: 'Questions:',        value: String(totalQuestions ?? 0) },
        { title: 'Session expires:',  value: expiryDisplay },
      ],
    },
    // Instruction note
    {
      type:    'TextBlock',
      text:    'Answer each question to configure the promotion fields. Fields marked ⚠ **Replay-critical** change identifiers that affect the XML slot mapping — these require a review confirmation step before the XML is generated.',
      wrap:    true,
      size:    'Small',
      isSubtle: true,
      spacing: 'Medium',
    },
  ];

  const actions = [
    {
      type:  'Action.Submit',
      title: 'Begin configuration →',
      style: 'positive',
      data:  {
        action:    'REQUEST_REVIEW',
        sessionId,
      },
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

module.exports = { buildWelcomeCard };
