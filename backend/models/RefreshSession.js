const mongoose = require('mongoose');

// One document per logged-in device/browser ("session family"). A
// refresh token's JWT payload carries { family, jti } — jti rotates
// on every use, family stays constant for the life of that session.
// We store only a hash of the *current* jti, never the raw token.
//
// This design is what makes two things possible:
//  1. Reuse detection: if a refresh token with a stale jti (one that's
//     already been rotated away) is presented, we know it was either
//     replayed by an attacker or the legitimate device raced itself —
//     either way, treat it as compromise and revoke everything.
//  2. A real "Active Sessions" page: each document is one row the
//     user can see and individually revoke ("log out this device").
const RefreshSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    family: { type: String, required: true, index: true },
    currentJtiHash: { type: String, required: true },

    // Device/session metadata shown on the sessions page.
    userAgent: { type: String, default: 'Unknown device' },
    ip: { type: String, default: '' },

    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Auto-delete expired sessions so this collection doesn't grow forever.
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshSession', RefreshSessionSchema);
