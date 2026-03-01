const rateLimit = require('express-rate-limit');

const subLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: '',
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { subLimiter, adminLimiter };