// Safe activity-log projection for the audit list. performedBy is populated to
// { id, name, email }; no password hashes or tokens exist on this document.
const toActivityLogView = (log) => {
  const performedBy = log.performedBy;
  let actor = null;
  if (performedBy && performedBy._id) {
    actor = {
      id: String(performedBy._id),
      name: performedBy.name || "",
      email: performedBy.email || "",
    };
  } else if (performedBy) {
    actor = { id: String(performedBy), name: "", email: "" };
  }

  return {
    id: String(log._id),
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId ? String(log.entityId) : null,
    description: log.description,
    metadata: log.metadata || {},
    performedBy: actor,
    ipAddress: log.ipAddress || null,
    createdAt: log.createdAt,
  };
};

module.exports = { toActivityLogView };
