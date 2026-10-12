const router = require("express").Router();
const { rateLimit } = require("express-rate-limit");
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const { registerRules, loginRules, forgotPasswordRules, resetPasswordRules } = require("./auth.validation");
const controller = require("./auth.controller");

const intFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const rateLimited = (req, res) => {
  res.status(429).json({
    success: false,
    error: {
      message: "Too many requests. Please try again later.",
      code: "RATE_LIMITED",
    },
  });
};

const windowMs = intFromEnv("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);

const registerLimiter = rateLimit({
  windowMs,
  limit: intFromEnv("AUTH_RATE_LIMIT_REGISTER_MAX", 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimited,
});

const loginLimiter = rateLimit({
  windowMs,
  limit: intFromEnv("AUTH_RATE_LIMIT_LOGIN_MAX", 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimited,
});

// Password-reset requests are rate limited to prevent email abuse.
const forgotPasswordLimiter = rateLimit({
  windowMs,
  limit: intFromEnv("AUTH_RATE_LIMIT_FORGOT_MAX", 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimited,
});

// POST /api/auth/register — public. role/companyId sent by clients are ignored.
router.post("/register", registerLimiter, validate(registerRules), controller.register);

// POST /api/auth/login — public.
router.post("/login", loginLimiter, validate(loginRules), controller.login);

// POST /api/auth/forgot-password — public. Generic response for existing and unknown emails.
router.post("/forgot-password", forgotPasswordLimiter, validate(forgotPasswordRules), controller.forgotPassword);

// POST /api/auth/reset-password — public. Single-use token from the reset email.
router.post("/reset-password", validate(resetPasswordRules), controller.resetPassword);

// GET /api/auth/me — authenticated.
router.get("/me", authenticate, controller.me);

// POST /api/auth/logout — authenticated. Stateless tokens: client must discard.
router.post("/logout", authenticate, controller.logout);

module.exports = router;
