'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { GROUP_ORDER } = require('../fieldRegistry/sasEditableFieldRegistry');
const { STATUS }      = require('./updateBlueprintSession');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine whether two values are semantically equal for change detection.
 * Uses JSON serialization — sufficient for string, number, array-of-primitives.
 */
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a grouped review summary for a clarification session.
 *
 * The review summary provides a human-readable view of:
 *   - Every question in the session (answered and unanswered)
 *   - Prior-season value vs. new answered value
 *   - Whether the value changed
 *   - Which fields are required, answered, valid
 *   - Replay-safety warnings for replay-critical changed fields
 *
 * Groups follow GROUP_ORDER.  Empty groups are omitted.
 *
 * @param {object} session - Current session object (any status)
 * @returns {{
 *   groups: Array<{ group: string, fields: object[] }>,
 *   replaySafetyWarnings: object[],
 *   sessionStatus: string,
 *   completionPercentage: number,
 * }}
 */
function buildReviewSummary(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  const { questionQueue, answers, invalidFields } = session;

  // Build groups in GROUP_ORDER, skipping empty groups
  const groups = [];

  GROUP_ORDER.forEach(group => {
    const groupItems = questionQueue.filter(q => q.group === group);
    if (groupItems.length === 0) return;

    const fields = groupItems.map(q => {
      const answer  = answers[q.key];
      const invalid = invalidFields[q.key];
      const newValue = answer ? answer.normalizedValue : null;
      const changed  = answer !== undefined
        ? !valuesEqual(q.currentValue, newValue)
        : null;   // null = not yet answered

      return {
        fieldId:        q.fieldId,
        key:            q.key,
        label:          q.label,
        group,
        slotContext:    { slotType: q.slotType, slotIndex: q.slotIndex },
        xmlLang:        q.xmlLang,
        required:       q.required,
        replayCritical: q.replayCritical,
        // Values
        priorValue:     q.currentValue,
        newValue,
        changed,
        // State
        answered:       !!answer,
        valid:          !invalid,
        validationErrors: invalid ? invalid.errors : [],
      };
    });

    groups.push({ group, fields });
  });

  return {
    groups,
    replaySafetyWarnings:  session.replaySafetyWarnings,
    sessionStatus:         session.status,
    completionPercentage:  session.completionPercentage,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { buildReviewSummary };
