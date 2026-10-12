const jwt = require("jsonwebtoken");
const User = require("../../modules/user/user.model");
const AppError = require("../error/AppError");
const { getJwtConfig, ConfigError } = require("../../config/env");
const { isObjectId } = require("../utils/scope");

const mapJwtError = (err) => {
  if (err && err.name === "TokenExpiredError") {
    return AppError.unauthorized("Session expired. Please sign in again.", "TOKEN_EXPIRED");
  }
  return AppError.unauthorized("Authentication failed", "TOKEN_INVALID");
};

/**
 * Verifies the bearer token and loads the user from MongoDB.
 * Role, company and active status always come from the database record,
 * never from token claims or request headers.
 */
const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || typeof header !== "string") {
    return next(AppError.unauthorized("Authentication required", "TOKEN_MISSING"));
  }

  const parts = header.split(" ");
  if (parts.length !== 2 || !/^bearer$/i.test(parts[0]) || !parts[1]) {
    return next(AppError.unauthorized("Authentication failed", "TOKEN_INVALID"));
  }
  const token = parts[1];

  let payload;
  try {
    const jwtConfig = getJwtConfig();
    payload = jwt.verify(token, jwtConfig.secret, { algorithms: ["HS256"] });
  } catch (err) {
    if (err instanceof ConfigError) {
      // Missing/invalid server configuration is an outage, not an auth failure.
      console.error(`[auth] ${err.message}`);
      return next(AppError.internal("Authentication service is not configured", "CONFIG_ERROR"));
    }
    return next(mapJwtError(err));
  }

  if (!payload || typeof payload !== "object") {
    return next(AppError.unauthorized("Authentication failed", "TOKEN_INVALID"));
  }

  // Token type and subject are required claims; anything else is ignored.
  if (payload.type !== "access" || !isObjectId(payload.sub)) {
    return next(AppError.unauthorized("Authentication failed", "TOKEN_INVALID"));
  }

  let user;
  try {
    user = await User.findById(payload.sub).select(
      "companyId role isActive name email phone lastLogin"
    );
  } catch (err) {
    // Database failure is not an authentication failure: surface it as 500.
    console.error(`[auth] database error while loading user: ${err.message}`);
    return next(AppError.internal("Authentication service temporarily unavailable", "DB_ERROR"));
  }

  if (!user) {
    return next(AppError.unauthorized("Authentication failed", "TOKEN_INVALID"));
  }

  if (!user.isActive) {
    return next(AppError.unauthorized("Account is deactivated", "ACCOUNT_DISABLED"));
  }

  req.user = {
    id: String(user._id),
    companyId: String(user.companyId),
    role: user.role,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
  };

  return next();
};

module.exports = authenticate;
