'use strict';

// ─── In-Memory Blueprint Store ─────────────────────────────────────────────────
//
// Persists extracted blueprint objects, keyed by sessionId.
//
// Why separate from sessionStore?
//   Blueprints are large (35+ field definitions, schema trees) and only needed
//   when an HTTP request must inject a blueprint back into the Teams action
//   pipeline (SUBMIT_ANSWER, CONFIRM_GENERATION, CANCEL_SESSION). Keeping them
//   in a dedicated store avoids polluting session snapshots with multi-KB schema
//   objects and makes the boundary explicit.
//
// Guarantees:
//   - Deep-copy on save and get — no external mutation reaches stored state
//   - Returns null (not throws) when a sessionId is not found
//   - _reset() exported for test isolation only
//
// ──────────────────────────────────────────────────────────────────────────────

const _store = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Persist a blueprint under the given session ID.
 *
 * @param {string} sessionId
 * @param {object} blueprint - Extracted SAS blueprint (JSON-serializable)
 * @returns {void}
 */
function saveBlueprint(sessionId, blueprint) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }
  _store.set(sessionId, deepCopy(blueprint));
}

/**
 * Retrieve a blueprint by session ID.
 * Returns null when the session ID has no stored blueprint.
 *
 * @param {string} sessionId
 * @returns {object|null}
 */
function getBlueprint(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  const stored = _store.get(sessionId);
  return stored ? deepCopy(stored) : null;
}

/**
 * Remove a blueprint from the store.
 * No-op when the session ID is not found.
 *
 * @param {string} sessionId
 * @returns {boolean} true if the entry was found and removed
 */
function deleteBlueprint(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  return _store.delete(sessionId);
}

/**
 * Reset store to empty.
 * FOR TESTING ONLY — must not be called in production paths.
 *
 * @returns {void}
 */
function _reset() {
  _store.clear();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { saveBlueprint, getBlueprint, deleteBlueprint, _reset };
