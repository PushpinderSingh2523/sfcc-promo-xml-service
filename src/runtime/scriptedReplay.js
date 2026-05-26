'use strict';

/**
 * scriptedReplay.js
 *
 * Scripted (non-interactive) mode for the local runtime harness.
 *
 * Loads a JSON fixture from fixtures/sas-conversation-replays/ and drives
 * the full conversation lifecycle in-process:
 *
 *   1. Load blueprint XML (from session input fixture)
 *   2. Extract SAS blueprint
 *   3. Create session
 *   4. Submit all answers from the replay fixture
 *   5. Confirm review → COMPLETE
 *   6. Generate replay-safe XML
 *   7. Build artifact
 *   8. Return result
 *
 * Guarantees:
 *   - No AI inference, no fuzzy matching
 *   - No mutation of blueprint or fixture files
 *   - Deterministic: same fixture → same result (given same blueprint XML)
 *   - Validation errors are collected, not swallowed — caller can inspect them
 *
 * @module scriptedReplay
 */

const fs   = require('fs');
const path = require('path');

const { extractSASBlueprint }    = require('../blueprints/extractors/extractSASBlueprint');
const { createBlueprintSession } = require('../blueprints/session/createBlueprintSession');
const { collectAnswer }          = require('../blueprints/session/collectAnswer');
const { confirmReview }          = require('../blueprints/session/collectAnswer');
const { buildReviewSummary }     = require('../blueprints/session/buildReviewSummary');
const { generateReplaySafeXML }  = require('../teams/runtime/generateReplaySafeXML');
const { buildXMLArtifact }       = require('../teams/runtime/buildXMLArtifact');
const { createLogger, EVENTS }   = require('./harnessLogger');
const metrics                    = require('./runtimeMetrics');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Resolve and read a JSON file relative to the project root.
 *
 * @param {string} relPath
 * @returns {object}
 */
function _readJson(relPath) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Fixture not found: ${abs}`);
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

/**
 * Resolve and read an XML file relative to the project root.
 *
 * @param {string} relPath
 * @returns {string}
 */
function _readXml(relPath) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Blueprint XML not found: ${abs}`);
  }
  return fs.readFileSync(abs, 'utf8');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a full scripted replay from a fixture file.
 *
 * @param {string} replayFixturePath — path relative to project root, or absolute
 * @param {object} [opts]
 * @param {string} [opts.sessionId]      — override generated sessionId
 * @param {boolean} [opts.silent=false]  — suppress logger file writes
 * @param {boolean} [opts.stopOnError=false] — abort on first validation error
 * @returns {{
 *   success:              boolean,
 *   sessionId:            string,
 *   answersSubmitted:     number,
 *   validationErrors:     Array<{ key: string, errors: string[] }>,
 *   reviewSummary:        object|null,
 *   xmlResult:            object|null,
 *   artifact:             object|null,
 *   error:                string|null,
 *   timingMs:             number,
 * }}
 */
function runScriptedReplay(replayFixturePath, opts = {}) {
  const startedAt   = Date.now();
  const sessionId   = opts.sessionId || `scripted-${Date.now()}`;
  const silent      = opts.silent === true;
  const stopOnError = opts.stopOnError === true;

  const logger = createLogger(sessionId, { silent });
  const { log } = logger;

  // ── Step 1: Load replay fixture ────────────────────────────────────────────
  let replayFixture;
  try {
    const absPath = path.isAbsolute(replayFixturePath)
      ? replayFixturePath
      : path.resolve(PROJECT_ROOT, replayFixturePath);
    replayFixture = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    return {
      success: false, sessionId, answersSubmitted: 0,
      validationErrors: [], reviewSummary: null, xmlResult: null, artifact: null,
      error: `Failed to load replay fixture: ${err.message}`,
      timingMs: Date.now() - startedAt,
    };
  }

  // ── Step 2: Load session input fixture ────────────────────────────────────
  let sessionInput;
  try {
    const sessionInputPath = replayFixture.sessionInput
      ? path.resolve(PROJECT_ROOT, replayFixture.sessionInput)
      : null;
    if (!sessionInputPath) {
      throw new Error('replayFixture.sessionInput is required');
    }
    sessionInput = JSON.parse(fs.readFileSync(sessionInputPath, 'utf8'));
  } catch (err) {
    return {
      success: false, sessionId, answersSubmitted: 0,
      validationErrors: [], reviewSummary: null, xmlResult: null, artifact: null,
      error: `Failed to load session input: ${err.message}`,
      timingMs: Date.now() - startedAt,
    };
  }

  // ── Step 3: Load blueprint XML ────────────────────────────────────────────
  let blueprintXml;
  try {
    blueprintXml = _readXml(sessionInput.blueprintXmlPath);
  } catch (err) {
    return {
      success: false, sessionId, answersSubmitted: 0,
      validationErrors: [], reviewSummary: null, xmlResult: null, artifact: null,
      error: `Failed to load blueprint XML: ${err.message}`,
      timingMs: Date.now() - startedAt,
    };
  }

  // ── Step 4: Extract blueprint & create session ────────────────────────────
  let blueprint, session;
  try {
    blueprint = extractSASBlueprint(blueprintXml, {
      blueprintId: sessionInput.blueprintId || 'unknown',
      extractedAt: new Date().toISOString(),
    });
    session = createBlueprintSession(blueprint, {
      sessionId,
      createdAt: new Date().toISOString(),
    });
    log(EVENTS.SESSION_START, {
      blueprintId:    blueprint.blueprintId,
      totalQuestions: session.questionQueue.length,
    });
    metrics.recordSessionStart(session.questionQueue.length);
  } catch (err) {
    return {
      success: false, sessionId, answersSubmitted: 0,
      validationErrors: [], reviewSummary: null, xmlResult: null, artifact: null,
      error: `Blueprint/session init failed: ${err.message}`,
      timingMs: Date.now() - startedAt,
    };
  }

  // ── Step 5: Submit all answers ────────────────────────────────────────────
  const answers = Array.isArray(replayFixture.answers) ? replayFixture.answers : [];
  const validationErrors = [];
  let answersSubmitted = 0;

  for (const entry of answers) {
    const { key, value } = entry;

    log(EVENTS.QUESTION_PRESENTED, { key });

    let result;
    try {
      result = collectAnswer(session, key, value, {
        answeredAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = `collectAnswer threw for key "${key}": ${err.message}`;
      log(EVENTS.HARNESS_ERROR, { key, message: msg });
      if (stopOnError) {
        return {
          success: false, sessionId, answersSubmitted,
          validationErrors, reviewSummary: null, xmlResult: null, artifact: null,
          error: msg,
          timingMs: Date.now() - startedAt,
        };
      }
      validationErrors.push({ key, errors: [msg] });
      continue;
    }

    session = result.session;

    if (result.validationResult && !result.validationResult.valid) {
      const errors = result.validationResult.errors || ['Validation failed'];
      log(EVENTS.ANSWER_REJECTED, { key, errors });
      validationErrors.push({ key, errors });
      if (stopOnError) {
        return {
          success: false, sessionId, answersSubmitted,
          validationErrors, reviewSummary: null, xmlResult: null, artifact: null,
          error: `Validation failed for key "${key}": ${errors.join('; ')}`,
          timingMs: Date.now() - startedAt,
        };
      }
    } else {
      log(EVENTS.ANSWER_ACCEPTED, { key });
      answersSubmitted++;
    }

    if (result.validationResult && !result.validationResult.valid) {
      metrics.recordValidationFailure();
    }
  }

  // ── Step 6: Log status transition ─────────────────────────────────────────
  log(EVENTS.STATUS_TRANSITION, { to: session.status });

  // ── Step 7: Build review summary ──────────────────────────────────────────
  let reviewSummary = null;
  try {
    reviewSummary = buildReviewSummary(session);
  } catch (err) {
    log(EVENTS.HARNESS_ERROR, { phase: 'buildReviewSummary', message: err.message });
    // non-fatal — continue to XML generation
  }

  // ── Step 8: Confirm review → COMPLETE (only if REVIEW_PENDING) ──────────
  // If all required fields were answered and there are no replay-safety
  // warnings, the session transitions directly to COMPLETE and no
  // confirmReview call is needed.
  if (session.status === 'REVIEW_PENDING') {
    try {
      session = confirmReview(session, { confirmedAt: new Date().toISOString() });
      log(EVENTS.STATUS_TRANSITION, { to: session.status });
    } catch (err) {
      return {
        success: false, sessionId, answersSubmitted,
        validationErrors, reviewSummary, xmlResult: null, artifact: null,
        error: `confirmReview failed: ${err.message}`,
        timingMs: Date.now() - startedAt,
      };
    }
  }

  // ── Step 9: Generate replay-safe XML ──────────────────────────────────────
  const xmlStart = Date.now();
  let xmlResult;
  try {
    xmlResult = generateReplaySafeXML(session, blueprint);
  } catch (err) {
    return {
      success: false, sessionId, answersSubmitted,
      validationErrors, reviewSummary, xmlResult: null, artifact: null,
      error: `generateReplaySafeXML threw: ${err.message}`,
      timingMs: Date.now() - startedAt,
    };
  }
  const xmlMs = Date.now() - xmlStart;

  log(EVENTS.XML_GENERATED, {
    success:         xmlResult.success,
    replaySuccessful: xmlResult.replaySuccessful,
    timingMs:        xmlMs,
    error:           xmlResult.error || null,
  });

  if (xmlResult.replaySuccessful && xmlResult.replaySuccessful !== false) {
    const diffs = xmlResult.structuralDifferences || [];
    if (diffs.length > 0) {
      diffs.forEach(d => log(EVENTS.REPLAY_WARNING, { difference: d }));
    }
  }

  if (!xmlResult.success) {
    if (!xmlResult.replaySuccessful) metrics.recordReplayFailure();
    return {
      success: false, sessionId, answersSubmitted,
      validationErrors, reviewSummary,
      xmlResult, artifact: null,
      error: xmlResult.error || 'XML generation failed',
      timingMs: Date.now() - startedAt,
    };
  }

  // ── Step 10: Build artifact ────────────────────────────────────────────────
  let artifact;
  try {
    artifact = buildXMLArtifact({
      xmlContent:  xmlResult.xmlContent,
      campaignId:  xmlResult.campaignId,
      sessionId,
      blueprintId: blueprint.blueprintId || sessionInput.blueprintId,
      generatedAt: new Date().toISOString(),
    });
    log(EVENTS.ARTIFACT_READY, {
      filename:  artifact.filename,
      byteSize:  artifact.byteSize,
      sessionId: artifact.sessionId,
    });
  } catch (err) {
    return {
      success: false, sessionId, answersSubmitted,
      validationErrors, reviewSummary, xmlResult, artifact: null,
      error: `buildXMLArtifact failed: ${err.message}`,
      timingMs: Date.now() - startedAt,
    };
  }

  metrics.recordSessionCompleted();

  return {
    success:          true,
    sessionId,
    answersSubmitted,
    validationErrors,
    reviewSummary,
    xmlResult,
    artifact,
    error:            null,
    timingMs:         Date.now() - startedAt,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { runScriptedReplay };
