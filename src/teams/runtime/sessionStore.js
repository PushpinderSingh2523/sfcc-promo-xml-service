'use strict';

// ─── In-Memory Session Store ───────────────────────────────────────────────────
//
// Deterministic, in-memory session persistence for the Teams runtime prototype.
//
// Guarantees:
//   - Sessions are deep-copied on save and get (no external mutation)
//   - Deterministic serialization via JSON round-trip
//   - No hidden mutations — the store is a pure Map keyed by sessionId
//   - listSessions() returns snapshots in insertion order
//
// Prototype constraints:
//   - In-memory only — no database, no Redis, no external storage
//   - Process restart clears all sessions
//   - _reset() is exported for test isolation only
//
// ──────────────────────────────────────────────────────────────────────────────

const _store = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deep-copy an object via JSON round-trip.
 * Sufficient for session objects (plain JSON-serializable structures).
 *
 * @param {object} obj
 * @returns {object}
 */
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Persist a session.
 *
 * Stores a deep copy so subsequent mutations to the passed session object
 * do not affect the stored copy.
 *
 * @param {object} session - Session object (must have a non-empty sessionId)
 * @returns {void}
 */
function saveSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }
  if (!session.sessionId || typeof session.sessionId !== 'string') {
    throw new Error('session.sessionId must be a non-empty string');
  }
  _store.set(session.sessionId, deepCopy(session));
}

/**
 * Retrieve a session by its sessionId.
 *
 * Returns a deep copy so the caller cannot mutate the stored state.
 * Returns null when the sessionId is not found.
 *
 * @param {string} sessionId
 * @returns {object|null}
 */
function getSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  const stored = _store.get(sessionId);
  return stored ? deepCopy(stored) : null;
}

/**
 * Delete a session from the store.
 *
 * No-op if the sessionId does not exist.
 *
 * @param {string} sessionId
 * @returns {boolean} true if the session was found and deleted
 */
function deleteSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  return _store.delete(sessionId);
}

/**
 * List all stored sessions.
 *
 * Returns deep copies in insertion order (Map iteration order).
 * An empty array is returned when the store is empty.
 *
 * @returns {object[]}
 */
function listSessions() {
  return Array.from(_store.values()).map(deepCopy);
}

/**
 * Reset the store to empty.
 *
 * FOR TESTING ONLY. Must not be called in production code paths.
 *
 * @returns {void}
 */
function _reset() {
  _store.clear();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { saveSession, getSession, deleteSession, listSessions, _reset };
