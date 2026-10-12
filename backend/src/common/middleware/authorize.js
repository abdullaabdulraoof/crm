const AppError = require("../error/AppError");

/**
 * Role-based access control. Must run after `authenticate`.
 *
 *   router.get("/admin-only", authenticate, authorize("OWNER", "ADMIN"), handler)
 *
 * 401 when the request is unauthenticated, 403 when the authenticated user's
 * role is not permitted. Fails closed when no roles are configured.
 */
const authorize = (...roles) => {
  const permitted = roles.filter((role) => typeof role === "string" && role.length > 0);

  if (permitted.length === 0) {
    // Misconfiguration: deny everything rather than accidentally allowing everything.
    console.error(
      "[authz] authorize() was called with no permitted roles; all requests to this route will be denied"
    );
  }

  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized("Authentication required"));
    }

    if (permitted.length === 0) {
      return next(AppError.forbidden("Access denied", "FORBIDDEN"));
    }

    if (!permitted.includes(req.user.role)) {
      return next(
        AppError.forbidden("You do not have permission to perform this action", "FORBIDDEN")
      );
    }

    return next();
  };
};

module.exports = authorize;
