'use strict';

const path = require('path');
const fs   = require('fs');

const { generateReplaySafeXML, _internals } = require('../../src/teams/runtime/generateReplaySafeXML');
const { resolveCampaignId }                 = _internals;
const { extractSASBlueprint }               = require('../../src/blueprints/extractors/extractSASBlueprint');
const { createBlueprintSession }            = require('../../src/blueprints/session/createBlueprintSession');
const { collectAnswer }                     = require('../../src/blueprints/session/collectAnswer');
const { getNextQuestion }                   = require('../../src/blueprints/session/getNextQuestion');
const { STATUS }                            = require('../../src/blueprints/session/updateBlueprintSession');
const { buildAnswerKey }                    = require('../../src/blueprints/session/buildQuestionQueue');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const XML_PATH = path.resolve(__dirname, '../fixtures/Summer_SAS.xml');
const RAW_XML  = fs.readFileSync(XML_PATH, 'utf8');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function answerAll(session) {
  let s = session;
  let next = getNextQuestion(s);
  while (next) {
    const raw = next.currentValue !== undefined ? next.currentValue : null;
    const { session: updated } = collectAnswer(s, next.key, raw);
    s    = updated;
    next = getNextQuestion(s);
  }
  return s;
}

function makeMinimalBlueprint() {
  return extractSASBlueprint(RAW_XML, {
    blueprintId:  'test-bp-gen',
    extractedAt:  '2026-01-01T00:00:00.000Z',
  });
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('generateReplaySafeXML — input validation', () => {
  test('throws when session is null', () => {
    expect(() => generateReplaySafeXML(null, {})).toThrow('session must be a non-null object');
  });
  test('throws when blueprint is null', () => {
    const bp = makeMinimalBlueprint();
    const session = createBlueprintSession(bp, { sessionId: 'x', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(() => generateReplaySafeXML(session, null)).toThrow('blueprint must be a non-null object');
  });
});

// ─── Status guard ─────────────────────────────────────────────────────────────

describe('generateReplaySafeXML — status guard', () => {
  let bp, freshSession;

  beforeAll(() => {
    bp           = makeMinimalBlueprint();
    freshSession = createBlueprintSession(bp, { sessionId: 'guard-test', createdAt: '2026-01-01T00:00:00.000Z' });
  });

  test('returns success:false when session is IN_PROGRESS', () => {
    const result = generateReplaySafeXML(freshSession, bp);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/COMPLETE/);
  });

  test('xmlContent is null when blocked', () => {
    const result = generateReplaySafeXML(freshSession, bp);
    expect(result.xmlContent).toBeNull();
  });

  test('replaySuccessful is false when blocked', () => {
    const result = generateReplaySafeXML(freshSession, bp);
    expect(result.replaySuccessful).toBe(false);
  });
});

// ─── Successful generation ────────────────────────────────────────────────────

describe('generateReplaySafeXML — successful generation', () => {
  let bp, completedSession, result;

  beforeAll(() => {
    bp               = makeMinimalBlueprint();
    const rawSession = createBlueprintSession(bp, { sessionId: 'gen-success', createdAt: '2026-01-01T00:00:00.000Z' });
    completedSession = answerAll(rawSession);
    result           = generateReplaySafeXML(completedSession, bp);
  });

  test('session status is COMPLETE', () => {
    expect(completedSession.status).toBe(STATUS.COMPLETE);
  });

  test('result.success is true', () => {
    expect(result.success).toBe(true);
  });

  test('xmlContent is a non-empty string', () => {
    expect(typeof result.xmlContent).toBe('string');
    expect(result.xmlContent.length).toBeGreaterThan(0);
  });

  test('xmlContent starts with XML declaration', () => {
    expect(result.xmlContent).toMatch(/^<\?xml/);
  });

  test('replaySuccessful is true', () => {
    expect(result.replaySuccessful).toBe(true);
  });

  test('structuralDifferences is empty array', () => {
    expect(result.structuralDifferences).toHaveLength(0);
  });

  test('error is null', () => {
    expect(result.error).toBeNull();
  });

  test('campaignId is resolved from session answers', () => {
    expect(typeof result.campaignId).toBe('string');
    expect(result.campaignId.length).toBeGreaterThan(0);
  });

  test('xmlContent contains the promotions root element', () => {
    expect(result.xmlContent).toContain('<promotions');
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('generateReplaySafeXML — determinism', () => {
  test('same session + blueprint produces identical XML twice', () => {
    const bp      = makeMinimalBlueprint();
    const session = answerAll(
      createBlueprintSession(bp, { sessionId: 'det-test', createdAt: '2026-01-01T00:00:00.000Z' })
    );
    const r1 = generateReplaySafeXML(session, bp);
    const r2 = generateReplaySafeXML(session, bp);
    expect(r1.xmlContent).toBe(r2.xmlContent);
  });
});

// ─── resolveCampaignId ────────────────────────────────────────────────────────

describe('resolveCampaignId', () => {
  test('returns answered campaignId when present', () => {
    const bp  = makeMinimalBlueprint();
    const key = buildAnswerKey('campaignId', 'campaign', null, null);
    const session = {
      answers: {
        [key]: { normalizedValue: 'MY_CAMPAIGN_2026' },
      },
    };
    expect(resolveCampaignId(session, bp)).toBe('MY_CAMPAIGN_2026');
  });

  test('falls back to blueprint campaignId when not answered', () => {
    const bp = makeMinimalBlueprint();
    const session = { answers: {} };
    const original = bp.campaignSlot.editableFields.campaignId;
    expect(resolveCampaignId(session, bp)).toBe(original);
  });

  test('returns UNKNOWN when neither source is available', () => {
    const bp = { campaignSlot: { editableFields: {} } };
    const session = { answers: {} };
    expect(resolveCampaignId(session, bp)).toBe('UNKNOWN');
  });
});

// ─── Mutation safety ──────────────────────────────────────────────────────────

describe('generateReplaySafeXML — mutation safety', () => {
  test('does NOT mutate session', () => {
    const bp      = makeMinimalBlueprint();
    const session = answerAll(
      createBlueprintSession(bp, { sessionId: 'mut-test', createdAt: '2026-01-01T00:00:00.000Z' })
    );
    const snapshot = JSON.stringify(session);
    generateReplaySafeXML(session, bp);
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  test('does NOT mutate blueprint', () => {
    const bp      = makeMinimalBlueprint();
    const session = answerAll(
      createBlueprintSession(bp, { sessionId: 'mut-bp-test', createdAt: '2026-01-01T00:00:00.000Z' })
    );
    const snapshot = JSON.stringify(bp);
    generateReplaySafeXML(session, bp);
    expect(JSON.stringify(bp)).toBe(snapshot);
  });
});
