'use strict';

const path = require('path');
const fs   = require('fs');
const sessionManager = require('../../src/services/sessionManager');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_PARSER_RESULT = {
  document: {
    globalSettings: { catalogId: 'siteCatalog_ToryUS', excludedCategoryIds: [], excludedProductOptionIds: [] },
    promotion: {
      id: 'test-promo', name: 'Test', ruleType: 'product', discountConditionType: 'product-amount',
      exclusivity: 'class', lifecycle: { enabled: true, archived: false, searchable: true, refinable: true, preventRequalifying: false, prorateAcrossEligibleItems: false },
      discounts: [{ threshold: 0, discountType: 'percentage', discountValue: 20 }],
      qualifyingProducts: { conditionGroups: [] },
      customAttributes: { gwp: false, isExcludeTranslate: false },
    },
  },
  confidence: 0.85,
  clarificationRequired: true,
  clarificationQuestions: [{ field: 'schedule', severity: 'recommended', question: 'When?' }],
  warnings: [],
};

const COMPLETE_PARSER_RESULT = {
  ...MOCK_PARSER_RESULT,
  clarificationRequired: false,
  clarificationQuestions: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sessionManager', () => {

  let sessionId;

  afterEach(() => {
    // Cleanup created sessions
    if (sessionId) {
      sessionManager.deleteSession(sessionId);
      sessionId = null;
    }
  });

  describe('createSession', () => {
    test('creates a session and returns it', () => {
      const session = sessionManager.createSession('20% off shoes', MOCK_PARSER_RESULT);
      sessionId = session.sessionId;
      expect(session.sessionId).toBeTruthy();
      expect(session.originalIntent).toBe('20% off shoes');
      expect(session.status).toBe('active');
    });

    test('session with no clarification required → status complete', () => {
      const session = sessionManager.createSession('20% off shoes', COMPLETE_PARSER_RESULT);
      sessionId = session.sessionId;
      expect(session.status).toBe('complete');
    });

    test('session includes createdAt, updatedAt, expiresAt', () => {
      const session = sessionManager.createSession('test', MOCK_PARSER_RESULT);
      sessionId = session.sessionId;
      expect(session.createdAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();
      expect(session.expiresAt).toBeTruthy();
    });

    test('conversationId option is stored', () => {
      const session = sessionManager.createSession('test', MOCK_PARSER_RESULT, { conversationId: 'conv-123' });
      sessionId = session.sessionId;
      expect(session.conversationId).toBe('conv-123');
    });
  });

  describe('getSession', () => {
    test('returns created session by ID', () => {
      const created = sessionManager.createSession('test', MOCK_PARSER_RESULT);
      sessionId = created.sessionId;
      const retrieved = sessionManager.getSession(sessionId);
      expect(retrieved.sessionId).toBe(sessionId);
    });

    test('returns null for unknown session ID', () => {
      expect(sessionManager.getSession('does-not-exist-abc123')).toBeNull();
    });
  });

  describe('applyAnswer', () => {
    test('appends to clarificationHistory', () => {
      const session = sessionManager.createSession('test', MOCK_PARSER_RESULT);
      sessionId = session.sessionId;
      const updated = sessionManager.applyAnswer(sessionId, 'schedule', 'When?', 'in July');
      expect(updated.clarificationHistory).toHaveLength(1);
      expect(updated.clarificationHistory[0].answer).toBe('in July');
    });

    test('augments currentIntent with answer', () => {
      const session = sessionManager.createSession('test intent', MOCK_PARSER_RESULT);
      sessionId = session.sessionId;
      const updated = sessionManager.applyAnswer(sessionId, 'schedule', 'When?', 'in July');
      expect(updated.currentIntent).toContain('test intent');
      expect(updated.currentIntent).toContain('in July');
    });

    test('adds field to resolvedFields', () => {
      const session = sessionManager.createSession('test', MOCK_PARSER_RESULT);
      sessionId = session.sessionId;
      const updated = sessionManager.applyAnswer(sessionId, 'schedule', 'When?', 'in July');
      expect(updated.resolvedFields).toContain('schedule');
    });

    test('updates status from parser result', () => {
      const session = sessionManager.createSession('test', MOCK_PARSER_RESULT);
      sessionId = session.sessionId;
      const updated = sessionManager.applyAnswer(sessionId, 'schedule', 'When?', 'in July', COMPLETE_PARSER_RESULT);
      expect(updated.status).toBe('complete');
    });

    test('returns null for non-existent session', () => {
      const result = sessionManager.applyAnswer('non-existent', 'f', 'q', 'a');
      expect(result).toBeNull();
    });
  });

  describe('completeSession', () => {
    test('marks session as complete', () => {
      const session = sessionManager.createSession('test', MOCK_PARSER_RESULT);
      sessionId = session.sessionId;
      const completed = sessionManager.completeSession(sessionId);
      expect(completed.status).toBe('complete');
    });

    test('returns null for non-existent session', () => {
      expect(sessionManager.completeSession('no-such-session')).toBeNull();
    });
  });

  describe('deleteSession', () => {
    test('deletes session file', () => {
      const session = sessionManager.createSession('test', MOCK_PARSER_RESULT);
      sessionId = session.sessionId;
      sessionManager.deleteSession(sessionId);
      expect(sessionManager.getSession(sessionId)).toBeNull();
      sessionId = null;
    });
  });

  describe('listSessions', () => {
    test('returns an array', () => {
      const sessions = sessionManager.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });
  });
});
