'use strict';

/**
 * interactiveSession.js
 *
 * Readline-based interactive mode for the local runtime harness.
 *
 * Drives the SAS conversation lifecycle interactively:
 *   - Presents each question in turn via displayQuestion()
 *   - Accepts free-text input from stdin
 *   - Validates the answer through the existing collectAnswer() pipeline
 *   - Shows inline validation errors and re-prompts on failure
 *   - Supports special commands:
 *       !review  — jump to review summary at any time
 *       !cancel  — cancel the session immediately
 *       !export  — export current session state to logs/runtime/ as JSON
 *       !skip    — skip the current optional field (leaves it unanswered)
 *       !status  — print current progress without advancing
 *       !help    — print command list
 *
 * Guarantees:
 *   - No AI inference; all validation is deterministic (delegated to
 *     collectAnswer / validateSessionAnswer)
 *   - No mutation of the original blueprint
 *   - Ctrl-C triggers a clean !cancel
 *
 * @module interactiveSession
 */

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const { extractSASBlueprint }    = require('../blueprints/extractors/extractSASBlueprint');
const { createBlueprintSession } = require('../blueprints/session/createBlueprintSession');
const { collectAnswer,
        confirmReview,
        cancelSession }          = require('../blueprints/session/collectAnswer');
const { getNextQuestion }        = require('../blueprints/session/getNextQuestion');
const { buildReviewSummary }     = require('../blueprints/session/buildReviewSummary');
const { generateReplaySafeXML }  = require('../teams/runtime/generateReplaySafeXML');
const { buildXMLArtifact }       = require('../teams/runtime/buildXMLArtifact');
const { createLogger, EVENTS }   = require('./harnessLogger');
const display                    = require('./harnessDisplay');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const COMMANDS     = ['!review', '!cancel', '!export', '!skip', '!status', '!help'];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Attempt to coerce a raw string input into the expected type for the field.
 * Returns the (possibly unchanged) raw value, or a typed conversion when safe.
 *
 * @param {string} raw        — raw stdin line
 * @param {object} question   — queue item
 * @returns {*}
 */
function _coerce(raw, question) {
  const v = question.validation || {};

  // Numeric fields
  if (v.type === 'number') {
    const n = parseFloat(raw);
    return isNaN(n) ? raw : n;
  }

  // Array fields — expect comma-separated values for simple arrays
  if (v.type === 'array') {
    // If input looks like a JSON array, parse it
    if (raw.trim().startsWith('[')) {
      try { return JSON.parse(raw); } catch (_) { /* fall through */ }
    }
    // Otherwise split on comma
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  return raw;
}

/**
 * Print the command help list.
 */
function _printHelp() {
  display.displayLine('');
  display.displayLine('  Available commands:');
  display.displayLine('    !review  — show review summary and confirm or cancel');
  display.displayLine('    !cancel  — cancel this session');
  display.displayLine('    !export  — export session state to logs/runtime/<sessionId>.json');
  display.displayLine('    !skip    — skip this optional field (leaves it unanswered)');
  display.displayLine('    !status  — show current progress');
  display.displayLine('    !help    — show this message');
  display.displayLine('');
}

/**
 * Write current session state to logs/runtime/<sessionId>.json (for debugging).
 *
 * @param {object} session
 */
function _exportSession(session) {
  try {
    const dir  = path.resolve(PROJECT_ROOT, 'logs/runtime');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${session.sessionId}.json`);
    fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf8');
    display.displayLine(`  Session exported to: ${file}`);
  } catch (err) {
    display.displayError(`Export failed: ${err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the interactive harness session.
 *
 * This function returns a Promise that resolves when the session ends
 * (via confirmation, cancellation, or fatal error).
 *
 * @param {string} blueprintXmlPath — absolute or project-relative path to the XML
 * @param {string} blueprintId
 * @param {object} [opts]
 * @param {string}  [opts.sessionId]
 * @param {boolean} [opts.silent=false]
 * @returns {Promise<{
 *   success:   boolean,
 *   sessionId: string,
 *   artifact:  object|null,
 *   error:     string|null,
 * }>}
 */
async function runInteractiveSession(blueprintXmlPath, blueprintId, opts = {}) {
  const sessionId = opts.sessionId || `interactive-${Date.now()}`;
  const silent    = opts.silent === true;
  const logger    = createLogger(sessionId, { silent });
  const { log }   = logger;

  // ── Load blueprint ───────────────────────────────────────────────────────
  let blueprintXml;
  try {
    const abs = path.isAbsolute(blueprintXmlPath)
      ? blueprintXmlPath
      : path.resolve(PROJECT_ROOT, blueprintXmlPath);
    blueprintXml = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    return { success: false, sessionId, artifact: null, error: `Cannot read blueprint: ${err.message}` };
  }

  let blueprint, session;
  try {
    blueprint = extractSASBlueprint(blueprintXml, {
      blueprintId,
      extractedAt: new Date().toISOString(),
    });
    session = createBlueprintSession(blueprint, {
      sessionId,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    return { success: false, sessionId, artifact: null, error: `Blueprint init failed: ${err.message}` };
  }

  log(EVENTS.SESSION_START, {
    blueprintId:    blueprint.blueprintId,
    totalQuestions: session.questionQueue.length,
  });

  display.displayBanner(blueprintId, sessionId, session.questionQueue.length);

  // ── Set up readline ───────────────────────────────────────────────────────
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  // Handle Ctrl-C cleanly
  rl.on('SIGINT', () => {
    display.displayLine('\n  Interrupted — cancelling session.');
    session = cancelSession(session);
    log(EVENTS.SESSION_CANCELLED, { sessionId });
    rl.close();
  });

  // ── Question/answer loop (promise-based) ─────────────────────────────────
  return new Promise((resolve) => {

    function advance() {
      // Find the next unanswered/invalid question
      const question = getNextQuestion(session);

      if (!question) {
        // All questions answered — move to review/complete
        return enterReview();
      }

      const answered = Object.keys(session.answers || {}).length;
      const total    = session.questionQueue.length;

      log(EVENTS.QUESTION_PRESENTED, { key: question.key });
      display.displayQuestion(question, answered, total);

      rl.once('line', (raw) => {
        const input = (raw || '').trim();

        // ── Special commands ─────────────────────────────────────────────
        if (input === '!help')   { _printHelp();                        return advance(); }
        if (input === '!status') { displayCurrentStatus();              return advance(); }
        if (input === '!export') { _exportSession(session);             return advance(); }
        if (input === '!cancel') { return doCancel(); }
        if (input === '!review') { return enterReview(); }

        if (input === '!skip') {
          if (question.required) {
            display.displayError('This field is required and cannot be skipped.');
          } else {
            display.displayLine('  Skipped.');
          }
          return advance();
        }

        // ── Submit answer ────────────────────────────────────────────────
        const coerced = _coerce(input, question);
        let result;
        try {
          result = collectAnswer(session, question.key, coerced, {
            answeredAt: new Date().toISOString(),
          });
        } catch (err) {
          display.displayError(`Unexpected error: ${err.message}`);
          log(EVENTS.HARNESS_ERROR, { key: question.key, message: err.message });
          return advance();
        }

        session = result.session;

        if (result.validationResult && !result.validationResult.valid) {
          const errors = result.validationResult.errors || ['Validation failed'];
          display.displayValidationErrors(errors);
          log(EVENTS.ANSWER_REJECTED, { key: question.key, errors });
        } else {
          log(EVENTS.ANSWER_ACCEPTED, { key: question.key });
        }

        return advance();
      });
    }

    function displayCurrentStatus() {
      const answered = Object.keys(session.answers || {}).length;
      const total    = session.questionQueue.length;
      display.displayProgress(answered, total, session.status);
    }

    function doCancel() {
      session = cancelSession(session, { cancelledAt: new Date().toISOString() });
      log(EVENTS.SESSION_CANCELLED, { sessionId });
      display.displayCancelled(sessionId);
      rl.close();
      resolve({ success: false, sessionId, artifact: null, error: 'Session cancelled by operator.' });
    }

    function enterReview() {
      rl.removeAllListeners('line');

      let reviewSummary;
      try {
        reviewSummary = buildReviewSummary(session);
      } catch (err) {
        display.displayError(`buildReviewSummary failed: ${err.message}`);
        reviewSummary = null;
      }

      display.displayReview(reviewSummary);

      rl.once('line', (raw) => {
        const input = (raw || '').trim().toLowerCase();

        if (input === '!cancel') {
          return doCancel();
        }

        if (input === '!export') {
          _exportSession(session);
          return enterReview(); // re-display review
        }

        // Anything else (including empty) → confirm
        if (session.status === 'REVIEW_PENDING') {
          try {
            session = confirmReview(session, { confirmedAt: new Date().toISOString() });
            log(EVENTS.STATUS_TRANSITION, { to: session.status });
          } catch (err) {
            display.displayError(`Cannot confirm: ${err.message}`);
            return enterReview();
          }
        } else if (session.status !== 'COMPLETE') {
          display.displayError(`Session status is "${session.status}" — cannot generate XML. Please answer all required fields.`);
          return advance(); // go back to answering
        }

        // ── Generate XML ───────────────────────────────────────────────
        display.displayLine('  Generating XML…');
        const xmlStart = Date.now();
        let xmlResult;
        try {
          xmlResult = generateReplaySafeXML(session, blueprint);
        } catch (err) {
          display.displayError(`XML generation threw: ${err.message}`);
          log(EVENTS.HARNESS_ERROR, { phase: 'generateReplaySafeXML', message: err.message });
          rl.close();
          return resolve({ success: false, sessionId, artifact: null, error: err.message });
        }

        log(EVENTS.XML_GENERATED, {
          success:          xmlResult.success,
          replaySuccessful: xmlResult.replaySuccessful,
          timingMs:         Date.now() - xmlStart,
          error:            xmlResult.error || null,
        });

        if (!xmlResult.success) {
          display.displayError(`XML generation failed: ${xmlResult.error}`);
          rl.close();
          return resolve({ success: false, sessionId, artifact: null, error: xmlResult.error });
        }

        // ── Build artifact ─────────────────────────────────────────────
        let artifact;
        try {
          artifact = buildXMLArtifact({
            xmlContent:  xmlResult.xmlContent,
            campaignId:  xmlResult.campaignId,
            sessionId,
            blueprintId: blueprint.blueprintId || blueprintId,
            generatedAt: new Date().toISOString(),
          });
          log(EVENTS.ARTIFACT_READY, {
            filename:  artifact.filename,
            byteSize:  artifact.byteSize,
            sessionId: artifact.sessionId,
          });
        } catch (err) {
          display.displayError(`Artifact build failed: ${err.message}`);
          rl.close();
          return resolve({ success: false, sessionId, artifact: null, error: err.message });
        }

        const diffs = xmlResult.structuralDifferences || [];
        display.displayArtifact(artifact, xmlResult.replaySuccessful, diffs);
        rl.close();
        resolve({ success: true, sessionId, artifact, error: null });
      });
    }

    // Start the loop
    advance();
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { runInteractiveSession };
