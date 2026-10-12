const AppError = require("../error/AppError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_MAX_LENGTH = 320;

const TYPE_CHECKS = {
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number" && Number.isFinite(value),
  boolean: (value) => typeof value === "boolean",
  object: (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  email: (value) =>
    typeof value === "string" &&
    value.trim().length <= EMAIL_MAX_LENGTH &&
    EMAIL_RE.test(value.trim()),
};

const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

const getPath = (source, path) =>
  path.split(".").reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), source);

/**
 * Builds a validation middleware from a list of rules:
 * { field, required, type, min, max, pattern, patternMessage, enum }
 *
 * Dot paths are supported (e.g. "owner.email") so nested payloads validate cleanly.
 */
const validate = (rules) => (req, res, next) => {
  const source = req.body || {};
  const errors = [];

  for (const rule of rules) {
    const value = getPath(source, rule.field);

    if (isEmpty(value)) {
      if (rule.required) errors.push({ field: rule.field, message: `${rule.field} is required` });
      continue;
    }

    const type = rule.type || "string";
    const check = TYPE_CHECKS[type];
    if (!check) continue;

    if (!check(value)) {
      errors.push({
        field: rule.field,
        message:
          type === "email"
            ? `${rule.field} must be a valid email address`
            : `${rule.field} must be of type ${type}`,
      });
      continue;
    }

    if (type === "string") {
      const trimmed = value.trim();
      const length = trimmed.length;

      if (rule.min !== undefined && length < rule.min) {
        errors.push({
          field: rule.field,
          message:
            rule.min === 1
              ? `${rule.field} is required`
              : `${rule.field} must be at least ${rule.min} characters`,
        });
      }
      if (rule.max !== undefined && length > rule.max) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at most ${rule.max} characters`,
        });
      }
      if (rule.pattern && !rule.pattern.test(trimmed)) {
        errors.push({
          field: rule.field,
          message: rule.patternMessage || `${rule.field} is invalid`,
        });
      }
      if (rule.enum && !rule.enum.includes(trimmed)) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be one of: ${rule.enum.join(", ")}`,
        });
      }
    } else if (type === "number") {
      // min/max for numbers are value bounds (string min/max are lengths).
      if (rule.min !== undefined && value < rule.min) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at least ${rule.min}`,
        });
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at most ${rule.max}`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return next(AppError.badRequest("Validation failed", errors));
  }

  return next();
};

module.exports = validate;
module.exports.EMAIL_RE = EMAIL_RE;
