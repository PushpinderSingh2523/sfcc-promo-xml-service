'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { buildReplayWarningPresentation } = require('./buildReplayWarningPresentation');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a presentation-safe review object from a buildReviewSummary result.
 *
 * This is a pure transformer.  It:
 *   - Preserves group ordering exactly as provided by buildReviewSummary (GROUP_ORDER)
 *   - Preserves all field-level state: priorValue, newValue, changed, answered, valid
 *   - Preserves the `changed: null` sentinel (unanswered field) — does NOT coerce to false
 *   - Preserves replayCritical flags on each field
 *   - Embeds replay warnings via buildReplayWarningPresentation
 *   - Sets reviewRequired based on warning count
 *
 * Does NOT:
 *   - Reorder groups or fields
 *   - Rewrite labels or values
 *   - Mutate the input reviewSummary
 *   - Track reviewConfirmedAt (orchestration owns that state)
 *   - Apply business logic to changed/unchanged fields
 *
 * @param {object} reviewSummary - Result of buildReviewSummary(session)
 * @returns {object} Presentation-safe review object
 */
function buildReviewPresentation(reviewSummary) {
  if (!reviewSummary || typeof reviewSummary !== 'object') {
    throw new Error('reviewSummary must be a non-null object');
  }

  const {
    groups             = [],
    replaySafetyWarnings = [],
    sessionStatus,
    completionPercentage = 0,
  } = reviewSummary;

  // Preserve group ordering from buildReviewSummary (already GROUP_ORDER)
  const presentationGroups = groups.map(g => ({
    group:  g.group,
    fields: (g.fields || []).map(f => ({
      fieldId:          f.fieldId,
      key:              f.key,
      label:            f.label,
      xmlLang:          f.xmlLang  !== undefined ? f.xmlLang  : null,
      slotContext:      f.slotContext || { slotType: null, slotIndex: null },
      required:         !!f.required,
      replayCritical:   !!f.replayCritical,
      priorValue:       f.priorValue !== undefined ? f.priorValue : null,
      newValue:         f.newValue   !== undefined ? f.newValue   : null,
      // Preserve null (unanswered) vs true/false (answered + changed state)
      changed:          f.changed,
      answered:         !!f.answered,
      valid:            !!f.valid,
      validationErrors: Array.isArray(f.validationErrors) ? [...f.validationErrors] : [],
    })),
  }));

  const warningPresentation = buildReplayWarningPresentation(replaySafetyWarnings);

  return {
    type:                 'review',
    sessionStatus,
    completionPercentage,
    groups:               presentationGroups,
    replayWarnings:       warningPresentation.warnings,
    reviewRequired:       warningPresentation.totalWarnings > 0,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { buildReviewPresentation };
