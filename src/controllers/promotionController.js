'use strict';

const { v4: uuidv4 } = require('uuid');
const claudeService           = require('../services/claudeService');
const xmlServiceV2            = require('../services/xmlServiceV2');
const validationService       = require('../services/validationService');
const questionFlowService     = require('../services/questionFlowService');
const sessionManager          = require('../services/sessionManager');
const promotionSummaryService = require('../services/promotionSummaryService');
const logger                  = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract flat Copilot Studio-friendly fields from the next question object. */
function flatQuestion(nextQuestion) {
  return {
    nextQuestionText:    nextQuestion?.text    || '',
    nextQuestionHint:    nextQuestion?.hint    || '',
    nextQuestionFieldId: nextQuestion?.fieldId || '',
  };
}

/** Collect field IDs from clarification questions for the missingFields[] array. */
function missingFields(clarificationQuestions) {
  return (clarificationQuestions || []).map(q => q.field);
}

// ─── POST /generate ────────────────────────────────────────────────────────────
//
// Pipeline:
//
//   intent → parser → PromotionDocumentV2
//     │
//     ├─ clarificationRequired: true  (and forceGenerate not set)
//     │     → return 200 with nextQuestion + sessionId
//     │       NO validation, NO XML generation
//     │
//     └─ clarificationRequired: false  (or forceGenerate: true)
//           → validateDocument  →  422 on structural failure
//           → buildDocument     →  200 with XML
//
// 422 is reserved for structurally invalid *completed* documents.
// Conversational / incomplete documents always receive 200.

async function generate(req, res, next) {
  const requestId = uuidv4();
  const { intent, options = {}, correlationId, conversationId } = req.body;

  if (!intent || typeof intent !== 'string' || !intent.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Field "intent" is required and must be a non-empty string.',
      requestId,
    });
  }

  const t0 = Date.now();

  try {
    // ── 1. Parse ────────────────────────────────────────────────────────────
    logger.info('Parsing intent', { requestId, intent: intent.slice(0, 120) });
    const parserResult = await claudeService.parseIntent(intent, options);
    const parseMs = Date.now() - t0;

    logger.info('Parser result', {
      requestId,
      confidence:            parserResult.confidence,
      ruleType:              parserResult.document?.promotion?.ruleType,
      clarificationRequired: parserResult.clarificationRequired,
      source:                parserResult.source,
      warnings:              parserResult.warnings?.length,
    });

    if (parserResult.parserTrace) {
      Object.entries(parserResult.parserTrace).forEach(([name, info]) => {
        if (info?.matchedPatterns?.length) {
          logger.debug(`[trace:${name}]`, { patterns: info.matchedPatterns, confidence: info.confidence });
        }
      });
    }

    // ── 2. Build flow state + create session ────────────────────────────────
    const flowState = questionFlowService.buildFlowState(parserResult);
    const session   = sessionManager.createSession(intent, parserResult, { conversationId });
    const sessionId = session.sessionId;

    // ── 3. Clarification gate ───────────────────────────────────────────────
    // If the parser flagged missing fields, return the first question immediately.
    // Validation and XML generation are deferred until all answers are collected.
    // forceGenerate bypasses this gate (for testing/debugging only).
    if (parserResult.clarificationRequired && !options.forceGenerate) {
      const missing = missingFields(parserResult.clarificationQuestions);
      logger.info('Clarification required — deferring validation', {
        requestId, sessionId, missingFields: missing,
      });

      const summary = promotionSummaryService.generateSummary(parserResult.document);

      return res.status(200).json({
        success:               true,
        requestId,
        correlationId:         correlationId || null,
        sessionId,
        confidence:            parserResult.confidence,
        source:                parserResult.source,
        clarificationRequired: true,
        clarificationQuestions: parserResult.clarificationQuestions,
        nextQuestion:          flowState.nextQuestion,
        ...flatQuestion(flowState.nextQuestion),
        missingFields:         missing,
        warnings:              parserResult.warnings,
        summary,
        normalizedDocument:    parserResult.document,
        xml:                   null,
        validation: {
          document: { valid: null, skipped: true, reason: 'Validation deferred — clarification in progress' },
          xml:      null,
        },
        timing: { parseMs, totalMs: Date.now() - t0 },
      });
    }

    // ── 4. Validate document ────────────────────────────────────────────────
    // Only reached when the parser says the document is complete,
    // or when forceGenerate overrides the clarification gate.
    const t1 = Date.now();
    logger.info('Validating PromotionDocumentV2', { requestId });
    const docValidation = validationService.validateDocument(parserResult.document);
    const validateMs    = Date.now() - t1;

    if (!docValidation.valid) {
      logger.warn('Document validation failed', { requestId, errors: docValidation.errors });
      return res.status(422).json({
        success: false,
        requestId,
        error:   'Document Validation Failed',
        message: 'The completed promotion document does not match the PromotionDocumentV2 schema.',
        confidence:            parserResult.confidence,
        source:                parserResult.source,
        clarificationRequired: parserResult.clarificationRequired,
        clarificationQuestions: parserResult.clarificationQuestions,
        nextQuestion:          flowState.nextQuestion,
        ...flatQuestion(flowState.nextQuestion),
        missingFields:         missingFields(parserResult.clarificationQuestions),
        warnings:              parserResult.warnings,
        normalizedDocument:    parserResult.document,
        validation: {
          document: { valid: false, errors: docValidation.errors },
          xml:      null,
        },
        timing: { parseMs, validateMs },
      });
    }

    // ── 5. Generate XML ─────────────────────────────────────────────────────
    const t2 = Date.now();
    logger.info('Generating SFCC promotion XML (v2)', { requestId });
    let xml = null;
    let xmlValidation = { valid: true, errors: [] };

    try {
      xml = xmlServiceV2.buildDocument(parserResult.document);
      const xmlMs = Date.now() - t2;
      xmlValidation = validationService.validateXml(xml);
      logger.info('XML generated', { requestId, xmlMs, xmlValid: xmlValidation.valid, bytes: xml.length });
    } catch (xmlErr) {
      logger.warn('XML generation error', { requestId, error: xmlErr.message });
      xmlValidation = { valid: false, errors: [{ field: 'xml', message: xmlErr.message }] };
    }

    // ── 6. Respond ──────────────────────────────────────────────────────────
    const summary = promotionSummaryService.generateSummary(parserResult.document);

    res.status(200).json({
      success:               true,
      requestId,
      correlationId:         correlationId || null,
      sessionId,
      confidence:            parserResult.confidence,
      source:                parserResult.source,
      clarificationRequired: false,
      clarificationQuestions: [],
      nextQuestion:          null,
      ...flatQuestion(null),
      missingFields:         [],
      warnings:              parserResult.warnings,
      summary,
      normalizedDocument:    parserResult.document,
      xml:                   xml || null,
      validation: {
        document: { valid: true, errors: [] },
        xml:      xmlValidation,
      },
      timing: { parseMs, validateMs, totalMs: Date.now() - t0 },
    });

  } catch (err) {
    next(err);
  }
}

// ─── POST /validate ────────────────────────────────────────────────────────────

async function validate(req, res, next) {
  const requestId = uuidv4();
  const { xml, document: doc } = req.body;

  if (xml) {
    if (typeof xml !== 'string' || !xml.trim()) {
      return res.status(400).json({
        success: false, error: 'Bad Request',
        message: 'Field "xml" must be a non-empty string.', requestId,
      });
    }
    try {
      const result = validationService.validateXml(xml);
      return res.status(200).json({ success: true, requestId, valid: result.valid, errors: result.errors });
    } catch (err) {
      return next(err);
    }
  }

  if (doc) {
    try {
      const result = validationService.validateDocument(doc);
      return res.status(200).json({ success: true, requestId, valid: result.valid, errors: result.errors });
    } catch (err) {
      return next(err);
    }
  }

  return res.status(400).json({
    success: false, error: 'Bad Request',
    message: 'Provide either "xml" (string) or "document" (PromotionDocumentV2 object).',
    requestId,
  });
}

// ─── POST /parse ───────────────────────────────────────────────────────────────

async function parse(req, res, next) {
  const requestId = uuidv4();
  const { intent, options = {} } = req.body;

  if (!intent || typeof intent !== 'string' || !intent.trim()) {
    return res.status(400).json({
      success: false, error: 'Bad Request',
      message: 'Field "intent" is required and must be a non-empty string.', requestId,
    });
  }

  try {
    const parserResult   = await claudeService.parseIntent(intent, options);
    const flowState      = questionFlowService.buildFlowState(parserResult);
    // /parse reports validation state but never blocks on it
    const docValidation  = validationService.validateDocument(parserResult.document);

    res.status(200).json({
      success:               true,
      requestId,
      intent,
      confidence:            parserResult.confidence,
      source:                parserResult.source,
      clarificationRequired: parserResult.clarificationRequired,
      clarificationQuestions: parserResult.clarificationQuestions,
      nextQuestion:          flowState.nextQuestion,
      ...flatQuestion(flowState.nextQuestion),
      missingFields:         missingFields(parserResult.clarificationQuestions),
      warnings:              parserResult.warnings,
      normalizedDocument:    parserResult.document,
      validation:            { document: docValidation },
      parserTrace:           parserResult.parserTrace,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { generate, validate, parse };
