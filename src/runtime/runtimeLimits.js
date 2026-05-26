'use strict';

/**
 * runtimeLimits.js
 *
 * Centralised deterministic payload-limit constants and guard functions.
 *
 * Every guard throws a plain Error with a `code` property when a limit is
 * exceeded.  No truncation, no silencing — callers receive a structured,
 * inspectable error.
 *
 * Limits:
 *   MAX_ANSWER_LENGTH        — chars for any single string answer value
 *   MAX_XML_BYTES            — UTF-8 byte size of a generated XML document
 *   MAX_SESSIONS             — concurrent in-memory sessions
 *   MAX_REPLAY_WARNINGS      — replay-safety warnings per session
 *   MAX_QUESTIONS_PER_SESSION — question-queue length
 *   DEFAULT_SESSION_TTL_MS   — inactivity window before expiry (ms)
 *
 * Error codes (stable string constants, safe to `switch` on):
 *   ANSWER_TOO_LONG
 *   XML_TOO_LARGE
 *   TOO_MANY_SESSIONS
 *   TOO_MANY_REPLAY_WARNINGS
 *   QUEUE_TOO_LARGE
 *
 * @module runtimeLimits
 */

// ─── Limit constants ──────────────────────────────────────────────────────────

const LIMITS = Object.freeze({
  /** Maximum character length for any single string answer value. */
  MAX_ANSWER_LENGTH:          4_000,

  /** Maximum UTF-8 byte size for any generated XML document (512 KB). */
  MAX_XML_BYTES:              524_288,

  /** Maximum concurrent in-memory sessions (runtime guard only). */
  MAX_SESSIONS:               1_000,

  /** Maximum replay-safety warnings surfaced per session. */
  MAX_REPLAY_WARNINGS:        50,

  /** Maximum questions allowed in a single session's question queue. */
  MAX_QUESTIONS_PER_SESSION:  200,

  /** Default session TTL in milliseconds (30 minutes). */
  DEFAULT_SESSION_TTL_MS:     30 * 60 * 1_000,
});

// ─── Error codes ──────────────────────────────────────────────────────────────

const LIMIT_CODES = Object.freeze({
  ANSWER_TOO_LONG:          'ANSWER_TOO_LONG',
  XML_TOO_LARGE:            'XML_TOO_LARGE',
  TOO_MANY_SESSIONS:        'TOO_MANY_SESSIONS',
  TOO_MANY_REPLAY_WARNINGS: 'TOO_MANY_REPLAY_WARNINGS',
  QUEUE_TOO_LARGE:          'QUEUE_TOO_LARGE',
});

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Build a limit-violation Error with a stable `code` and diagnostic metadata.
 *
 * @param {string} code
 * @param {string} message
 * @param {object} meta — additional properties attached to the error
 * @returns {Error}
 */
function _limitError(code, message, meta = {}) {
  const err = new Error(message);
  err.code  = code;
  Object.assign(err, meta);
  return err;
}

// ─── Guard functions ──────────────────────────────────────────────────────────

/**
 * Throw if a string answer value exceeds MAX_ANSWER_LENGTH.
 *
 * Only guards string values — numbers/arrays pass through.
 *
 * @param {*}      value — raw or normalized answer value
 * @param {string} [fieldId] — field name for diagnostic message
 */
function assertAnswerLength(value, fieldId) {
  if (typeof value !== 'string') return;
  if (value.length > LIMITS.MAX_ANSWER_LENGTH) {
    throw _limitError(
      LIMIT_CODES.ANSWER_TOO_LONG,
      `Answer for field "${fieldId || 'unknown'}" exceeds maximum length ` +
      `(${value.length} chars; limit ${LIMITS.MAX_ANSWER_LENGTH})`,
      { field: fieldId, actual: value.length, limit: LIMITS.MAX_ANSWER_LENGTH }
    );
  }
}

/**
 * Throw if an XML content string exceeds MAX_XML_BYTES.
 *
 * @param {string} xmlContent
 */
function assertXmlSize(xmlContent) {
  if (typeof xmlContent !== 'string') return;
  const bytes = Buffer.byteLength(xmlContent, 'utf8');
  if (bytes > LIMITS.MAX_XML_BYTES) {
    throw _limitError(
      LIMIT_CODES.XML_TOO_LARGE,
      `Generated XML exceeds maximum size (${bytes} bytes; limit ${LIMITS.MAX_XML_BYTES})`,
      { actual: bytes, limit: LIMITS.MAX_XML_BYTES }
    );
  }
}

/**
 * Throw if the active session count would exceed MAX_SESSIONS.
 *
 * @param {number} currentCount — number of sessions currently alive
 */
function assertSessionCount(currentCount) {
  if (typeof currentCount !== 'number') return;
  if (currentCount >= LIMITS.MAX_SESSIONS) {
    throw _limitError(
      LIMIT_CODES.TOO_MANY_SESSIONS,
      `Session limit reached (${currentCount}/${LIMITS.MAX_SESSIONS}). ` +
      'Expire or cancel inactive sessions before creating new ones.',
      { actual: currentCount, limit: LIMITS.MAX_SESSIONS }
    );
  }
}

/**
 * Throw if the replay-warning count would exceed MAX_REPLAY_WARNINGS.
 *
 * @param {number} count — number of warnings about to be stored
 */
function assertReplayWarnings(count) {
  if (typeof count !== 'number') return;
  if (count > LIMITS.MAX_REPLAY_WARNINGS) {
    throw _limitError(
      LIMIT_CODES.TOO_MANY_REPLAY_WARNINGS,
      `Replay-safety warning count (${count}) exceeds limit ` +
      `(${LIMITS.MAX_REPLAY_WARNINGS}). Blueprint may be malformed.`,
      { actual: count, limit: LIMITS.MAX_REPLAY_WARNINGS }
    );
  }
}

/**
 * Throw if a question queue would exceed MAX_QUESTIONS_PER_SESSION.
 *
 * @param {number} count — number of questions in the queue
 */
function assertQueueSize(count) {
  if (typeof count !== 'number') return;
  if (count > LIMITS.MAX_QUESTIONS_PER_SESSION) {
    throw _limitError(
      LIMIT_CODES.QUEUE_TOO_LARGE,
      `Question queue (${count}) exceeds maximum per-session limit ` +
      `(${LIMITS.MAX_QUESTIONS_PER_SESSION}).`,
      { actual: count, limit: LIMITS.MAX_QUESTIONS_PER_SESSION }
    );
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  LIMITS,
  LIMIT_CODES,
  assertAnswerLength,
  assertXmlSize,
  assertSessionCount,
  assertReplayWarnings,
  assertQueueSize,
};
