const Client = require("./client.model");
const AppError = require("../../common/error/AppError");
const { CLIENT_EDIT_ROLES, CLIENT_DELETE_ROLES } = require("../../common/constants");
const { scopedQuery, findByCompanyOr404 } = require("../../common/utils/scope");
const {
  parsePagination,
  paginationMeta,
  parseSearch,
  searchRegex,
  parseEnumFilter,
  parseSort,
} = require("../../common/utils/query");
const { normalizeEmail, normalizeString } = require("../../common/utils/normalize");
const { recordUserActivity } = require("../activity-logs/activityLog.service");
const { CLIENT_TYPES } = require("./client.validation");
const { toClientView, toClientOption } = require("./client.util");

const CLIENT_NOT_FOUND = "Client not found";
const SORTABLE = ["name", "createdAt", "clientType"];

const assertEditClient = (actor) => {
  if (!CLIENT_EDIT_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to manage clients", "FORBIDDEN");
  }
};

const assertDeleteClient = (actor) => {
  if (!CLIENT_DELETE_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to delete clients", "FORBIDDEN");
  }
};

// Lightweight company directory for pickers (follow-up/quotation/invoice/payment
// forms). Any authenticated member may load it; only the minimal fields ever
// leave the server.
const listClientOptions = async (actor) => {
  const clients = await Client.find({ companyId: actor.companyId, isActive: true })
    .sort({ name: 1 })
    .select("name phoneNumber email");

  return clients.map(toClientOption);
};

/**
 * Creates a client for the actor's company.
 * companyId and createdBy always come from the authenticated actor; any
 * client-supplied values are never read.
 */
const createClient = async (actor, input, { ipAddress } = {}) => {
  assertEditClient(actor);

  const email = input.email === undefined ? undefined : normalizeEmail(input.email);

  const doc = {
    companyId: actor.companyId,
    createdBy: actor.id,
    name: normalizeString(input.name),
    clientType: normalizeString(input.clientType) || "INDIVIDUAL",
  };

  if (input.phoneNumber !== undefined) doc.phoneNumber = normalizeString(input.phoneNumber);
  if (email) doc.email = email;
  if (input.address !== undefined) doc.address = normalizeString(input.address);
  if (input.gstNo !== undefined && input.gstNo !== null && input.gstNo !== "") {
    doc.gstNo = normalizeString(input.gstNo);
  }
  if (input.notes !== undefined) doc.notes = normalizeString(input.notes);

  const [client] = await Client.create([doc]);

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "CLIENT_CREATED",
    entityType: "CLIENT",
    entityId: client._id,
    description: `Created client ${client.name}`,
    metadata: { clientType: client.clientType },
    ipAddress,
  });

  return toClientView(client);
};

// Builds the optional company-scoped filter from the documented query params.
// Archived clients are never listed. Search covers name, email and phone; the
// shared query utils escape input so bad terms can never become an injection.
const buildListFilter = (actor, query = {}) => {
  const filter = scopedQuery(actor.companyId, { isActive: true });

  const search = parseSearch(query.search);
  if (search) {
    const regex = searchRegex(search);
    filter.$or = [{ name: regex }, { email: regex }, { phoneNumber: regex }];
  }

  const clientType = parseEnumFilter(query.clientType, CLIENT_TYPES, "clientType");
  if (clientType) filter.clientType = clientType;

  return filter;
};

const listClients = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);
  const filter = buildListFilter(actor, query);
  const sort = parseSort(query, { allowlist: SORTABLE, default: { name: 1 } });

  const [total, clients] = await Promise.all([
    Client.countDocuments(filter),
    Client.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return {
    clients: clients.map(toClientView),
    pagination: paginationMeta(page, limit, total),
  };
};

const getClient = async (actor, id) => {
  const client = await findByCompanyOr404(Client, actor.companyId, id, {}, CLIENT_NOT_FOUND);
  return toClientView(client);
};

/**
 * Updates a client. Only the documented fields are ever read from the payload;
 * companyId and createdBy are immutable.
 */
const updateClient = async (actor, id, input, { ipAddress } = {}) => {
  assertEditClient(actor);
  const client = await findByCompanyOr404(Client, actor.companyId, id, {}, CLIENT_NOT_FOUND);

  const changed = [];

  if (input.name !== undefined) {
    client.name = normalizeString(input.name);
    changed.push("name");
  }
  if (input.phoneNumber !== undefined) {
    client.phoneNumber = normalizeString(input.phoneNumber);
    changed.push("phoneNumber");
  }
  if (input.email !== undefined) {
    client.email = normalizeEmail(input.email);
    changed.push("email");
  }
  if (input.address !== undefined) {
    client.address = normalizeString(input.address);
    changed.push("address");
  }
  if (input.gstNo !== undefined) {
    const gstNo = normalizeString(input.gstNo);
    client.gstNo = gstNo ? gstNo : null;
    changed.push("gstNo");
  }
  if (input.clientType !== undefined) {
    client.clientType = normalizeString(input.clientType);
    changed.push("clientType");
  }
  if (input.notes !== undefined) {
    client.notes = normalizeString(input.notes);
    changed.push("notes");
  }

  if (changed.length > 0) {
    await client.save();

    await recordUserActivity({
      companyId: actor.companyId,
      performedBy: actor.id,
      action: "CLIENT_UPDATED",
      entityType: "CLIENT",
      entityId: client._id,
      description: `Updated ${changed.join(", ")} of client ${client.name}`,
      metadata: { fields: changed },
      ipAddress,
    });
  }

  return toClientView(client);
};

/**
 * Archives a client (soft delete). The record is retained so quotations,
 * invoices, payments and follow-ups that reference it stay intact, but it is
 * hidden from every list and picker.
 */
const deleteClient = async (actor, id, { ipAddress } = {}) => {
  assertDeleteClient(actor);
  const client = await findByCompanyOr404(Client, actor.companyId, id, {}, CLIENT_NOT_FOUND);

  client.isActive = false;
  await client.save();

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "CLIENT_DELETED",
    entityType: "CLIENT",
    entityId: client._id,
    description: `Archived client ${client.name}`,
    metadata: { name: client.name },
    ipAddress,
  });

  return { id: String(client._id) };
};

module.exports = {
  createClient,
  listClients,
  listClientOptions,
  getClient,
  updateClient,
  deleteClient,
  assertEditClient,
  assertDeleteClient,
};
