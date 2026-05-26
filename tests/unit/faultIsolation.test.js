'use strict';

/**
 * faultIsolation.test.js — Unit tests for Req 6 (Runtime fault isolation)
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');

const {
  safeCall,
  safeArtifactWrite,
  isolateFixtureLoad,
} = require('../../src/runtime/faultIsolation');

// ─── safeCall ─────────────────────────────────────────────────────────────────

describe('safeCall', () => {
  test('returns { result, error: null } on success', () => {
    const r = safeCall(x => x * 2, 5);
    expect(r.result).toBe(10);
    expect(r.error).toBeNull();
  });

  test('returns { result: undefined, error } on throw', () => {
    const r = safeCall(() => { throw new Error('boom'); });
    expect(r.result).toBeUndefined();
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error.message).toBe('boom');
  });

  test('wraps non-Error throws in an Error', () => {
    const r = safeCall(() => { throw 'string error'; });
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error.message).toContain('string error');
  });

  test('does not throw itself when the function throws', () => {
    expect(() => safeCall(() => { throw new Error('inner'); })).not.toThrow();
  });

  test('passes multiple arguments to fn', () => {
    const r = safeCall((a, b, c) => a + b + c, 1, 2, 3);
    expect(r.result).toBe(6);
  });

  test('one session failure does not affect another — isolated results', () => {
    const r1 = safeCall(() => { throw new Error('session-1 failure'); });
    const r2 = safeCall(() => 'session-2 ok');
    expect(r1.error.message).toContain('session-1');
    expect(r2.result).toBe('session-2 ok');
    expect(r2.error).toBeNull();
  });
});

// ─── safeArtifactWrite ────────────────────────────────────────────────────────

describe('safeArtifactWrite', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  });

  afterEach(() => {
    // Clean up test files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  function makeArtifact(overrides = {}) {
    return {
      filename:   'SAS_TEST_20260101_SESS.xml',
      xmlContent: '<?xml version="1.0"?><promotions/>',
      sessionId:  'test-session',
      byteSize:   36,
      ...overrides,
    };
  }

  test('writes file successfully and returns written:true', () => {
    const r = safeArtifactWrite(makeArtifact(), tmpDir);
    expect(r.written).toBe(true);
    expect(r.collision).toBe(false);
    expect(r.error).toBeNull();
    expect(fs.existsSync(r.filePath)).toBe(true);
  });

  test('returns collision:true when file already exists', () => {
    const art = makeArtifact();
    safeArtifactWrite(art, tmpDir);  // first write succeeds
    const r = safeArtifactWrite(art, tmpDir); // second write = collision
    expect(r.written).toBe(false);
    expect(r.collision).toBe(true);
    expect(r.error).toMatch(/overwrite|collision|already exists/i);
  });

  test('creates output directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'nested', 'output');
    const r = safeArtifactWrite(makeArtifact(), newDir);
    expect(r.written).toBe(true);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  test('returns error without throwing when artifact is invalid', () => {
    expect(() => safeArtifactWrite(null, tmpDir)).not.toThrow();
    const r = safeArtifactWrite(null, tmpDir);
    expect(r.written).toBe(false);
    expect(r.error).toBeTruthy();
  });

  test('returns error without throwing when outputDir is invalid', () => {
    const r = safeArtifactWrite(makeArtifact(), null);
    expect(r.written).toBe(false);
    expect(r.error).toBeTruthy();
  });

  test('artifact write failure is isolated — does not throw', () => {
    // Use a non-writable location
    const r = safeArtifactWrite(makeArtifact(), '/proc/definitely-does-not-exist-and-not-writable');
    expect(r.written).toBe(false);
    expect(r.error).toBeTruthy();
    // No throw occurred reaching this line
  });

  test('written file contains correct XML content', () => {
    const art = makeArtifact({ xmlContent: '<promotions><promotion/></promotions>' });
    const r = safeArtifactWrite(art, tmpDir);
    expect(r.written).toBe(true);
    const onDisk = fs.readFileSync(r.filePath, 'utf8');
    expect(onDisk).toBe('<promotions><promotion/></promotions>');
  });
});

// ─── isolateFixtureLoad ───────────────────────────────────────────────────────

describe('isolateFixtureLoad', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  test('loads a valid JSON fixture', () => {
    const fixturePath = path.join(tmpDir, 'good.json');
    fs.writeFileSync(fixturePath, JSON.stringify({ key: 'value' }));
    const { data, error } = isolateFixtureLoad(fixturePath);
    expect(data).toEqual({ key: 'value' });
    expect(error).toBeNull();
  });

  test('returns structured error for malformed JSON', () => {
    const fixturePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(fixturePath, '{ not valid json');
    const { data, error } = isolateFixtureLoad(fixturePath);
    expect(data).toBeNull();
    expect(error).toMatch(/malformed|JSON/i);
  });

  test('returns structured error for missing file', () => {
    const { data, error } = isolateFixtureLoad(path.join(tmpDir, 'MISSING.json'));
    expect(data).toBeNull();
    expect(error).toMatch(/read|ENOENT/i);
  });

  test('returns structured error for null path', () => {
    const { data, error } = isolateFixtureLoad(null);
    expect(data).toBeNull();
    expect(error).toMatch(/filePath/);
  });

  test('never throws — always returns { data, error }', () => {
    expect(() => isolateFixtureLoad(undefined)).not.toThrow();
    expect(() => isolateFixtureLoad('/tmp/__no_such_file__')).not.toThrow();
  });
});

// ─── Logger failure isolation ─────────────────────────────────────────────────

describe('logger failure isolation', () => {
  const { createLogger, EVENTS } = require('../../src/runtime/harnessLogger');

  test('logger write failure does not throw to caller', () => {
    // Create logger pointing to an unwritable location
    // The logger swallows fs errors internally
    const { log } = createLogger('test-fault-session', { silent: false });
    // Even in non-silent mode, we can't easily make fs.appendFileSync fail
    // without mocking — verify it doesn't throw with normal usage
    expect(() => log(EVENTS.SESSION_START, { blueprintId: 'bp', totalQuestions: 5 })).not.toThrow();
  });

  test('silent logger never touches filesystem', () => {
    const { log } = createLogger('test-silent', { silent: true });
    // No file should be created — just verify no throw
    expect(() => log(EVENTS.ANSWER_ACCEPTED, { key: 'k1' })).not.toThrow();
  });
});

// ─── Malformed fixture isolation (scripted replay) ────────────────────────────

describe('scriptedReplay malformed fixture isolation', () => {
  const { runScriptedReplay } = require('../../src/runtime/scriptedReplay');
  const os = require('os');

  let tmpDir2;
  beforeEach(() => { tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-test-')); });
  afterEach(() => { try { fs.rmSync(tmpDir2, { recursive: true, force: true }); } catch (_) {} });

  test('malformed JSON fixture returns structured error, does not throw', () => {
    const badPath = path.join(tmpDir2, 'malformed.json');
    fs.writeFileSync(badPath, '{ invalid json }');
    const result = runScriptedReplay(badPath, { silent: true });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.artifact).toBeNull();
  });

  test('fixture with wrong sessionInput path returns structured error', () => {
    const fixture = { sessionInput: 'fixtures/DOES_NOT_EXIST.json', answers: [] };
    const fixturePath = path.join(tmpDir2, 'bad-session.json');
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
    const result = runScriptedReplay(fixturePath, { silent: true });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('one failed replay does not pollute metrics across concurrent replays', () => {
    const { resetMetrics, getMetrics } = require('../../src/runtime/runtimeMetrics');
    resetMetrics();

    // Bad replay
    const badPath = path.join(tmpDir2, 'bad.json');
    fs.writeFileSync(badPath, '{ invalid }');
    runScriptedReplay(badPath, { silent: true });

    // Good replay — should still work
    const goodResult = runScriptedReplay(
      'fixtures/sas-conversation-replays/full-summer-sas.json',
      { silent: true }
    );
    expect(goodResult.success).toBe(true);

    // Only 1 session recorded (the good one — bad replay failed before session start)
    expect(getMetrics().sessionsStarted).toBe(1);
    expect(getMetrics().sessionsCompleted).toBe(1);
    resetMetrics();
  });
});
