'use strict';

// ─── Replay-Safe XML Generation ───────────────────────────────────────────────
//
// Consumes a COMPLETE session and blueprint, generates the updated SAS XML,
// and validates that the output is structurally self-consistent via a
// replay round-trip before returning the XML to any caller.
//
// Generation pipeline:
//
//   session + blueprint
//       ↓ buildRendererPayloads       (merge answers into blueprint slots)
//   renderer payloads (campaignSlot, promotionSlots, assignmentSlots)
//       ↓ assembleBlueprintXML        (render complete XML document)
//   generatedXml
//       ↓ validateBlueprintReplay     (extract → re-assemble → compare)
//   replayResult
//       ↓ if replaySuccessful → return xml
//         if !replaySuccessful → throw / return failure
//
// Guarantees:
//   - XML is only returned when replay validation passes
//   - Session must be COMPLETE before calling
//   - Neither session nor blueprint is mutated
//   - Deterministic: same session + blueprint → same XML
//
// ──────────────────────────────────────────────────────────────────────────────

const { buildRendererPayloads }  = require('../../blueprints/session/buildRendererPayloads');
const { assembleBlueprintXML }   = require('../../blueprints/assembleBlueprintXML');
const { validateBlueprintReplay } = require('../../blueprints/validateBlueprintReplay');
const { STATUS }                 = require('../../blueprints/session/updateBlueprintSession');
const { buildAnswerKey }         = require('../../blueprints/session/buildQuestionQueue');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the campaignId from session answers.
 * Falls back to the blueprint's original campaignId.
 *
 * @param {object} session
 * @param {object} blueprint
 * @returns {string}
 */
function resolveCampaignId(session, blueprint) {
  const key = buildAnswerKey('campaignId', 'campaign', null, null);
  const ans = session.answers && session.answers[key];
  if (ans && ans.normalizedValue !== undefined && ans.normalizedValue !== null) {
    return String(ans.normalizedValue);
  }
  return blueprint.campaignSlot
    && blueprint.campaignSlot.editableFields
    && blueprint.campaignSlot.editableFields.campaignId
    ? blueprint.campaignSlot.editableFields.campaignId
    : 'UNKNOWN';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a replay-validated XML document from a completed session.
 *
 * @param {object} session   - Session with status COMPLETE
 * @param {object} blueprint - Original SAS blueprint
 * @returns {{
 *   success:              boolean,
 *   xmlContent:           string|null,
 *   campaignId:           string|null,
 *   replaySuccessful:     boolean,
 *   structuralDifferences: object[],
 *   error:                string|null,
 * }}
 */
function generateReplaySafeXML(session, blueprint) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be a non-null object');
  }
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }

  // ── Guard: session must be COMPLETE ─────────────────────────────────────────
  if (session.status !== STATUS.COMPLETE) {
    return {
      success:               false,
      xmlContent:            null,
      campaignId:            null,
      replaySuccessful:      false,
      structuralDifferences: [],
      error:                 `XML generation requires COMPLETE session; current status is "${session.status}"`,
    };
  }

  // ── Step 1: Build renderer payloads ─────────────────────────────────────────
  let payloads;
  try {
    payloads = buildRendererPayloads(session, blueprint);
  } catch (err) {
    return {
      success:               false,
      xmlContent:            null,
      campaignId:            null,
      replaySuccessful:      false,
      structuralDifferences: [],
      error:                 `Payload build failed: ${err.message}`,
    };
  }

  // ── Step 2: Assemble XML from payloads ───────────────────────────────────────
  // Build a render-ready blueprint by replacing slots with merged payloads
  const renderBlueprint = {
    ...blueprint,
    campaignSlot:    payloads.campaignSlot,
    promotionSlots:  payloads.promotionSlots,
    assignmentSlots: payloads.assignmentSlots,
  };

  let xmlContent;
  try {
    xmlContent = assembleBlueprintXML(renderBlueprint);
  } catch (err) {
    return {
      success:               false,
      xmlContent:            null,
      campaignId:            null,
      replaySuccessful:      false,
      structuralDifferences: [],
      error:                 `XML assembly failed: ${err.message}`,
    };
  }

  // ── Step 3: Replay validation ────────────────────────────────────────────────
  // Prove the generated XML is structurally self-consistent:
  //   extract(generatedXml) → re-assemble → compare vs generatedXml
  // A passing round-trip proves the output is well-formed and round-trip safe.
  let replayResult;
  try {
    replayResult = validateBlueprintReplay(xmlContent, {
      blueprintId:  blueprint.blueprintId  || 'generated',
      sourceExport: 'generated-by-runtime',
      extractedAt:  new Date().toISOString(),
    });
  } catch (err) {
    return {
      success:               false,
      xmlContent:            null,
      campaignId:            null,
      replaySuccessful:      false,
      structuralDifferences: [],
      error:                 `Replay validation threw: ${err.message}`,
    };
  }

  // ── Step 4: Block delivery on replay failure ─────────────────────────────────
  if (!replayResult.replaySuccessful) {
    return {
      success:               false,
      xmlContent:            null,
      campaignId:            null,
      replaySuccessful:      false,
      structuralDifferences: replayResult.structuralDifferences || [],
      error:                 'Replay validation failed — XML delivery blocked. Structural integrity could not be confirmed.',
    };
  }

  const campaignId = resolveCampaignId(session, blueprint);

  return {
    success:               true,
    xmlContent,
    campaignId,
    replaySuccessful:      true,
    structuralDifferences: [],
    error:                 null,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generateReplaySafeXML,
  _internals: { resolveCampaignId },
};
