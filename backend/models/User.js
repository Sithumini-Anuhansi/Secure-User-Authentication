const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 60
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false
    },

    // --- Email verification ---
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, select: false },
    verificationTokenExpires: { type: Date, select: false },

    // --- Password reset ---
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // --- Account lockout (brute-force protection) ---
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },

    // --- Refresh tokens (supports multiple active sessions/devices) ---
    refreshTokens: [
      {
        token: { type: String, select: false },
        expiresAt: { type: Date },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Is the account currently locked out due to too many failed logins?
UserSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Generate a random token + its hashed form (stored in DB) for
// email verification or password reset links. Only the hashed form
// is ever persisted; the raw token is sent to the user (or logged,
// since this project mocks email delivery).
UserSchema.methods.generateToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, hashedToken };
};

module.exports = mongoose.model('User', UserSchema);
