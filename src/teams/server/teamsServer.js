'use strict';

// ─── Teams Adapter Express Router ─────────────────────────────────────────────
//
// Exposes the deterministic SAS orchestration engine through Teams-compatible
// HTTP endpoints. This module creates an Express Router (not a standalone app)
// that is mounted in the main application under a configurable prefix (default
// /teams).
//
// Architecture:
//
//   HTTP request
//     → teamsServer router (Content-Type guard, 404, error handler)
//       → /session/* routes (sessionRoutes.js)
//         → payloadNormalizer   (format canonicalization)
//           → actionAdapter     (blueprint injection)
//             → handleTeamsAction (runtime routing)
//               → command handlers (startSASSession / submitAnswer / ...)
//                 → orchestration layer (collectAnswer / confirmReview / ...)
//                   → session store (in-memory)
//         → responseAdapter     (HTTP body shape)
//           → copilotEnvelope   (Copilot Studio envelope)
//             → Express res.json()
//
// Non-negotiables:
//   - No HTML rendering — JSON only
//   - No business logic in this file
//   - All runtime guards (TTL, limits, transitions) remain active
//   - No Bot Framework or Azure SDK dependencies
//
// ──────────────────────────────────────────────────────────────────────────────

const express       = require('express');
const sessionRoutes = require('../routes/sessionRoutes');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create the Teams adapter Express router.
 *
 * Usage in app.js:
 *   const { createTeamsRouter } = require('./teams/server/teamsServer');
 *   app.use('/teams', createTeamsRouter());
 *
 * @returns {express.Router}
 */
function createTeamsRouter() {
  const router = express.Router();

  // ── Content-Type guard for mutating methods ──────────────────────────────
  router.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const ct = (req.headers['content-type'] || '').split(';')[0].trim();
      if (ct !== 'application/json') {
        return res.status(415).json({
          version:   '1.0',
          status:    'error',
          action:    null,
          sessionId: null,
          card:      null,
          artifact:  null,
          error:     'Content-Type must be application/json',
          metadata:  { envelopeVersion: '1.0', actionSuccess: false, isIdempotent: false, sessionStatus: null },
        });
      }
    }
    next();
  });

  // ── Session lifecycle routes ─────────────────────────────────────────────
  router.use('/session', sessionRoutes);

  // ── 404 for unrecognized Teams sub-routes ────────────────────────────────
  router.use((req, res) => {
    res.status(404).json({
      version:   '1.0',
      status:    'error',
      action:    null,
      sessionId: null,
      card:      null,
      artifact:  null,
      error:     `Teams route not found: ${req.method} ${req.path}`,
      metadata:  { envelopeVersion: '1.0', actionSuccess: false, isIdempotent: false, sessionStatus: null },
    });
  });

  // ── Error handler ────────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    res.status(500).json({
      version:   '1.0',
      status:    'error',
      action:    null,
      sessionId: null,
      card:      null,
      artifact:  null,
      error:     err.message || 'Internal Teams adapter error',
      metadata:  { envelopeVersion: '1.0', actionSuccess: false, isIdempotent: false, sessionStatus: null },
    });
  });

  return router;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createTeamsRouter };
