const jwt = require('jsonwebtoken');

// Short-lived access token — sent on every request, kept small-blast-radius
// if leaked because it expires quickly.
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m' }
  );
};

// Longer-lived refresh token — only ever sent to /api/auth/refresh to
// mint a new access token, so it's rarely transmitted and easy to revoke.
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, type: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
};

// How many ms from now a refresh token expires — used to store its
// expiry alongside the user document so expired ones can be pruned.
const refreshTokenExpiryDate = () => {
  const days = parseInt((process.env.REFRESH_TOKEN_EXPIRES_IN || '7d').replace('d', ''), 10) || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  refreshTokenExpiryDate
};
