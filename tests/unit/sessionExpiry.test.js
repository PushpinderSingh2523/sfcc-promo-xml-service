'use strict';

/**
 * sessionExpiry.test.js — Unit tests for Req 1 (Session expiration)
 */

const {
  buildExpiresAt,
  isSessionExpired,
  touchSession,
  expireSession,
  EXPIRED_STATUS,
} = require('../../src/blueprints/session/sessionExpiry');

const { LIMITS } = require('../../src/runtime/runtimeLimits');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    sessionId:         'test-session',
    status:            'CREATED',
    expiresAt:         null,
    lastInteractionAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST   = '2020-01-01T00:00:00.000Z';

// ─── buildExpiresAt ───────────────────────────────────────────────────────────

describe('buildExpiresAt', () => {
  test('returns ISO string 30 minutes after given ISO start', () => {
    const result = buildExpiresAt('2026-06-01T10:00:00.000Z', LIMITS.DEFAULT_SESSION_TTL_MS);
    expect(result).toBe('2026-06-01T10:30:00.000Z');
  });

  test('accepts a Date object as start', () => {
    const start = new Date('2026-06-01T10:00:00.000Z');
    const result = buildExpiresAt(start, 60_000); // 1 minute TTL
    expect(result).toBe('2026-06-01T10:01:00.000Z');
  });

  test('uses DEFAULT_SESSION_TTL_MS when ttlMs is omitted', () => {
    const start = new Date('2026-06-01T10:00:00.000Z');
    const result = buildExpiresAt(start);
    expect(result).toBe('2026-06-01T10:30:00.000Z');
  });

  test('returns a string in ISO format', () => {
    const result = buildExpiresAt(new Date(), LIMITS.DEFAULT_SESSION_TTL_MS);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── isSessionExpired ─────────────────────────────────────────────────────────

describe('isSessionExpired', () => {
  test('returns false when expiresAt is null', () => {
    expect(isSessionExpired(makeSession({ expiresAt: null }))).toBe(false);
  });

  test('returns false when expiresAt is undefined', () => {
    expect(isSessionExpired(makeSession({ expiresAt: undefined }))).toBe(false);
  });

  test('returns false when expiresAt is in the future', () => {
    expect(isSessionExpired(makeSession({ expiresAt: FUTURE }), new Date())).toBe(false);
  });

  test('returns true when expiresAt is in the past', () => {
    expect(isSessionExpired(makeSession({ expiresAt: PAST }), new Date())).toBe(true);
  });

  test('returns true when status is already EXPIRED', () => {
    expect(isSessionExpired(makeSession({ status: EXPIRED_STATUS, expiresAt: FUTURE }))).toBe(true);
  });

  test('accepts now override as ISO string', () => {
    const session = makeSession({ expiresAt: '2026-06-01T10:30:00.000Z' });
    // now = 10:29 → not expired; now = 10:31 → expired
    expect(isSessionExpired(session, '2026-06-01T10:29:00.000Z')).toBe(false);
    expect(isSessionExpired(session, '2026-06-01T10:31:00.000Z')).toBe(true);
  });

  test('returns false for null session', () => {
    expect(isSessionExpired(null)).toBe(false);
  });

  test('returns false for session without expiresAt (legacy sessions)', () => {
    const legacy = { sessionId: 'old', status: 'IN_PROGRESS' };
    expect(isSessionExpired(legacy)).toBe(false);
  });
});

// ─── touchSession ─────────────────────────────────────────────────────────────

describe('touchSession', () => {
  test('returns a new object — does not mutate input', () => {
    const s = makeSession({ expiresAt: PAST });
    const t = touchSession(s, '2026-06-01T10:00:00.000Z');
    expect(t).not.toBe(s);
    expect(s.expiresAt).toBe(PAST); // original unchanged
  });

  test('sets lastInteractionAt to the provided now', () => {
    const t = touchSession(makeSession(), '2026-06-01T10:00:00.000Z');
    expect(t.lastInteractionAt).toBe('2026-06-01T10:00:00.000Z');
  });

  test('extends expiresAt by DEFAULT_SESSION_TTL_MS from now', () => {
    const t = touchSession(makeSession(), '2026-06-01T10:00:00.000Z');
    expect(t.expiresAt).toBe('2026-06-01T10:30:00.000Z');
  });

  test('uses custom ttlMs when provided', () => {
    const t = touchSession(makeSession(), '2026-06-01T10:00:00.000Z', 60_000); // 1 min
    expect(t.expiresAt).toBe('2026-06-01T10:01:00.000Z');
  });

  test('throws when session is null', () => {
    expect(() => touchSession(null)).toThrow('session must be a non-null object');
  });

  test('preserves all other session fields', () => {
    const s = makeSession({ sessionId: 'abc', blueprintId: 'bp-1', status: 'IN_PROGRESS' });
    const t = touchSession(s, new Date().toISOString());
    expect(t.sessionId).toBe('abc');
    expect(t.blueprintId).toBe('bp-1');
    expect(t.status).toBe('IN_PROGRESS');
  });
});

// ─── expireSession ────────────────────────────────────────────────────────────

describe('expireSession', () => {
  test('sets status to EXPIRED', () => {
    const t = expireSession(makeSession(), '2026-06-01T10:00:00.000Z');
    expect(t.status).toBe(EXPIRED_STATUS);
  });

  test('returns a new object — does not mutate input', () => {
    const s = makeSession({ status: 'IN_PROGRESS' });
    const t = expireSession(s);
    expect(t).not.toBe(s);
    expect(s.status).toBe('IN_PROGRESS');
  });

  test('sets updatedAt to the provided now', () => {
    const t = expireSession(makeSession(), '2026-06-01T10:00:00.000Z');
    expect(t.updatedAt).toBe('2026-06-01T10:00:00.000Z');
  });

  test('preserves all answer/queue content for post-mortem', () => {
    const s = makeSession({
      answers: { key1: { normalizedValue: 'foo' } },
      sessionId: 'audit-session',
    });
    const t = expireSession(s, new Date().toISOString());
    expect(t.sessionId).toBe('audit-session');
    expect(t.answers.key1.normalizedValue).toBe('foo');
  });

  test('throws when session is null', () => {
    expect(() => expireSession(null)).toThrow('session must be a non-null object');
  });
});

// ─── EXPIRED_STATUS constant ──────────────────────────────────────────────────

describe('EXPIRED_STATUS', () => {
  test('equals the string "EXPIRED"', () => {
    expect(EXPIRED_STATUS).toBe('EXPIRED');
  });
});

// ─── Integration: expiry blocks collectAnswer ─────────────────────────────────

describe('collectAnswer expiry integration', () => {
  const { collectAnswer }          = require('../../src/blueprints/session/collectAnswer');
  const { createBlueprintSession } = require('../../src/blueprints/session/createBlueprintSession');
  const { extractSASBlueprint }    = require('../../src/blueprints/extractors/extractSASBlueprint');
  const fs = require('fs');
  const path = require('path');

  const xml = fs.readFileSync(
    path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8'
  );

  test('collectAnswer throws SESSION_EXPIRED when expiresAt is in the past', () => {
    const blueprint = extractSASBlueprint(xml, { blueprintId: 'test', extractedAt: new Date().toISOString() });
    // Create session with expiresAt in the past
    const session = createBlueprintSession(blueprint, {
      sessionId: 'expiry-test',
      expiresAt: '2020-01-01T00:00:00.000Z',  // definitely past
    });

    const firstKey = session.questionQueue[0].key;
    expect(() => collectAnswer(session, firstKey, 'any-value')).toThrow(/expired/i);

    // Check error code
    let errorCode;
    try {
      collectAnswer(session, firstKey, 'any-value');
    } catch (err) {
      errorCode = err.code;
    }
    expect(errorCode).toBe('SESSION_EXPIRED');
  });

  test('collectAnswer succeeds when expiresAt is in the future', () => {
    const blueprint = extractSASBlueprint(xml, { blueprintId: 'test2', extractedAt: new Date().toISOString() });
    const session = createBlueprintSession(blueprint, { sessionId: 'not-expired' });
    // expiresAt defaults to now+30min — not expired

    const firstKey = session.questionQueue[0].key;
    const { validationResult } = collectAnswer(session, firstKey, '2026_SUMMER_SAS');
    expect(validationResult.valid).toBe(true);
  });

  test('expired session error carries expiresAt and session properties', () => {
    const blueprint = extractSASBlueprint(xml, { blueprintId: 'test3', extractedAt: new Date().toISOString() });
    const session = createBlueprintSession(blueprint, {
      sessionId: 'expiry-meta',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    const firstKey = session.questionQueue[0].key;
    let err;
    try { collectAnswer(session, firstKey, 'val'); } catch (e) { err = e; }

    expect(err.code).toBe('SESSION_EXPIRED');
    expect(err.expiresAt).toBe('2020-01-01T00:00:00.000Z');
    expect(err.session).toBeDefined();
    expect(err.session.status).toBe('EXPIRED');
  });
});
