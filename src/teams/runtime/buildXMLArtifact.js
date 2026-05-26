'use strict';

// ─── XML Artifact Builder ──────────────────────────────────────────────────────
//
// Packages a generated XML string into a downloadable artifact descriptor.
//
// Responsibilities:
//   - Produce a deterministic filename from blueprint / session context
//   - Attach generation metadata (timestamp, sessionId, blueprintId)
//   - Measure byte size of the XML content
//
// Does NOT:
//   - Upload to any storage (WebDAV, S3, SharePoint, etc.)
//   - Compress or encode the XML
//   - Transmit over any network
//
// ──────────────────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a safe filesystem filename segment from an arbitrary string.
 * Replaces all non-alphanumeric, non-underscore characters with underscores.
 *
 * @param {string} value
 * @returns {string}
 */
function safeName(value) {
  if (!value) return 'UNKNOWN';
  return String(value).replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
}

/**
 * Derive a collision-resistant deterministic filename for the artifact.
 *
 * Pattern: SAS_<campaignId>_<YYYYMMDD>[_<sessionSlug>].xml
 *
 * When sessionId is supplied (the standard path), the first 12 chars of its
 * safe-name are appended, making simultaneous runs for the same campaign on
 * the same date produce distinct filenames.
 *
 * Examples:
 *   SAS_2026_SUMMER_PROMOTION_20260615.xml          (no sessionId)
 *   SAS_2026_SUMMER_PROMOTION_20260615_SESS_001.xml (with sessionId)
 *
 * @param {string}  campaignId   - From the generated session answers
 * @param {string}  generatedAt  - ISO-8601 generation timestamp
 * @param {string}  [sessionId]  - Session ID for collision prevention
 * @returns {string}
 */
function buildFilename(campaignId, generatedAt, sessionId) {
  const datePart    = generatedAt
    ? generatedAt.slice(0, 10).replace(/-/g, '')
    : '00000000';
  const sessionSlug = sessionId
    ? '_' + safeName(sessionId).slice(0, 16)
    : '';
  return `SAS_${safeName(campaignId)}_${datePart}${sessionSlug}.xml`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a downloadable XML artifact descriptor.
 *
 * @param {object} options
 * @param {string} options.xmlContent   - Complete XML document string
 * @param {string} options.campaignId   - Campaign ID (drives filename)
 * @param {string} options.sessionId    - Session that produced this artifact
 * @param {string} options.blueprintId  - Blueprint that was updated
 * @param {string} [options.generatedAt] - ISO-8601 timestamp (default: now)
 * @returns {{
 *   filename:    string,
 *   xmlContent:  string,
 *   sessionId:   string,
 *   blueprintId: string,
 *   generatedAt: string,
 *   byteSize:    number,
 * }}
 */
function buildXMLArtifact({ xmlContent, campaignId, sessionId, blueprintId, generatedAt }) {
  if (typeof xmlContent !== 'string' || xmlContent.trim() === '') {
    throw new Error('xmlContent must be a non-empty string');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  if (!blueprintId || typeof blueprintId !== 'string') {
    throw new Error('blueprintId must be a non-empty string');
  }

  const at       = generatedAt || new Date().toISOString();
  const filename = buildFilename(campaignId, at, sessionId);
  const byteSize = Buffer.byteLength(xmlContent, 'utf8');

  return {
    filename,
    xmlContent,
    sessionId,
    blueprintId,
    generatedAt: at,
    byteSize,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildXMLArtifact,
  // Internal helpers exported for unit testing
  _internals: { buildFilename, safeName },
};
