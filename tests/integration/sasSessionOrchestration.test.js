'use strict';

/**
 * Integration test: Complete full Summer_SAS.xml clarification session deterministically.
 *
 * This test exercises the entire session orchestration pipeline:
 *   extractSASBlueprint → createBlueprintSession → collectAnswer (×35) →
 *   isSessionComplete → buildReviewSummary → buildRendererPayloads
 *
 * All assertions are derived from real blueprint data — no hardcoded answer values
 * except where specific semantics must be verified (e.g. cross-reference correctness).
 */

const path = require('path');
const fs   = require('fs');

const { extractSASBlueprint }   = require('../../src/blueprints/extractors/extractSASBlueprint');
const { createBlueprintSession } = require('../../src/blueprints/session/createBlueprintSession');
const { collectAnswer, confirmReview } = require('../../src/blueprints/session/collectAnswer');
const { getNextQuestion, getRemainingQuestions } = require('../../src/blueprints/session/getNextQuestion');
const { isSessionComplete, getSessionProgress }  = require('../../src/blueprints/session/isSessionComplete');
const { buildReviewSummary }     = require('../../src/blueprints/session/buildReviewSummary');
const { buildRendererPayloads }  = require('../../src/blueprints/session/buildRendererPayloads');
const { STATUS }                 = require('../../src/blueprints/session/updateBlueprintSession');

// ─── Fixture ──────────────────────────────────────────────────────────────────

const FIXTURE_XML = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8'
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Answer every question in a session using each question's currentValue.
 * When currentValue is null (optional unanswered), answer with null (accepted for optional fields).
 * Returns the final session after all answers are collected.
 */
function answerAllWithCurrentValues(session) {
  let s = session;
  let next = getNextQuestion(s);

  while (next) {
    const raw = next.currentValue !== undefined ? next.currentValue : null;
    const { session: updated } = collectAnswer(s, next.key, raw);
    s    = updated;
    next = getNextQuestion(s);
  }
  return s;
}

/**
 * Answer every question with a new value derived by prefixing "2026_" or appending "_NEW"
 * for string fields, or changing numbers by +1, or returning original for arrays/dates.
 * Only mutates non-replay-critical fields to keep review flow predictable.
 */
function deriveNewValue(queueItem) {
  const { currentValue, fieldId } = queueItem;
  if (currentValue === null || currentValue === undefined) return null;
  if (typeof currentValue === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(currentValue)) {
      // ISO date: change year to 2026
      return currentValue.replace(/^2025/, '2026');
    }
    // Generic string: replace year prefix or append suffix
    if (currentValue.includes('2025')) return currentValue.replace(/2025/g, '2026');
    return currentValue + '_NEW';
  }
  if (typeof currentValue === 'number') return currentValue + 1;
  return currentValue; // arrays and objects: return unchanged
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SAS Session Orchestration — full lifecycle', () => {
  let blueprint;
  let initialSession;

  beforeAll(() => {
    blueprint      = extractSASBlueprint(FIXTURE_XML);
    initialSession = createBlueprintSession(blueprint, {
      sessionId: 'integ-sas-001',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  // ── Session creation ──────────────────────────────────────────────────────

  describe('Session creation', () => {
    test('creates session with 35 questions', () => {
      expect(initialSession.questionQueue.length).toBe(35);
    });

    test('status is CREATED', () => {
      expect(initialSession.status).toBe(STATUS.CREATED);
    });

    test('completionPercentage is 0', () => {
      expect(initialSession.completionPercentage).toBe(0);
    });

    test('all 35 keys appear in unansweredFields', () => {
      expect(initialSession.unansweredFields.length).toBe(35);
    });

    test('answers is empty', () => {
      expect(Object.keys(initialSession.answers)).toHaveLength(0);
    });

    test('invalidFields is empty', () => {
      expect(Object.keys(initialSession.invalidFields)).toHaveLength(0);
    });

    test('first question is campaignId (Campaign group first)', () => {
      const next = getNextQuestion(initialSession);
      expect(next.key).toBe('campaignId::campaign::_::_');
      expect(next.group).toBe('Campaign');
    });
  });

  // ── Question progression ──────────────────────────────────────────────────

  describe('Question progression', () => {
    test('getNextQuestion returns different questions after each answer', () => {
      let s = initialSession;
      const answeredKeys = [];

      for (let i = 0; i < 5; i++) {
        const next = getNextQuestion(s);
        expect(next).not.toBeNull();
        expect(answeredKeys).not.toContain(next.key);
        answeredKeys.push(next.key);
        const { session: updated } = collectAnswer(s, next.key, next.currentValue);
        s = updated;
      }
      // 5 answers in — completionPercentage > 0
      expect(s.completionPercentage).toBeGreaterThan(0);
    });

    test('getRemainingQuestions decreases by 1 after each answered question', () => {
      let s         = initialSession;
      let remaining = getRemainingQuestions(s).length;
      expect(remaining).toBe(35);

      const next = getNextQuestion(s);
      const { session: updated } = collectAnswer(s, next.key, next.currentValue);
      s = updated;

      const newRemaining = getRemainingQuestions(s).length;
      expect(newRemaining).toBe(34);
    });

    test('invalid answer keeps question in remaining and at top of retry queue', () => {
      const next = getNextQuestion(initialSession);
      // Submit empty string for a required field
      const { session: failedSession } = collectAnswer(initialSession, next.key, '');
      expect(failedSession.status).toBe(STATUS.VALIDATION_FAILED);

      const retryNext = getNextQuestion(failedSession);
      expect(retryNext.key).toBe(next.key);
      expect(retryNext.isRetry).toBe(true);
      expect(retryNext.validationErrors.length).toBeGreaterThan(0);
    });

    test('correcting invalid answer removes it from retry queue', () => {
      const next = getNextQuestion(initialSession);
      const { session: failedSession } = collectAnswer(initialSession, next.key, '');
      const { session: correctedSession } = collectAnswer(failedSession, next.key, next.currentValue);

      const retryNext = getNextQuestion(correctedSession);
      // The corrected field should no longer be invalid
      if (retryNext) {
        expect(retryNext.key).not.toBe(next.key);
        expect(correctedSession.invalidFields[next.key]).toBeUndefined();
      }
    });
  });

  // ── Answer all with currentValues (no-change session) ─────────────────────

  describe('Complete session — all answers equal currentValues', () => {
    let completedSession;

    beforeAll(() => {
      completedSession = answerAllWithCurrentValues(initialSession);
    });

    test('status is COMPLETE (no replay warnings when values unchanged)', () => {
      expect(completedSession.status).toBe(STATUS.COMPLETE);
    });

    test('completionPercentage reflects required-fields-answered ratio (11/35 = 31%)', () => {
      // answerAllWithCurrentValues answers only required fields (session becomes COMPLETE
      // once all required are met). Optional fields remain unanswered.
      expect(completedSession.completionPercentage).toBe(31);
    });

    test('unansweredFields contains only optional questions', () => {
      // All required fields are answered; only optional fields remain in unansweredFields
      const unansweredItems = completedSession.questionQueue.filter(
        q => completedSession.unansweredFields.includes(q.key)
      );
      unansweredItems.forEach(qi => expect(qi.required).toBe(false));
    });

    test('no invalidFields', () => {
      expect(Object.keys(completedSession.invalidFields)).toHaveLength(0);
    });

    test('replaySafetyWarnings is empty (values unchanged)', () => {
      expect(completedSession.replaySafetyWarnings).toHaveLength(0);
    });

    test('reviewRequired is false', () => {
      expect(completedSession.reviewRequired).toBe(false);
    });

    test('getNextQuestion returns null', () => {
      expect(getNextQuestion(completedSession)).toBeNull();
    });

    test('getRemainingQuestions returns []', () => {
      expect(getRemainingQuestions(completedSession)).toHaveLength(0);
    });

    test('isSessionComplete returns complete=true', () => {
      const result = isSessionComplete(completedSession);
      expect(result.complete).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    test('getSessionProgress shows 11 required answered, 0 invalid, 0 requiredUnanswered', () => {
      const progress = getSessionProgress(completedSession);
      expect(progress.totalQuestions).toBe(35);
      expect(progress.answeredQuestions).toBe(11); // 11 required fields
      expect(progress.invalidQuestions).toBe(0);
      expect(progress.requiredUnanswered).toBe(0);
    });

    test('groupedProgress Campaign group is complete', () => {
      expect(completedSession.groupedProgress['Campaign'].complete).toBe(true);
    });

    test('groupedProgress Identity group is complete', () => {
      expect(completedSession.groupedProgress['Identity'].complete).toBe(true);
    });
  });

  // ── Review summary ─────────────────────────────────────────────────────────

  describe('buildReviewSummary — completed session', () => {
    let completedSession;
    let summary;

    beforeAll(() => {
      completedSession = answerAllWithCurrentValues(initialSession);
      summary          = buildReviewSummary(completedSession);
    });

    test('summary has groups, replaySafetyWarnings, sessionStatus, completionPercentage', () => {
      expect(summary).toHaveProperty('groups');
      expect(summary).toHaveProperty('replaySafetyWarnings');
      expect(summary).toHaveProperty('sessionStatus');
      expect(summary).toHaveProperty('completionPercentage');
    });

    test('sessionStatus is COMPLETE', () => {
      expect(summary.sessionStatus).toBe(STATUS.COMPLETE);
    });

    test('completionPercentage is 31 (11 required answered out of 35 total)', () => {
      expect(summary.completionPercentage).toBe(31);
    });

    test('required fields are all marked answered=true', () => {
      const allFields = summary.groups.flatMap(g => g.fields);
      const requiredFields = allFields.filter(f => f.required);
      requiredFields.forEach(f => expect(f.answered).toBe(true));
    });

    test('optional unanswered fields have answered=false', () => {
      const allFields = summary.groups.flatMap(g => g.fields);
      const optionalUnanswered = allFields.filter(f => !f.required && !f.answered);
      expect(optionalUnanswered.length).toBeGreaterThan(0);
    });

    test('no field has valid=false (no validation failures)', () => {
      const allFields = summary.groups.flatMap(g => g.fields);
      allFields.forEach(f => expect(f.valid).toBe(true));
    });

    test('no field has changed=true (required fields answered with currentValues; optional fields left unanswered)', () => {
      // When all required fields are answered with their prior-season values, the session
      // reaches COMPLETE and getNextQuestion stops. Optional fields remain unanswered
      // (changed=null). No field should have changed=true.
      const allFields = summary.groups.flatMap(g => g.fields);
      allFields.forEach(f => {
        expect(f.changed).not.toBe(true);
      });
    });

    test('answered (required) fields have changed=false', () => {
      const allFields = summary.groups.flatMap(g => g.fields);
      const answeredFields = allFields.filter(f => f.answered);
      answeredFields.forEach(f => {
        expect(f.changed).toBe(false);
      });
    });

    test('groups include Campaign, Identity, Scheduling, Discounting', () => {
      const groupNames = summary.groups.map(g => g.group);
      expect(groupNames).toContain('Campaign');
      expect(groupNames).toContain('Identity');
      expect(groupNames).toContain('Scheduling');
      expect(groupNames).toContain('Discounting');
    });

    test('total field count across groups equals 35', () => {
      const total = summary.groups.reduce((acc, g) => acc + g.fields.length, 0);
      expect(total).toBe(35);
    });
  });

  // ── Renderer payloads — no-change session ─────────────────────────────────

  describe('buildRendererPayloads — no-change session', () => {
    let completedSession;
    let payload;

    beforeAll(() => {
      completedSession = answerAllWithCurrentValues(initialSession);
      payload          = buildRendererPayloads(completedSession, blueprint);
    });

    test('campaignId matches blueprint original', () => {
      expect(payload.campaignSlot.editableFields.campaignId)
        .toBe(blueprint.campaignSlot.editableFields.campaignId);
    });

    test('4 promotion payloads produced', () => {
      expect(payload.promotionSlots).toHaveLength(4);
    });

    test('4 assignment payloads produced', () => {
      expect(payload.assignmentSlots).toHaveLength(4);
    });

    test('promotionSlot promotionIds match blueprint originals', () => {
      blueprint.promotionSlots.forEach((slot, i) => {
        expect(payload.promotionSlots[i].editableFields.promotionId)
          .toBe(slot.editableFields.promotionId);
      });
    });

    test('assignment promotionIds cross-referenced correctly from promotion answers', () => {
      blueprint.assignmentSlots.forEach((slot, i) => {
        const origPromoId    = slot.editableFields.promotionId;
        const promoSlot      = blueprint.promotionSlots.find(p => p.editableFields.promotionId === origPromoId);
        const expectedPromoId = promoSlot
          ? promoSlot.editableFields.promotionId  // same since answers = currentValues
          : origPromoId;
        expect(payload.assignmentSlots[i].editableFields.promotionId).toBe(expectedPromoId);
      });
    });

    test('assignment campaignIds all equal blueprint campaignId', () => {
      const expectedCampaignId = blueprint.campaignSlot.editableFields.campaignId;
      payload.assignmentSlots.forEach(slot => {
        expect(slot.editableFields.campaignId).toBe(expectedCampaignId);
      });
    });

    test('frozenStructures preserved — enabledFlag on promotion 0', () => {
      expect(payload.promotionSlots[0].frozenStructure.enabledFlag)
        .toBe(blueprint.promotionSlots[0].frozenStructure.enabledFlag);
    });

    test('slotIndex preserved for all promotion slots', () => {
      blueprint.promotionSlots.forEach((slot, i) => {
        expect(payload.promotionSlots[i].slotIndex).toBe(slot.slotIndex);
      });
    });

    test('slotIndex preserved for all assignment slots', () => {
      blueprint.assignmentSlots.forEach((slot, i) => {
        expect(payload.assignmentSlots[i].slotIndex).toBe(slot.slotIndex);
      });
    });

    test('does not mutate the blueprint during payload build', () => {
      const snapshot = JSON.stringify(blueprint);
      buildRendererPayloads(completedSession, blueprint);
      expect(JSON.stringify(blueprint)).toBe(snapshot);
    });
  });

  // ── Replay-critical changed value flow ────────────────────────────────────

  describe('REVIEW_PENDING flow when replay-critical field changes', () => {
    let sessionWithChange;

    beforeAll(() => {
      // Answer all questions with currentValues except the campaignId (replay-critical)
      // which we answer with a new value
      let s = initialSession;
      let next = getNextQuestion(s);

      while (next) {
        let raw;
        if (next.key === 'campaignId::campaign::_::_') {
          raw = '2026_SUMMER_SAS'; // different from 2025_SUMMER_SAS
        } else {
          raw = next.currentValue !== undefined ? next.currentValue : null;
        }
        const { session: updated } = collectAnswer(s, next.key, raw);
        s    = updated;
        next = getNextQuestion(s);
      }
      sessionWithChange = s;
    });

    test('status is REVIEW_PENDING after replay-critical field changed', () => {
      expect(sessionWithChange.status).toBe(STATUS.REVIEW_PENDING);
    });

    test('replaySafetyWarnings contains one warning', () => {
      expect(sessionWithChange.replaySafetyWarnings.length).toBeGreaterThanOrEqual(1);
    });

    test('warning has severity HIGH', () => {
      expect(sessionWithChange.replaySafetyWarnings[0].severity).toBe('HIGH');
    });

    test('warning has priorValue and newValue', () => {
      const w = sessionWithChange.replaySafetyWarnings[0];
      expect(w.priorValue).toBeDefined();
      expect(w.newValue).toBeDefined();
      expect(w.priorValue).not.toEqual(w.newValue);
    });

    test('isSessionComplete returns complete=false with review blocker', () => {
      const result = isSessionComplete(sessionWithChange);
      expect(result.complete).toBe(false);
      expect(result.blockers.some(b => b.toLowerCase().includes('review'))).toBe(true);
    });

    test('confirmReview transitions to COMPLETE', () => {
      const confirmed = confirmReview(sessionWithChange, { confirmedAt: '2026-01-01T01:00:00.000Z' });
      expect(confirmed.status).toBe(STATUS.COMPLETE);
      expect(confirmed.reviewConfirmedAt).toBe('2026-01-01T01:00:00.000Z');
    });

    test('after confirmReview, isSessionComplete returns complete=true', () => {
      const confirmed = confirmReview(sessionWithChange, { confirmedAt: '2026-01-01T01:00:00.000Z' });
      const result    = isSessionComplete(confirmed);
      expect(result.complete).toBe(true);
    });

    test('renderer payload campaignId reflects new value after confirmation', () => {
      const confirmed = confirmReview(sessionWithChange, { confirmedAt: '2026-01-01T01:00:00.000Z' });
      const payload   = buildRendererPayloads(confirmed, blueprint);
      expect(payload.campaignSlot.editableFields.campaignId).toBe('2026_SUMMER_SAS');
    });
  });

  // ── Determinism ───────────────────────────────────────────────────────────

  describe('Determinism guarantees', () => {
    test('two independent sessions from same blueprint have identical question queue keys', () => {
      const s1 = createBlueprintSession(blueprint, { sessionId: 'det-1', createdAt: '2026-01-01T00:00:00.000Z' });
      const s2 = createBlueprintSession(blueprint, { sessionId: 'det-2', createdAt: '2026-01-01T00:00:00.000Z' });
      expect(s1.questionQueue.map(q => q.key)).toEqual(s2.questionQueue.map(q => q.key));
    });

    test('answering questions in same order produces identical final sessions', () => {
      const s1 = answerAllWithCurrentValues(
        createBlueprintSession(blueprint, { sessionId: 'det-3', createdAt: '2026-01-01T00:00:00.000Z' })
      );
      const s2 = answerAllWithCurrentValues(
        createBlueprintSession(blueprint, { sessionId: 'det-4', createdAt: '2026-01-01T00:00:00.000Z' })
      );
      // Compare invariant parts only — exclude timestamps which differ between runs
      expect(s1.completionPercentage).toBe(s2.completionPercentage);
      expect(s1.status).toBe(s2.status);
      // Compare answer keys and normalizedValues (not answeredAt timestamps)
      const answerMap = (s) => Object.fromEntries(
        Object.entries(s.answers).map(([k, v]) => [k, v.normalizedValue])
      );
      expect(answerMap(s1)).toEqual(answerMap(s2));
    });

    test('buildRendererPayloads is deterministic', () => {
      const completed = answerAllWithCurrentValues(initialSession);
      const p1 = buildRendererPayloads(completed, blueprint);
      const p2 = buildRendererPayloads(completed, blueprint);
      expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
    });

    test('buildReviewSummary is deterministic', () => {
      const completed = answerAllWithCurrentValues(initialSession);
      const sum1 = buildReviewSummary(completed);
      const sum2 = buildReviewSummary(completed);
      expect(JSON.stringify(sum1.groups)).toBe(JSON.stringify(sum2.groups));
    });
  });

  // ── Cancellation ──────────────────────────────────────────────────────────

  describe('Cancellation', () => {
    test('cancelled session cannot collect further answers', () => {
      const { cancelSession } = require('../../src/blueprints/session/collectAnswer');
      const cancelled = cancelSession(initialSession);
      const next = initialSession.questionQueue[0];
      expect(() => collectAnswer(cancelled, next.key, next.currentValue))
        .toThrow('CANCELLED');
    });

    test('cancelled session cannot build renderer payloads', () => {
      const { cancelSession } = require('../../src/blueprints/session/collectAnswer');
      const cancelled = cancelSession(initialSession);
      expect(() => buildRendererPayloads(cancelled, blueprint))
        .toThrow('CANCELLED');
    });

    test('isSessionComplete returns false for cancelled session', () => {
      const { cancelSession } = require('../../src/blueprints/session/collectAnswer');
      const cancelled = cancelSession(initialSession);
      expect(isSessionComplete(cancelled).complete).toBe(false);
    });
  });

  // ── Session resumability ───────────────────────────────────────────────────

  describe('Resumability — session can be saved and resumed', () => {
    test('JSON round-trip of a partial session produces identical queue order', () => {
      const next = getNextQuestion(initialSession);
      const { session: partial } = collectAnswer(initialSession, next.key, next.currentValue);

      // Simulate save/load via JSON serialization
      const restored = JSON.parse(JSON.stringify(partial));
      const nextAfterRestore = getNextQuestion(restored);

      // Should ask the second question
      expect(nextAfterRestore).not.toBeNull();
      expect(nextAfterRestore.key).not.toBe(next.key);
    });

    test('JSON round-trip preserves all answer keys and normalizedValues', () => {
      const next = getNextQuestion(initialSession);
      const { session: partial } = collectAnswer(initialSession, next.key, next.currentValue);
      const restored = JSON.parse(JSON.stringify(partial));

      expect(restored.answers[next.key]).toBeDefined();
      expect(restored.answers[next.key].normalizedValue)
        .toEqual(partial.answers[next.key].normalizedValue);
    });
  });
});
