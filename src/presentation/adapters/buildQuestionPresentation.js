'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { GROUP_ORDER } = require('../../blueprints/fieldRegistry/sasEditableFieldRegistry');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive human-readable validation hints from a registry validation spec.
 *
 * Hints are derived mechanically from the spec — no new text is authored.
 * They are suitable for display below a question prompt as format guidance.
 *
 * @param {object|null} validation - Registry validation spec
 * @returns {string[]}
 */
function buildValidationHints(validation) {
  if (!validation) return [];
  const hints = [];

  if (validation.minLength !== undefined) {
    hints.push(`Minimum ${validation.minLength} character${validation.minLength === 1 ? '' : 's'}`);
  }
  if (validation.maxLength !== undefined) {
    hints.push(`Maximum ${validation.maxLength} characters`);
  }
  if (validation.format === 'iso8601') {
    hints.push('Format: ISO-8601 date/time (e.g. "2026-06-15T04:00:00.000Z")');
  }
  if (validation.min !== undefined) {
    hints.push(`Minimum value: ${validation.min}`);
  }
  if (validation.max !== undefined) {
    hints.push(`Maximum value: ${validation.max}`);
  }
  if (validation.type === 'integer') {
    hints.push('Must be a whole number');
  }
  if (validation.minItems !== undefined) {
    hints.push(`Minimum ${validation.minItems} item${validation.minItems === 1 ? '' : 's'}`);
  }
  if (validation.pattern !== undefined) {
    hints.push('Value must match the required format');
  }

  return hints;
}

/**
 * Build progress context relevant to the current question's group position.
 *
 * Extracts per-group progress from the session's groupedProgress and attaches
 * the overall completion percentage.  This is display context only — the
 * session owns all progress state.
 *
 * @param {object} nextQuestion - NextQuestion from getNextQuestion
 * @param {object} session      - Current session object
 * @returns {object}
 */
function buildProgressContext(nextQuestion, session) {
  const group = nextQuestion.group;
  const gp    = (session.groupedProgress && session.groupedProgress[group])
    || { answered: 0, total: 0 };

  return {
    currentGroup:       group,
    completedInGroup:   gp.answered,
    totalInGroup:       gp.total,
    overallPercentage:  session.completionPercentage || 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a presentation-safe question object from a NextQuestion and session context.
 *
 * This is a pure transformer.  It:
 *   - Preserves registry wording verbatim (label, question)
 *   - Preserves replayCritical flags
 *   - Preserves localized variants (xmlLang)
 *   - Preserves multi-value indicators (choices for enum, validationHints)
 *   - Attaches progress context from the session's groupedProgress
 *   - Attaches retry metadata (isRetry, validationErrors, priorRawValue)
 *
 * Does NOT:
 *   - Rewrite question text
 *   - Infer answers
 *   - Add conversational filler
 *   - Modify session state
 *
 * @param {object} nextQuestion - NextQuestion from getNextQuestion (never null)
 * @param {object} session      - Current session (for progress context)
 * @returns {object} Presentation-safe question object
 */
function buildQuestionPresentation(nextQuestion, session) {
  if (!nextQuestion || typeof nextQuestion !== 'object') {
    throw new Error('nextQuestion must be a non-null object');
  }
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  const {
    key, fieldId, slotType, slotIndex, xmlLang,
    group, label, question,
    required, currentValue, validation, replayCritical,
    isRetry, validationErrors, priorRawValue,
  } = nextQuestion;

  // Enum choices: extracted from validation spec, order preserved
  const choices = (validation && Array.isArray(validation.enum))
    ? [...validation.enum]
    : null;

  return {
    type:           'question',
    key,
    group,
    label,
    question,
    required:       !!required,
    currentValue:   currentValue !== undefined ? currentValue : null,
    replayCritical: !!replayCritical,
    xmlLang:        xmlLang !== undefined ? xmlLang : null,
    slotContext: {
      slotType:  slotType  !== undefined ? slotType  : null,
      slotIndex: slotIndex !== undefined ? slotIndex : null,
    },
    progress:         buildProgressContext(nextQuestion, session),
    choices,
    validationHints:  buildValidationHints(validation),
    retryMetadata: {
      isRetry:          !!isRetry,
      validationErrors: Array.isArray(validationErrors) ? [...validationErrors] : [],
      priorRawValue:    priorRawValue !== undefined ? priorRawValue : null,
    },
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildQuestionPresentation,
  // Internal helpers exported for unit testing
  _internals: { buildValidationHints, buildProgressContext },
};
