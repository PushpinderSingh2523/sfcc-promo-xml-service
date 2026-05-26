'use strict';

/**
 * runtimeMetrics.test.js — Unit tests for Req 7 (Runtime metrics)
 */

const {
  recordSessionStart,
  recordSessionCompleted,
  recordSessionCancelled,
  recordSessionExpired,
  recordValidationFailure,
  recordReplayFailure,
  getMetrics,
  resetMetrics,
} = require('../../src/runtime/runtimeMetrics');

// Always reset between tests to avoid cross-test state
beforeEach(() => resetMetrics());

// ─── Initial state ─────────────────────────────────────────────────────────────

describe('getMetrics — initial state after reset', () => {
  test('all counters start at 0', () => {
    const m = getMetrics();
    expect(m.sessionsStarted).toBe(0);
    expect(m.sessionsCompleted).toBe(0);
    expect(m.sessionsCancelled).toBe(0);
    expect(m.sessionsExpired).toBe(0);
    expect(m.validationFailures).toBe(0);
    expect(m.replayFailures).toBe(0);
    expect(m.totalQuestionCount).toBe(0);
  });

  test('averageQuestionCount is 0 when no sessions started', () => {
    expect(getMetrics().averageQuestionCount).toBe(0);
  });
});

// ─── recordSessionStart ───────────────────────────────────────────────────────

describe('recordSessionStart', () => {
  test('increments sessionsStarted', () => {
    recordSessionStart(10);
    recordSessionStart(20);
    expect(getMetrics().sessionsStarted).toBe(2);
  });

  test('accumulates totalQuestionCount', () => {
    recordSessionStart(10);
    recordSessionStart(25);
    expect(getMetrics().totalQuestionCount).toBe(35);
  });

  test('treats non-finite questionCount as 0', () => {
    recordSessionStart(NaN);
    recordSessionStart(undefined);
    expect(getMetrics().totalQuestionCount).toBe(0);
    expect(getMetrics().sessionsStarted).toBe(2);
  });

  test('works with 0 questions', () => {
    recordSessionStart(0);
    expect(getMetrics().sessionsStarted).toBe(1);
    expect(getMetrics().totalQuestionCount).toBe(0);
  });
});

// ─── recordSessionCompleted ───────────────────────────────────────────────────

describe('recordSessionCompleted', () => {
  test('increments sessionsCompleted', () => {
    recordSessionCompleted();
    recordSessionCompleted();
    expect(getMetrics().sessionsCompleted).toBe(2);
  });

  test('does not affect other counters', () => {
    recordSessionCompleted();
    const m = getMetrics();
    expect(m.sessionsStarted).toBe(0);
    expect(m.sessionsExpired).toBe(0);
  });
});

// ─── recordSessionCancelled ───────────────────────────────────────────────────

describe('recordSessionCancelled', () => {
  test('increments sessionsCancelled', () => {
    recordSessionCancelled();
    expect(getMetrics().sessionsCancelled).toBe(1);
  });
});

// ─── recordSessionExpired ─────────────────────────────────────────────────────

describe('recordSessionExpired', () => {
  test('increments sessionsExpired', () => {
    recordSessionExpired();
    recordSessionExpired();
    expect(getMetrics().sessionsExpired).toBe(2);
  });
});

// ─── recordValidationFailure ──────────────────────────────────────────────────

describe('recordValidationFailure', () => {
  test('increments validationFailures', () => {
    recordValidationFailure();
    recordValidationFailure();
    recordValidationFailure();
    expect(getMetrics().validationFailures).toBe(3);
  });
});

// ─── recordReplayFailure ──────────────────────────────────────────────────────

describe('recordReplayFailure', () => {
  test('increments replayFailures', () => {
    recordReplayFailure();
    expect(getMetrics().replayFailures).toBe(1);
  });
});

// ─── averageQuestionCount ─────────────────────────────────────────────────────

describe('averageQuestionCount (derived)', () => {
  test('equals totalQuestionCount / sessionsStarted', () => {
    recordSessionStart(10);
    recordSessionStart(20);
    recordSessionStart(30);
    // avg = 60/3 = 20
    expect(getMetrics().averageQuestionCount).toBe(20);
  });

  test('rounds to one decimal place', () => {
    recordSessionStart(1);
    recordSessionStart(2);
    // avg = 3/2 = 1.5
    expect(getMetrics().averageQuestionCount).toBe(1.5);
  });

  test('is 0 when no sessions started', () => {
    expect(getMetrics().averageQuestionCount).toBe(0);
  });
});

// ─── Snapshot immutability ────────────────────────────────────────────────────

describe('getMetrics snapshot immutability', () => {
  test('mutating the returned object does not affect internal state', () => {
    recordSessionStart(10);
    const snap = getMetrics();
    snap.sessionsStarted = 999;
    expect(getMetrics().sessionsStarted).toBe(1);
  });
});

// ─── resetMetrics ─────────────────────────────────────────────────────────────

describe('resetMetrics', () => {
  test('resets all counters to 0', () => {
    recordSessionStart(35);
    recordSessionCompleted();
    recordValidationFailure();
    recordReplayFailure();
    resetMetrics();
    const m = getMetrics();
    expect(m.sessionsStarted).toBe(0);
    expect(m.sessionsCompleted).toBe(0);
    expect(m.validationFailures).toBe(0);
    expect(m.replayFailures).toBe(0);
    expect(m.totalQuestionCount).toBe(0);
    expect(m.averageQuestionCount).toBe(0);
  });
});

// ─── concurrent-session accumulation ─────────────────────────────────────────

describe('concurrent sessions — metrics accumulate correctly', () => {
  test('running 10 simulated sessions increments counters correctly', () => {
    for (let i = 0; i < 10; i++) {
      recordSessionStart(35);
      recordSessionCompleted();
    }
    const m = getMetrics();
    expect(m.sessionsStarted).toBe(10);
    expect(m.sessionsCompleted).toBe(10);
    expect(m.totalQuestionCount).toBe(350);
    expect(m.averageQuestionCount).toBe(35);
  });

  test('mix of completed / expired / cancelled sessions', () => {
    for (let i = 0; i < 5; i++) recordSessionStart(35);
    recordSessionCompleted();
    recordSessionCompleted();
    recordSessionCancelled();
    recordSessionExpired();
    recordSessionExpired();
    const m = getMetrics();
    expect(m.sessionsStarted).toBe(5);
    expect(m.sessionsCompleted).toBe(2);
    expect(m.sessionsCancelled).toBe(1);
    expect(m.sessionsExpired).toBe(2);
  });
});
