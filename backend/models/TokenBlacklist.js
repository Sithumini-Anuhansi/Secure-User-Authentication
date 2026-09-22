const mongoose = require('mongoose');

// Stores access tokens that have been explicitly logged out before
// their natural expiry, so /api/auth/profile (and any protected
// route) rejects them even though the JWT signature is still valid.
// The TTL index auto-removes entries once the token would have
// expired anyway, keeping this collection small.
const TokenBlacklistSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});

TokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TokenBlacklist', TokenBlacklistSchema);
