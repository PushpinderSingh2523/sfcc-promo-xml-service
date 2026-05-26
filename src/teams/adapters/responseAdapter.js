'use strict';

// ─── Teams Response Adapter ────────────────────────────────────────────────────
//
// Maps the raw Teams action result into a normalized HTTP response body.
//
// Responsibilities:
//   - Apply consistent field ordering
//   - Strip internal-only fields
//   - Annotate with idempotency metadata
//
// The artifact's xmlContent is preserved in the HTTP response body because:
//   - No file server / SharePoint adapter exists yet
//   - Copilot Studio needs the content inline for its flow variable
//   - A future download endpoint will split content out of the main response
//
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a normalized HTTP response body from a Teams action result.
 *
 * @param {object} actionResult   - Output of dispatchAction()
 * @param {object} [options]
 * @param {boolean} [options.isIdempotent=false] - Was this a duplicate submission?
 * @returns {object} HTTP response body
 */
function buildHttpResponse(actionResult, options = {}) {
  const { isIdempotent = false } = options;

  if (!actionResult || typeof actionResult !== 'object') {
    return {
      success:   false,
      action:    'UNKNOWN',
      sessionId: null,
      card:      null,
      artifact:  null,
      error:     'Internal adapter error: empty action result',
      _metadata: { isIdempotent: false },
    };
  }

  const { success, action, sessionId, card, artifact, error } = actionResult;

  // ── Artifact — include all fields, xmlContent preserved for download ────────
  let artifactBody = null;
  if (artifact && typeof artifact === 'object') {
    artifactBody = {
      filename:    artifact.filename    || null,
      byteSize:    artifact.byteSize    ?? null,
      generatedAt: artifact.generatedAt || null,
      sessionId:   artifact.sessionId   || null,
      blueprintId: artifact.blueprintId || null,
      xmlContent:  artifact.xmlContent  || null,  // kept for inline download
    };
  }

  return {
    success:   success === true,
    action:    action   || 'UNKNOWN',
    sessionId: sessionId || null,
    card:      card     || null,
    artifact:  artifactBody,
    error:     error    || null,
    _metadata: { isIdempotent },
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { buildHttpResponse };
