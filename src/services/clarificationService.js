'use strict';

/**
 * Detects missing required fields and returns the corresponding clarification
 * questions from the promotion definition config.
 *
 * Completely deterministic — no AI, no inference, no assumptions.
 *
 * @param {Object} extracted   - Fields extracted from user input (may be partial)
 * @param {Object} definition  - promotionDefinition config (field → { required, clarification })
 * @returns {{ clarificationRequired: boolean, missingFields: string[], questions: string[] }}
 */
function detectMissingFields(extracted, definition) {
  const missingFields = [];
  const questions = [];

  for (const [field, config] of Object.entries(definition)) {
    if (!config.required) continue;

    const value = extracted[field];
    const isMissing = value === undefined || value === null || value === '';

    if (isMissing) {
      missingFields.push(field);
      questions.push(config.clarification);
    }
  }

  return {
    clarificationRequired: missingFields.length > 0,
    missingFields,
    questions,
  };
}

module.exports = { detectMissingFields };
