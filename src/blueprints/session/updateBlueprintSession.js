'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { GROUP_ORDER } = require('../fieldRegistry/sasEditableFieldRegistry');

// ─── Status constants ─────────────────────────────────────────────────────────

const STATUS = Object.freeze({
  CREATED:           'CREATED',
  IN_PROGRESS:       'IN_PROGRESS',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  REVIEW_PENDING:    'REVIEW_PENDING',
  COMPLETE:          'COMPLETE',
  CANCELLED:         'CANCELLED',
  EXPIRED:           'EXPIRED',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deep-equal two values for change detection.
 * Uses JSON comparison — sufficient for string, number, array of primitives.
 */
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Recalculate all derived state fields from the raw session data.
 *
 * Derived fields:
 *   groupedProgress       — per-group answered/total counts
 *   completionPercentage  — 0–100 integer
 *   unansweredFields      — keys not yet validly answered
 *   replaySafetyWarnings  — for replay-critical fields whose value changed
 *   reviewRequired        — true when any replay safety warning exists
 *   currentGroup          — the group of the next unanswered question
 *   status                — determined by answer and validation state
 *
 * Status transition rules (applied in priority order):
 *   1. CANCELLED — if status was explicitly set to CANCELLED (preserved)
 *   2. VALIDATION_FAILED — any invalidFields entries remain
 *   3. REVIEW_PENDING — all required answered, warnings exist, not yet confirmed
 *   4. COMPLETE — all required answered, (no warnings OR review confirmed)
 *   5. IN_PROGRESS — some answers exist
 *   6. CREATED — no answers yet
 *
 * @param {object} session - Raw session with answers, invalidFields, questionQueue
 * @returns {object} New session object with all derived fields recalculated
 */
function recalculateDerivedState(session) {
  const { questionQueue, answers, invalidFields, reviewConfirmedAt } = session;

  // ── Grouped progress ──────────────────────────────────────────────────────
  const groupedProgress = {};
  GROUP_ORDER.forEach(g => {
    groupedProgress[g] = { total: 0, answered: 0, complete: false };
  });

  questionQueue.forEach(q => {
    const g = q.group;
    if (groupedProgress[g]) {
      groupedProgress[g].total += 1;
      if (answers[q.key] && !invalidFields[q.key]) {
        groupedProgress[g].answered += 1;
      }
    }
  });

  GROUP_ORDER.forEach(g => {
    const gp = groupedProgress[g];
    gp.complete = gp.total > 0 && gp.answered === gp.total;
  });

  // ── Completion percentage ─────────────────────────────────────────────────
  const totalAnswered = Object.keys(answers).filter(k => !invalidFields[k]).length;
  const totalQuestions = questionQueue.length;
  const completionPercentage = totalQuestions > 0
    ? Math.round((totalAnswered / totalQuestions) * 100)
    : 0;

  // ── Unanswered fields (ordered, preserving queue order) ───────────────────
  const unansweredFields = questionQueue
    .filter(q => !answers[q.key] || invalidFields[q.key])
    .map(q => q.key);

  // ── Replay safety warnings ────────────────────────────────────────────────
  const replaySafetyWarnings = [];
  questionQueue.forEach(q => {
    if (!q.replayCritical) return;
    const ans = answers[q.key];
    if (!ans || invalidFields[q.key]) return;

    if (!valuesEqual(q.currentValue, ans.normalizedValue)) {
      replaySafetyWarnings.push({
        fieldId:    q.fieldId,
        key:        q.key,
        slotContext: { slotType: q.slotType, slotIndex: q.slotIndex },
        severity:   'HIGH',
        message:    `Changing "${q.label}" may affect replay parity. Prior value: ${JSON.stringify(q.currentValue)}. New value: ${JSON.stringify(ans.normalizedValue)}.`,
        priorValue: q.currentValue,
        newValue:   ans.normalizedValue,
      });
    }
  });

  const reviewRequired = replaySafetyWarnings.length > 0;

  // ── Current group ─────────────────────────────────────────────────────────
  const nextUnanswered = questionQueue.find(q => !answers[q.key] || invalidFields[q.key]);
  const currentGroup   = nextUnanswered ? nextUnanswered.group : null;

  // ── Status ────────────────────────────────────────────────────────────────
  let status = session.status;

  // CANCELLED and EXPIRED are terminal — never overridden by recalculation
  if (status !== STATUS.CANCELLED && status !== STATUS.EXPIRED) {
    const hasInvalid = Object.keys(invalidFields).length > 0;

    // All required fields answered validly?
    const requiredUnmet = questionQueue.filter(q =>
      q.required && (!answers[q.key] || invalidFields[q.key])
    ).length;
    const allRequiredMet = requiredUnmet === 0 && !hasInvalid;

    if (hasInvalid) {
      status = STATUS.VALIDATION_FAILED;
    } else if (allRequiredMet && reviewRequired && !reviewConfirmedAt) {
      status = STATUS.REVIEW_PENDING;
    } else if (allRequiredMet) {
      status = STATUS.COMPLETE;
    } else if (Object.keys(answers).length > 0) {
      status = STATUS.IN_PROGRESS;
    } else {
      status = STATUS.CREATED;
    }
  }

  return {
    ...session,
    groupedProgress,
    completionPercentage,
    unansweredFields,
    replaySafetyWarnings,
    reviewRequired,
    currentGroup,
    status,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply partial changes to a session and recalculate all derived state.
 *
 * This is the single path for all session state transitions.  Callers
 * apply raw data changes (answers, invalidFields, timestamps, explicit
 * status overrides) and this function recalculates everything else.
 *
 * Guarantees:
 *   - Does NOT mutate the input session
 *   - Always returns a new object
 *   - Derived state is always consistent with raw data
 *   - Status transitions are deterministic
 *
 * @param {object} session  - Current session object
 * @param {object} changes  - Partial overrides to apply before recalculation
 *   Supported keys: answers, invalidFields, status (explicit override),
 *                   reviewConfirmedAt, generatedPayload, updatedAt
 * @returns {object} New session with changes applied and derived state fresh
 */
function updateBlueprintSession(session, changes = {}) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }

  // Merge raw changes (shallow — answers/invalidFields are replaced, not merged)
  const merged = {
    ...session,
    ...changes,
    updatedAt: changes.updatedAt || new Date().toISOString(),
  };

  return recalculateDerivedState(merged);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  updateBlueprintSession,
  STATUS,
  // Internal helpers exported for unit testing
  _internals: { recalculateDerivedState, valuesEqual },
};
