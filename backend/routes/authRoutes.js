const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  getProfile,
  refresh,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
];

const loginValidation = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

const resetPasswordValidation = [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
];

// @route   POST /api/auth/register
router.post('/register', registerValidation, register);

// @route   GET /api/auth/verify-email/:token
router.get('/verify-email/:token', verifyEmail);

// @route   POST /api/auth/login  (rate-limited: 10 attempts / 15 min / IP)
router.post('/login', loginLimiter, loginValidation, login);

// @route   POST /api/auth/refresh
router.post('/refresh', refresh);

// @route   POST /api/auth/logout  (protected - blacklists the access token)
router.post('/logout', protect, logout);

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', body('email').isEmail().withMessage('A valid email is required'), forgotPassword);

// @route   POST /api/auth/reset-password/:token
router.post('/reset-password/:token', resetPasswordValidation, resetPassword);

// @route   GET /api/auth/profile  (protected - requires Bearer token)
router.get('/profile', protect, getProfile);

module.exports = router;
