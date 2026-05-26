'use strict';

/**
 * sessionExpiry.js
 *
 * Deterministic TTL handling for blueprint clarification sessions.
 *
 * A session is considered expired when `expiresAt` is set and the current
 * wall-clock time (or the supplied `now` override) is past that timestamp.
 *
 * Responsibilities:
 *   - isSessionExpired(session, now?)   — pure check, no mutation
 *   - touchSession(session, now?, ttl?) — returns new session with refreshed
 *                                         lastInteractionAt + expiresAt
 *   - expireSession(session, now?)      — returns new session in EXPIRED status
 *   - buildExpiresAt(from, ttlMs)       — helper: compute ISO expiry timestamp
 *
 * Guarantees:
 *   - No mutation of input session
 *   - Deterministic: given same inputs, same output
 *   - EXPIRED sessions remain readable (all fields preserved)
 *   - Only `status`, `expiresAt`, `lastInteractionAt`, `updatedAt` change
 *
 * Integration points:
 *   - collectAnswer: calls isSessionExpired; throws if true
 *   - confirmReview: calls isSessionExpired; throws if true
 *   - getNextQuestion: returns null for EXPIRED sessions
 *   - createBlueprintSession: calls buildExpiresAt to set initial TTL
 *   - updateBlueprintSession: preserves EXPIRED status (same as CANCELLED)
 *
 * @module sessionExpiry
 */

const { LIMITS } = require('../../runtime/runtimeLimits');

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPIRED_STATUS = 'EXPIRED';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute an ISO-8601 expiry timestamp from a given start time.
 *
 * @param {string|number|Date} from  — start time (ISO string, epoch ms, or Date)
 * @param {number}             ttlMs — TTL in milliseconds
 * @returns {string} ISO-8601 expiry timestamp
 */
function buildExpiresAt(from, ttlMs) {
  const ms = ttlMs != null ? ttlMs : LIMITS.DEFAULT_SESSION_TTL_MS;
  const base = from instanceof Date ? from : new Date(from || Date.now());
  return new Date(base.getTime() + ms).toISOString();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Test whether a session has expired.
 *
 * A session without `expiresAt` is never considered expired (supports legacy
 * sessions created before TTL was introduced).
 *
 * @param {object}          session
 * @param {string|Date}     [now] — override current time (for deterministic tests)
 * @returns {boolean}
 */
function isSessionExpired(session, now) {
  if (!session || !session.expiresAt) return false;
  if (session.status === EXPIRED_STATUS) return true;
  const nowMs = now ? new Date(now).getTime() : Date.now();
  return nowMs > new Date(session.expiresAt).getTime();
}

/**
 * Refresh `lastInteractionAt` and extend `expiresAt` by `ttlMs` from now.
 *
 * Called on every accepted interaction to keep active sessions alive.
 *
 * @param {object}      session
 * @param {string|Date} [now]   — override current time
 * @param {number}      [ttlMs] — override TTL; defaults to LIMITS.DEFAULT_SESSION_TTL_MS
 * @returns {object} New session with refreshed timestamps
 */
function touchSession(session, now, ttlMs) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }
  const ts = now ? (now instanceof Date ? now.toISOString() : now) : new Date().toISOString();
  return {
    ...session,
    lastInteractionAt: ts,
    expiresAt:         buildExpiresAt(ts, ttlMs != null ? ttlMs : LIMITS.DEFAULT_SESSION_TTL_MS),
    updatedAt:         ts,
  };
}

/**
 * Mark a session as EXPIRED, making it immutable.
 *
 * The session content (answers, queue, etc.) is preserved for post-mortem
 * debugging, but no further mutations are allowed.
 *
 * @param {object}      session
 * @param {string|Date} [now]   — override current time
 * @returns {object} New session in EXPIRED status
 */
function expireSession(session, now) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }
  const ts = now ? (now instanceof Date ? now.toISOString() : now) : new Date().toISOString();
  return {
    ...session,
    status:    EXPIRED_STATUS,
    updatedAt: ts,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildExpiresAt,
  isSessionExpired,
  touchSession,
  expireSession,
  EXPIRED_STATUS,
};
