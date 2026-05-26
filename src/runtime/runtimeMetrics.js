'use strict';

/**
 * runtimeMetrics.js
 *
 * Lightweight in-memory deterministic counters for the local runtime harness.
 *
 * Metrics are stored in a module-level singleton plain object — no external
 * systems, no network, no persistence.  Metrics survive for the lifetime of
 * the Node process and are reset-able for tests.
 *
 * Counters:
 *   sessionsStarted      — total sessions created (via recordSessionStart)
 *   sessionsCompleted    — sessions that reached COMPLETE status
 *   sessionsCancelled    — sessions that reached CANCELLED status
 *   sessionsExpired      — sessions that expired before completion
 *   totalQuestionCount   — sum of questionQueue.length across all started sessions
 *   validationFailures   — cumulative count of ANSWER_REJECTED events
 *   replayFailures       — cumulative count of failed replay validations
 *
 * Derived (computed on getMetrics()):
 *   averageQuestionCount — totalQuestionCount / sessionsStarted (0 when none)
 *
 * @module runtimeMetrics
 */

// ─── Internal state ───────────────────────────────────────────────────────────

let _state = _fresh();

function _fresh() {
  return {
    sessionsStarted:    0,
    sessionsCompleted:  0,
    sessionsCancelled:  0,
    sessionsExpired:    0,
    totalQuestionCount: 0,
    validationFailures: 0,
    replayFailures:     0,
  };
}

// ─── Recorder functions ───────────────────────────────────────────────────────

/**
 * Record a session being created.
 *
 * @param {number} [questionCount=0] — number of questions in the session queue
 */
function recordSessionStart(questionCount) {
  _state.sessionsStarted    += 1;
  _state.totalQuestionCount += (Number.isFinite(questionCount) ? questionCount : 0);
}

/** Record a session reaching COMPLETE status. */
function recordSessionCompleted() {
  _state.sessionsCompleted += 1;
}

/** Record a session being cancelled by the operator. */
function recordSessionCancelled() {
  _state.sessionsCancelled += 1;
}

/** Record a session that expired before completion. */
function recordSessionExpired() {
  _state.sessionsExpired += 1;
}

/** Record one answer-validation failure (ANSWER_REJECTED event). */
function recordValidationFailure() {
  _state.validationFailures += 1;
}

/** Record a replay validation failure (replaySuccessful === false). */
function recordReplayFailure() {
  _state.replayFailures += 1;
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/**
 * Return a snapshot of all current metrics.
 *
 * The returned object is a new plain object — callers cannot mutate state.
 *
 * @returns {{
 *   sessionsStarted:    number,
 *   sessionsCompleted:  number,
 *   sessionsCancelled:  number,
 *   sessionsExpired:    number,
 *   totalQuestionCount: number,
 *   averageQuestionCount: number,
 *   validationFailures: number,
 *   replayFailures:     number,
 * }}
 */
function getMetrics() {
  const avg = _state.sessionsStarted > 0
    ? Math.round((_state.totalQuestionCount / _state.sessionsStarted) * 10) / 10
    : 0;

  return {
    ..._state,
    averageQuestionCount: avg,
  };
}

/**
 * Reset all counters to zero.
 *
 * Only intended for test isolation — production code should never call this.
 */
function resetMetrics() {
  _state = _fresh();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  recordSessionStart,
  recordSessionCompleted,
  recordSessionCancelled,
  recordSessionExpired,
  recordValidationFailure,
  recordReplayFailure,
  getMetrics,
  resetMetrics,
};
