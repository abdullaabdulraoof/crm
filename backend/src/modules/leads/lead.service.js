const Lead = require("./lead.model");
const User = require("../user/user.model");
const Client = require("../client/client.model");
const AppError = require("../../common/error/AppError");
const { LEAD_EDIT_ROLES, LEAD_DELETE_ROLES } = require("../../common/constants");
const {
  parseId,
  scopedQuery,
  companyObjectId,
  findByCompanyOr404,
} = require("../../common/utils/scope");
const {
  parseSearch,
  searchRegex,
  parseEnumFilter,
  parseIdFilter,
  parseDateBounds,
  rangeFilter,
} = require("../../common/utils/query");
const { normalizeEmail, normalizeString } = require("../../common/utils/normalize");
const { recordUserActivity } = require("../activity-logs/activityLog.service");
const { LEAD_SOURCES, LEAD_STATUSES } = require("./lead.validation");
const { toLeadView } = require("./lead.util");

const LEAD_NOT_FOUND = "Lead not found";

const assertEditLead = (actor) => {
  if (!LEAD_EDIT_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to manage leads", "FORBIDDEN");
  }
};

const assertDeleteLead = (actor) => {
  if (!LEAD_DELETE_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to delete leads", "FORBIDDEN");
  }
};

// Optional reference that must resolve to a record inside the actor's company.
const sameCompanyRef = async (Model, actor, value, field, label) => {
  const id = parseId(value, field);
  const record = await Model.findOne({ _id: id, companyId: actor.companyId }).select("_id");
  if (!record) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be a ${label} of this company` },
    ]);
  }
  return id;
};

const parseOptionalDate = (value, field) => {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.badRequest(`Invalid ${field}`, [
      { field, message: `${field} must be a valid date` },
    ]);
  }
  return date;
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

const populateAssignee = (lead) => lead.populate("assignedTo", "name email");

/**
 * Creates a lead for the actor's company.
 * companyId and createdBy always come from the authenticated actor; any
 * client-supplied values are never read.
 */
const createLead = async (actor, input, { ipAddress } = {}) => {
  assertEditLead(actor);

  const email = input.email === undefined ? undefined : normalizeEmail(input.email);

  const doc = {
    companyId: actor.companyId,
    createdBy: actor.id,
    name: normalizeString(input.name),
    phoneNumber: normalizeString(input.phoneNumber),
    source: normalizeString(input.source) || "OTHER",
    status: normalizeString(input.status) || "NEW",
  };

  if (email) doc.email = email;
  if (input.notes !== undefined) doc.notes = normalizeString(input.notes);
  if (input.assignedTo !== undefined && input.assignedTo !== null && input.assignedTo !== "") {
    doc.assignedTo = await sameCompanyRef(User, actor, input.assignedTo, "assignedTo", "user");
  }
  if (
    input.convertedClientId !== undefined &&
    input.convertedClientId !== null &&
    input.convertedClientId !== ""
  ) {
    doc.convertedClientId = await sameCompanyRef(
      Client,
      actor,
      input.convertedClientId,
      "convertedClientId",
      "client"
    );
  }
  const nextFollowUpAt = parseOptionalDate(input.nextFollowUpAt, "nextFollowUpAt");
  if (nextFollowUpAt !== undefined) doc.nextFollowUpAt = nextFollowUpAt;

  const [lead] = await Lead.create([doc]);

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "LEAD_CREATED",
    entityType: "LEAD",
    entityId: lead._id,
    description: `Created lead ${lead.name}`,
    metadata: { email: lead.email || "", source: lead.source, status: lead.status },
    ipAddress,
  });

  return toLeadView(lead);
};

// Builds the optional company-scoped filter from the documented query params.
// Values are validated/escaped by the shared query utils so bad input is a 400,
// never an unbounded regex or an unescaped injection.
const buildListFilter = (actor, query = {}) => {
  const filter = scopedQuery(actor.companyId);

  const search = parseSearch(query.search);
  if (search) {
    const regex = searchRegex(search);
    filter.$or = [{ name: regex }, { email: regex }, { phoneNumber: regex }];
  }

  const status = parseEnumFilter(query.status, LEAD_STATUSES, "status");
  if (status) filter.status = status;

  const source = parseEnumFilter(query.source, LEAD_SOURCES, "source");
  if (source) filter.source = source;

  const assignedTo = parseIdFilter(query.assignedTo, "assignedTo");
  if (assignedTo) filter.assignedTo = assignedTo;

  const createdRange = rangeFilter("createdAt", parseDateBounds(query));
  if (createdRange) filter.createdAt = createdRange.createdAt;

  return filter;
};

const listLeads = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);
  const filter = buildListFilter(actor, query);

  const [total, leads] = await Promise.all([
    Lead.countDocuments(filter),
    Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  await Promise.all(leads.map(populateAssignee));

  return {
    leads: leads.map(toLeadView),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

const toStatusMap = (rows) => {
  const map = LEAD_STATUSES.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
  for (const row of rows) {
    if (row._id && Object.prototype.hasOwnProperty.call(map, row._id)) {
      map[row._id] = row.count;
    }
  }
  return map;
};

// Company-wide lead counters for the Leads page summary cards. Aggregated over
// the whole company (never the current pagination page).
const getLeadSummary = async (actor) => {
  const rows = await Lead.aggregate([
    { $match: { companyId: companyObjectId(actor) } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const byStatus = toStatusMap(rows);
  const total = LEAD_STATUSES.reduce((sum, key) => sum + byStatus[key], 0);

  return {
    total,
    new: byStatus.NEW,
    qualified: byStatus.QUALIFIED,
    won: byStatus.WON,
    byStatus,
  };
};

const getLead = async (actor, id) => {
  const lead = await findByCompanyOr404(Lead, actor.companyId, id, {}, LEAD_NOT_FOUND);
  await populateAssignee(lead);
  return toLeadView(lead);
};

/**
 * Updates a lead. Only the documented fields are ever read from the payload;
 * companyId and createdBy are immutable.
 */
const updateLead = async (actor, id, input, { ipAddress } = {}) => {
  assertEditLead(actor);
  const lead = await findByCompanyOr404(Lead, actor.companyId, id, {}, LEAD_NOT_FOUND);

  const changed = [];

  if (input.name !== undefined) {
    lead.name = normalizeString(input.name);
    changed.push("name");
  }
  if (input.phoneNumber !== undefined) {
    lead.phoneNumber = normalizeString(input.phoneNumber);
    changed.push("phoneNumber");
  }
  if (input.email !== undefined) {
    lead.email = normalizeEmail(input.email);
    changed.push("email");
  }
  if (input.source !== undefined) {
    lead.source = normalizeString(input.source);
    changed.push("source");
  }
  if (input.status !== undefined) {
    lead.status = normalizeString(input.status);
    changed.push("status");
  }
  if (input.notes !== undefined) {
    lead.notes = normalizeString(input.notes);
    changed.push("notes");
  }
  if (input.assignedTo !== undefined) {
    lead.assignedTo =
      input.assignedTo === null || input.assignedTo === ""
        ? null
        : await sameCompanyRef(User, actor, input.assignedTo, "assignedTo", "user");
    changed.push("assignedTo");
  }
  if (input.nextFollowUpAt !== undefined) {
    lead.nextFollowUpAt = parseOptionalDate(input.nextFollowUpAt, "nextFollowUpAt") || null;
    changed.push("nextFollowUpAt");
  }
  if (input.convertedClientId !== undefined) {
    lead.convertedClientId =
      input.convertedClientId === null || input.convertedClientId === ""
        ? null
        : await sameCompanyRef(
            Client,
            actor,
            input.convertedClientId,
            "convertedClientId",
            "client"
          );
    changed.push("convertedClientId");
  }

  if (changed.length > 0) {
    await lead.save();

    await recordUserActivity({
      companyId: actor.companyId,
      performedBy: actor.id,
      action: "LEAD_UPDATED",
      entityType: "LEAD",
      entityId: lead._id,
      description: `Updated ${changed.join(", ")} of lead ${lead.name}`,
      metadata: { fields: changed },
      ipAddress,
    });
  }

  await populateAssignee(lead);
  return toLeadView(lead);
};

const deleteLead = async (actor, id, { ipAddress } = {}) => {
  assertDeleteLead(actor);
  const lead = await findByCompanyOr404(Lead, actor.companyId, id, {}, LEAD_NOT_FOUND);

  await Lead.deleteOne({ _id: lead._id, companyId: actor.companyId });

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "LEAD_DELETED",
    entityType: "LEAD",
    entityId: lead._id,
    description: `Deleted lead ${lead.name}`,
    metadata: { name: lead.name },
    ipAddress,
  });

  return { id: String(lead._id) };
};

module.exports = {
  createLead,
  listLeads,
  getLeadSummary,
  getLead,
  updateLead,
  deleteLead,
  assertEditLead,
  assertDeleteLead,
};