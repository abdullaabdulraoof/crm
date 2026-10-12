const AppError = require("../error/AppError");

const notFound = (req, res, next) => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, "ROUTE_NOT_FOUND"));
};

module.exports = notFound;
