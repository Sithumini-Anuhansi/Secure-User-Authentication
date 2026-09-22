const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
const sendEmail = require('../utils/sendEmail');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  refreshTokenExpiryDate
} = require('../utils/tokens');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

// Issues a fresh access + refresh token pair and stores the refresh
// token on the user document so it can be revoked later.
const issueTokenPair = async (user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshTokens.push({ token: refreshToken, expiresAt: refreshTokenExpiryDate() });
  // Prune any refresh tokens that have already expired, so this array
  // doesn't grow unbounded for users who log in often.
  user.refreshTokens = user.refreshTokens.filter((rt) => rt.expiresAt > new Date());
  await user.save();

  return { accessToken, refreshToken };
};

// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }

    const user = await User.create({ name, email, password });

    // --- Email verification (mocked) ---
    const { rawToken, hashedToken } = user.generateToken();
    user.verificationToken = hashedToken;
    user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
    await user.save();

    const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email/${rawToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Verify your email',
      text: `Welcome ${user.name}! Verify your account: ${verifyUrl}`
    });

    const { accessToken, refreshToken } = await issueTokenPair(user);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully. Check your email (mocked - see server logs) to verify your account.',
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, isVerified: user.isVerified }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error during registration', error: err.message });
  }
};

// @route   GET /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() }
    }).select('+verificationToken +verificationTokenExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Verification link is invalid or has expired' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error verifying email', error: err.message });
  }
};

// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // --- Account lockout check ---
    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Account locked due to too many failed login attempts. Try again in ${minutesLeft} minute(s).`
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = Date.now() + LOCK_TIME_MS;
        user.failedLoginAttempts = 0;
        await user.save();
        return res.status(423).json({
          success: false,
          message: `Too many failed attempts. Account locked for ${LOCK_TIME_MS / 60000} minutes.`
        });
      }
      await user.save();
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Successful login — reset lockout counters
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;

    const { accessToken, refreshToken } = await issueTokenPair(user);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, isVerified: user.isVerified }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error during login', error: err.message });
  }
};

// @route   POST /api/auth/refresh
// @access  Public (requires a valid refresh token in the body)
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'Refresh token is required' });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);

    const user = await User.findById(decoded.id).select('+refreshTokens.token');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    const storedToken = user.refreshTokens.find((rt) => rt.token === refreshToken);
    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Refresh token is invalid or expired' });
    }

    // Rotate: remove the used refresh token and issue a brand new pair.
    user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== refreshToken);
    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user);

    return res.status(200).json({ success: true, accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Refresh token is invalid or expired' });
  }
};

// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const accessToken = req.token; // set by the protect middleware

    // Blacklist the access token so it's rejected immediately, even
    // though its JWT signature would otherwise remain valid until expiry.
    const decoded = require('jsonwebtoken').decode(accessToken);
    if (decoded?.exp) {
      await TokenBlacklist.create({ token: accessToken, expiresAt: new Date(decoded.exp * 1000) });
    }

    // Revoke the refresh token too, if one was provided.
    if (refreshToken) {
      await User.updateOne(
        { _id: req.user.id },
        { $pull: { refreshTokens: { token: refreshToken } } }
      );
    }

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error during logout', error: err.message });
  }
};

// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always return 200 here (even if no user matches) so this endpoint
    // can't be used to enumerate which emails are registered.
    if (!user) {
      return res.status(200).json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    const { rawToken, hashedToken } = user.generateToken();
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${rawToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      text: `Reset your password: ${resetUrl} (expires in 1 hour)`
    });

    return res.status(200).json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error processing password reset', error: err.message });
  }
};

// @route   POST /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired' });
    }

    user.password = req.body.password; // re-hashed by the pre-save hook
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshTokens = []; // force re-login on all devices after a password reset
    await user.save();

    return res.status(200).json({ success: true, message: 'Password reset successfully. Please log in again.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error resetting password', error: err.message });
  }
};

// @route   GET /api/auth/profile
// @access  Private (protected)
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error fetching profile', error: err.message });
  }
};
