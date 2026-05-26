'use strict';

// ─── Copilot Studio Response Envelope ─────────────────────────────────────────
//
// Wraps a Teams HTTP response in a Copilot Studio / Power Virtual Agents
// compatible envelope for use in connector action responses.
//
// Copilot Studio expects connector responses to carry:
//   - A stable set of top-level fields it can map to flow variables
//   - A "status" string for conditional branching in the conversation flow
//   - A "resumeToken" for resuming interrupted sessions
//   - An "artifact" block for download flows
//
// Status values (for Copilot Studio topic conditions):
//   in_progress  — session is active and accepting answers
//   complete     — session is COMPLETE (XML may be available)
//   cancelled    — session was cancelled
//   expired      — session TTL exceeded
//   error        — action failed (check error field)
//
// ──────────────────────────────────────────────────────────────────────────────

const ENVELOPE_VERSION = '1.0';

// Maps session STATUS enum values to Copilot-friendly lowercase strings
const STATUS_MAP = Object.freeze({
  CREATED:           'in_progress',
  IN_PROGRESS:       'in_progress',
  VALIDATION_FAILED: 'in_progress',
  REVIEW_PENDING:    'in_progress',
  COMPLETE:          'complete',
  CANCELLED:         'cancelled',
  EXPIRED:           'expired',
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Wrap an HTTP response body in a Copilot Studio compatible envelope.
 *
 * @param {object}      httpResponse   - Output of buildHttpResponse()
 * @param {string|null} sessionStatus  - Current session status (STATUS enum value)
 * @returns {object} Copilot Studio envelope
 */
function wrapForCopilot(httpResponse, sessionStatus = null) {
  const {
    success, action, sessionId, card, artifact, error, _metadata,
  } = httpResponse;

  const copilotStatus = deriveStatus(success, sessionStatus, error);

  return {
    version:     ENVELOPE_VERSION,
    status:      copilotStatus,
    action:      action    || 'UNKNOWN',
    sessionId:   sessionId || null,
    resumeToken: sessionId || null,           // opaque token — currently sessionId
    card:        card      || null,
    artifact:    artifact  || null,
    error:       error     || null,
    metadata: {
      isIdempotent:    (_metadata && _metadata.isIdempotent) || false,
      actionSuccess:   success === true,
      sessionStatus:   sessionStatus || null,
      envelopeVersion: ENVELOPE_VERSION,
    },
  };
}

/**
 * Derive the Copilot Studio status string from action result + session state.
 *
 * @param {boolean}     success
 * @param {string|null} sessionStatus
 * @param {string|null} error
 * @returns {string}
 */
function deriveStatus(success, sessionStatus, error) {
  if (!success || error) return 'error';
  if (!sessionStatus)    return 'in_progress';
  return STATUS_MAP[sessionStatus] || 'in_progress';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { wrapForCopilot, deriveStatus, ENVELOPE_VERSION, STATUS_MAP };
