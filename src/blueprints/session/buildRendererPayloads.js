'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { buildAnswerKey } = require('./buildQuestionQueue');
const { STATUS }         = require('./updateBlueprintSession');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Look up an answer value from the session.
 * Returns the normalizedValue if a valid answer exists, or the fallback.
 *
 * @param {object} answers     - session.answers map
 * @param {string} key         - Answer key
 * @param {*}      fallback    - Value to use when no answer exists
 */
function answered(answers, key, fallback) {
  const ans = answers[key];
  return ans !== undefined ? ans.normalizedValue : fallback;
}

// ─── Payload builders ─────────────────────────────────────────────────────────

/**
 * Build the renderer-ready campaignSlot by merging frozen structure with
 * the answered campaignId (or falling back to the original).
 */
function buildCampaignPayload(blueprint, answers) {
  const origCampaign = blueprint.campaignSlot;
  const key          = buildAnswerKey('campaignId', 'campaign', null, null);

  return {
    frozenStructure: { ...origCampaign.frozenStructure },
    editableFields: {
      campaignId: answered(answers, key, origCampaign.editableFields.campaignId),
    },
  };
}

/**
 * Build renderer-ready promotionSlots by merging each slot's frozen structure
 * with all answered editable fields.
 *
 * For each slot:
 *   - promotionId     ← answered or original
 *   - names[]         ← reconstructed per locale from answered name fields
 *   - simpleDiscountValue ← answered or original
 *   - discountEntries ← answered or original
 *   - editableCustomAttributes[] ← per-attr answered value or original value
 *
 * Frozen structures are shallow-copied, never mutated.
 */
function buildPromotionPayloads(blueprint, answers) {
  return blueprint.promotionSlots.map((slot, i) => {
    const fs = slot.frozenStructure;
    const ef = slot.editableFields;

    // promotionId
    const promoIdKey = buildAnswerKey('promotionId', 'promotion', i, null);
    const promotionId = answered(answers, promoIdKey, ef.promotionId);

    // names — one per locale from frozenStructure.nameLocales
    const locales = Array.isArray(fs.nameLocales) ? fs.nameLocales : [];
    const names = locales.map(locale => {
      const nameKey = buildAnswerKey('name', 'promotion', i, locale);
      const original = (ef.names || []).find(n => n.xmlLang === locale);
      return {
        xmlLang: locale,
        value:   answered(answers, nameKey, original ? original.value : ''),
      };
    });

    // simple discount
    const sdKey = buildAnswerKey('simpleDiscountValue', 'promotion', i, null);
    const simpleDiscountValue = answered(answers, sdKey, ef.simpleDiscountValue);

    // tiered discount entries
    const deKey = buildAnswerKey('discountEntries', 'promotion', i, null);
    const discountEntries = answered(answers, deKey, ef.discountEntries);

    // editable custom attributes — merge answered values with originals
    const editableCustomAttributes = (ef.editableCustomAttributes || []).map(attr => {
      const attrKey = buildAnswerKey(
        attr.attributeId,
        'promotion',
        i,
        attr.xmlLang !== null && attr.xmlLang !== undefined ? attr.xmlLang : null
      );
      return {
        ...attr,
        value: answered(answers, attrKey, attr.value),
      };
    });

    return {
      slotIndex: slot.slotIndex,
      frozenStructure: {
        ...fs,
        // Frozen custom attributes are passed through unchanged
        frozenCustomAttributes: (fs.frozenCustomAttributes || []).map(a => ({ ...a })),
      },
      editableFields: {
        promotionId,
        names,
        simpleDiscountValue,
        discountEntries,
        editableCustomAttributes,
      },
    };
  });
}

/**
 * Build renderer-ready assignmentSlots.
 *
 * Assignment promotionIds and campaignIds are derived from the promotion and
 * campaign answers — they are not independently asked in the clarification flow.
 *
 * Cross-reference logic:
 *   - For each assignment, find the promotionSlot whose ORIGINAL promotionId
 *     matches this assignment's original promotionId.
 *   - Use the NEW promotionId from that promotion's answer.
 *   - Use the NEW campaignId from the campaign answer.
 */
function buildAssignmentPayloads(blueprint, answers) {
  // Build: original promotionId → new promotionId map
  const promoIdMap = {};
  blueprint.promotionSlots.forEach((slot, i) => {
    const origId = slot.editableFields.promotionId;
    const key    = buildAnswerKey('promotionId', 'promotion', i, null);
    promoIdMap[origId] = answered(answers, key, origId);
  });

  // New campaignId
  const campaignKey  = buildAnswerKey('campaignId', 'campaign', null, null);
  const newCampaignId = answered(
    answers,
    campaignKey,
    blueprint.campaignSlot.editableFields.campaignId
  );

  return blueprint.assignmentSlots.map((slot, i) => {
    const fs = slot.frozenStructure;
    const ef = slot.editableFields;

    // promotionId: re-mapped through the promotion id map
    const updatedPromotionId = promoIdMap[ef.promotionId] !== undefined
      ? promoIdMap[ef.promotionId]
      : ef.promotionId;

    // couponIds
    const couponKey = buildAnswerKey('couponIds', 'assignment', i, null);
    const couponIds = answered(answers, couponKey, ef.couponIds);

    // startDate (only when hasStartDate)
    const startKey  = buildAnswerKey('startDate', 'assignment', i, null);
    const startDate = fs.hasStartDate
      ? answered(answers, startKey, ef.startDate)
      : null;

    // endDate (only when hasEndDate)
    const endKey  = buildAnswerKey('endDate', 'assignment', i, null);
    const endDate = fs.hasEndDate
      ? answered(answers, endKey, ef.endDate)
      : null;

    return {
      slotIndex: slot.slotIndex,
      frozenStructure: { ...fs },
      editableFields: {
        promotionId: updatedPromotionId,
        campaignId:  newCampaignId,
        couponIds,
        startDate,
        endDate,
      },
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build renderer-ready slot payloads by merging a session's validated answers
 * with the original blueprint's frozen structures.
 *
 * This function:
 *   - Produces new campaignSlot, promotionSlots[], assignmentSlots[] objects
 *   - Fills answered fields with session answer normalizedValues
 *   - Falls back to original blueprint values for unanswered fields
 *   - Preserves all frozen structures unchanged
 *   - Preserves source order (slotIndex)
 *
 * The returned payload is suitable for passing directly to assembleBlueprintXML.
 *
 * IMPORTANT:
 *   - Does NOT render XML
 *   - Does NOT mutate the session or blueprint
 *   - Does NOT add defaults for unanswered fields
 *   - Assignment promotionIds are derived from promotion answers (not asked separately)
 *
 * @param {object} session   - Current session (any non-cancelled status)
 * @param {object} blueprint - Original blueprint record (frozen structures)
 * @returns {{
 *   campaignSlot:    object,
 *   promotionSlots:  object[],
 *   assignmentSlots: object[],
 * }}
 */
function buildRendererPayloads(session, blueprint) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }
  if (session.status === STATUS.CANCELLED) {
    throw new Error('Cannot build payloads from a CANCELLED session');
  }

  const { answers } = session;

  return {
    campaignSlot:    buildCampaignPayload(blueprint, answers),
    promotionSlots:  buildPromotionPayloads(blueprint, answers),
    assignmentSlots: buildAssignmentPayloads(blueprint, answers),
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildRendererPayloads,
  // Internal helpers exported for unit testing
  _internals: {
    buildCampaignPayload,
    buildPromotionPayloads,
    buildAssignmentPayloads,
    answered,
  },
};
