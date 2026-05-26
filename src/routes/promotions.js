const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const promotionController = require('../controllers/promotionController');
const sessionController   = require('../controllers/sessionController');
const previewController   = require('../controllers/previewController');

router.use(authenticate);
router.use(rateLimiter);

// ── Generation pipeline ──────────────────────────────────────────────────────

// POST /api/v1/promotions/generate
// Body: { intent, options?, correlationId?, conversationId? }
router.post('/generate', promotionController.generate);

// POST /api/v1/promotions/preview
// Body: { intent } → normalized doc + XML + human-readable summary
router.post('/preview', previewController.preview);

// ── Conversational clarification ─────────────────────────────────────────────

// POST /api/v1/promotions/clarify
// Body: { sessionId, answer } → next question or completed XML
router.post('/clarify', sessionController.clarify);

// ── Validation ───────────────────────────────────────────────────────────────

// POST /api/v1/promotions/validate
// Body: { xml } or { document }
router.post('/validate', promotionController.validate);

// ── Parse only (no XML generation) ──────────────────────────────────────────

// POST /api/v1/promotions/parse
// Body: { intent } → returns parsed JSON only, no XML
router.post('/parse', promotionController.parse);

// ── Import existing SFCC XML ─────────────────────────────────────────────────

// POST /api/v1/promotions/import-xml
// Body: { xml } → PromotionDocumentV2 + summary + field map
router.post('/import-xml', previewController.importXml);

// ── Meta ─────────────────────────────────────────────────────────────────────

// GET /api/v1/promotions/capabilities
router.get('/capabilities', previewController.capabilities);

module.exports = router;
