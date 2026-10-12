class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details = undefined) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad request", details) {
    return new AppError(message, 400, "BAD_REQUEST", details);
  }

  static unauthorized(message = "Authentication required", code = "UNAUTHORIZED") {
    return new AppError(message, 401, code);
  }

  static forbidden(message = "You do not have permission to perform this action", code = "FORBIDDEN") {
    return new AppError(message, 403, code);
  }

  static notFound(message = "Resource not found", code = "NOT_FOUND") {
    return new AppError(message, 404, code);
  }

  static conflict(message = "Resource already exists", code = "CONFLICT") {
    return new AppError(message, 409, code);
  }

  static internal(message = "Something went wrong", code = "INTERNAL_ERROR") {
    return new AppError(message, 500, code);
  }
}

module.exports = AppError;
