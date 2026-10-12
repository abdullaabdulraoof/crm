const FollowUp = require("./followup.model");
const Lead = require("../leads/lead.model");
const Client = require("../client/client.model");
const User = require("../user/user.model");
const AppError = require("../../common/error/AppError");
const { FOLLOWUP_EDIT_ROLES, FOLLOWUP_DELETE_ROLES } = require("../../common/constants");
const { parseId, scopedQuery, findByCompanyOr404 } = require("../../common/utils/scope");
const { normalizeString } = require("../../common/utils/normalize");
const { recordUserActivity } = require("../activity-logs/activityLog.service");
const { toFollowUpView } = require("./followup.util");

const FOLLOWUP_NOT_FOUND = "Follow-up not found";

const assertEditFollowup = (actor) => {
  if (!FOLLOWUP_EDIT_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to manage follow-ups", "FORBIDDEN");
  }
};

const assertDeleteFollowup = (actor) => {
  if (!FOLLOWUP_DELETE_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to delete follow-ups", "FORBIDDEN");
  }
};

// A follow-up must belong to exactly one of: a lead or a client.
// Both or neither is a validation error, never a silent default.
const assertExactlyOneTarget = (leadId, clientId) => {
  const hasLead = leadId !== undefined && leadId !== null && leadId !== "";
  const hasClient = clientId !== undefined && clientId !== null && clientId !== "";

  if (hasLead && hasClient) {
    throw AppError.badRequest("Invalid target", [
      { field: "leadId", message: "Provide exactly one of leadId or clientId, not both" },
    ]);
  }
  if (!hasLead && !hasClient) {
    throw AppError.badRequest("Invalid target", [
      { field: "leadId", message: "Exactly one of leadId or clientId is required" },
    ]);
  }
};

// Optional reference that must resolve to a record inside the actor's company.
// Users must additionally be active. Cross-company references are rejected.
const sameCompanyRef = async (Model, actor, value, field, label, { requireActive = false } = {}) => {
  const id = parseId(value, field);
  const filter = { _id: id, companyId: actor.companyId };
  if (requireActive) filter.isActive = true;
  const record = await Model.findOne(filter).select("_id");
  if (!record) {
    const message = requireActive
      ? `${field} must be an active ${label} of this company`
      : `${field} must be a ${label} of this company`;
    throw AppError.badRequest(`Invalid ${field}`, [{ field, message }]);
  }
  return id;
};

const parseRequiredDate = (value, field) => {
  const date = new Date(value);
  if (value === undefined || value === null || value === "" || Number.isNaN(date.getTime())) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be a valid date` },
    ]);
  }
  return date;
};

const parseOptionalDate = (value, field) => {
  if (value === undefined || value === null || value === "") return undefined;
  return parseRequiredDate(value, field);
};

const parsePagination = (query = {}) => {
  const page = query.page === undefined || query.page === "" ? 1 : Number(query.page);
  const limit = query.limit === undefined || query.limit === "" ? 10 : Number(query.limit);

  if (!Number.isInteger(page) || page < 1) {
    throw AppError.badRequest("Invalid page", [
      { field: "page", message: "page must be a positive integer" },
    ]);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw AppError.badRequest("Invalid limit", [
      { field: "limit", message: "limit must be an integer between 1 and 100" },
    ]);
  }

  return { page, limit };
};

const parseEnumFilter = (value, field, allowed) => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = normalizeString(value);
  if (!allowed.includes(normalized)) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be one of: ${allowed.join(", ")}` },
    ]);
  }
  return normalized;
};

// from/to filter on dueAt. Date-only values (YYYY-MM-DD) cover the whole day:
// from starts at 00:00 UTC, to ends at 23:59:59.999 UTC.
const parseDateBound = (value, field, bound) => {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = normalizeString(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be a valid date (YYYY-MM-DD)` },
    ]);
  }
  if (dateOnly && bound === "to") {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
};

const populateListTargets = async (followup) => {
  await followup.populate([
    { path: "leadId", select: "name phoneNumber" },
    { path: "clientId", select: "name phoneNumber" },
    { path: "assignedTo", select: "name email" },
  ]);
};

const populateDetailTargets = async (followup) => {
  await followup.populate([
    { path: "leadId", select: "name phoneNumber" },
    { path: "clientId", select: "name phoneNumber" },
    { path: "assignedTo", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);
};

/**
 * Creates a follow-up for the actor's company targeting exactly one lead or
 * client. companyId and createdBy always come from the authenticated actor;
 * any client-supplied values are never read.
 */
const createFollowup = async (actor, input, { ipAddress } = {}) => {
  assertEditFollowup(actor);
  assertExactlyOneTarget(input.leadId, input.clientId);

  const doc = {
    companyId: actor.companyId,
    createdBy: actor.id,
    assignedTo: await sameCompanyRef(User, actor, input.assignedTo, "assignedTo", "user", {
      requireActive: true,
    }),
    type: normalizeString(input.type),
    subject: normalizeString(input.subject),
    dueAt: parseRequiredDate(input.dueAt, "dueAt"),
    status: normalizeString(input.status) || "PENDING",
  };

  if (input.leadId) {
    doc.leadId = await sameCompanyRef(Lead, actor, input.leadId, "leadId", "lead");
  } else {
    doc.clientId = await sameCompanyRef(Client, actor, input.clientId, "clientId", "client");
  }

  if (input.description !== undefined) {
    doc.description = normalizeString(input.description) || "";
  }

  // completedAt is derived from status on the backend, never from the client.
  doc.completedAt = doc.status === "COMPLETED" ? new Date() : null;

  const [followup] = await FollowUp.create([doc]);

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "FOLLOW_UP_CREATED",
    entityType: "FOLLOW_UP",
    entityId: followup._id,
    description: `Created follow-up "${followup.subject}"`,
    metadata: {
      type: followup.type,
      status: followup.status,
      dueAt: followup.dueAt,
      leadId: input.leadId ? String(input.leadId) : null,
      clientId: input.clientId ? String(input.clientId) : null,
      assignedTo: String(followup.assignedTo),
    },
    ipAddress,
  });

  await populateDetailTargets(followup);
  return toFollowUpView(followup);
};

const listFollowups = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);

  const filter = scopedQuery(actor.companyId);

  const status = parseEnumFilter(query.status, "status", ["PENDING", "COMPLETED", "CANCELLED"]);
  if (status) filter.status = status;

  const type = parseEnumFilter(query.type, "type", [
    "CALL",
    "MEETING",
    "EMAIL",
    "WHATSAPP",
    "OTHER",
  ]);
  if (type) filter.type = type;

  if (query.assignedTo !== undefined && query.assignedTo !== "") {
    filter.assignedTo = parseId(query.assignedTo, "assignedTo");
  }
  if (query.leadId !== undefined && query.leadId !== "") {
    filter.leadId = parseId(query.leadId, "leadId");
  }
  if (query.clientId !== undefined && query.clientId !== "") {
    filter.clientId = parseId(query.clientId, "clientId");
  }

  const from = parseDateBound(query.from, "from", "from");
  const to = parseDateBound(query.to, "to", "to");
  if (from !== undefined || to !== undefined) {
    filter.dueAt = {};
    if (from !== undefined) filter.dueAt.$gte = from;
    if (to !== undefined) filter.dueAt.$lte = to;
  }

  const [total, followups] = await Promise.all([
    FollowUp.countDocuments(filter),
    FollowUp.find(filter)
      .sort({ dueAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  await Promise.all(followups.map(populateListTargets));

  return {
    followups: followups.map(toFollowUpView),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

const getFollowup = async (actor, id) => {
  const followup = await findByCompanyOr404(
    FollowUp,
    actor.companyId,
    id,
    {},
    FOLLOWUP_NOT_FOUND
  );
  await populateDetailTargets(followup);
  return toFollowUpView(followup);
};

/**
 * Updates a follow-up. Only the documented fields are ever read from the
 * payload; companyId, createdBy and completedAt are backend-controlled.
 * completedAt is derived: COMPLETED sets it, PENDING/CANCELLED clear it.
 */
const updateFollowup = async (actor, id, input, { ipAddress } = {}) => {
  assertEditFollowup(actor);
  const followup = await findByCompanyOr404(
    FollowUp,
    actor.companyId,
    id,
    {},
    FOLLOWUP_NOT_FOUND
  );

  const changed = [];
  const previousStatus = followup.status;

  // Target switch: if either key is present, exactly one must be and the
  // other target is cleared, so the invariant holds after every update.
  const touchesTarget = "leadId" in input || "clientId" in input;
  if (touchesTarget) {
    assertExactlyOneTarget(input.leadId, input.clientId);
    if (input.leadId) {
      followup.leadId = await sameCompanyRef(Lead, actor, input.leadId, "leadId", "lead");
      followup.clientId = null;
    } else {
      followup.clientId = await sameCompanyRef(Client, actor, input.clientId, "clientId", "client");
      followup.leadId = null;
    }
    changed.push("leadId", "clientId");
  }

  if (input.assignedTo !== undefined) {
    followup.assignedTo = await sameCompanyRef(
      User,
      actor,
      input.assignedTo,
      "assignedTo",
      "user",
      { requireActive: true }
    );
    changed.push("assignedTo");
  }
  if (input.type !== undefined) {
    followup.type = normalizeString(input.type);
    changed.push("type");
  }
  if (input.subject !== undefined) {
    followup.subject = normalizeString(input.subject);
    changed.push("subject");
  }
  if (input.description !== undefined) {
    followup.description = normalizeString(input.description) || "";
    changed.push("description");
  }
  if (input.dueAt !== undefined) {
    followup.dueAt = parseRequiredDate(input.dueAt, "dueAt");
    changed.push("dueAt");
  }
  if (input.status !== undefined) {
    followup.status = normalizeString(input.status);
    changed.push("status");
  }

  // Backend-owned completion logic: never trust completedAt from the client.
  if (followup.status === "COMPLETED") {
    followup.completedAt = followup.completedAt || new Date();
  } else {
    followup.completedAt = null;
  }

  if (changed.length > 0) {
    await followup.save();

    let action = "FOLLOW_UP_UPDATED";
    if (followup.status !== previousStatus) {
      if (followup.status === "COMPLETED") action = "FOLLOW_UP_COMPLETED";
      else if (followup.status === "CANCELLED") action = "FOLLOW_UP_CANCELLED";
    }

    await recordUserActivity({
      companyId: actor.companyId,
      performedBy: actor.id,
      action,
      entityType: "FOLLOW_UP",
      entityId: followup._id,
      description: `Updated ${changed.join(", ")} of follow-up "${followup.subject}"`,
      metadata: { fields: changed, previousStatus, status: followup.status },
      ipAddress,
    });
  }

  await populateDetailTargets(followup);
  return toFollowUpView(followup);
};

const deleteFollowup = async (actor, id, { ipAddress } = {}) => {
  assertDeleteFollowup(actor);
  const followup = await findByCompanyOr404(
    FollowUp,
    actor.companyId,
    id,
    {},
    FOLLOWUP_NOT_FOUND
  );

  await FollowUp.deleteOne({ _id: followup._id, companyId: actor.companyId });

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "FOLLOW_UP_DELETED",
    entityType: "FOLLOW_UP",
    entityId: followup._id,
    description: `Deleted follow-up "${followup.subject}"`,
    metadata: { subject: followup.subject, type: followup.type, status: followup.status },
    ipAddress,
  });

  return { id: String(followup._id) };
};

module.exports = {
  createFollowup,
  listFollowups,
  getFollowup,
  updateFollowup,
  deleteFollowup,
  assertEditFollowup,
  assertDeleteFollowup,
};
