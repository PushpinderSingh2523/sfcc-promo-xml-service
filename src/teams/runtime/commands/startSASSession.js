'use strict';

// ─── START_SAS_SESSION command handler ────────────────────────────────────────
//
// Responsibilities:
//   1. Accept the SAS blueprint XML (hardcoded prototype — caller provides XML)
//   2. Extract the blueprint via extractSASBlueprint
//   3. Create a new blueprint session via createBlueprintSession
//   4. Persist the session in sessionStore
//   5. Get the first question via getNextQuestion
//   6. Build the presentation via buildQuestionPresentation
//   7. Build the Adaptive Card via buildQuestionCard
//   8. Return { session, blueprint, card }
//
// Prototype constraint:
//   The caller passes the raw SAS XML (loaded from the latest hardcoded source).
//   In Phase 7, this will be replaced by a blueprint selection flow.
//
// Non-negotiables:
//   - Does NOT mutate session after creation
//   - Does NOT inject answers
//   - Does NOT apply AI inference
//   - Always starts with CREATED status
//
// ──────────────────────────────────────────────────────────────────────────────

const { extractSASBlueprint }        = require('../../../blueprints/extractors/extractSASBlueprint');
const { createBlueprintSession }     = require('../../../blueprints/session/createBlueprintSession');
const { getNextQuestion }            = require('../../../blueprints/session/getNextQuestion');
const { buildQuestionPresentation }  = require('../../../presentation/adapters/buildQuestionPresentation');
const { buildProgressPresentation }  = require('../../../presentation/adapters/buildProgressPresentation');
const { buildQuestionCard }          = require('../../cards/buildQuestionCard');
const { buildProgressCard }          = require('../../cards/buildProgressCard');
const { saveSession }                = require('../sessionStore');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Handle the START_SAS_SESSION action.
 *
 * @param {object} options
 * @param {string} options.intent       - Natural-language promotion request
 * @param {string} [options.xml]        - Optional SAS blueprint XML override
 * @param {string} [options.sessionId]  - Optional session ID override (for testing)
 * @param {string} [options.createdAt]  - ISO-8601 creation timestamp override (for testing)
 * @returns {{
 *   session:   object,
 *   blueprint: object,
 *   card:      object,
 * }}
 */
function startSASSession({ intent, xml, sessionId, createdAt } = {}) {
  if (typeof intent !== 'string' || intent.trim() === '') {
    throw new Error('intent must be a non-empty string');
  }

  // Temporary prototype fallback until dynamic blueprint selection is implemented
  if (typeof xml !== 'string' || xml.trim() === '') {
    xml = require('../../../blueprints/fixtures/summerSASBlueprint');
  }

  // ── Step 1: Extract blueprint from XML ─────────────────────────────────────
  const blueprint = extractSASBlueprint(xml, {
    blueprintId:  sessionId ? `bp-${sessionId}` : undefined,
    extractedAt:  createdAt,
  });

  // ── Step 2: Create a fresh session ─────────────────────────────────────────
  const session = createBlueprintSession(blueprint, {
    sessionId: sessionId,
    createdAt: createdAt,
  });

  // ── Step 3: Persist the session ────────────────────────────────────────────
  saveSession(session);

  // ── Step 4: Get first question and build card ───────────────────────────────
  const nextQuestion = getNextQuestion(session);

  let card;
  if (nextQuestion) {
    const presentation = buildQuestionPresentation(nextQuestion, session);
    card = buildQuestionCard(presentation);
  } else {
    // Edge case: no questions in this blueprint (should not occur for valid SAS XML)
    const progressPresentation = buildProgressPresentation(session);
    card = buildProgressCard(progressPresentation);
  }

  return { session, blueprint, card };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { startSASSession };
