'use strict';

// ─── CONFIRM_GENERATION command handler ───────────────────────────────────────
//
// Responsibilities:
//   1. Load session from sessionStore
//   2. If REVIEW_PENDING → call confirmReview (orchestration) to transition to COMPLETE
//   3. If COMPLETE → proceed directly to generation
//   4. Call generateReplaySafeXML (with replay validation gate)
//   5. If replay validation fails → return warning card, do NOT deliver XML
//   6. If successful → build XML artifact, return completion card + artifact
//   7. Persist the (possibly status-changed) session
//
// Non-negotiables:
//   - Replay validation MUST pass before XML is returned
//   - Session must be COMPLETE before generation
//   - Neither session nor blueprint is mutated by the Teams layer
//   - Card builders consume presentation objects only
//
// ──────────────────────────────────────────────────────────────────────────────

const { confirmReview }              = require('../../../blueprints/session/collectAnswer');
const { STATUS }                     = require('../../../blueprints/session/updateBlueprintSession');
const { buildCompletionPresentation } = require('../../../presentation/adapters/buildCompletionPresentation');
const { buildReplayWarningPresentation } = require('../../../presentation/adapters/buildReplayWarningPresentation');
const { buildCompletionCard }        = require('../../cards/buildCompletionCard');
const { buildWarningCard }           = require('../../cards/buildWarningCard');
const { generateReplaySafeXML }      = require('../generateReplaySafeXML');
const { buildXMLArtifact }           = require('../buildXMLArtifact');
const { getSession, saveSession }    = require('../sessionStore');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Handle the CONFIRM_GENERATION action.
 *
 * @param {object} options
 * @param {string} options.sessionId    - Session to confirm and generate from
 * @param {object} options.blueprint    - Blueprint the session was started from
 * @param {string} [options.confirmedAt] - ISO-8601 timestamp override (for testing)
 * @returns {{
 *   session:     object,
 *   artifact:    object|null,
 *   card:        object,
 *   xmlBlocked:  boolean,
 * }}
 */
function confirmGeneration({ sessionId, blueprint, confirmedAt } = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }

  // ── Step 1: Load session ───────────────────────────────────────────────────
  let session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found in store`);
  }

  // ── Step 2: Confirm review if REVIEW_PENDING ────────────────────────────────
  if (session.status === STATUS.REVIEW_PENDING) {
    session = confirmReview(session, { confirmedAt });
    saveSession(session);
  }

  // ── Step 3: Guard — must be COMPLETE to generate ───────────────────────────
  if (session.status !== STATUS.COMPLETE) {
    // Return a warning card describing the blocking condition
    const warningPresentation = buildReplayWarningPresentation(session.replaySafetyWarnings || []);
    const card = session.replaySafetyWarnings && session.replaySafetyWarnings.length > 0
      ? buildWarningCard(warningPresentation)
      : buildCompletionCard(buildCompletionPresentation(session, blueprint));

    return { session, artifact: null, card, xmlBlocked: true };
  }

  // ── Step 4: Generate replay-safe XML ─────────────────────────────────────
  const generationResult = generateReplaySafeXML(session, blueprint);

  if (!generationResult.success) {
    // Replay validation failed — return a blocking warning, no XML delivered
    const blockCard = buildWarningCard({
      type:                    'warning',
      warnings: [{
        severity:               'HIGH',
        fieldId:                'xml-generation',
        key:                    'xml-generation::runtime::_::_',
        slotContext:            { slotType: 'runtime', slotIndex: null },
        message:                generationResult.error || 'XML replay validation failed.',
        priorValue:             null,
        newValue:               null,
        acknowledgementRequired: true,
      }],
      totalWarnings:           1,
      acknowledgementRequired: true,
    });

    return { session, artifact: null, card: blockCard, xmlBlocked: true };
  }

  // ── Step 5: Build XML artifact ────────────────────────────────────────────
  const artifact = buildXMLArtifact({
    xmlContent:  generationResult.xmlContent,
    campaignId:  generationResult.campaignId,
    sessionId:   session.sessionId,
    blueprintId: session.blueprintId,
    generatedAt: confirmedAt || new Date().toISOString(),
  });

  // ── Step 6: Build completion card ─────────────────────────────────────────
  const completionPresentation = buildCompletionPresentation(session, blueprint);
  const card = buildCompletionCard(completionPresentation);

  return { session, artifact, card, xmlBlocked: false };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { confirmGeneration };
