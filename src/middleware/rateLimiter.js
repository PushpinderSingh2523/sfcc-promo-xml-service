const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  // Required when the service sits behind a proxy (ngrok, Azure, APIM).
  // express-rate-limit v7 throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR if it sees
  // an X-Forwarded-For header without 'trust proxy' being set.  We set
  // app.set('trust proxy', 1) in app.js; this flag tells the rate-limiter
  // not to perform its own independent check so the two settings stay in sync.
  validate: { xForwardedForHeader: false },
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

module.exports = { rateLimiter };
