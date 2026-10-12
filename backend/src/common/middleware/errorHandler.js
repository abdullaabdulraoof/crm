const AppError = require("../error/AppError");

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let error = err;

  if (err && err.name === "ValidationError" && err.errors) {
    error = new AppError(
      "Validation failed",
      400,
      "BAD_REQUEST",
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }))
    );
  } else if (err && err.name === "CastError") {
    error = new AppError("Invalid identifier format", 400, "INVALID_ID");
  } else if (err && err.code === 11000) {
    const duplicateFields = Object.keys(err.keyValue || {});
    error = new AppError(
      duplicateFields.length
        ? `Duplicate value for: ${duplicateFields.join(", ")}`
        : "Resource already exists",
      409,
      "DUPLICATE_VALUE"
    );
  } else if (err && (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError")) {
    error = new AppError("Authentication failed", 401, "TOKEN_INVALID");
  }

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const isOperational = error.isOperational === true;
  const code = error.code || (statusCode >= 500 ? "INTERNAL_ERROR" : "ERROR");

  // Unexpected (non-operational) errors never expose their message.
  // Operational errors are curated, safe messages - shown even for 500s (e.g. CONFIG_ERROR).
  const message = isOperational ? error.message : "Something went wrong";

  const logLine = `[error] ${req.method} ${req.originalUrl} -> ${statusCode} ${code} ${
    error && error.message ? error.message : "unknown error"
  }`;
  if (statusCode >= 500) {
    console.error(logLine);
    if (error && error.stack) console.error(error.stack);
  } else {
    console.warn(logLine);
  }

  const body = { success: false, error: { message, code } };
  if (isOperational && error.details !== undefined) body.error.details = error.details;

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
