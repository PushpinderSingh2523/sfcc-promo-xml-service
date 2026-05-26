'use strict';

/**
 * localHarness.test.js
 *
 * Integration tests for the local runtime harness (Phase 9).
 *
 * All tests exercise the scripted replay path (runScriptedReplay) because it
 * covers the complete lifecycle deterministically without requiring a TTY or
 * stdin.  The interactiveSession module is tested separately at the unit level.
 *
 * Scenarios:
 *   1. Full happy-path replay  — all 35 answers, replay passes, artifact generated
 *   2. Invalid answer skipped  — one bad answer produces a validationError entry
 *   3. Stop-on-error mode      — first bad answer aborts the run
 *   4. Missing fixture         — graceful error when fixture file does not exist
 *   5. Missing blueprint XML   — graceful error when blueprint path is wrong
 *   6. All replay-critical fields — campaignId and promotionIds present in answers
 *   7. Artifact shape          — filename / byteSize / sessionId present and valid
 *   8. Custom sessionId        — session ID override is propagated to artifact
 */

const path = require('path');
const fs   = require('fs');

const { runScriptedReplay } = require('../../src/runtime/scriptedReplay');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REPLAY_FIXTURE = 'fixtures/sas-conversation-replays/full-summer-sas.json';
const PROJECT_ROOT   = path.resolve(__dirname, '../..');

/** Load the replay fixture and patch it in-memory for test scenarios. */
function loadFixture() {
  return JSON.parse(
    fs.readFileSync(path.resolve(PROJECT_ROOT, REPLAY_FIXTURE), 'utf8')
  );
}

/** Write a temp fixture file for tests that need to modify the fixture. */
function writeTempFixture(data, name) {
  const tmpDir  = path.resolve(PROJECT_ROOT, 'logs/runtime');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.resolve(tmpDir, `_test_${name}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
  return tmpPath;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Local Runtime Harness — scripted replay integration', () => {

  // ── Scenario 1 ─────────────────────────────────────────────────────────────

  test('Scenario 1: Full happy-path replay — 35 answers, replay passes, artifact generated', () => {
    const result = runScriptedReplay(REPLAY_FIXTURE, { silent: true });

    expect(result.success).toBe(true);
    expect(result.answersSubmitted).toBe(35);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.error).toBeNull();

    // XML produced
    expect(result.xmlResult).toBeDefined();
    expect(result.xmlResult.success).toBe(true);
    expect(result.xmlResult.replaySuccessful).toBe(true);
    expect(typeof result.xmlResult.xmlContent).toBe('string');
    expect(result.xmlResult.xmlContent.length).toBeGreaterThan(100);
    expect(result.xmlResult.xmlContent).toContain('<promotions');

    // Artifact produced
    expect(result.artifact).toBeDefined();
    expect(result.artifact.filename).toMatch(/^SAS_/);
    expect(result.artifact.filename).toMatch(/\.xml$/);
    expect(result.artifact.byteSize).toBeGreaterThan(100);

    // Timing recorded
    expect(typeof result.timingMs).toBe('number');
    expect(result.timingMs).toBeGreaterThan(0);
  });

  // ── Scenario 2 ─────────────────────────────────────────────────────────────

  test('Scenario 2: Invalid answer does not abort — validationError recorded, run continues', () => {
    const fixture = loadFixture();

    // Inject an invalid campaignId (empty string violates minLength:1 and pattern)
    fixture.answers[0] = { key: 'campaignId::campaign::_::_', value: '' };

    const tmpPath = writeTempFixture(fixture, 'invalid-answer');
    const result  = runScriptedReplay(tmpPath, { silent: true, stopOnError: false });

    // The run continues despite the error
    expect(result.success).toBe(false);
    expect(result.validationErrors.length).toBeGreaterThanOrEqual(1);

    const campaignErr = result.validationErrors.find(
      e => e.key === 'campaignId::campaign::_::_'
    );
    expect(campaignErr).toBeDefined();
    expect(campaignErr.errors.length).toBeGreaterThan(0);
  });

  // ── Scenario 3 ─────────────────────────────────────────────────────────────

  test('Scenario 3: Stop-on-error mode aborts on first validation error', () => {
    const fixture = loadFixture();

    // Make the first answer invalid
    fixture.answers[0] = { key: 'campaignId::campaign::_::_', value: 'invalid campaign id with spaces!' };

    const tmpPath = writeTempFixture(fixture, 'stop-on-error');
    const result  = runScriptedReplay(tmpPath, { silent: true, stopOnError: true });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    // Aborted early — only 0 answers accepted (the bad one was rejected)
    expect(result.answersSubmitted).toBe(0);
    expect(result.artifact).toBeNull();
  });

  // ── Scenario 4 ─────────────────────────────────────────────────────────────

  test('Scenario 4: Missing replay fixture returns graceful error', () => {
    const result = runScriptedReplay(
      'fixtures/sas-conversation-replays/DOES_NOT_EXIST.json',
      { silent: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fixture|not found|ENOENT/i);
    expect(result.artifact).toBeNull();
    expect(result.answersSubmitted).toBe(0);
  });

  // ── Scenario 5 ─────────────────────────────────────────────────────────────

  test('Scenario 5: Blueprint XML path not found returns graceful error', () => {
    const fixture = loadFixture();

    // Point to a non-existent XML file
    const sessionInputFixture = JSON.parse(
      fs.readFileSync(
        path.resolve(PROJECT_ROOT, fixture.sessionInput), 'utf8'
      )
    );
    const badSessionInput = {
      ...sessionInputFixture,
      blueprintXmlPath: 'tests/fixtures/DOES_NOT_EXIST.xml',
    };
    const badSessionInputPath = writeTempFixture(badSessionInput, 'bad-xml-path');

    const badReplayFixture = { ...fixture, sessionInput: badSessionInputPath };
    const tmpPath = writeTempFixture(badReplayFixture, 'bad-blueprint');

    const result = runScriptedReplay(tmpPath, { silent: true });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/blueprint|not found|ENOENT/i);
    expect(result.artifact).toBeNull();
  });

  // ── Scenario 6 ─────────────────────────────────────────────────────────────

  test('Scenario 6: All replay-critical answer keys are present in fixture', () => {
    const fixture = loadFixture();
    const keys    = fixture.answers.map(a => a.key);

    // These are the replay-critical fields from Summer_SAS.xml
    const replayCriticalKeys = [
      'campaignId::campaign::_::_',
      'promotionId::promotion::0::_',
      'promotionId::promotion::1::_',
      'promotionId::promotion::2::_',
      'promotionId::promotion::3::_',
    ];

    replayCriticalKeys.forEach(k => {
      expect(keys).toContain(k);
    });
  });

  // ── Scenario 7 ─────────────────────────────────────────────────────────────

  test('Scenario 7: Artifact has correct shape — filename, byteSize, sessionId, blueprintId', () => {
    const result = runScriptedReplay(REPLAY_FIXTURE, { silent: true });

    expect(result.success).toBe(true);
    const art = result.artifact;

    expect(typeof art.filename).toBe('string');
    expect(art.filename.length).toBeGreaterThan(0);
    expect(art.filename).toMatch(/\.xml$/);

    expect(typeof art.byteSize).toBe('number');
    expect(art.byteSize).toBeGreaterThan(0);

    expect(typeof art.sessionId).toBe('string');
    expect(art.sessionId.length).toBeGreaterThan(0);

    expect(typeof art.blueprintId).toBe('string');
    expect(art.blueprintId.length).toBeGreaterThan(0);

    expect(typeof art.generatedAt).toBe('string');
    expect(art.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // xmlContent is also present in artifact
    expect(typeof art.xmlContent).toBe('string');
    expect(art.xmlContent.length).toBeGreaterThan(0);
  });

  // ── Scenario 8 ─────────────────────────────────────────────────────────────

  test('Scenario 8: Custom sessionId is propagated through to artifact and log', () => {
    const customId = 'harness-test-session-12345';
    const result = runScriptedReplay(REPLAY_FIXTURE, {
      sessionId: customId,
      silent:    true,
    });

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe(customId);
    expect(result.artifact.sessionId).toBe(customId);
  });

  // ── Supporting assertion: campaignId reflected in XML ─────────────────────

  test('Campaign ID from fixture appears in generated XML output', () => {
    const result = runScriptedReplay(REPLAY_FIXTURE, { silent: true });

    expect(result.success).toBe(true);
    // The fixture sets campaignId to "2026_SUMMER_SAS"
    expect(result.xmlResult.xmlContent).toContain('2026_SUMMER_SAS');
  });

  // ── Supporting assertion: all promotion IDs reflected in XML ──────────────

  test('Promotion IDs from fixture appear in generated XML output', () => {
    const result = runScriptedReplay(REPLAY_FIXTURE, { silent: true });

    expect(result.success).toBe(true);
    const xml = result.xmlResult.xmlContent;

    expect(xml).toContain('2026-SUMMER-SAS-APPEASEMENT');
    expect(xml).toContain('2026_SUMMER_SAS');
    expect(xml).toContain('2026_Summer_SAS_BB50OFF');
    expect(xml).toContain('2026_Summer_SAS_WebApp');
  });

});
