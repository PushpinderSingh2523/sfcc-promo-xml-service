'use strict';

/**
 * harnessDisplay.js
 *
 * Terminal rendering for the local runtime harness.
 *
 * Uses only Node built-ins (process.stdout.write, readline).
 * No third-party dependencies, no colour codes that break CI pipes.
 *
 * Exported functions:
 *   displayBanner(blueprintId, sessionId, totalQuestions)
 *   displayQuestion(question, answered, total)
 *   displayValidationErrors(errors)
 *   displayProgress(answered, total, status)
 *   displayReview(reviewSummary)
 *   displayArtifact(artifact)
 *   displayCancelled(sessionId)
 *   displayError(message)
 *   displayLine(text)  — utility
 *
 * All functions write to process.stdout synchronously.
 * None throw — unexpected inputs produce a safe fallback rendering.
 */

// ─── Internal ─────────────────────────────────────────────────────────────────

const W = 72; // terminal column width

function _line(char = '─') {
  process.stdout.write(char.repeat(W) + '\n');
}

function _write(text) {
  process.stdout.write(text + '\n');
}

function _truncate(str, max) {
  if (!str || typeof str !== 'string') return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

function _pct(a, b) {
  if (!b) return '0%';
  return Math.round((a / b) * 100) + '%';
}

function _progressBar(answered, total) {
  const filled = total > 0 ? Math.round((answered / total) * 20) : 0;
  const empty  = 20 - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Display the harness startup banner.
 */
function displayBanner(blueprintId, sessionId, totalQuestions) {
  _line('═');
  _write('  SFCC SAS LOCAL RUNTIME HARNESS');
  _line('─');
  _write(`  Blueprint : ${blueprintId || '(unknown)'}`);
  _write(`  Session   : ${sessionId || '(unknown)'}`);
  _write(`  Questions : ${totalQuestions}`);
  _line('═');
  _write('');
}

/**
 * Display a single question prompt for interactive mode.
 *
 * @param {object} question      — queue item from session.questionQueue
 * @param {number} answeredCount — questions answered so far
 * @param {number} total         — total questions
 */
function displayQuestion(question, answeredCount, total) {
  const idx          = answeredCount + 1;
  const replayBadge  = question.replayCritical ? ' [REPLAY-CRITICAL]' : '';
  const requiredBadge = question.required ? ' *' : '';

  _write('');
  _line('─');
  _write(`  Question ${idx}/${total}${replayBadge}`);
  _write(`  Group : ${question.group || '(unset)'}`);
  _write(`  Field : ${question.fieldId || '(unset)'}${requiredBadge}`);
  _write(`  Key   : ${question.key || '(unset)'}`);
  if (question.currentValue !== undefined && question.currentValue !== null) {
    const cv = typeof question.currentValue === 'object'
      ? JSON.stringify(question.currentValue)
      : String(question.currentValue);
    _write(`  Current value: ${_truncate(cv, 60)}`);
  }
  _line('─');
  const label = question.label || question.fieldId || 'Enter value';
  _write(`  ${label}${requiredBadge}`);
  if (question.question) {
    _write(`  ${_truncate(question.question, 68)}`);
  }
  _write('');
  process.stdout.write('> ');
}

/**
 * Display inline validation errors after a rejected answer.
 *
 * @param {string[]} errors — array of human-readable error strings
 */
function displayValidationErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return;
  _write('');
  _write('  !! Validation failed:');
  errors.forEach(e => _write(`     - ${e}`));
  _write('');
}

/**
 * Display current session progress.
 *
 * @param {number} answered
 * @param {number} total
 * @param {string} status — session STATUS value
 */
function displayProgress(answered, total, status) {
  const bar = _progressBar(answered, total);
  const pct = _pct(answered, total);
  _write('');
  _write(`  Progress: ${bar} ${pct} (${answered}/${total})   Status: ${status}`);
}

/**
 * Display the full review summary before confirmation.
 *
 * @param {object} reviewSummary — output of buildReviewSummary()
 */
function displayReview(reviewSummary) {
  const { groups = [], replaySafetyWarnings = [], completionPercentage = 0 } = reviewSummary || {};

  _write('');
  _line('═');
  _write('  REVIEW — Please verify all answers before generating XML');
  _write(`  Completion: ${completionPercentage}%`);
  _line('─');

  groups.forEach(group => {
    _write('');
    _write(`  [ ${group.groupName || group.name || 'Group'} ]`);
    const fields = group.fields || group.items || [];
    fields.forEach(field => {
      const val = field.newValue !== undefined ? field.newValue : field.currentValue;
      const display = val !== undefined && val !== null
        ? (typeof val === 'object' ? JSON.stringify(val) : String(val))
        : '(not answered)';
      const changed = field.changed ? ' [CHANGED]' : '';
      const rc      = field.replayCritical ? ' [REPLAY-CRITICAL]' : '';
      _write(`    ${field.label || field.fieldId || '?'}${rc}${changed}`);
      _write(`      → ${_truncate(display, 60)}`);
    });
  });

  if (replaySafetyWarnings.length > 0) {
    _write('');
    _line('─');
    _write('  !! REPLAY SAFETY WARNINGS:');
    replaySafetyWarnings.forEach(w => _write(`     - ${w}`));
  }

  _write('');
  _line('═');
  _write('  Commands: [ENTER] confirm  |  !cancel  |  !export');
  _write('');
}

/**
 * Display the generated XML artifact summary.
 *
 * @param {object} artifact — output of buildXMLArtifact()
 * @param {boolean} replaySuccessful
 * @param {string[]} [differences]
 */
function displayArtifact(artifact, replaySuccessful, differences = []) {
  _write('');
  _line('═');
  _write('  XML ARTIFACT GENERATED');
  _line('─');
  _write(`  Blueprint  : ${artifact.blueprintId || '?'}`);
  _write(`  Campaign   : ${artifact.campaignId  || '?'}`);
  _write(`  Session    : ${artifact.sessionId   || '?'}`);
  _write(`  Generated  : ${artifact.generatedAt || new Date().toISOString()}`);
  _write(`  Replay     : ${replaySuccessful ? 'PASSED' : 'FAILED'}`);

  if (!replaySuccessful && differences.length > 0) {
    _write('');
    _write('  Structural differences:');
    differences.slice(0, 5).forEach(d => _write(`    - ${d}`));
    if (differences.length > 5) {
      _write(`    … and ${differences.length - 5} more`);
    }
  }

  _line('─');
  _write('  XML preview (first 800 chars):');
  _write('');
  const preview = (artifact.xmlContent || '').slice(0, 800);
  preview.split('\n').forEach(ln => _write('  ' + ln));
  if ((artifact.xmlContent || '').length > 800) _write('  …(truncated)');
  _line('═');
  _write('');
}

/**
 * Display cancellation notice.
 *
 * @param {string} sessionId
 */
function displayCancelled(sessionId) {
  _write('');
  _line('─');
  _write(`  Session ${sessionId} CANCELLED.`);
  _line('─');
  _write('');
}

/**
 * Display a harness-level error (non-fatal).
 *
 * @param {string} message
 */
function displayError(message) {
  _write('');
  _write(`  ERROR: ${message}`);
  _write('');
}

/**
 * Utility: write a plain line.
 *
 * @param {string} text
 */
function displayLine(text) {
  _write(typeof text === 'string' ? text : '');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  displayBanner,
  displayQuestion,
  displayValidationErrors,
  displayProgress,
  displayReview,
  displayArtifact,
  displayCancelled,
  displayError,
  displayLine,
};
