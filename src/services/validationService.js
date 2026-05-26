'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const intentSchema = require('../schemas/promotionIntent.json');
const logger = require('../utils/logger');

// Load at module level to get early errors on bad schema
let promotionDocumentSchema;
try {
  promotionDocumentSchema = require('../../schemas/promotion-document.schema.json');
} catch {
  logger.warn('promotion-document.schema.json not found — v2 document validation unavailable');
  promotionDocumentSchema = null;
}

// ─── AJV instances ─────────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validateIntentSchema   = ajv.compile(intentSchema);
const validateDocumentSchema = promotionDocumentSchema
  ? ajv.compile(promotionDocumentSchema)
  : null;

// ─── v1 Intent validation (kept for backward compat) ──────────────────────────

function validateIntent(data) {
  const valid = validateIntentSchema(data);
  if (!valid) {
    return {
      valid: false,
      errors: validateIntentSchema.errors.map(e => ({
        field: e.instancePath || e.schemaPath,
        message: e.message,
        params: e.params,
      })),
    };
  }
  return { valid: true, errors: [] };
}

// ─── v2 PromotionDocumentV2 validation ────────────────────────────────────────

/**
 * Validate a PromotionDocumentV2 against the runtime AJV schema
 * before handing it to xmlServiceV2.buildDocument().
 *
 * @param {object} doc — PromotionDocumentV2
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateDocument(doc) {
  if (!validateDocumentSchema) {
    logger.warn('validateDocument: schema not loaded — skipping validation');
    return { valid: true, errors: [], schemaUnavailable: true };
  }

  const valid = validateDocumentSchema(doc);
  if (!valid) {
    return {
      valid: false,
      errors: validateDocumentSchema.errors.map(e => ({
        field: e.instancePath || e.schemaPath,
        message: e.message,
        params: e.params,
        suggestion: _suggest(e),
      })),
    };
  }
  return { valid: true, errors: [] };
}

function _suggest(e) {
  if (e.keyword === 'enum') {
    return `Must be one of: ${(e.params.allowedValues || []).join(', ')}`;
  }
  if (e.keyword === 'minItems') {
    return `At least ${e.params.limit} item(s) required`;
  }
  if (e.keyword === 'required') {
    return `Add the missing field: "${e.params.missingProperty}"`;
  }
  return null;
}

// ─── XML structural validation ─────────────────────────────────────────────────

/**
 * Lightweight structural XML validation.
 * Full XSD validation requires libxml2 bindings not available in pure JS.
 * Checks required SFCC v2 elements are present.
 *
 * @param {string} xml
 * @returns {{ valid: boolean, errors: Array }}
 */
function validateXml(xml) {
  const errors = [];

  const requiredChecks = [
    { tag: 'promotions',        pattern: /<promotions[\s>]/ },
    { tag: 'promotion',         pattern: /<promotion\s+promotion-id=/ },
    { tag: 'promotion-rule',    pattern: /<(?:product|order|shipping)-promotion-rule[\s>]/ },
    { tag: 'discounts',         pattern: /<discounts\s+condition-type=/ },
    { tag: 'discount',          pattern: /<discount>/ },
    { tag: 'threshold',         pattern: /<threshold>/ },
  ];

  requiredChecks.forEach(({ tag, pattern }) => {
    if (!pattern.test(xml)) {
      errors.push({ field: tag, message: `Required element "${tag}" is missing or malformed.` });
    }
  });

  if (!xml.includes('http://www.demandware.com/xml/impex/promotion/2008-01-31')) {
    errors.push({ field: 'xmlns', message: 'SFCC promotion namespace is missing.' });
  }

  if (errors.length > 0) {
    logger.warn('XML structural validation errors', { errorCount: errors.length });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

module.exports = { validateIntent, validateDocument, validateXml };
