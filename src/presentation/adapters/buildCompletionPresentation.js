'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { buildReplayWarningPresentation } = require('./buildReplayWarningPresentation');
const { STATUS }                         = require('../../blueprints/session/updateBlueprintSession');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a presentation-safe completion summary from a session and blueprint.
 *
 * This is a pure transformer.  It:
 *   - Summarises the completed orchestration state
 *   - Reports promotion and assignment counts from the blueprint
 *   - Lists fields that changed from their prior-season currentValue
 *   - Indicates whether the renderer payload is ready (payloadReady)
 *   - Indicates whether replay warnings were acknowledged
 *
 * Does NOT:
 *   - Generate XML
 *   - Call the renderer
 *   - Modify session state
 *   - Modify blueprint state
 *   - Filter or reorder orchestration outputs
 *
 * @param {object} session   - Current session (any non-null status)
 * @param {object} blueprint - Original SAS blueprint
 * @returns {object} Presentation-safe completion object
 */
function buildCompletionPresentation(session, blueprint) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }

  const {
    sessionId,
    blueprintId,
    status,
    completionPercentage,
    questionQueue,
    answers,
    invalidFields,
    replaySafetyWarnings,
    reviewRequired,
    reviewConfirmedAt,
  } = session;

  // Blueprint slot counts
  const promotionCount  = Array.isArray(blueprint.promotionSlots)  ? blueprint.promotionSlots.length  : 0;
  const assignmentCount = Array.isArray(blueprint.assignmentSlots) ? blueprint.assignmentSlots.length : 0;

  // Valid answer count
  const answeredFields = Object.keys(answers || {})
    .filter(k => !(invalidFields || {})[k])
    .length;

  const totalFields = Array.isArray(questionQueue) ? questionQueue.length : 0;

  // Payload is ready when session is COMPLETE
  const payloadReady = status === STATUS.COMPLETE;

  // Warnings were acknowledged when reviewRequired is true AND reviewConfirmedAt is set,
  // OR when reviewRequired is false (nothing to acknowledge)
  const warningsAcknowledged = !reviewRequired || !!reviewConfirmedAt;

  // Changed fields: answered questions whose normalizedValue differs from currentValue
  const changedFields = [];
  if (Array.isArray(questionQueue)) {
    questionQueue.forEach(qi => {
      const ans = answers && answers[qi.key];
      if (!ans) return;
      if (invalidFields && invalidFields[qi.key]) return;

      // Compare using JSON stringify (consistent with orchestrator's valuesEqual)
      const prior    = qi.currentValue;
      const newVal   = ans.normalizedValue;
      const isEqual  = JSON.stringify(prior) === JSON.stringify(newVal);
      if (!isEqual) {
        changedFields.push({
          fieldId:    qi.fieldId,
          key:        qi.key,
          label:      qi.label,
          slotContext: {
            slotType:  qi.slotType,
            slotIndex: qi.slotIndex,
          },
          priorValue: prior !== undefined ? prior : null,
          newValue:   newVal !== undefined ? newVal : null,
        });
      }
    });
  }

  const warningPresentation = buildReplayWarningPresentation(replaySafetyWarnings || []);

  return {
    type:                  'completion',
    sessionId,
    blueprintId,
    status,
    completionPercentage:  completionPercentage || 0,
    promotionCount,
    assignmentCount,
    answeredFields,
    totalFields,
    payloadReady,
    warningsAcknowledged,
    replayWarnings:        warningPresentation.warnings,
    changedFields,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { buildCompletionPresentation };
