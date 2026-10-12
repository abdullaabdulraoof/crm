const ActivityLog = require("./activityLog.model");

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

module.exports = { recordUserActivity };
