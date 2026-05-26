'use strict';

/**
 * Orchestration layer: field extraction → clarification detection → XML rendering.
 *
 * Responsibilities:
 * - Call extractFields on raw user input
 * - Call detectMissingFields to identify any absent required fields
 * - If clarification is needed: return the question set, no XML
 * - If complete: call renderPromotionXML and return the result
 *
 * Does NOT:
 * - Infer or mutate extracted values
 * - Auto-fill defaults
 * - Contain regex, XML, or business logic
 */

const { extractFields }      = require('./fieldExtractionService');
const { detectMissingFields } = require('./clarificationService');
const { renderPromotionXML } = require('./xmlRendererService');
const promotionDefinition    = require('../config/promotionDefinition');

/**
 * Process a raw promotion request end-to-end.
 *
 * Clarification required:
 *   { clarificationRequired: true, extracted, missingFields, questions }
 *
 * Complete — XML rendered:
 *   { clarificationRequired: false, extracted, xml }
 *
 * @param {string} userInput  Raw user text (any value accepted safely)
 * @returns {Object}
 */
function processPromotionRequest(userInput) {
  const extracted = extractFields(userInput);

  const { clarificationRequired, missingFields, questions } =
    detectMissingFields(extracted, promotionDefinition);

  if (clarificationRequired) {
    return {
      clarificationRequired: true,
      extracted,
      missingFields,
      questions,
    };
  }

  const xml = renderPromotionXML(extracted);

  return {
    clarificationRequired: false,
    extracted,
    xml,
  };
}

module.exports = { processPromotionRequest };
