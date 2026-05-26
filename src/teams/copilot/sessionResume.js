'use strict';

// ─── Copilot Studio Session Resumability ──────────────────────────────────────
//
// Provides session resume token generation and validation for Copilot Studio
// conversations that may be interrupted and resumed.
//
// Resume token contract:
//   - A token uniquely identifies a session
//   - Parsing a token gives back a sessionId
//   - A token is valid only while the session is in an active (non-terminal) status
//
// Current implementation:
//   The token IS the sessionId. This is intentional — no auth layer exists yet.
//   The abstraction ensures callers treat tokens as opaque strings, so a signed
//   JWT implementation can be swapped in without changing callers.
//
// Resumable statuses (active, non-terminal):
//   CREATED | IN_PROGRESS | VALIDATION_FAILED | REVIEW_PENDING
//
// Non-resumable (terminal):
//   COMPLETE | CANCELLED | EXPIRED
//
// ──────────────────────────────────────────────────────────────────────────────

const { getSession } = require('../runtime/sessionStore');

const RESUMABLE_STATUSES = Object.freeze(new Set([
  'CREATED',
  'IN_PROGRESS',
  'VALIDATION_FAILED',
  'REVIEW_PENDING',
]));

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a resume token for an active session.
 * Currently returns the sessionId directly (no auth).
 *
 * @param {string} sessionId
 * @returns {string}
 */
function generateResumeToken(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  return sessionId;
}

/**
 * Parse a resume token back to a sessionId.
 * Currently a pass-through (token IS the sessionId).
 *
 * @param {string} token
 * @returns {string}
 */
function parseResumeToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('token must be a non-empty string');
  }
  return token;
}

/**
 * Check whether a session identified by the given token can be resumed.
 *
 * Returns:
 *   { resumable: true,  reason: null,       session }  — session is active
 *   { resumable: false, reason: <string>,   session }  — terminal or missing
 *
 * @param {string} sessionIdOrToken - sessionId or resume token
 * @returns {{ resumable: boolean, reason: string|null, session: object|null }}
 */
function checkResumable(sessionIdOrToken) {
  if (!sessionIdOrToken || typeof sessionIdOrToken !== 'string') {
    return { resumable: false, reason: 'Invalid or missing session token', session: null };
  }

  let sessionId;
  try {
    sessionId = parseResumeToken(sessionIdOrToken);
  } catch (_) {
    return { resumable: false, reason: 'Malformed session token', session: null };
  }

  let session;
  try {
    session = getSession(sessionId);
  } catch (err) {
    return { resumable: false, reason: `Session store error: ${err.message}`, session: null };
  }

  if (!session) {
    return { resumable: false, reason: `Session "${sessionId}" not found`, session: null };
  }

  if (!RESUMABLE_STATUSES.has(session.status)) {
    return {
      resumable: false,
      reason:    `Session status "${session.status}" is terminal — cannot be resumed`,
      session,
    };
  }

  return { resumable: true, reason: null, session };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generateResumeToken,
  parseResumeToken,
  checkResumable,
  RESUMABLE_STATUSES,
};
