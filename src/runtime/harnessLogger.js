'use strict';

/**
 * harnessLogger.js
 *
 * Deterministic NDJSON logger for the local runtime harness.
 *
 * Writes one JSON object per line to:
 *   logs/runtime/<sessionId>.ndjson
 *
 * Each log entry has the shape:
 *   { ts, sessionId, event, data? }
 *
 * Events (deterministic set — never free-form):
 *   SESSION_START        — session created, blueprint loaded
 *   QUESTION_PRESENTED   — question shown to user / dispatched in scripted mode
 *   ANSWER_ACCEPTED      — valid answer collected
 *   ANSWER_REJECTED      — invalid answer, validation errors included
 *   STATUS_TRANSITION    — session.status changed
 *   REPLAY_WARNING       — structural difference detected during replay validation
 *   XML_GENERATED        — XML generation completed (timing in ms)
 *   ARTIFACT_READY       — final artifact produced
 *   SESSION_CANCELLED    — operator cancelled
 *   HARNESS_ERROR        — unexpected runtime error (non-fatal where possible)
 *
 * Guarantees:
 *   - Never throws (errors are swallowed after a console.warn)
 *   - Each entry is on its own line (NDJSON)
 *   - File is opened in append mode so partial sessions are preserved
 *   - No AI / async inference — purely synchronous file I/O
 */

const fs   = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENTS = Object.freeze({
  SESSION_START:       'SESSION_START',
  QUESTION_PRESENTED:  'QUESTION_PRESENTED',
  ANSWER_ACCEPTED:     'ANSWER_ACCEPTED',
  ANSWER_REJECTED:     'ANSWER_REJECTED',
  STATUS_TRANSITION:   'STATUS_TRANSITION',
  REPLAY_WARNING:      'REPLAY_WARNING',
  XML_GENERATED:       'XML_GENERATED',
  ARTIFACT_READY:      'ARTIFACT_READY',
  SESSION_CANCELLED:   'SESSION_CANCELLED',
  HARNESS_ERROR:       'HARNESS_ERROR',
});

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Resolve the log file path for a given sessionId.
 * Creates the logs/runtime directory if it does not exist.
 *
 * @param {string} sessionId
 * @returns {string} absolute path
 */
function _logPath(sessionId) {
  const dir = path.resolve(__dirname, '../../logs/runtime');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${sessionId}.ndjson`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a logger bound to a specific sessionId.
 *
 * @param {string} sessionId
 * @param {object} [opts]
 * @param {boolean} [opts.silent=false] — suppress all writes (useful in tests)
 * @returns {{ log, events }}
 */
function createLogger(sessionId, opts = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('harnessLogger.createLogger: sessionId must be a non-empty string');
  }

  const silent  = opts.silent === true;
  const logFile = silent ? null : _logPath(sessionId);

  /**
   * Write one NDJSON entry.
   *
   * @param {string} event  — one of EVENTS
   * @param {object} [data] — arbitrary serializable payload
   */
  function log(event, data) {
    if (silent) return;
    const entry = {
      ts:        new Date().toISOString(),
      sessionId,
      event,
      ...(data !== undefined ? { data } : {}),
    };
    try {
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[harnessLogger] Failed to write log entry: ${err.message}`);
    }
  }

  return { log, events: EVENTS };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createLogger, EVENTS };
