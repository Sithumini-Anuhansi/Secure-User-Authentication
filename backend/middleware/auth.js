const jwt = require('jsonwebtoken');
const TokenBlacklist = require('../models/TokenBlacklist');

// Protects routes by requiring a valid, non-blacklisted Bearer JWT.
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
    req.user = decoded; // { id, email }
    req.token = token; // needed by the logout handler to blacklist it
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid or expired' });
  }
};

module.exports = { protect };
