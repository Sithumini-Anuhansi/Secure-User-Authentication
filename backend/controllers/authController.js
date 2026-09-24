const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
const RefreshSession = require('../models/RefreshSession');
const sendEmail = require('../utils/sendEmail');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  refreshTokenExpiryDate,
  hashJti
} = require('../utils/tokens');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

// Starts a brand new session (new family) — used on register/login,
// i.e. whenever this is a fresh device/browser logging in, not a
// token rotation of an existing session.
const startNewSession = async (user, req) => {
  const accessToken = generateAccessToken(user);
  const family = crypto.randomUUID();
  const jti = crypto.randomUUID();
  const refreshToken = generateRefreshToken(user, family, jti);

  await RefreshSession.create({
    user: user._id,
    family,
    currentJtiHash: hashJti(jti),
    userAgent: req.headers['user-agent'] || 'Unknown device',
    ip: req.ip,
    lastUsedAt: new Date(),
    expiresAt: refreshTokenExpiryDate()
  });

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

    const { accessToken, refreshToken } = await startNewSession(user, req);

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

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    const { accessToken, refreshToken } = await startNewSession(user, req);

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
//
// Rotation + reuse detection: every refresh token carries a `family`
// (constant per device session) and a `jti` (changes every rotation).
// We only ever store a hash of the CURRENT jti for that family.
//   - Presented jti matches the stored one → legitimate, expected use.
//     Rotate: issue a new jti/token pair, update the stored hash.
//   - Presented jti does NOT match → this exact token was already
//     rotated away earlier, meaning someone is replaying an old,
//     stolen refresh token. We can no longer tell which of "attacker"
//     or "legitimate user" we're talking to, so we treat it as a
//     compromise: revoke every session this user has, everywhere.
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'Refresh token is required' });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const { id, family, jti } = decoded;

    const session = await RefreshSession.findOne({ user: id, family, revoked: false });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Session is invalid or expired, please log in again' });
    }

    if (session.currentJtiHash !== hashJti(jti)) {
      // --- Reuse detected: nuke every session for this user ---
      await RefreshSession.updateMany({ user: id }, { revoked: true });
      await User.updateOne({ _id: id }, { sessionsRevokedAt: new Date() });

      return res.status(401).json({
        success: false,
        message: 'Refresh token reuse detected. All sessions have been revoked for your security — please log in again.'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    // Legitimate rotation: same family, new jti.
    const newJti = crypto.randomUUID();
    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user, family, newJti);

    session.currentJtiHash = hashJti(newJti);
    session.lastUsedAt = new Date();
    await session.save();

    return res.status(200).json({ success: true, accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Refresh token is invalid or expired' });
  }
};

// @route   POST /api/auth/logout
// @access  Private — logs out THIS device only (blacklists the
//          current access token, revokes this one session/family).
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const accessToken = req.token; // set by the protect middleware

    const decodedAccess = jwt.decode(accessToken);
    if (decodedAccess?.exp) {
      await TokenBlacklist.create({ token: accessToken, expiresAt: new Date(decodedAccess.exp * 1000) });
    }

    if (refreshToken) {
      try {
        const { family } = verifyRefreshToken(refreshToken);
        await RefreshSession.updateOne({ user: req.user.id, family }, { revoked: true });
      } catch {
        // Refresh token already invalid/expired — nothing to revoke, ignore.
      }
    }

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error during logout', error: err.message });
  }
};

// @route   GET /api/auth/sessions
// @access  Private — lists this user's active (non-revoked,
//          non-expired) device sessions for the "Active Sessions" page.
exports.getSessions = async (req, res) => {
  try {
    const sessions = await RefreshSession.find({
      user: req.user.id,
      revoked: false,
      expiresAt: { $gt: new Date() }
    }).sort({ lastUsedAt: -1 });

    return res.status(200).json({
      success: true,
      sessions: sessions.map((s) => ({
        id: s._id,
        family: s.family,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error fetching sessions', error: err.message });
  }
};

// @route   DELETE /api/auth/sessions/:id
// @access  Private — revoke one specific device/session ("log out
//          this device" from the sessions list).
exports.revokeSession = async (req, res) => {
  try {
    const session = await RefreshSession.findOne({ _id: req.params.id, user: req.user.id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    session.revoked = true;
    await session.save();
    return res.status(200).json({ success: true, message: 'Session revoked' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error revoking session', error: err.message });
  }
};

// @route   DELETE /api/auth/sessions
// @access  Private — "Log out of all other devices": revokes every
//          session except the one the caller is currently using.
exports.revokeOtherSessions = async (req, res) => {
  try {
    const { currentFamily } = req.body;
    const filter = { user: req.user.id };
    if (currentFamily) filter.family = { $ne: currentFamily };

    const result = await RefreshSession.updateMany(filter, { revoked: true });

    return res.status(200).json({
      success: true,
      message: `Revoked ${result.modifiedCount} other session(s).`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error revoking sessions', error: err.message });
  }
};

// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

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
    user.sessionsRevokedAt = new Date(); // kill any still-valid access tokens immediately
    await user.save();

    // Force re-login everywhere after a password reset.
    await RefreshSession.updateMany({ user: user._id }, { revoked: true });

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
