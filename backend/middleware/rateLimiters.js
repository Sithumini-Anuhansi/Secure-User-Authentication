const rateLimit = require('express-rate-limit');

// General API limiter — generous, just a backstop against abuse.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// Strict limiter for /login specifically — blocks credential-stuffing
// / brute-force attempts by IP, independent of the per-account lockout
// implemented in the User model.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts from this IP, please try again later.' }
});

module.exports = { generalLimiter, loginLimiter };
