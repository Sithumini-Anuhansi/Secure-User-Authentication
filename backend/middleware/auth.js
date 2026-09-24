const jwt = require('jsonwebtoken');
const TokenBlacklist = require('../models/TokenBlacklist');
const User = require('../models/User');

// Protects routes by requiring a valid, non-blacklisted, non-revoked
// Bearer JWT.
const protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }

  try {
    // Reject tokens that were explicitly logged out before their
    // natural expiry, even if the signature is still valid.
    const blacklisted = await TokenBlacklist.findOne({ token });
    if (blacklisted) {
      return res.status(401).json({ success: false, message: 'Token has been revoked, please log in again' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject tokens issued before a "revoke all sessions" event
    // (password reset, or refresh-token reuse/theft detection) —
    // this catches still-unexpired access tokens that were never
    // individually blacklisted, without a per-request blacklist
    // lookup for every single user.
    const user = await User.findById(decoded.id).select('+sessionsRevokedAt');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }
    if (user.sessionsRevokedAt && decoded.iat * 1000 < user.sessionsRevokedAt.getTime()) {
      return res.status(401).json({ success: false, message: 'Session has been revoked, please log in again' });
    }

    req.user = decoded; // { id, email }
    req.token = token; // needed by the logout handler to blacklist it
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid or expired' });
  }
};

module.exports = { protect };
