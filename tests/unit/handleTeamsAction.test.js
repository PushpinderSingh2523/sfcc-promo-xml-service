'use strict';

const path = require('path');
const fs   = require('fs');

const { handleTeamsAction, ACTIONS } = require('../../src/teams/runtime/handleTeamsAction');
const { _reset }                     = require('../../src/teams/runtime/sessionStore');
const { extractSASBlueprint }        = require('../../src/blueprints/extractors/extractSASBlueprint');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const XML_PATH = path.resolve(__dirname, '../fixtures/Summer_SAS.xml');
const RAW_XML  = fs.readFileSync(XML_PATH, 'utf8');

function makeBlueprint() {
  return extractSASBlueprint(RAW_XML, {
    blueprintId: 'bp-handle-test',
    extractedAt: '2026-01-01T00:00:00.000Z',
  });
}

beforeEach(() => _reset());

// ─── ACTIONS constants ────────────────────────────────────────────────────────

describe('ACTIONS', () => {
  test('ACTIONS is frozen', () => {
    expect(Object.isFrozen(ACTIONS)).toBe(true);
  });
  test('contains all 5 supported actions', () => {
    ['START_SAS_SESSION', 'SUBMIT_ANSWER', 'REQUEST_REVIEW', 'CONFIRM_GENERATION', 'CANCEL_SESSION']
      .forEach(a => expect(ACTIONS[a]).toBe(a));
  });
});

// ─── Payload validation ───────────────────────────────────────────────────────

describe('handleTeamsAction — payload validation', () => {
  test('returns error when payload is null', () => {
    const r = handleTeamsAction(null);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/payload must be/);
  });

  test('returns error when action is missing', () => {
    const r = handleTeamsAction({});
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/payload.action/);
  });

  test('returns error for unsupported action', () => {
    const r = handleTeamsAction({ action: 'UNKNOWN_ACTION' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unsupported action/);
  });
});

// ─── START_SAS_SESSION ────────────────────────────────────────────────────────

describe('handleTeamsAction — START_SAS_SESSION', () => {
  test('returns success:true', () => {
    const r = handleTeamsAction({
      action:    ACTIONS.START_SAS_SESSION,
      xml:       RAW_XML,
      sessionId: 'ha-start-001',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  test('returns a sessionId', () => {
    const r = handleTeamsAction({
      action:    ACTIONS.START_SAS_SESSION,
      xml:       RAW_XML,
      sessionId: 'ha-start-002',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(r.sessionId).toBe('ha-start-002');
  });

  test('returns a card', () => {
    const r = handleTeamsAction({
      action: ACTIONS.START_SAS_SESSION,
      xml:    RAW_XML,
    });
    expect(r.card).not.toBeNull();
    expect(r.card.type).toBe('AdaptiveCard');
  });

  test('first card is a question card (has fieldValue input)', () => {
    const r = handleTeamsAction({
      action:    ACTIONS.START_SAS_SESSION,
      xml:       RAW_XML,
      sessionId: 'ha-start-003',
    });
    const hasInput = r.card.body.some(b => b.id === 'fieldValue' || b.type === 'Input.Text' || b.type === 'Input.ChoiceSet');
    expect(hasInput).toBe(true);
  });

  test('returns error when xml is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.START_SAS_SESSION });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/xml must be/);
  });

  test('action is echoed back in response', () => {
    const r = handleTeamsAction({
      action: ACTIONS.START_SAS_SESSION,
      xml:    RAW_XML,
    });
    expect(r.action).toBe(ACTIONS.START_SAS_SESSION);
  });

  test('artifact is null (no XML generated at start)', () => {
    const r = handleTeamsAction({
      action: ACTIONS.START_SAS_SESSION,
      xml:    RAW_XML,
    });
    expect(r.artifact).toBeNull();
  });
});

// ─── SUBMIT_ANSWER ────────────────────────────────────────────────────────────

describe('handleTeamsAction — SUBMIT_ANSWER validation', () => {
  test('returns error when sessionId is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.SUBMIT_ANSWER, blueprint: makeBlueprint() });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/sessionId is required/);
  });

  test('returns error when blueprint is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.SUBMIT_ANSWER, sessionId: 'x' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/blueprint is required/);
  });

  test('returns error when fieldKey is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.SUBMIT_ANSWER, sessionId: 'x', blueprint: makeBlueprint() });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/fieldKey is required/);
  });

  test('returns error when session not found', () => {
    const r = handleTeamsAction({
      action:    ACTIONS.SUBMIT_ANSWER,
      sessionId: 'nonexistent',
      blueprint: makeBlueprint(),
      fieldKey:  'campaignId::campaign::_::_',
      rawAnswer: '2026_SUMMER_SAS',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not found/);
  });
});

describe('handleTeamsAction — SUBMIT_ANSWER flow', () => {
  let sessionId, blueprint;

  beforeEach(() => {
    _reset();
    blueprint = makeBlueprint();
    const startResult = handleTeamsAction({
      action:    ACTIONS.START_SAS_SESSION,
      xml:       RAW_XML,
      sessionId: 'ha-submit-001',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    sessionId = startResult.sessionId;
  });

  test('valid answer returns success:true', () => {
    const r = handleTeamsAction({
      action:    ACTIONS.SUBMIT_ANSWER,
      sessionId,
      blueprint,
      fieldKey:  'campaignId::campaign::_::_',
      rawAnswer: '2026_SUMMER_SAS',
      answeredAt: '2026-01-01T00:01:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  test('valid answer returns a next question card', () => {
    const r = handleTeamsAction({
      action:    ACTIONS.SUBMIT_ANSWER,
      sessionId,
      blueprint,
      fieldKey:  'campaignId::campaign::_::_',
      rawAnswer: '2026_SUMMER_SAS',
      answeredAt: '2026-01-01T00:01:00.000Z',
    });
    expect(r.card).not.toBeNull();
    expect(r.card.type).toBe('AdaptiveCard');
  });

  test('invalid answer returns success:true with a retry card', () => {
    const r = handleTeamsAction({
      action:    ACTIONS.SUBMIT_ANSWER,
      sessionId,
      blueprint,
      fieldKey:  'campaignId::campaign::_::_',
      rawAnswer: '',  // empty — should fail required validation
      answeredAt: '2026-01-01T00:01:00.000Z',
    });
    // Invalid answer is still processed successfully — returns a retry question card
    expect(r.success).toBe(true);
    expect(r.card.type).toBe('AdaptiveCard');
  });
});

// ─── REQUEST_REVIEW ───────────────────────────────────────────────────────────

describe('handleTeamsAction — REQUEST_REVIEW', () => {
  let sessionId;

  beforeEach(() => {
    _reset();
    const r = handleTeamsAction({
      action:    ACTIONS.START_SAS_SESSION,
      xml:       RAW_XML,
      sessionId: 'ha-review-001',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    sessionId = r.sessionId;
  });

  test('returns success:true', () => {
    const r = handleTeamsAction({ action: ACTIONS.REQUEST_REVIEW, sessionId });
    expect(r.success).toBe(true);
  });

  test('returns a review card', () => {
    const r = handleTeamsAction({ action: ACTIONS.REQUEST_REVIEW, sessionId });
    const cardStr = JSON.stringify(r.card);
    expect(cardStr).toContain('Review Changes');
  });

  test('returns error when sessionId is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.REQUEST_REVIEW });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/sessionId is required/);
  });
});

// ─── CANCEL_SESSION ───────────────────────────────────────────────────────────

describe('handleTeamsAction — CANCEL_SESSION', () => {
  let sessionId, blueprint;

  beforeEach(() => {
    _reset();
    blueprint = makeBlueprint();
    const r = handleTeamsAction({
      action:    ACTIONS.START_SAS_SESSION,
      xml:       RAW_XML,
      sessionId: 'ha-cancel-001',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    sessionId = r.sessionId;
  });

  test('returns success:true', () => {
    const r = handleTeamsAction({ action: ACTIONS.CANCEL_SESSION, sessionId, blueprint });
    expect(r.success).toBe(true);
  });

  test('returns a completion card', () => {
    const r = handleTeamsAction({ action: ACTIONS.CANCEL_SESSION, sessionId, blueprint });
    const cardStr = JSON.stringify(r.card);
    expect(cardStr).toContain('CANCELLED');
  });

  test('returns error when sessionId is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.CANCEL_SESSION, blueprint });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/sessionId is required/);
  });

  test('returns error when blueprint is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.CANCEL_SESSION, sessionId });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/blueprint is required/);
  });
});

// ─── CONFIRM_GENERATION validation ───────────────────────────────────────────

describe('handleTeamsAction — CONFIRM_GENERATION validation', () => {
  test('returns error when sessionId is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.CONFIRM_GENERATION, blueprint: makeBlueprint() });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/sessionId is required/);
  });

  test('returns error when blueprint is missing', () => {
    const r = handleTeamsAction({ action: ACTIONS.CONFIRM_GENERATION, sessionId: 'x' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/blueprint is required/);
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe('handleTeamsAction — response shape', () => {
  test('all responses have success, action, sessionId, card, artifact, error', () => {
    const r = handleTeamsAction({ action: ACTIONS.START_SAS_SESSION, xml: RAW_XML });
    ['success', 'action', 'sessionId', 'card', 'artifact', 'error'].forEach(f => {
      expect(r).toHaveProperty(f);
    });
  });

  test('error response has success:false and error string', () => {
    const r = handleTeamsAction(null);
    expect(r.success).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.card).toBeNull();
  });
});
