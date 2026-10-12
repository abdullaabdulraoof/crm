const AppError = require("../error/AppError");
const { normalizeString } = require("./normalize");
const { parseId } = require("./scope");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 100;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

// A query value is "present" when it is neither missing, null, nor an empty
// string. Treating "" as absent keeps `?status=` behaving like an omitted filter.
const isPresent = (value) => value !== undefined && value !== null && value !== "";

const toPositiveInt = (value, field, { min = 1, max } = {}) => {
  const raw = normalizeString(value);
  if (!/^\d+$/.test(String(raw))) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be a positive integer` },
    ]);
  }
  const parsed = Number.parseInt(raw, 10);
  if (parsed < min) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be at least ${min}` },
    ]);
  }
  if (max !== undefined && parsed > max) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be at most ${max}` },
    ]);
  }
  return parsed;
};

/**
 * Parses the shared `page`/`limit` query params. Defaults 1/10, rejects
 * non-integers, page < 1 and limit outside 1..100 with a 400 so every list
 * endpoint fails the same, clear way.
 */
const parsePagination = (query = {}) => {
  const page = isPresent(query.page) ? toPositiveInt(query.page, "page") : DEFAULT_PAGE;
  const limit = isPresent(query.limit)
    ? toPositiveInt(query.limit, "limit", { max: MAX_LIMIT })
    : DEFAULT_LIMIT;
  return { page, limit };
};

const paginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / limit),
});

// Escapes user input before it becomes a RegExp so a search term can never
// inject regex syntax or cause pathological matching.
const escapeRegex = (value) => String(value).replace(REGEX_SPECIALS, "\\$&");

// Trimmed, length-capped search term (undefined when absent). Throws a 400 when
// longer than the cap so callers never build an unbounded regex.
const parseSearch = (value, { field = "search", maxLength = MAX_SEARCH_LENGTH } = {}) => {
  if (!isPresent(value)) return undefined;
  const term = normalizeString(value);
  if (!term) return undefined;
  if (term.length > maxLength) {
    throw AppError.badRequest("Search term is too long", [
      { field, message: `${field} must be at most ${maxLength} characters` },
    ]);
  }
  return term;
};

// Case-insensitive, escaped regex built from an already-parsed search term.
const searchRegex = (term) => new RegExp(escapeRegex(term), "i");

const parseEnumFilter = (value, allowed, field) => {
  if (!isPresent(value)) return undefined;
  const normalized = normalizeString(value);
  if (!allowed.includes(normalized)) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be one of: ${allowed.join(", ")}` },
    ]);
  }
  return normalized;
};

const parseBooleanFilter = (value, field) => {
  if (!isPresent(value)) return undefined;
  if (typeof value === "boolean") return value;
  if (value !== "true" && value !== "false") {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be true or false` },
    ]);
  }
  return value === "true";
};

const parseIdFilter = (value, field) => (isPresent(value) ? parseId(value, field) : undefined);

const parseDateBound = (value, field, isEndBound) => {
  if (!isPresent(value)) return undefined;
  const raw = normalizeString(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be a valid date (YYYY-MM-DD)` },
    ]);
  }
  // A date-only upper bound covers the whole day so the range is inclusive.
  if (isEndBound && DATE_ONLY_RE.test(raw)) {
    return new Date(date.getTime() + ONE_DAY_MS - 1);
  }
  return date;
};

/**
 * Parses an optional inclusive from/to range. Rejects unparseable dates and an
 * inverted range with a 400. Date-only `to` values are extended to the last
 * millisecond of the day so end-of-day records are never silently excluded.
 */
const parseDateBounds = (query = {}) => {
  const from = parseDateBound(query.from, "from", false);
  const to = parseDateBound(query.to, "to", true);
  if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
    throw AppError.badRequest("Invalid date range", [
      { field: "from", message: "from must be on or before to" },
    ]);
  }
  return { from, to };
};

// Builds a Mongo date filter on `field` from parsed bounds, or undefined when
// neither bound was supplied.
const rangeFilter = (field, { from, to } = {}) => {
  if (from === undefined && to === undefined) return undefined;
  const range = {};
  if (from !== undefined) range.$gte = from;
  if (to !== undefined) range.$lte = to;
  return { [field]: range };
};

const parseDateRange = (query, field) => rangeFilter(field, parseDateBounds(query));

const normalizeSortOrder = (value) => {
  if (!isPresent(value)) return undefined;
  const order = normalizeString(value).toLowerCase();
  if (order !== "asc" && order !== "desc") {
    throw AppError.badRequest("Invalid sortOrder", [
      { field: "sortOrder", message: "sortOrder must be asc or desc" },
    ]);
  }
  return order === "asc" ? 1 : -1;
};

const directionFromDefault = (field, defaultSort) =>
  defaultSort && defaultSort[field] === 1 ? 1 : -1;

const withTiebreaker = (sort) => {
  if (Object.prototype.hasOwnProperty.call(sort, "_id")) return sort;
  const firstDirection = sort[Object.keys(sort)[0]];
  return { ...sort, _id: firstDirection === 1 ? 1 : -1 };
};

/**
 * Parses optional `sortBy`/`sortOrder`, validated against an explicit
 * per-module allowlist. Falls back to the module default (which may already
 * include `_id`) and always guarantees a deterministic `_id` tie-breaker.
 */
const parseSort = (query = {}, { allowlist, default: defaultSort }) => {
  const sortBy = isPresent(query.sortBy) ? normalizeString(query.sortBy) : undefined;
  let sort;
  if (sortBy) {
    if (!allowlist.includes(sortBy)) {
      throw AppError.badRequest("Invalid sortBy", [
        { field: "sortBy", message: `sortBy must be one of: ${allowlist.join(", ")}` },
      ]);
    }
    const direction = normalizeSortOrder(query.sortOrder);
    sort = { [sortBy]: direction !== undefined ? direction : directionFromDefault(sortBy, defaultSort) };
  } else {
    sort = { ...defaultSort };
  }
  return withTiebreaker(sort);
};

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_SEARCH_LENGTH,
  parsePagination,
  paginationMeta,
  escapeRegex,
  parseSearch,
  searchRegex,
  parseEnumFilter,
  parseBooleanFilter,
  parseIdFilter,
  parseDateBound,
  parseDateBounds,
  rangeFilter,
  parseDateRange,
  parseSort,
};
