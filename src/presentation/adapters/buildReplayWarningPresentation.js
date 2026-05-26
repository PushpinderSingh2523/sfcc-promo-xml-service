'use strict';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a presentation-safe replay warning object from a session's
 * replaySafetyWarnings array.
 *
 * This is a pure transformer.  It:
 *   - Preserves source ordering from the orchestrator (already severity-ordered)
 *   - Preserves all field context (fieldId, key, slotContext)
 *   - Preserves severity — always 'HIGH' from the orchestrator
 *   - Preserves priorValue and newValue for display comparison
 *   - Marks all warnings as acknowledgementRequired: true
 *   - Sets aggregate acknowledgementRequired on the container
 *
 * Does NOT:
 *   - Reorder warnings
 *   - Modify warning messages
 *   - Infer additional context
 *   - Track acknowledgement state (orchestration owns that via reviewConfirmedAt)
 *
 * @param {object[]} warnings - replaySafetyWarnings from session
 * @returns {object} Presentation-safe warning container
 */
function buildReplayWarningPresentation(warnings) {
  if (!Array.isArray(warnings)) {
    throw new Error('warnings must be an array');
  }

  const warningObjects = warnings.map(w => ({
    severity:               w.severity,
    fieldId:                w.fieldId,
    key:                    w.key,
    slotContext: {
      slotType:  w.slotContext ? w.slotContext.slotType  : null,
      slotIndex: w.slotContext ? w.slotContext.slotIndex : null,
    },
    message:                w.message,
    priorValue:             w.priorValue !== undefined ? w.priorValue : null,
    newValue:               w.newValue   !== undefined ? w.newValue   : null,
    acknowledgementRequired: true,
  }));

  return {
    type:                    'warning',
    warnings:                warningObjects,
    totalWarnings:           warningObjects.length,
    acknowledgementRequired: warningObjects.length > 0,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { buildReplayWarningPresentation };
