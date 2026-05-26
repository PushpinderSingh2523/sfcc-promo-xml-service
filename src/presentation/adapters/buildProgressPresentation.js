'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { GROUP_ORDER } = require('../../blueprints/fieldRegistry/sasEditableFieldRegistry');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a presentation-safe progress object from a session.
 *
 * This is a pure transformer.  It:
 *   - Reports overall and per-group progress from session state
 *   - Follows GROUP_ORDER exactly for group listing
 *   - Omits groups with no questions (total === 0)
 *   - Derives completedQuestions and remainingQuestions from raw answer counts
 *   - Passes through completionPercentage and status unchanged
 *
 * Does NOT:
 *   - Modify session state
 *   - Infer question ordering
 *   - Apply business logic
 *   - Add UI filler
 *
 * @param {object} session - Current session object (any non-null status)
 * @returns {object} Presentation-safe progress object
 */
function buildProgressPresentation(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  const {
    questionQueue,
    answers,
    invalidFields,
    groupedProgress,
    completionPercentage,
    currentGroup,
    status,
  } = session;

  const totalQuestions = Array.isArray(questionQueue) ? questionQueue.length : 0;

  // Valid answers: present in answers but NOT in invalidFields
  const completedQuestions = Object.keys(answers || {})
    .filter(k => !(invalidFields || {})[k])
    .length;

  const remainingQuestions = totalQuestions - completedQuestions;

  // Groups follow GROUP_ORDER; omit groups with no questions
  const groups = GROUP_ORDER
    .filter(group => {
      const gp = groupedProgress && groupedProgress[group];
      return gp && gp.total > 0;
    })
    .map(group => {
      const gp = groupedProgress[group];
      return {
        group,
        total:    gp.total,
        answered: gp.answered,
        complete: gp.complete,
      };
    });

  return {
    type:                 'progress',
    currentGroup:         currentGroup || null,
    completedQuestions,
    totalQuestions,
    remainingQuestions,
    completionPercentage: completionPercentage || 0,
    status,
    groups,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { buildProgressPresentation };
