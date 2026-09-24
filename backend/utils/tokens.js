const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Short-lived access token — sent on every request, kept small-blast-radius
// if leaked because it expires quickly.
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m' }
  );
};

// Refresh token carrying a session `family` (constant for the life of
// one device's session) and a `jti` (rotates every time the token is
// used). See models/RefreshSession.js for how these two are used
// together to detect token theft.
const generateRefreshToken = (user, family, jti) => {
  return jwt.sign(
    { id: user._id, family, jti, type: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
};

const hashJti = (jti) => crypto.createHash('sha256').update(jti).digest('hex');

// How many ms from now a refresh token expires — used to store its
// expiry on the RefreshSession document so expired ones can be pruned.
const refreshTokenExpiryDate = () => {
  const days = parseInt((process.env.REFRESH_TOKEN_EXPIRES_IN || '7d').replace('d', ''), 10) || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  refreshTokenExpiryDate,
  hashJti
};
