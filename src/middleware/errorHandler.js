const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
  });

  if (err.status) {
    return res.status(err.status).json({ error: err.name || 'Error', message: err.message });
  }

  // Anthropic API errors
  if (err.constructor?.name === 'APIError' || err.message?.includes('anthropic')) {
    return res.status(502).json({
      error: 'Claude API Error',
      message: 'Failed to communicate with the Claude AI service.',
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
  });
}

module.exports = { errorHandler };
