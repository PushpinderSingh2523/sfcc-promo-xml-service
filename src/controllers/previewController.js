'use strict';

/**
 * previewController.js
 *
 * POST /preview — Returns parsed document + XML preview + human-readable summary.
 * POST /import-xml — Imports existing SFCC XML → PromotionDocumentV2 + summary.
 */

const { v4: uuidv4 } = require('uuid');
const claudeService        = require('../services/claudeService');
const xmlServiceV2         = require('../services/xmlServiceV2');
const validationService    = require('../services/validationService');
const questionFlowService  = require('../services/questionFlowService');
const promotionSummaryService = require('../services/promotionSummaryService');
const xmlImportService     = require('../services/xmlImportService');
const logger               = require('../utils/logger');

// ─── POST /preview ─────────────────────────────────────────────────────────────

async function preview(req, res, next) {
  const requestId = uuidv4();
  const { intent } = req.body;

  if (!intent || typeof intent !== 'string' || !intent.trim()) {
    return res.status(400).json({
      success: false, error: 'Bad Request',
      message: 'Field "intent" is required and must be a non-empty string.', requestId,
    });
  }

  try {
    const t0 = Date.now();
    const parserResult = await claudeService.parseIntent(intent, {});
    const parseMs = Date.now() - t0;

    const flowState = questionFlowService.buildFlowState(parserResult);
    const summary   = promotionSummaryService.generateSummary(parserResult.document);

    let xml = null;
    let xmlValid = null;
    const skipXml = parserResult.clarificationRequired;

    if (!skipXml) {
      try {
        xml = xmlServiceV2.buildDocument(parserResult.document);
        xmlValid = validationService.validateXml(xml);
      } catch (err) {
        logger.warn('XML generation error in preview', { requestId, error: err.message });
      }
    }

    const docValidation = validationService.validateDocument(parserResult.document);
    const validationExplanation = promotionSummaryService.explainValidation(docValidation);

    return res.status(200).json({
      success: true,
      requestId,
      confidence: parserResult.confidence,
      source: parserResult.source,
      clarificationRequired: parserResult.clarificationRequired,
      nextQuestion: flowState.nextQuestion,
      summary,
      validationExplanation,
      normalizedDocument: parserResult.document,
      xml: xml || null,
      validation: {
        document: docValidation,
        xml: xml ? xmlValid : { valid: null, skipped: true },
      },
      warnings: parserResult.warnings || [],
      timing: { parseMs, totalMs: Date.now() - t0 },
    });

  } catch (err) {
    next(err);
  }
}

// ─── POST /import-xml ──────────────────────────────────────────────────────────

async function importXml(req, res, next) {
  const requestId = uuidv4();
  const { xml } = req.body;

  if (!xml || typeof xml !== 'string' || !xml.trim()) {
    return res.status(400).json({
      success: false, error: 'Bad Request',
      message: 'Field "xml" is required and must be a non-empty XML string.', requestId,
    });
  }

  try {
    logger.info('Importing promotion XML', { requestId, xmlLen: xml.length });
    const importResult = xmlImportService.importXml(xml);
    const { document: doc, warnings, fieldMap } = importResult;

    const docValidation = validationService.validateDocument(doc);
    const summary       = promotionSummaryService.generateSummary(doc);

    logger.info('XML import complete', {
      requestId,
      promotionId: doc.promotion?.id,
      ruleType: doc.promotion?.ruleType,
      valid: docValidation.valid,
      warnings: warnings.length,
    });

    return res.status(200).json({
      success: true,
      requestId,
      normalizedDocument: doc,
      summary,
      fieldMap,
      warnings,
      validation: docValidation,
    });

  } catch (err) {
    logger.warn('XML import error', { requestId, error: err.message });
    return res.status(400).json({
      success: false,
      error: 'Import Error',
      message: err.message,
      requestId,
    });
  }
}

// ─── GET /capabilities ────────────────────────────────────────────────────────

function capabilities(req, res) {
  const { USE_AI } = require('../services/claudeService');

  res.status(200).json({
    schemaVersion:    '1.3.0',
    xmlEngineVersion: '2.0.0',
    apiVersion:       'v1',

    ruleTypes:   ['product', 'order', 'shipping'],
    discountKinds: ['percentage', 'amount', 'fixed-price', 'free'],

    shippingMethods: [
      { id: 'standard',        label: 'Standard Shipping' },
      { id: 'twoday',          label: 'Two-Day Shipping' },
      { id: 'overnight',       label: 'Overnight / Next-Day' },
      { id: 'express',         label: 'Express / Rush' },
      { id: 'standard-hazmat', label: 'Standard Hazmat' },
      { id: 'surepost',        label: 'SurePost' },
      { id: 'economy',         label: 'Economy / Budget' },
    ],

    customerGroups: [
      'VIP', 'Loyalty', 'Employees', 'RegisteredUsers',
      'Partners', 'Birthday', 'Welcome', 'Everyone', 'Subscribers',
    ],

    schedulePatterns: [
      'ISO date range (2026-07-01 to 2026-07-31)',
      'Named month (in July / for September)',
      'Named event (Black Friday, Christmas, Valentine\'s Day)',
      'Relative (this weekend, this week, next month)',
      'Duration (for 30 days, for 2 weeks)',
      '90-day fallback when no schedule detected',
    ],

    exclusionCategories: [
      'sale', 'clearance', 'markdown', 'private-sale', 'preorder',
      'gift-cards', 'foundation', 'monogrammed', 'hazmat',
      'final-sale', 'accessories-masks',
    ],

    parserStrategies: [
      'discountParser', 'scheduleParser', 'qualifierParser', 'shippingParser',
      'categoryParser', 'exclusionParser', 'lifecycleParser', 'conditionParser',
    ],

    features: {
      tieredDiscounts:    true,
      conversationalFlow: true,
      xmlImport:          true,
      diffEngine:         true,
      aiParsing:          USE_AI,
      swaggerUI:          true,
      sessionPersistence: true,
    },

    endpoints: {
      generate:     'POST /api/v1/promotions/generate',
      clarify:      'POST /api/v1/promotions/clarify',
      validate:     'POST /api/v1/promotions/validate',
      preview:      'POST /api/v1/promotions/preview',
      importXml:    'POST /api/v1/promotions/import-xml',
      capabilities: 'GET  /api/v1/promotions/capabilities',
      health:       'GET  /health',
      swaggerUI:    'GET  /api-docs',
    },
  });
}

module.exports = { preview, importXml, capabilities };
