const ActivityLog = require("./activityLog.model");
const { toActivityLogView } = require("./activityLog.util");
const {
  parsePagination,
  paginationMeta,
  parseSearch,
  searchRegex,
  parseEnumFilter,
  parseIdFilter,
  parseDateBounds,
  rangeFilter,
  parseSort,
} = require("../../common/utils/query");
const { companyObjectId } = require("../../common/utils/scope");
const { normalizeString } = require("../../common/utils/normalize");

// The audit entity allowlist is the schema's own enum, so validation can never
// drift from what is actually persistable.
const ENTITY_TYPES = ActivityLog.schema.path("entityType").enumValues;
const SORTABLE = ["createdAt"];

/**
 * Company-scoped, paginated audit trail, newest first. Every filter is combined
 * with the authenticated company id so one tenant can never read another's
 * history. Unknown entity types, malformed ids, inverted date ranges and
 * unsupported sort fields are rejected with a 400 by the shared query helpers.
 */
const listActivityLogs = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);
  const filter = { companyId: companyObjectId(actor) };

  const entityType = parseEnumFilter(query.entityType, ENTITY_TYPES, "entityType");
  if (entityType) filter.entityType = entityType;

  const action = normalizeString(query.action);
  if (action) filter.action = action;

  const performedBy = parseIdFilter(query.performedBy, "performedBy");
  if (performedBy) filter.performedBy = performedBy;

  const range = rangeFilter("createdAt", parseDateBounds(query));
  if (range) filter.createdAt = range.createdAt;

  const term = parseSearch(query.search);
  if (term) {
    const regex = searchRegex(term);
    filter.$or = [{ description: regex }, { action: regex }];
  }

  const sort = parseSort(query, { allowlist: SORTABLE, default: { createdAt: -1 } });

  const [docs, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("performedBy", "name email")
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  return {
    activityLogs: docs.map(toActivityLogView),
    pagination: paginationMeta(page, limit, total),
  };
};

/**
 * Records an audit entry. The entity type must be one of the values allowed
 * by the ActivityLog schema (USER, LEAD, CLIENT, ...).
 *
 * Audit logging must never break the operation it describes: the mutation is
 * already committed by the time we log, so failures go to server logs only.
 */
async function recordUserActivity({
  companyId,
  performedBy,
  action,
  entityId,
  description,
  metadata = {},
  ipAddress = null,
  entityType = "USER",
}) {
  try {
    await ActivityLog.create({
      companyId,
      performedBy,
      action,
      entityType,
      entityId,
      description,
      metadata,
      ipAddress: ipAddress || null,
    });
  } catch (err) {
    console.error(`[activity] failed to record ${action}: ${err.message}`);
  }
}

module.exports = { recordUserActivity, listActivityLogs };
