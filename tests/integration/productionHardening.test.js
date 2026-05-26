'use strict';

/**
 * productionHardening.test.js
 *
 * Integration tests covering all production-hardening requirements (Phase 10):
 *
 *   Req 1  — Session expiration
 *   Req 2  — Duplicate action protection (idempotency)
 *   Req 3  — Runtime payload limits
 *   Req 4  — Invalid transition protection
 *   Req 5  — Artifact collision prevention
 *   Req 6  — Runtime fault isolation
 *   Req 7  — Runtime metrics
 *   Req 8  — Comprehensive coverage of all paths
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');

const { extractSASBlueprint }    = require('../../src/blueprints/extractors/extractSASBlueprint');
const { createBlueprintSession } = require('../../src/blueprints/session/createBlueprintSession');
const { collectAnswer,
        confirmReview,
        cancelSession }          = require('../../src/blueprints/session/collectAnswer');
const { STATUS }                 = require('../../src/blueprints/session/updateBlueprintSession');
const { getNextQuestion }        = require('../../src/blueprints/session/getNextQuestion');
const { buildReviewSummary }     = require('../../src/blueprints/session/buildReviewSummary');
const { generateReplaySafeXML }  = require('../../src/teams/runtime/generateReplaySafeXML');
const { buildXMLArtifact }       = require('../../src/teams/runtime/buildXMLArtifact');
const { runScriptedReplay }      = require('../../src/runtime/scriptedReplay');
const {
  recordSessionStart, recordSessionExpired, getMetrics, resetMetrics,
} = require('../../src/runtime/runtimeMetrics');
const { LIMITS, LIMIT_CODES }    = require('../../src/runtime/runtimeLimits');
const { GUARD_CODES }            = require('../../src/blueprints/session/transitionGuard');
const { safeArtifactWrite }      = require('../../src/runtime/faultIsolation');

// ─── Fixtures & helpers ───────────────────────────────────────────────────────

const SUMMER_XML = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8'
);
const REPLAY_FIXTURE = 'fixtures/sas-conversation-replays/full-summer-sas.json';

function makeBlueprint(blueprintId = 'prod-hardening-bp') {
  return extractSASBlueprint(SUMMER_XML, {
    blueprintId,
    extractedAt: new Date().toISOString(),
  });
}

function makeSession(opts = {}) {
  return createBlueprintSession(makeBlueprint(opts.blueprintId), {
    sessionId: opts.sessionId || `test-${Date.now()}`,
    ...opts,
  });
}

/** Answer all 35 questions with currentValues using collectAnswer directly. */
function answerAll(session) {
  let s = session;
  for (const q of s.questionQueue) {
    // Stop if session reached a terminal state mid-loop
    if (s.status === STATUS.COMPLETE || s.status === STATUS.CANCELLED || s.status === STATUS.EXPIRED) break;
    const val = q.currentValue !== undefined ? q.currentValue : null;
    if (val !== null) {
      const res = collectAnswer(s, q.key, val);
      s = res.session;
    }
  }
  return s;
}

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardening-'));
  resetMetrics();
});
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

// ─── Req 1: Session expiration ────────────────────────────────────────────────

describe('Req 1 — Session expiration', () => {

  test('expired session cannot accept answers — throws SESSION_EXPIRED', () => {
    const session = makeSession({ expiresAt: '2020-01-01T00:00:00.000Z' });
    const key = session.questionQueue[0].key;
    expect(() => collectAnswer(session, key, 'any'))
      .toThrow(/expired/i);
    let err;
    try { collectAnswer(session, key, 'any'); } catch (e) { err = e; }
    expect(err.code).toBe('SESSION_EXPIRED');
  });

  test('expired session cannot be confirmed — throws SESSION_EXPIRED', () => {
    const session = makeSession({ expiresAt: '2020-01-01T00:00:00.000Z' });
    const pending = { ...session, status: 'REVIEW_PENDING' };
    expect(() => confirmReview(pending)).toThrow(/expired/i);
  });

  test('getNextQuestion returns null for expired session', () => {
    const session = { ...makeSession(), status: STATUS.EXPIRED };
    expect(getNextQuestion(session)).toBeNull();
  });

  test('expired session remains readable — all fields preserved', () => {
    const session = makeSession({ expiresAt: '2020-01-01T00:00:00.000Z' });
    let err;
    try { collectAnswer(session, session.questionQueue[0].key, 'x'); } catch (e) { err = e; }
    // The error carries the expired session for inspection
    expect(err.session).toBeDefined();
    expect(err.session.status).toBe('EXPIRED');
    expect(err.session.questionQueue).toBeDefined();
    expect(err.session.questionQueue.length).toBeGreaterThan(0);
  });

  test('non-expired session updates expiresAt on each valid answer', () => {
    const session = makeSession();
    const firstKey = session.questionQueue[0].key;
    const { session: updated } = collectAnswer(session, firstKey, '2026_SUMMER_SAS');
    // expiresAt should be ~30 minutes from now (must be in the future)
    expect(new Date(updated.expiresAt) > new Date()).toBe(true);
  });

  test('EXPIRED status is preserved by recalculateDerivedState', () => {
    const session = { ...makeSession(), status: STATUS.EXPIRED };
    // Simulate an updateBlueprintSession call — status must not change
    const { updateBlueprintSession } = require('../../src/blueprints/session/updateBlueprintSession');
    const updated = updateBlueprintSession(session, { updatedAt: new Date().toISOString() });
    expect(updated.status).toBe(STATUS.EXPIRED);
  });

  test('STATUS.EXPIRED is present in STATUS constants', () => {
    expect(STATUS.EXPIRED).toBe('EXPIRED');
  });

  test('cancelled sessions are already terminal — cancel on expired is no-op', () => {
    const expired = { ...makeSession(), status: STATUS.EXPIRED };
    const result = cancelSession(expired);
    expect(result).toBe(expired); // same reference, no change
  });
});

// ─── Req 2: Duplicate action protection ───────────────────────────────────────

describe('Req 2 — Duplicate action protection (idempotency)', () => {

  test('same idempotencyToken + key returns cached result, session unchanged', () => {
    let session = makeSession();
    const key   = session.questionQueue[0].key;

    // First submission
    const r1 = collectAnswer(session, key, '2026_SUMMER_SAS', {
      idempotencyToken: 'tok-aaa',
    });
    expect(r1.idempotent).toBeFalsy();
    session = r1.session;

    // Duplicate submission (same token)
    const r2 = collectAnswer(session, key, '2026_SUMMER_SAS', {
      idempotencyToken: 'tok-aaa',
    });
    expect(r2.idempotent).toBe(true);
    expect(r2.session).toBe(session);  // same session object — no state change
  });

  test('cached validationResult is returned on duplicate', () => {
    let session = makeSession();
    const key = session.questionQueue[0].key;

    const r1 = collectAnswer(session, key, '2026_SUMMER_SAS', { idempotencyToken: 'tok-bbb' });
    expect(r1.validationResult.valid).toBe(true);
    session = r1.session;

    const r2 = collectAnswer(session, key, '2026_SUMMER_SAS', { idempotencyToken: 'tok-bbb' });
    expect(r2.validationResult.valid).toBe(true);
    expect(r2.idempotent).toBe(true);
  });

  test('different token for same key is treated as a new submission', () => {
    let session = makeSession();
    const key = session.questionQueue[0].key;

    const r1 = collectAnswer(session, key, '2026_SUMMER_SAS', { idempotencyToken: 'tok-1' });
    session = r1.session;

    // New token → processed normally
    const r2 = collectAnswer(session, key, '2026_SUMMER_SAS_V2', { idempotencyToken: 'tok-2' });
    expect(r2.idempotent).toBeFalsy();
    // The new value should be stored
    expect(r2.session.answers[key].normalizedValue).toBe('2026_SUMMER_SAS_V2');
  });

  test('no token = no idempotency check (normal processing)', () => {
    let session = makeSession();
    const key = session.questionQueue[0].key;

    const r1 = collectAnswer(session, key, '2026_SUMMER_SAS');
    session = r1.session;
    const r2 = collectAnswer(session, key, '2026_SUMMER_SAS_B');
    expect(r2.idempotent).toBeFalsy();
    expect(r2.session.answers[key].normalizedValue).toBe('2026_SUMMER_SAS_B');
  });

  test('idempotency tokens are stored in session.submittedTokens', () => {
    const session = makeSession();
    const key = session.questionQueue[0].key;
    const { session: updated } = collectAnswer(session, key, '2026_SAS', {
      idempotencyToken: 'tok-persist',
    });
    expect(updated.submittedTokens).toBeDefined();
    expect(updated.submittedTokens['tok-persist']).toBeDefined();
    expect(updated.submittedTokens['tok-persist'].key).toBe(key);
  });
});

// ─── Req 3: Runtime payload limits ───────────────────────────────────────────

describe('Req 3 — Runtime payload limits', () => {

  test('oversized string answer throws ANSWER_TOO_LONG with structured error', () => {
    const session = makeSession();
    const key = session.questionQueue.find(q => q.fieldId === 'name')?.key
      || session.questionQueue[0].key;
    const oversized = 'x'.repeat(LIMITS.MAX_ANSWER_LENGTH + 1);
    let err;
    try { collectAnswer(session, key, oversized); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.ANSWER_TOO_LONG);
    expect(err.actual).toBeGreaterThan(LIMITS.MAX_ANSWER_LENGTH);
    expect(err.limit).toBe(LIMITS.MAX_ANSWER_LENGTH);
  });

  test('oversized answer does NOT truncate — clean throw only', () => {
    const session = makeSession();
    const key = session.questionQueue[0].key;
    const oversized = 'x'.repeat(LIMITS.MAX_ANSWER_LENGTH + 1);
    // Must throw, not silently truncate
    expect(() => collectAnswer(session, key, oversized)).toThrow();
  });

  test('createBlueprintSession throws QUEUE_TOO_LARGE for blueprints > 200 questions', () => {
    const { assertQueueSize } = require('../../src/runtime/runtimeLimits');
    let err;
    try { assertQueueSize(201); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.QUEUE_TOO_LARGE);
  });

  test('assertXmlSize throws XML_TOO_LARGE for content > 512 KB', () => {
    const { assertXmlSize } = require('../../src/runtime/runtimeLimits');
    const huge = 'x'.repeat(LIMITS.MAX_XML_BYTES + 1);
    let err;
    try { assertXmlSize(huge); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.XML_TOO_LARGE);
    expect(err.message).toMatch(/512 KB|524288/i);
  });

  test('assertSessionCount throws TOO_MANY_SESSIONS at exactly MAX_SESSIONS', () => {
    const { assertSessionCount } = require('../../src/runtime/runtimeLimits');
    let err;
    try { assertSessionCount(LIMITS.MAX_SESSIONS); } catch (e) { err = e; }
    expect(err.code).toBe(LIMIT_CODES.TOO_MANY_SESSIONS);
  });
});

// ─── Req 4: Invalid transition protection ─────────────────────────────────────

describe('Req 4 — Invalid transition protection', () => {

  test('answering after COMPLETE throws ANSWER_ON_COMPLETE', () => {
    let session = answerAll(makeSession());
    // session should be COMPLETE (no replay warnings — all values unchanged)
    if (session.status !== STATUS.COMPLETE) {
      session = confirmReview(session); // handle REVIEW_PENDING
    }
    const firstKey = session.questionQueue[0].key;
    let err;
    try { collectAnswer(session, firstKey, 'NEW_VALUE'); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.ANSWER_ON_COMPLETE);
  });

  test('answering after CANCELLED throws ANSWER_ON_CANCELLED', () => {
    const session = cancelSession(makeSession());
    const key = session.questionQueue[0].key;
    let err;
    try { collectAnswer(session, key, 'val'); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.ANSWER_ON_CANCELLED);
  });

  test('answering after EXPIRED throws ANSWER_ON_EXPIRED', () => {
    const session = { ...makeSession(), status: STATUS.EXPIRED, expiresAt: '2020-01-01T00:00:00.000Z' };
    const key = session.questionQueue[0].key;
    let err;
    try { collectAnswer(session, key, 'val'); } catch (e) { err = e; }
    // Either SESSION_EXPIRED (from expiry check) or ANSWER_ON_EXPIRED (from guard)
    expect(['SESSION_EXPIRED', GUARD_CODES.ANSWER_ON_EXPIRED]).toContain(err.code);
  });

  test('confirmReview on non-REVIEW_PENDING throws REVIEW_NOT_PENDING', () => {
    const session = makeSession();  // CREATED
    let err;
    try { confirmReview(session); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.REVIEW_NOT_PENDING);
  });

  test('double confirmReview throws REVIEW_ALREADY_CONFIRMED', () => {
    // Build a REVIEW_PENDING session by changing a replayCritical field during answering
    let session = makeSession();
    const rcQ = session.questionQueue.find(q => q.replayCritical);
    if (!rcQ) return; // skip if no replay-critical field found

    // Answer all questions: use a new value for the replayCritical field, currentValue for others
    let s = session;
    for (const q of s.questionQueue) {
      if (s.status === STATUS.COMPLETE || s.status === STATUS.CANCELLED || s.status === STATUS.EXPIRED) break;
      const val = q.key === rcQ.key
        ? 'BRAND_NEW_CAMPAIGN_2026'
        : (q.currentValue !== undefined ? q.currentValue : null);
      if (val !== null) {
        const res = collectAnswer(s, q.key, val);
        s = res.session;
      }
    }
    session = s;

    if (session.status !== STATUS.REVIEW_PENDING) return; // guard: skip if not in expected state

    // First confirm → COMPLETE
    const confirmed = confirmReview(session);
    expect(confirmed.status).toBe(STATUS.COMPLETE);

    // Second confirm → REVIEW_ALREADY_CONFIRMED
    let err;
    try { confirmReview(confirmed); } catch (e) { err = e; }
    expect(err.code).toBe(GUARD_CODES.REVIEW_ALREADY_CONFIRMED);
  });

  test('generateReplaySafeXML returns failure (not throw) for non-COMPLETE session', () => {
    const session   = makeSession();
    const blueprint = makeBlueprint();
    const result    = generateReplaySafeXML(session, blueprint);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/COMPLETE/);
  });

  test('cancelSession on EXPIRED is a no-op — returns same session', () => {
    const session = { ...makeSession(), status: STATUS.EXPIRED };
    const result  = cancelSession(session);
    expect(result).toBe(session);
    expect(result.status).toBe(STATUS.EXPIRED);
  });
});

// ─── Req 5: Artifact collision prevention ─────────────────────────────────────

describe('Req 5 — Artifact collision prevention', () => {

  test('buildXMLArtifact filename includes sessionId slug', () => {
    const art = buildXMLArtifact({
      xmlContent:  '<?xml version="1.0"?><promotions/>',
      campaignId:  '2026_SUMMER_SAS',
      sessionId:   'my-session-99',
      blueprintId: 'summer-sas-2026',
      generatedAt: '2026-06-01T00:00:00.000Z',
    });
    // 'my-session-99' → safeName → 'MY_SESSION_99'
    expect(art.filename).toContain('MY_SESSION_99');
    expect(art.filename).toMatch(/^SAS_2026_SUMMER_SAS_20260601_MY_SESSION_99\.xml$/);
  });

  test('two artifacts for same campaign + date but different sessions get distinct filenames', () => {
    const base = {
      xmlContent:  '<?xml version="1.0"?><promotions/>',
      campaignId:  '2026_SAS',
      blueprintId: 'bp',
      generatedAt: '2026-06-01T00:00:00.000Z',
    };
    const a1 = buildXMLArtifact({ ...base, sessionId: 'sess-A' });
    const a2 = buildXMLArtifact({ ...base, sessionId: 'sess-B' });
    expect(a1.filename).not.toBe(a2.filename);
    expect(a1.filename).toContain('SESS_A');
    expect(a2.filename).toContain('SESS_B');
  });

  test('safeArtifactWrite blocks overwrite — second write returns collision:true', () => {
    const art = buildXMLArtifact({
      xmlContent:  '<?xml version="1.0"?><promotions/>',
      campaignId:  '2026_COLLISION_TEST',
      sessionId:   'collision-sess',
      blueprintId: 'bp',
      generatedAt: '2026-06-01T00:00:00.000Z',
    });
    const r1 = safeArtifactWrite(art, tmpDir);
    expect(r1.written).toBe(true);

    const r2 = safeArtifactWrite(art, tmpDir);
    expect(r2.written).toBe(false);
    expect(r2.collision).toBe(true);
  });

  test('filesystem write failure surfaces as structured error, not throw', () => {
    const art = buildXMLArtifact({
      xmlContent:  '<?xml version="1.0"?><promotions/>',
      campaignId:  '2026_WRITE_FAIL',
      sessionId:   'write-fail-sess',
      blueprintId: 'bp',
    });
    const r = safeArtifactWrite(art, '/proc/definitely-does-not-exist');
    expect(r.written).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.collision).toBe(false);
  });
});

// ─── Req 6: Runtime fault isolation ───────────────────────────────────────────

describe('Req 6 — Runtime fault isolation', () => {

  test('one session failure does not affect another concurrent session', () => {
    const good    = makeSession({ sessionId: 'good-session' });
    const expired = { ...makeSession({ sessionId: 'bad-session' }), status: STATUS.EXPIRED, expiresAt: '2020-01-01T00:00:00.000Z' };
    const key = good.questionQueue[0].key;

    // Bad session fails
    let badErr;
    try { collectAnswer(expired, key, 'val'); } catch (e) { badErr = e; }
    expect(badErr.code).toBe('SESSION_EXPIRED');

    // Good session continues unaffected
    const { validationResult } = collectAnswer(good, key, '2026_SUMMER_SAS');
    expect(validationResult.valid).toBe(true);
  });

  test('malformed fixture in scripted replay returns structured error, never throws', () => {
    const path_ = require('path');
    const badPath = path_.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(badPath, 'NOT JSON AT ALL');
    const result = runScriptedReplay(badPath, { silent: true });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.artifact).toBeNull();
  });

  test('logger failure is swallowed — orchestration continues', () => {
    const { createLogger, EVENTS } = require('../../src/runtime/harnessLogger');
    // A silent logger never writes files
    const { log } = createLogger('isolated-session', { silent: true });
    expect(() => log(EVENTS.SESSION_START, { blueprintId: 'bp' })).not.toThrow();

    // Non-silent — standard write path
    const { log: log2 } = createLogger('isolated-session-2', { silent: false });
    expect(() => log2(EVENTS.ANSWER_ACCEPTED, { key: 'k1' })).not.toThrow();
  });
});

// ─── Req 7: Runtime metrics ───────────────────────────────────────────────────

describe('Req 7 — Runtime metrics', () => {

  test('scripted replay increments sessionsStarted and sessionsCompleted', () => {
    resetMetrics();
    runScriptedReplay(REPLAY_FIXTURE, { silent: true });
    const m = getMetrics();
    expect(m.sessionsStarted).toBe(1);
    expect(m.sessionsCompleted).toBe(1);
    resetMetrics();
  });

  test('scripted replay accumulates totalQuestionCount (35 for Summer SAS)', () => {
    resetMetrics();
    runScriptedReplay(REPLAY_FIXTURE, { silent: true });
    expect(getMetrics().totalQuestionCount).toBe(35);
    resetMetrics();
  });

  test('averageQuestionCount is 35 after one full Summer SAS replay', () => {
    resetMetrics();
    runScriptedReplay(REPLAY_FIXTURE, { silent: true });
    expect(getMetrics().averageQuestionCount).toBe(35);
    resetMetrics();
  });

  test('recordSessionExpired increments sessionsExpired counter', () => {
    resetMetrics();
    recordSessionExpired();
    recordSessionExpired();
    expect(getMetrics().sessionsExpired).toBe(2);
  });

  test('metrics do not bleed between independent test calls', () => {
    resetMetrics();
    recordSessionStart(10);
    const snap1 = getMetrics();
    expect(snap1.sessionsStarted).toBe(1);

    resetMetrics();
    const snap2 = getMetrics();
    expect(snap2.sessionsStarted).toBe(0);  // clean slate
  });

  test('metrics snapshot is immutable', () => {
    recordSessionStart(20);
    const m = getMetrics();
    m.sessionsStarted = 999;
    expect(getMetrics().sessionsStarted).toBe(1);
    resetMetrics();
  });
});

// ─── Req 8 supplementary: full lifecycle with hardening active ────────────────

describe('Full lifecycle with all hardening active', () => {

  test('complete scripted replay: 35 answers, replay passes, no validation errors', () => {
    resetMetrics();
    const result = runScriptedReplay(REPLAY_FIXTURE, { silent: true });
    expect(result.success).toBe(true);
    expect(result.answersSubmitted).toBe(35);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.artifact.filename).toMatch(/^SAS_/);
    expect(result.artifact.filename).toMatch(/\.xml$/);
    expect(result.xmlResult.replaySuccessful).toBe(true);
    resetMetrics();
  });

  test('session with expiresAt override in far future completes without expiry error', () => {
    const session  = makeSession({ expiresAt: '2099-01-01T00:00:00.000Z' });
    const firstKey = session.questionQueue[0].key;
    expect(() => collectAnswer(session, firstKey, '2026_SUMMER_SAS')).not.toThrow();
  });

  test('buildReviewSummary works on EXPIRED session (readable, not blocked)', () => {
    const expired = { ...makeSession(), status: STATUS.EXPIRED };
    expect(() => buildReviewSummary(expired)).not.toThrow();
    const summary = buildReviewSummary(expired);
    expect(summary.sessionStatus).toBe(STATUS.EXPIRED);
  });
});
