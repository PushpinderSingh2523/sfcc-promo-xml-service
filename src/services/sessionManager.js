'use strict';

/**
 * sessionManager.js
 *
 * File-backed session store for multi-turn conversational promotion workflows.
 * Each session persists a partial PromotionDocumentV2 across /clarify calls.
 *
 * Session shape:
 * {
 *   sessionId: string,
 *   conversationId: string,   // outer correlation (e.g. Teams thread ID)
 *   createdAt: ISO string,
 *   updatedAt: ISO string,
 *   expiresAt: ISO string,    // TTL-based expiry (default 2 hours)
 *   originalIntent: string,
 *   currentIntent: string,    // grows as user answers questions
 *   partialDocument: PromotionDocumentV2 | null,
 *   clarificationHistory: Array<{field, question, answer, timestamp}>,
 *   resolvedFields: string[],
 *   status: 'active' | 'complete' | 'expired',
 *   metadata: object,
 * }
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const SESSIONS_DIR  = path.join(__dirname, '../../runtime/sessions');
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─── Storage helpers ──────────────────────────────────────────────────────────

function _sessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function _write(session) {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(_sessionPath(session.sessionId), JSON.stringify(session, null, 2), 'utf8');
}

function _read(sessionId) {
  const p = _sessionPath(sessionId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new session from an initial parser result.
 *
 * @param {string} originalIntent
 * @param {object} parserResult   — return value of claudeService.parseIntent()
 * @param {object} [opts]
 * @param {string} [opts.conversationId]
 * @param {object} [opts.metadata]
 * @returns {object} session
 */
function createSession(originalIntent, parserResult, opts = {}) {
  const now = new Date();
  const session = {
    sessionId:     uuidv4(),
    conversationId: opts.conversationId || uuidv4(),
    createdAt:     now.toISOString(),
    updatedAt:     now.toISOString(),
    expiresAt:     new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    originalIntent,
    currentIntent:  originalIntent,
    partialDocument: parserResult.document || null,
    clarificationHistory: [],
    resolvedFields: [],
    pendingQuestions: parserResult.clarificationQuestions || [],
    status: parserResult.clarificationRequired ? 'active' : 'complete',
    confidence: parserResult.confidence,
    warnings: parserResult.warnings || [],
    metadata: opts.metadata || {},
  };
  _write(session);
  return session;
}

/**
 * Load a session by ID. Returns null if not found or expired.
 *
 * @param {string} sessionId
 * @returns {object|null}
 */
function getSession(sessionId) {
  const session = _read(sessionId);
  if (!session) return null;
  if (session.status === 'expired') return session;
  if (new Date() > new Date(session.expiresAt)) {
    session.status = 'expired';
    _write(session);
    return session;
  }
  return session;
}

/**
 * Apply a user answer to a session and update the current intent.
 *
 * @param {string} sessionId
 * @param {string} field      — which field was answered (matches question fieldId)
 * @param {string} question   — the question text that was asked
 * @param {string} answer     — the user's text answer
 * @param {object} [newParserResult] — optional updated parser result after re-parsing
 * @returns {object|null} updated session, or null if not found/expired
 */
function applyAnswer(sessionId, field, question, answer, newParserResult = null) {
  const session = getSession(sessionId);
  if (!session || session.status === 'expired') return null;

  const now = new Date().toISOString();

  // Append answer to history
  session.clarificationHistory.push({ field, question, answer, timestamp: now });

  // Track resolved field
  if (!session.resolvedFields.includes(field)) {
    session.resolvedFields.push(field);
  }

  // Grow intent string
  session.currentIntent = `${session.currentIntent.trim()}. ${answer.trim()}`;
  session.updatedAt = now;

  // Apply updated parser result if provided
  if (newParserResult) {
    session.partialDocument  = newParserResult.document || session.partialDocument;
    session.pendingQuestions = newParserResult.clarificationQuestions || [];
    session.confidence       = newParserResult.confidence;
    session.warnings         = newParserResult.warnings || [];
    session.status           = newParserResult.clarificationRequired ? 'active' : 'complete';
  }

  _write(session);
  return session;
}

/**
 * Mark a session as complete (XML generated successfully).
 *
 * @param {string} sessionId
 * @param {object} [finalDocument]
 * @returns {object|null}
 */
function completeSession(sessionId, finalDocument = null) {
  const session = getSession(sessionId);
  if (!session) return null;
  session.status = 'complete';
  session.updatedAt = new Date().toISOString();
  if (finalDocument) session.partialDocument = finalDocument;
  _write(session);
  return session;
}

/**
 * Delete a session file.
 *
 * @param {string} sessionId
 */
function deleteSession(sessionId) {
  const p = _sessionPath(sessionId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/**
 * List all active sessions (for admin/debug only).
 *
 * @returns {object[]}
 */
function listSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

module.exports = { createSession, getSession, applyAnswer, completeSession, deleteSession, listSessions };
