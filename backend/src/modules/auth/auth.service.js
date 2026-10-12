const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Company = require("../companies/company.model");
const User = require("../user/user.model");
const AppError = require("../../common/error/AppError");
const { getJwtConfig, ConfigError } = require("../../config/env");
const { hashPassword, comparePassword, dummyCompare } = require("../../common/utils/password");
const { normalizeEmail, normalizeString } = require("../../common/utils/normalize");
const { runInTransaction } = require("../../common/utils/transaction");
const { toSafeUser } = require("../user/user.util");
const { buildPasswordResetUrl, sendPasswordResetEmail } = require("../../common/utils/email");

const GENERIC_INVALID_CREDENTIALS = "Invalid email or password";
const GENERIC_RESET_MESSAGE = "If an account exists with this email, a password reset link has been sent.";
const INVALID_RESET_TOKEN_MESSAGE = "Invalid or expired password reset link.";

const resetTtlMs = () => {
  const minutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES);
  return Number.isInteger(minutes) && minutes > 0 ? minutes * 60 * 1000 : 15 * 60 * 1000; // default: 15 min
};

// Reset tokens are cryptographically random and stored only as a SHA-256 hash.
const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const signAccessToken = (user) => {
  const { secret, expiresIn } = getJwtConfig();
  return jwt.sign({ sub: String(user._id), type: "access" }, secret, {
    algorithm: "HS256",
    expiresIn,
  });
};

const isDuplicateKeyError = (err) => err && err.code === 11000;

/**
 * Creates a company and its first owner in one controlled operation.
 * - role is forced to OWNER on the server; client-supplied role/companyId are ignored;
 * - uses a transaction when available, otherwise compensates by deleting the
 *   company if owner creation fails (no orphaned records).
 */
const register = async (input) => {
  const owner = input.owner || {};
  const company = input.company || {};

  const ownerEmail = normalizeEmail(owner.email);
  const companyEmail = normalizeEmail(company.email);

  const existing = await User.findOne({ email: ownerEmail });
  if (existing) {
    throw AppError.conflict("An account with this email already exists", "EMAIL_TAKEN");
  }

  // Hash outside the transaction: bcrypt is intentionally slow.
  const passwordHash = await hashPassword(owner.password);

  const companyDoc = {
    name: normalizeString(company.name),
    email: companyEmail,
    phone: normalizeString(company.phone),
    gstNumber: normalizeString(company.gstNumber),
    address: normalizeString(company.address),
  };

  const userDoc = {
    name: normalizeString(owner.name),
    email: ownerEmail,
    phone: normalizeString(owner.phone || ""),
    passwordHash,
    role: "OWNER", // never taken from the request
    isActive: true,
  };

  let createdCompanyId = null;

  try {
    const { result } = await runInTransaction(async (session) => {
      const [companyRecord] = await Company.create([companyDoc], { session });
      createdCompanyId = companyRecord._id;

      const [userRecord] = await User.create(
        [{ ...userDoc, companyId: companyRecord._id }],
        { session }
      );

      return { company: companyRecord, user: userRecord };
    });

    return {
      company: { id: String(result.company._id), name: result.company.name },
      user: toSafeUser(result.user),
    };
  } catch (err) {
    // Fallback path: company may already exist outside a transaction. Remove it
    // so a failed registration never leaves an orphaned company behind.
    if (createdCompanyId) {
      try {
        await Company.deleteOne({ _id: createdCompanyId });
      } catch (cleanupErr) {
        console.error(`[auth] failed to clean up company after registration failure: ${cleanupErr.message}`);
      }
    }

    if (err instanceof AppError) throw err;
    if (isDuplicateKeyError(err)) {
      throw AppError.conflict("An account with this email already exists", "EMAIL_TAKEN");
    }
    if (err && err.name === "ValidationError") throw err; // mapped to 400 by the error middleware
    throw err;
  }
};

/**
 * Verifies credentials. The response is deliberately identical for unknown
 * emails and wrong passwords so the endpoint cannot enumerate accounts.
 */
const login = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);

  const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");

  if (!user) {
    await dummyCompare(password);
    throw AppError.unauthorized(GENERIC_INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
  }

  const matches = await comparePassword(password, user.passwordHash);
  if (!matches) {
    throw AppError.unauthorized(GENERIC_INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
  }

  if (!user.isActive) {
    // Only reachable after the password matched, so this does not enable enumeration.
    throw AppError.forbidden("Account is deactivated. Contact your company administrator.", "ACCOUNT_INACTIVE");
  }

  let token;
  try {
    token = signAccessToken(user);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[auth] ${err.message}`);
      throw AppError.internal("Authentication service is not configured", "CONFIG_ERROR");
    }
    throw err;
  }

  user.lastLogin = new Date();
  try {
    await user.save();
  } catch (err) {
    // A failed lastLogin write must not fail an otherwise valid login.
    console.warn(`[auth] could not update lastLogin: ${err.message}`);
  }

  return {
    token,
    tokenType: "Bearer",
    expiresIn: getJwtConfig().expiresIn,
    user: toSafeUser(user),
  };
};

// The user record was already loaded (and status-checked) by `authenticate`.
const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw AppError.unauthorized("Authentication failed", "INVALID_CREDENTIALS");
  }
  return toSafeUser(user);
};

// Access tokens are stateless: there is no server-side revocation list.
const logoutMessage = () => ({
  message:
    "Logged out. Access tokens are stateless and remain valid until they expire; the client must discard the token.",
});

/**
 * Starts a password reset for an email. The response is identical whether or
 * not an account exists (no account enumeration), and only the hash of the
 * reset token is stored. A new request invalidates any previous reset token by
 * overwriting it. Note: JWTs are stateless in this app, so a reset does NOT
 * revoke existing sessions (no session manager or token-version counter exists).
 */
const forgotPassword = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });

  const rawToken = crypto.randomBytes(32).toString("hex"); // 256-bit token
  const resetUrl = buildPasswordResetUrl(rawToken);

  if (!user) {
    // Normalize timing so "unknown email" is not measurably faster.
    await dummyCompare(rawToken);
    await sendPasswordResetEmail(normalizedEmail, resetUrl);
    return { message: GENERIC_RESET_MESSAGE };
  }

  user.passwordResetTokenHash = hashResetToken(rawToken);
  user.passwordResetExpiresAt = new Date(Date.now() + resetTtlMs());
  await user.save();

  await sendPasswordResetEmail(user.email, resetUrl);

  return { message: GENERIC_RESET_MESSAGE };
};

/**
 * Completes a password reset with a single-use token. Both the token and its
 * hash are discarded on success, so the same token cannot be reused. Invalid,
 * expired, used, or missing tokens all produce the same generic error so the
 * endpoint cannot be probed for valid tokens.
 */
const resetPassword = async ({ token, password }) => {
  const tokenHash = hashResetToken(String(token || ""));
  const user = await User.findOne({ passwordResetTokenHash: tokenHash }).select("+passwordHash");

  if (!user) {
    throw new AppError(INVALID_RESET_TOKEN_MESSAGE, 400, "INVALID_RESET_TOKEN");
  }

  const { passwordResetExpiresAt: expiresAt } = user;
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    throw new AppError(INVALID_RESET_TOKEN_MESSAGE, 400, "INVALID_RESET_TOKEN");
  }

  // Same central password rules and hashing as registration/login.
  const passwordHash = await hashPassword(password);
  user.passwordHash = passwordHash;
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  // Stateless JWTs: previously issued access tokens remain valid until they
  // expire. Documented limitation - no session revocation is performed.
  return { message: "Password reset successfully" };
};

module.exports = {
  register,
  login,
  getProfile,
  logoutMessage,
  forgotPassword,
  resetPassword,
  signAccessToken,
  GENERIC_INVALID_CREDENTIALS,
  hashResetToken,
};
