#!/usr/bin/env node
'use strict';

/**
 * localHarness.js — Local Runtime Harness entrypoint
 *
 * Deterministic end-to-end simulation of the SAS conversation lifecycle.
 * Supports two operating modes:
 *
 *   Interactive mode  (default):
 *     Prompts the operator for each question in turn via stdin/stdout.
 *     Accepts !review / !cancel / !export / !skip / !status / !help commands.
 *
 *     Usage:
 *       node src/runtime/localHarness.js \
 *         --mode interactive \
 *         --input fixtures/sas-session-inputs/summer-sas-2026.json
 *
 *   Scripted replay mode:
 *     Loads a predefined answer fixture and runs the full lifecycle headlessly.
 *     Exits 0 on success, 1 on any failure.
 *
 *     Usage:
 *       node src/runtime/localHarness.js \
 *         --mode scripted \
 *         --replay fixtures/sas-conversation-replays/full-summer-sas.json \
 *         [--stop-on-error]
 *
 * Flags:
 *   --mode interactive|scripted     Operating mode (default: interactive)
 *   --input  <path>                 Session input JSON (interactive mode)
 *   --replay <path>                 Replay fixture JSON (scripted mode)
 *   --session-id <id>               Override the generated session ID
 *   --stop-on-error                 Abort scripted replay on first validation error
 *   --silent                        Suppress NDJSON log file writes
 *   --help                          Print usage and exit
 *
 * Guarantees:
 *   - No AI inference, no external API calls
 *   - No mutation of blueprint XML or fixture files
 *   - Deterministic: same inputs → same output
 *   - Logs written to logs/runtime/<sessionId>.ndjson
 *
 * @module localHarness
 */

const path = require('path');
const fs   = require('fs');

const { runInteractiveSession } = require('./interactiveSession');
const { runScriptedReplay }     = require('./scriptedReplay');
const display                   = require('./harnessDisplay');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ─── CLI parsing ──────────────────────────────────────────────────────────────

/**
 * Parse process.argv into a plain options object.
 * No external dependencies — uses only string manipulation.
 *
 * @param {string[]} argv — process.argv.slice(2)
 * @returns {object}
 */
function parseArgs(argv) {
  const opts = {
    mode:        'interactive',
    input:       null,
    replay:      null,
    sessionId:   null,
    stopOnError: false,
    silent:      false,
    help:        false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--mode':        opts.mode        = argv[++i]; break;
      case '--input':       opts.input       = argv[++i]; break;
      case '--replay':      opts.replay      = argv[++i]; break;
      case '--session-id':  opts.sessionId   = argv[++i]; break;
      case '--stop-on-error': opts.stopOnError = true;    break;
      case '--silent':      opts.silent      = true;      break;
      case '--help':
      case '-h':            opts.help        = true;      break;
      default:
        // Unknown flag — ignore silently
    }
  }

  return opts;
}

/**
 * Print usage and exit.
 */
function printUsage() {
  const lines = [
    '',
    'SFCC SAS Local Runtime Harness',
    '',
    'Usage:',
    '  node src/runtime/localHarness.js [flags]',
    '',
    'Modes:',
    '  --mode interactive   Prompt for answers via stdin (default)',
    '  --mode scripted      Run headlessly from a replay fixture',
    '',
    'Flags:',
    '  --input  <path>      Session input JSON  (interactive mode, required)',
    '  --replay <path>      Replay fixture JSON (scripted mode, required)',
    '  --session-id <id>    Override the generated session ID',
    '  --stop-on-error      Abort scripted replay on first validation error',
    '  --silent             Suppress NDJSON log file writes',
    '  --help               Print this message and exit',
    '',
    'Examples:',
    '  Interactive:',
    '    node src/runtime/localHarness.js \\',
    '      --mode interactive \\',
    '      --input fixtures/sas-session-inputs/summer-sas-2026.json',
    '',
    '  Scripted:',
    '    node src/runtime/localHarness.js \\',
    '      --mode scripted \\',
    '      --replay fixtures/sas-conversation-replays/full-summer-sas.json',
    '',
  ];
  lines.forEach(l => process.stdout.write(l + '\n'));
}

// ─── Mode runners ─────────────────────────────────────────────────────────────

/**
 * Interactive mode — validate input fixture and delegate to interactiveSession.
 *
 * @param {object} opts — parsed CLI options
 */
async function runInteractiveMode(opts) {
  if (!opts.input) {
    display.displayError('--input is required for interactive mode');
    process.exit(1);
  }

  const inputPath = path.isAbsolute(opts.input)
    ? opts.input
    : path.resolve(PROJECT_ROOT, opts.input);

  if (!fs.existsSync(inputPath)) {
    display.displayError(`Session input file not found: ${inputPath}`);
    process.exit(1);
  }

  let sessionInput;
  try {
    sessionInput = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (err) {
    display.displayError(`Cannot parse session input: ${err.message}`);
    process.exit(1);
  }

  const { blueprintXmlPath, blueprintId } = sessionInput;

  if (!blueprintXmlPath || !blueprintId) {
    display.displayError('Session input must contain blueprintXmlPath and blueprintId');
    process.exit(1);
  }

  const result = await runInteractiveSession(blueprintXmlPath, blueprintId, {
    sessionId: opts.sessionId,
    silent:    opts.silent,
  });

  if (!result.success) {
    display.displayLine(`  Exiting: ${result.error || 'session not completed'}`);
    process.exit(result.error === 'Session cancelled by operator.' ? 0 : 1);
  }

  process.exit(0);
}

/**
 * Scripted mode — validate replay fixture and delegate to scriptedReplay.
 *
 * @param {object} opts — parsed CLI options
 */
async function runScriptedMode(opts) {
  if (!opts.replay) {
    display.displayError('--replay is required for scripted mode');
    process.exit(1);
  }

  const replayPath = path.isAbsolute(opts.replay)
    ? opts.replay
    : path.resolve(PROJECT_ROOT, opts.replay);

  if (!fs.existsSync(replayPath)) {
    display.displayError(`Replay fixture not found: ${replayPath}`);
    process.exit(1);
  }

  display.displayLine('');
  display.displayLine('  SFCC SAS Local Runtime Harness — Scripted Replay Mode');
  display.displayLine(`  Fixture: ${opts.replay}`);
  display.displayLine('');

  const result = runScriptedReplay(replayPath, {
    sessionId:   opts.sessionId,
    silent:      opts.silent,
    stopOnError: opts.stopOnError,
  });

  // ── Print result summary ──────────────────────────────────────────────────
  display.displayLine(`  Status          : ${result.success ? 'SUCCESS' : 'FAILED'}`);
  display.displayLine(`  Session ID      : ${result.sessionId}`);
  display.displayLine(`  Answers accepted: ${result.answersSubmitted}`);
  display.displayLine(`  Timing          : ${result.timingMs}ms`);

  if (result.validationErrors.length > 0) {
    display.displayLine('');
    display.displayLine(`  Validation errors (${result.validationErrors.length}):`);
    result.validationErrors.forEach(e => {
      display.displayLine(`    ${e.key}: ${e.errors.join('; ')}`);
    });
  }

  if (result.error) {
    display.displayLine('');
    display.displayLine(`  Error: ${result.error}`);
  }

  if (result.artifact) {
    const diffs = (result.xmlResult && result.xmlResult.structuralDifferences) || [];
    display.displayArtifact(result.artifact, result.xmlResult && result.xmlResult.replaySuccessful, diffs);
  }

  process.exit(result.success ? 0 : 1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Main entrypoint — parses args, dispatches to mode runner.
 * Only runs when invoked directly (not when require()'d in tests).
 */
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  if (opts.mode === 'scripted') {
    await runScriptedMode(opts);
  } else if (opts.mode === 'interactive') {
    await runInteractiveMode(opts);
  } else {
    display.displayError(`Unknown mode: "${opts.mode}". Use --mode interactive or --mode scripted.`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    display.displayError(`Fatal harness error: ${err.message}`);
    process.exit(1);
  });
}

// ─── Exports (for testing) ────────────────────────────────────────────────────

module.exports = {
  parseArgs,
  // Mode runners are not exported — tests drive them via runScriptedReplay directly
};
