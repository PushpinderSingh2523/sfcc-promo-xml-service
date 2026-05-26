'use strict';

/**
 * faultIsolation.js
 *
 * Lightweight fault-isolation wrappers for the local runtime harness.
 *
 * Guarantees:
 *   - A failure inside a wrapped call NEVER propagates to the calling session
 *   - Every failure is returned as a structured { error } object — never thrown
 *   - Session state is never mutated by a failed isolated call
 *   - Isolation is synchronous — no async/Promise wrappers
 *
 * Functions:
 *   safeCall(fn, ...args)        — run any function; catch all errors
 *   safeArtifactWrite(artifact, outputDir) — write XML to disk; structured failure
 *   isolateFixtureLoad(loadFn)   — load a fixture; structured failure on malformed JSON
 *
 * @module faultIsolation
 */

const fs   = require('fs');
const path = require('path');

// ─── safeCall ─────────────────────────────────────────────────────────────────

/**
 * Call any synchronous function and catch all errors.
 *
 * @param {Function} fn
 * @param {...*}     args
 * @returns {{ result: *, error: Error|null }}
 */
function safeCall(fn, ...args) {
  try {
    const result = fn(...args);
    return { result, error: null };
  } catch (err) {
    return { result: undefined, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ─── safeArtifactWrite ────────────────────────────────────────────────────────

/**
 * Write an XML artifact to disk without throwing on filesystem errors.
 *
 * Writes `<outputDir>/<artifact.filename>`.
 * If the file already exists it is NOT overwritten — this is the collision
 * prevention gate: callers should use collision-resistant filenames
 * (see buildXMLArtifact for the sessionId-bearing filename strategy).
 *
 * @param {object} artifact   — artifact descriptor from buildXMLArtifact()
 * @param {string} outputDir  — absolute path to the output directory
 * @returns {{
 *   written:   boolean,
 *   filePath:  string|null,
 *   error:     string|null,
 *   collision: boolean,       — true when file already exists
 * }}
 */
function safeArtifactWrite(artifact, outputDir) {
  if (!artifact || !artifact.filename || !artifact.xmlContent) {
    return {
      written:   false,
      filePath:  null,
      error:     'Invalid artifact: filename and xmlContent are required',
      collision: false,
    };
  }

  if (!outputDir || typeof outputDir !== 'string') {
    return {
      written:   false,
      filePath:  null,
      error:     'outputDir must be a non-empty string',
      collision: false,
    };
  }

  const filePath = path.join(outputDir, artifact.filename);

  // ── Collision check ───────────────────────────────────────────────────────
  if (fs.existsSync(filePath)) {
    return {
      written:   false,
      filePath,
      error:     `Artifact already exists at ${filePath} — write skipped to prevent overwrite`,
      collision: true,
    };
  }

  // ── Directory creation ────────────────────────────────────────────────────
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  } catch (err) {
    return {
      written:   false,
      filePath,
      error:     `Failed to create output directory: ${err.message}`,
      collision: false,
    };
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  try {
    // wx flag = fail if file exists (atomic collision guard)
    fs.writeFileSync(filePath, artifact.xmlContent, { encoding: 'utf8', flag: 'wx' });
    return { written: true, filePath, error: null, collision: false };
  } catch (err) {
    if (err.code === 'EEXIST') {
      return {
        written:   false,
        filePath,
        error:     `Collision detected: file was created between existence check and write: ${filePath}`,
        collision: true,
      };
    }
    return {
      written:   false,
      filePath,
      error:     `Write failed: ${err.message}`,
      collision: false,
    };
  }
}

// ─── isolateFixtureLoad ───────────────────────────────────────────────────────

/**
 * Load and parse a JSON fixture file without throwing on malformed content.
 *
 * @param {string}   filePath  — absolute path to the JSON fixture
 * @returns {{
 *   data:  object|null,
 *   error: string|null,
 * }}
 */
function isolateFixtureLoad(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { data: null, error: 'filePath must be a non-empty string' };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { data: null, error: `Cannot read fixture file: ${err.message}` };
  }

  try {
    return { data: JSON.parse(raw), error: null };
  } catch (err) {
    return {
      data:  null,
      error: `Fixture JSON is malformed at ${filePath}: ${err.message}`,
    };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  safeCall,
  safeArtifactWrite,
  isolateFixtureLoad,
};
