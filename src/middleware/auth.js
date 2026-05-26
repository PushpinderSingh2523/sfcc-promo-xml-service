function authenticate(req, res, next) {
  // Skip auth in test environment
  if (process.env.NODE_ENV === 'test') return next();

  const key = req.headers['x-api-key'];
  const expected = process.env.API_KEY;

  if (!expected) {
    // No key configured — warn but allow (useful for local dev without .env)
    return next();
  }

  if (!key || key !== expected) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required in X-API-Key header.',
    });
  }

  next();
}

module.exports = { authenticate };
