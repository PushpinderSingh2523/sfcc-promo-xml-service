'use strict';

/**
 * runtimeLimits.test.js — Unit tests for Req 3 (Runtime payload limits)
 */

const {
  LIMITS,
  LIMIT_CODES,
  assertAnswerLength,
  assertXmlSize,
  assertSessionCount,
  assertReplayWarnings,
  assertQueueSize,
} = require('../../src/runtime/runtimeLimits');

// ─── LIMITS constants ─────────────────────────────────────────────────────────

describe('LIMITS', () => {
  test('is a frozen object', () => {
    expect(() => { LIMITS.MAX_ANSWER_LENGTH = 999; }).toThrow();
  });

  test('MAX_ANSWER_LENGTH is 4000', () => {
    expect(LIMITS.MAX_ANSWER_LENGTH).toBe(4_000);
  });

  test('MAX_XML_BYTES is 524288 (512 KB)', () => {
    expect(LIMITS.MAX_XML_BYTES).toBe(524_288);
  });

  test('MAX_SESSIONS is 1000', () => {
    expect(LIMITS.MAX_SESSIONS).toBe(1_000);
  });

  test('MAX_REPLAY_WARNINGS is 50', () => {
    expect(LIMITS.MAX_REPLAY_WARNINGS).toBe(50);
  });

  test('MAX_QUESTIONS_PER_SESSION is 200', () => {
    expect(LIMITS.MAX_QUESTIONS_PER_SESSION).toBe(200);
  });

  test('DEFAULT_SESSION_TTL_MS is 1800000 (30 min)', () => {
    expect(LIMITS.DEFAULT_SESSION_TTL_MS).toBe(30 * 60 * 1_000);
  });
});

// ─── assertAnswerLength ───────────────────────────────────────────────────────

describe('assertAnswerLength', () => {
  test('does not throw for a string within the limit', () => {
    expect(() => assertAnswerLength('a'.repeat(LIMITS.MAX_ANSWER_LENGTH), 'f')).not.toThrow();
  });

  test('throws ANSWER_TOO_LONG when string exceeds MAX_ANSWER_LENGTH', () => {
    const oversized = 'x'.repeat(LIMITS.MAX_ANSWER_LENGTH + 1);
    let err;
    try { assertAnswerLength(oversized, 'myField'); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.ANSWER_TOO_LONG);
    expect(err.message).toMatch(/myField/);
    expect(err.actual).toBe(LIMITS.MAX_ANSWER_LENGTH + 1);
    expect(err.limit).toBe(LIMITS.MAX_ANSWER_LENGTH);
  });

  test('does not throw for non-string values (numbers, arrays)', () => {
    expect(() => assertAnswerLength(12345, 'numField')).not.toThrow();
    expect(() => assertAnswerLength(['a', 'b'], 'arrField')).not.toThrow();
  });

  test('does not throw for null / undefined', () => {
    expect(() => assertAnswerLength(null, 'f')).not.toThrow();
    expect(() => assertAnswerLength(undefined, 'f')).not.toThrow();
  });

  test('does not throw for an empty string', () => {
    expect(() => assertAnswerLength('', 'f')).not.toThrow();
  });
});

// ─── assertXmlSize ────────────────────────────────────────────────────────────

describe('assertXmlSize', () => {
  test('does not throw for XML within 512 KB', () => {
    const smallXml = '<root>' + 'x'.repeat(100) + '</root>';
    expect(() => assertXmlSize(smallXml)).not.toThrow();
  });

  test('throws XML_TOO_LARGE when UTF-8 byte size exceeds MAX_XML_BYTES', () => {
    const bigXml = 'x'.repeat(LIMITS.MAX_XML_BYTES + 1);
    let err;
    try { assertXmlSize(bigXml); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.XML_TOO_LARGE);
    expect(err.actual).toBeGreaterThan(LIMITS.MAX_XML_BYTES);
    expect(err.limit).toBe(LIMITS.MAX_XML_BYTES);
  });

  test('does not throw for non-string input', () => {
    expect(() => assertXmlSize(null)).not.toThrow();
    expect(() => assertXmlSize(42)).not.toThrow();
  });
});

// ─── assertSessionCount ───────────────────────────────────────────────────────

describe('assertSessionCount', () => {
  test('does not throw when count is below MAX_SESSIONS', () => {
    expect(() => assertSessionCount(LIMITS.MAX_SESSIONS - 1)).not.toThrow();
  });

  test('throws TOO_MANY_SESSIONS when count equals MAX_SESSIONS', () => {
    let err;
    try { assertSessionCount(LIMITS.MAX_SESSIONS); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.TOO_MANY_SESSIONS);
    expect(err.actual).toBe(LIMITS.MAX_SESSIONS);
  });

  test('does not throw for non-numeric input', () => {
    expect(() => assertSessionCount(null)).not.toThrow();
    expect(() => assertSessionCount(undefined)).not.toThrow();
  });
});

// ─── assertReplayWarnings ─────────────────────────────────────────────────────

describe('assertReplayWarnings', () => {
  test('does not throw when count is within MAX_REPLAY_WARNINGS', () => {
    expect(() => assertReplayWarnings(LIMITS.MAX_REPLAY_WARNINGS)).not.toThrow();
  });

  test('throws TOO_MANY_REPLAY_WARNINGS when count exceeds the limit', () => {
    let err;
    try { assertReplayWarnings(LIMITS.MAX_REPLAY_WARNINGS + 1); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.TOO_MANY_REPLAY_WARNINGS);
    expect(err.actual).toBe(LIMITS.MAX_REPLAY_WARNINGS + 1);
  });
});

// ─── assertQueueSize ─────────────────────────────────────────────────────────

describe('assertQueueSize', () => {
  test('does not throw for a queue at the limit', () => {
    expect(() => assertQueueSize(LIMITS.MAX_QUESTIONS_PER_SESSION)).not.toThrow();
  });

  test('throws QUEUE_TOO_LARGE when queue exceeds the limit', () => {
    let err;
    try { assertQueueSize(LIMITS.MAX_QUESTIONS_PER_SESSION + 1); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.QUEUE_TOO_LARGE);
    expect(err.actual).toBe(LIMITS.MAX_QUESTIONS_PER_SESSION + 1);
  });
});

// ─── Payload limit integration: collectAnswer ─────────────────────────────────

describe('collectAnswer enforces answer length limit', () => {
  const { collectAnswer }          = require('../../src/blueprints/session/collectAnswer');
  const { createBlueprintSession } = require('../../src/blueprints/session/createBlueprintSession');
  const { extractSASBlueprint }    = require('../../src/blueprints/extractors/extractSASBlueprint');
  const fs   = require('fs');
  const path = require('path');

  const xml = fs.readFileSync(path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8');

  test('throws ANSWER_TOO_LONG when string answer exceeds MAX_ANSWER_LENGTH', () => {
    const blueprint = extractSASBlueprint(xml, { blueprintId: 'test-limits', extractedAt: new Date().toISOString() });
    const session   = createBlueprintSession(blueprint, { sessionId: 'limits-test' });
    const firstKey  = session.questionQueue[0].key;
    const oversized = 'x'.repeat(LIMITS.MAX_ANSWER_LENGTH + 1);

    let err;
    try { collectAnswer(session, firstKey, oversized); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.ANSWER_TOO_LONG);
  });

  test('accepts answer exactly at MAX_ANSWER_LENGTH for a name field', () => {
    const blueprint = extractSASBlueprint(xml, { blueprintId: 'test-limits-ok', extractedAt: new Date().toISOString() });
    const session   = createBlueprintSession(blueprint, { sessionId: 'limits-ok' });
    // Find a name field (string type, max 4000)
    const nameQuestion = session.questionQueue.find(q => q.fieldId === 'name');
    if (!nameQuestion) return; // skip if structure differs
    const atLimit = 'a'.repeat(LIMITS.MAX_ANSWER_LENGTH);
    expect(() => collectAnswer(session, nameQuestion.key, atLimit)).not.toThrow();
  });
});
