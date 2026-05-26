'use strict';

const {
  saveSession, getSession, deleteSession, listSessions, _reset,
} = require('../../src/teams/runtime/sessionStore');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    sessionId: 'sess-001',
    status:    'IN_PROGRESS',
    answers:   {},
    ...overrides,
  };
}

beforeEach(() => _reset());

// ─── Input validation ─────────────────────────────────────────────────────────

describe('sessionStore — saveSession validation', () => {
  test('throws when session is null', () => {
    expect(() => saveSession(null)).toThrow('session must be a non-null object');
  });
  test('throws when session is a string', () => {
    expect(() => saveSession('bad')).toThrow('session must be a non-null object');
  });
  test('throws when sessionId is missing', () => {
    expect(() => saveSession({ status: 'IN_PROGRESS' })).toThrow('session.sessionId must be a non-empty string');
  });
  test('throws when sessionId is empty string', () => {
    expect(() => saveSession({ sessionId: '', status: 'IN_PROGRESS' })).toThrow('session.sessionId must be a non-empty string');
  });
});

describe('sessionStore — getSession validation', () => {
  test('throws when sessionId is null', () => {
    expect(() => getSession(null)).toThrow('sessionId must be a non-empty string');
  });
  test('throws when sessionId is empty', () => {
    expect(() => getSession('')).toThrow('sessionId must be a non-empty string');
  });
  test('returns null for unknown sessionId', () => {
    expect(getSession('nonexistent')).toBeNull();
  });
});

describe('sessionStore — deleteSession validation', () => {
  test('throws when sessionId is null', () => {
    expect(() => deleteSession(null)).toThrow('sessionId must be a non-empty string');
  });
  test('returns false for nonexistent sessionId', () => {
    expect(deleteSession('nonexistent')).toBe(false);
  });
});

// ─── Save and retrieve ────────────────────────────────────────────────────────

describe('sessionStore — save and retrieve', () => {
  test('saves and retrieves a session', () => {
    const s = makeSession();
    saveSession(s);
    const retrieved = getSession('sess-001');
    expect(retrieved).not.toBeNull();
    expect(retrieved.sessionId).toBe('sess-001');
  });

  test('retrieved session is a deep copy (not same reference)', () => {
    const s = makeSession();
    saveSession(s);
    const r1 = getSession('sess-001');
    const r2 = getSession('sess-001');
    expect(r1).not.toBe(r2);
  });

  test('mutating retrieved session does not affect stored session', () => {
    const s = makeSession();
    saveSession(s);
    const retrieved = getSession('sess-001');
    retrieved.status = 'MUTATED';
    const second = getSession('sess-001');
    expect(second.status).toBe('IN_PROGRESS');
  });

  test('mutating input session after save does not affect store', () => {
    const s = makeSession();
    saveSession(s);
    s.status = 'MUTATED';
    const retrieved = getSession('sess-001');
    expect(retrieved.status).toBe('IN_PROGRESS');
  });

  test('overwriting an existing session replaces it', () => {
    saveSession(makeSession({ status: 'IN_PROGRESS' }));
    saveSession(makeSession({ status: 'COMPLETE' }));
    expect(getSession('sess-001').status).toBe('COMPLETE');
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

describe('sessionStore — deleteSession', () => {
  test('returns true when session was found and deleted', () => {
    saveSession(makeSession());
    expect(deleteSession('sess-001')).toBe(true);
  });

  test('session is gone after delete', () => {
    saveSession(makeSession());
    deleteSession('sess-001');
    expect(getSession('sess-001')).toBeNull();
  });

  test('returns false when session did not exist', () => {
    expect(deleteSession('nobody')).toBe(false);
  });
});

// ─── List sessions ────────────────────────────────────────────────────────────

describe('sessionStore — listSessions', () => {
  test('empty store returns empty array', () => {
    expect(listSessions()).toEqual([]);
  });

  test('returns all stored sessions', () => {
    saveSession(makeSession({ sessionId: 'A' }));
    saveSession(makeSession({ sessionId: 'B' }));
    const list = listSessions();
    expect(list).toHaveLength(2);
    const ids = list.map(s => s.sessionId).sort();
    expect(ids).toEqual(['A', 'B']);
  });

  test('returns deep copies (mutating list items does not affect store)', () => {
    saveSession(makeSession({ sessionId: 'X' }));
    const list = listSessions();
    list[0].status = 'MUTATED';
    expect(getSession('X').status).toBe('IN_PROGRESS');
  });

  test('insertion order is preserved', () => {
    saveSession(makeSession({ sessionId: 'first' }));
    saveSession(makeSession({ sessionId: 'second' }));
    saveSession(makeSession({ sessionId: 'third' }));
    const ids = listSessions().map(s => s.sessionId);
    expect(ids).toEqual(['first', 'second', 'third']);
  });
});

// ─── _reset ───────────────────────────────────────────────────────────────────

describe('sessionStore — _reset', () => {
  test('clears all sessions', () => {
    saveSession(makeSession({ sessionId: 'A' }));
    saveSession(makeSession({ sessionId: 'B' }));
    _reset();
    expect(listSessions()).toHaveLength(0);
  });

  test('getSession returns null after reset', () => {
    saveSession(makeSession());
    _reset();
    expect(getSession('sess-001')).toBeNull();
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('sessionStore — determinism', () => {
  test('same session saved twice produces identical retrievals', () => {
    const s = makeSession({ answers: { 'key::t::_::_': { normalizedValue: 'V' } } });
    saveSession(s);
    const r1 = getSession('sess-001');
    saveSession(s);
    const r2 = getSession('sess-001');
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
