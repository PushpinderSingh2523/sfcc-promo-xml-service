'use strict';

/**
 * sessionController.js
 *
 * Handles POST /clarify — multi-turn conversational promotion clarification.
 *
 * Flow per call:
 *   1. Load session → verify active
 *   2. Identify which field the answer resolves
 *   3. Re-parse with augmented intent
 *   4a. Still incomplete → return next question (no validation, no XML)
 *   4b. Complete → validate → generate XML → return result
 *       If validation fails after completion → return validationFailed: true,
 *       completed: true, xml: null (Copilot shows an error, not an infinite loop)
 */

const { v4: uuidv4 } = require('uuid');
const claudeService        = require('../services/claudeService');
const xmlServiceV2         = require('../services/xmlServiceV2');
const validationService    = require('../services/validationService');
const questionFlowService  = require('../services/questionFlowService');
const sessionManager       = require('../services/sessionManager');
const promotionSummaryService = require('../services/promotionSummaryService');
const logger               = require('../utils/logger');

// ─── POST /clarify ────────────────────────────────────────────────────────────

async function clarify(req, res, next) {
  const requestId = uuidv4();
  const { sessionId, answer, correlationId } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({
      success: false, error: 'Bad Request',
      message: 'Field "sessionId" is required.', requestId,
    });
  }
  if (!answer || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({
      success: false, error: 'Bad Request',
      message: 'Field "answer" is required and must be a non-empty string.', requestId,
    });
  }

  try {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false, error: 'Not Found',
        message: `Session "${sessionId}" not found. It may have expired (TTL: 2 hours) or never existed.`,
        requestId,
      });
    }
    if (session.status === 'expired') {
      return res.status(410).json({
        success: false, error: 'Gone',
        message: `Session "${sessionId}" has expired. Please start a new session with POST /generate.`,
        requestId,
      });
    }
    if (session.status === 'complete') {
      return res.status(200).json({
        success: true, requestId, sessionId,
        completed:          true,
        message:            'This session is already complete.',
        nextQuestion:       null,
        nextQuestionText:   '',
        nextQuestionHint:   '',
        nextQuestionFieldId: '',
        questionsRemaining: 0,
        normalizedDocument: session.partialDocument,
      });
    }

    // Identify the field being answered from the pending questions
    const flowState       = questionFlowService.buildFlowState({
      clarificationRequired: true,
      clarificationQuestions: session.pendingQuestions || [],
    });
    const answeredField    = flowState.nextQuestion?.fieldId || 'unknown';
    const answeredQuestion = flowState.nextQuestion?.text    || '';

    logger.info('Clarification answer received', {
      requestId, sessionId, field: answeredField, answerLen: answer.trim().length,
    });

    // Re-parse with the accumulated intent + new answer
    const augmentedIntent = `${session.currentIntent.trim()}. ${answer.trim()}`;
    const parserResult    = await claudeService.parseIntent(augmentedIntent, {});

    // Persist answer + updated parser result to session
    const updatedSession = sessionManager.applyAnswer(
      sessionId, answeredField, answeredQuestion, answer.trim(), parserResult
    );

    const newFlowState = questionFlowService.buildFlowState(parserResult);
    const completed    = !parserResult.clarificationRequired;
    const summary      = promotionSummaryService.generateSummary(parserResult.document);

    // ── Still incomplete → return next question, no validation ────────────────
    if (!completed) {
      return res.status(200).json({
        success:               true,
        requestId,
        correlationId:         correlationId || updatedSession?.conversationId,
        sessionId,
        completed:             false,
        validationFailed:      false,
        nextQuestion:          newFlowState.nextQuestion,
        nextQuestionText:      newFlowState.nextQuestion?.text    || '',
        nextQuestionHint:      newFlowState.nextQuestion?.hint    || '',
        nextQuestionFieldId:   newFlowState.nextQuestion?.fieldId || '',
        questionsRemaining:    newFlowState.totalQuestionsRemaining,
        criticalRemaining:     newFlowState.criticalQuestionsRemaining,
        missingFields:         (parserResult.clarificationQuestions || []).map(q => q.field),
        confidence:            parserResult.confidence,
        normalizedDocument:    parserResult.document,
        xml:                   null,
        summary,
        warnings:              parserResult.warnings || [],
        clarificationHistory:  updatedSession?.clarificationHistory || [],
      });
    }

    // ── Complete — now validate ───────────────────────────────────────────────
    logger.info('Clarification complete — validating document', { requestId, sessionId });
    const docValidation = validationService.validateDocument(parserResult.document);

    if (!docValidation.valid) {
      // Structural validation failed even after all answers were collected.
      // Return completed: true so Copilot Studio does not loop into more questions,
      // but set xml: null and surface the errors so the UI can show a clear message.
      logger.warn('Document validation failed after clarification completion', {
        requestId, sessionId, errors: docValidation.errors,
      });
      return res.status(200).json({
        success:               true,
        requestId,
        correlationId:         correlationId || updatedSession?.conversationId,
        sessionId,
        completed:             true,
        validationFailed:      true,
        validationErrors:      docValidation.errors,
        nextQuestion:          null,
        nextQuestionText:      '',
        nextQuestionHint:      '',
        nextQuestionFieldId:   '',
        questionsRemaining:    0,
        missingFields:         [],
        confidence:            parserResult.confidence,
        normalizedDocument:    parserResult.document,
        xml:                   null,
        summary,
        warnings:              parserResult.warnings || [],
        clarificationHistory:  updatedSession?.clarificationHistory || [],
      });
    }

    // ── Validation passed → generate XML ──────────────────────────────────────
    let xml = null;
    let xmlValidation = null;
    try {
      xml = xmlServiceV2.buildDocument(parserResult.document);
      xmlValidation = validationService.validateXml(xml);
      sessionManager.completeSession(sessionId, parserResult.document);
      logger.info('Session completed — XML generated', { requestId, sessionId, bytes: xml.length });
    } catch (xmlErr) {
      logger.warn('XML generation failed after clarification', { requestId, sessionId, error: xmlErr.message });
      xmlValidation = { valid: false, errors: [{ field: 'xml', message: xmlErr.message }] };
    }

    return res.status(200).json({
      success:               true,
      requestId,
      correlationId:         correlationId || updatedSession?.conversationId,
      sessionId,
      completed:             true,
      validationFailed:      false,
      validationErrors:      [],
      nextQuestion:          null,
      nextQuestionText:      '',
      nextQuestionHint:      '',
      nextQuestionFieldId:   '',
      questionsRemaining:    0,
      missingFields:         [],
      confidence:            parserResult.confidence,
      normalizedDocument:    parserResult.document,
      xml:                   xml || null,
      xmlValidation,
      summary,
      warnings:              parserResult.warnings || [],
      clarificationHistory:  updatedSession?.clarificationHistory || [],
    });

  } catch (err) {
    next(err);
  }
}

module.exports = { clarify };
