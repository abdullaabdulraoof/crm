const Quotation = require("./quotation.model");
const Lead = require("../leads/lead.model");
const Client = require("../client/client.model");
const Product = require("../products/product.model");
const AppError = require("../../common/error/AppError");
const { QUOTATION_EDIT_ROLES, QUOTATION_DELETE_ROLES } = require("../../common/constants");
const { parseId, scopedQuery, findByCompanyOr404 } = require("../../common/utils/scope");
const { normalizeString } = require("../../common/utils/normalize");
const { recordUserActivity } = require("../activity-logs/activityLog.service");
const { toQuotationView, round2 } = require("./quotation.util");
const { TERMINAL_STATUSES } = require("./quotation.validation");

const QUOTATION_NOT_FOUND = "Quotation not found";
const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

const LIST_POPULATE = [
  { path: "leadId", select: "name phoneNumber" },
  { path: "clientId", select: "name phoneNumber" },
  { path: "createdBy", select: "name email" },
];
const SINGLE_POPULATE = [
  ...LIST_POPULATE,
  { path: "items.productId", select: "name sku" },
];

const assertEditQuotation = (actor) => {
  if (!QUOTATION_EDIT_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to manage quotations", "FORBIDDEN");
  }
};

const assertDeleteQuotation = (actor) => {
  if (!QUOTATION_DELETE_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to delete quotations", "FORBIDDEN");
  }
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

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseStatusFilter = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = normalizeString(value);
  if (!QUOTATION_STATUSES.includes(normalized)) {
    throw AppError.badRequest("Invalid status", [
      { field: "status", message: `status must be one of: ${QUOTATION_STATUSES.join(", ")}` },
    ]);
  }
  return normalized;
};

const parseOptionalId = (value, field) => {
  if (value === undefined || value === null || value === "") return undefined;
  return parseId(value, field);
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

// Company-owned reference: the record must exist inside the actor's company.
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

// Exactly one of leadId/clientId, validated against the actor's company.
// Returns { leadId, clientId } with the absent side as null.
const resolveTarget = async (actor, input) => {
  const hasLead = input.leadId !== undefined && input.leadId !== null && input.leadId !== "";
  const hasClient = input.clientId !== undefined && input.clientId !== null && input.clientId !== "";

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

  if (hasLead) {
    return {
      leadId: await sameCompanyRef(Lead, actor, input.leadId, "leadId", "lead"),
      clientId: null,
    };
  }
  return {
    leadId: null,
    clientId: await sameCompanyRef(Client, actor, input.clientId, "clientId", "client"),
  };
};

/**
 * Validates every line item and computes item amounts, subtotal and tax.
 *
 * Server authoritative: for a product-linked line the description/unitPrice/
 * gstRate are overwritten from the current Product record (the client only
 * chooses the product and quantity). Manual lines keep their validated
 * description/unitPrice/gstRate. The client-sent `amount` is never read.
 */
const buildItems = async (actor, rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw AppError.badRequest("Validation failed", [
      { field: "items", message: "items must contain at least one item" },
    ]);
  }

  const details = [];
  const items = [];

  for (let i = 0; i < rawItems.length; i += 1) {
    const raw = rawItems[i];
    const at = (field) => `items.${i}.${field}`;
    const errorsBefore = details.length;

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      details.push({ field: `items.${i}`, message: `items.${i} must be an object` });
      continue;
    }

    const quantity = raw.quantity;
    const hasProduct =
      raw.productId !== undefined && raw.productId !== null && raw.productId !== "";

    let productId = null;
    let lineDescription;
    let lineUnitPrice;
    let lineGstRate;

    if (hasProduct) {
      // Server authoritative: only the reference and the quantity come from
      // the client; description/unitPrice/gstRate are the product's current
      // values. Manual-field validation does not apply to this line.
      try {
        const pid = parseId(raw.productId, "productId");
        const product = await Product.findOne({ _id: pid, companyId: actor.companyId });
        if (!product) {
          details.push({
            field: at("productId"),
            message: "productId must be a product of this company",
          });
        } else {
          productId = pid;
          lineDescription = product.name;
          lineUnitPrice = product.unitPrice;
          lineGstRate = product.gstRate;
        }
      } catch (err) {
        if (err instanceof AppError) {
          details.push({
            field: at("productId"),
            message: (err.details && err.details[0] && err.details[0].message) || "invalid productId",
          });
        } else {
          throw err;
        }
      }
    } else {
      lineDescription = typeof raw.description === "string" ? raw.description.trim() : "";
      if (!lineDescription) {
        details.push({ field: at("description"), message: "description is required" });
      } else if (lineDescription.length > 500) {
        details.push({ field: at("description"), message: "description must be at most 500 characters" });
      }

      lineUnitPrice = raw.unitPrice;
      if (typeof lineUnitPrice !== "number" || !Number.isFinite(lineUnitPrice) || lineUnitPrice < 0) {
        details.push({ field: at("unitPrice"), message: "unitPrice must be a number of at least 0" });
      }

      lineGstRate =
        raw.gstRate === undefined || raw.gstRate === null || raw.gstRate === "" ? 0 : raw.gstRate;
      if (
        typeof lineGstRate !== "number" ||
        !Number.isFinite(lineGstRate) ||
        lineGstRate < 0 ||
        lineGstRate > 100
      ) {
        details.push({ field: at("gstRate"), message: "gstRate must be a number between 0 and 100" });
      }
    }

    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
      details.push({ field: at("quantity"), message: "quantity must be a number greater than 0" });
    }

    if (details.length > errorsBefore) continue; // this item is invalid; its errors are recorded

    const amount = round2(quantity * lineUnitPrice);
    items.push({
      productId,
      description: lineDescription,
      quantity,
      unitPrice: lineUnitPrice,
      gstRate: lineGstRate,
      amount,
    });
  }

  if (details.length > 0) {
    throw AppError.badRequest("Validation failed", details);
  }
  if (items.length === 0) {
    throw AppError.badRequest("Validation failed", [
      { field: "items", message: "items must contain at least one item" },
    ]);
  }

  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  // Per-line tax is rounded first, then summed: taxAmount = round2(Σ round2(amount_i × gstRate_i / 100)).
  const taxAmount = round2(
    items.reduce((sum, item) => sum + round2((item.amount * item.gstRate) / 100), 0)
  );

  return { items, subtotal, taxAmount };
};

// totalAmount = subtotal - discount + taxAmount, never negative.
const resolveTotals = (subtotal, taxAmount, rawDiscount) => {
  const discountAmount = round2(rawDiscount === undefined || rawDiscount === null ? 0 : rawDiscount);
  const totalAmount = round2(subtotal - discountAmount + taxAmount);
  if (totalAmount < 0) {
    throw AppError.badRequest("Validation failed", [
      { field: "discountAmount", message: "discountAmount is too large for this quotation" },
    ]);
  }
  return { discountAmount, totalAmount };
};

/**
 * QT-YYYY-NNNN, unique per company. The unique index {companyId,
 * quotationNumber} is the race-proof guarantee: on a concurrent collision
 * (E11000) the caller re-reads the new max and retries a bounded number of
 * times.
 */
const nextQuotationNumber = async (companyId) => {
  const prefix = `QT-${new Date().getUTCFullYear()}-`;
  const existing = await Quotation.find({
    companyId,
    quotationNumber: new RegExp(`^${escapeRegex(prefix)}\\d+$`),
  })
    .select("quotationNumber")
    .lean();

  let max = 0;
  for (const doc of existing) {
    const parsed = parseInt(doc.quotationNumber.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
};

const createQuotation = async (actor, input, { ipAddress } = {}) => {
  assertEditQuotation(actor);

  const target = await resolveTarget(actor, input);
  const { items, subtotal, taxAmount } = await buildItems(actor, input.items);
  const { discountAmount, totalAmount } = resolveTotals(subtotal, taxAmount, input.discountAmount);
  const validUntil = parseOptionalDate(input.validUntil, "validUntil");

  const doc = {
    companyId: actor.companyId,
    createdBy: actor.id,
    leadId: target.leadId,
    clientId: target.clientId,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    status: input.status === undefined ? "DRAFT" : normalizeString(input.status) || "DRAFT",
  };
  if (validUntil !== undefined) doc.validUntil = validUntil;
  if (input.notes !== undefined) doc.notes = normalizeString(input.notes);

  // Allocate the number and insert, retrying the whole insert when another
  // concurrent create wins the unique index race.
  let quotation = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    doc.quotationNumber = await nextQuotationNumber(actor.companyId);
    try {
      [quotation] = await Quotation.create([doc]);
      break;
    } catch (err) {
      if (err && err.code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  if (!quotation) throw AppError.conflict("Could not allocate a quotation number, please retry");

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "QUOTATION_CREATED",
    entityType: "QUOTATION",
    entityId: quotation._id,
    description: `Created quotation ${quotation.quotationNumber}`,
    metadata: {
      quotationNumber: quotation.quotationNumber,
      status: quotation.status,
      totalAmount: quotation.totalAmount,
      target: quotation.leadId ? "lead" : "client",
    },
    ipAddress,
  });

  await quotation.populate(LIST_POPULATE);
  return toQuotationView(quotation);
};

const listQuotations = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);
  const filter = scopedQuery(actor.companyId);

  const status = parseStatusFilter(query.status);
  if (status) filter.status = status;

  const leadId = parseOptionalId(query.leadId, "leadId");
  if (leadId) filter.leadId = leadId;
  const clientId = parseOptionalId(query.clientId, "clientId");
  if (clientId) filter.clientId = clientId;

  const search =
    query.search === undefined || query.search === null ? "" : normalizeString(String(query.search));
  if (search.length > 100) {
    throw AppError.badRequest("Invalid search", [
      { field: "search", message: "search must be at most 100 characters" },
    ]);
  }
  if (search) {
    const safe = new RegExp(escapeRegex(search), "i");
    const [matchingLeads, matchingClients] = await Promise.all([
      Lead.find({ companyId: actor.companyId, name: safe }).select("_id").lean(),
      Client.find({ companyId: actor.companyId, name: safe }).select("_id").lean(),
    ]);
    filter.$or = [
      { quotationNumber: safe },
      { leadId: { $in: matchingLeads.map((d) => d._id) } },
      { clientId: { $in: matchingClients.map((d) => d._id) } },
    ];
  }

  const [total, quotations] = await Promise.all([
    Quotation.countDocuments(filter),
    Quotation.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(LIST_POPULATE),
  ]);

  return {
    quotations: quotations.map(toQuotationView),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

const getQuotation = async (actor, id) => {
  const quotation = await findByCompanyOr404(Quotation, actor.companyId, id, {}, QUOTATION_NOT_FOUND);
  await quotation.populate(SINGLE_POPULATE);
  return toQuotationView(quotation);
};

// Simple transition map - no workflow engine. DRAFT and SENT are open for
// any change; terminal statuses are locked to themselves.
const assertStatusChange = (from, to) => {
  if (from === to) return;
  if (TERMINAL_STATUSES.includes(from)) {
    throw AppError.badRequest(`Cannot change status from ${from}`, [
      {
        field: "status",
        message: `A ${from} quotation can no longer change status`,
      },
    ]);
  }
};

/**
 * Updates a quotation. companyId, createdBy and quotationNumber are
 * immutable; money totals are always recomputed server-side; the lead/client
 * target and every product-linked line are revalidated against the actor's
 * company. Terminal quotations keep their items but may change status only
 * per assertStatusChange (which locks them entirely).
 */
const updateQuotation = async (actor, id, input, { ipAddress } = {}) => {
  assertEditQuotation(actor);
  const quotation = await findByCompanyOr404(Quotation, actor.companyId, id, {}, QUOTATION_NOT_FOUND);

  const isTerminal = TERMINAL_STATUSES.includes(quotation.status);
  const touchesContent =
    input.leadId !== undefined ||
    input.clientId !== undefined ||
    input.items !== undefined ||
    input.discountAmount !== undefined ||
    input.validUntil !== undefined ||
    input.notes !== undefined;

  if (isTerminal && touchesContent) {
    throw AppError.badRequest(`A ${quotation.status} quotation can no longer be edited`, [
      { field: "status", message: `A ${quotation.status} quotation can no longer be edited` },
    ]);
  }

  const changed = [];
  let previousStatus = quotation.status;

  if (input.leadId !== undefined || input.clientId !== undefined) {
    const target = await resolveTarget(actor, input);
    quotation.leadId = target.leadId;
    quotation.clientId = target.clientId;
    changed.push("leadId", "clientId");
  }

  if (input.items !== undefined) {
    const { items, subtotal, taxAmount } = await buildItems(actor, input.items);
    const discount = input.discountAmount !== undefined ? input.discountAmount : quotation.discountAmount;
    const { discountAmount, totalAmount } = resolveTotals(subtotal, taxAmount, discount);
    quotation.items = items;
    quotation.subtotal = subtotal;
    quotation.taxAmount = taxAmount;
    quotation.discountAmount = discountAmount;
    quotation.totalAmount = totalAmount;
    changed.push("items", "subtotal", "taxAmount", "totalAmount");
    if (input.discountAmount !== undefined) changed.push("discountAmount");
  } else if (input.discountAmount !== undefined) {
    const { discountAmount, totalAmount } = resolveTotals(
      quotation.subtotal,
      quotation.taxAmount,
      input.discountAmount
    );
    quotation.discountAmount = discountAmount;
    quotation.totalAmount = totalAmount;
    changed.push("discountAmount", "totalAmount");
  }

  if (input.validUntil !== undefined) {
    quotation.validUntil = parseOptionalDate(input.validUntil, "validUntil") || null;
    changed.push("validUntil");
  }
  if (input.notes !== undefined) {
    quotation.notes = normalizeString(input.notes);
    changed.push("notes");
  }
  if (input.status !== undefined) {
    const nextStatus = normalizeString(input.status);
    if (nextStatus) {
      assertStatusChange(quotation.status, nextStatus);
      if (nextStatus !== quotation.status) {
        quotation.status = nextStatus;
        changed.push("status");
      }
    }
  }

  if (changed.length > 0) {
    await quotation.save();

    const statusChanged = changed.includes("status");
    await recordUserActivity({
      companyId: actor.companyId,
      performedBy: actor.id,
      action: "QUOTATION_UPDATED",
      entityType: "QUOTATION",
      entityId: quotation._id,
      description: statusChanged
        ? `Changed status of ${quotation.quotationNumber} from ${previousStatus} to ${quotation.status}`
        : `Updated ${changed.join(", ")} of quotation ${quotation.quotationNumber}`,
      metadata: {
        fields: changed,
        ...(statusChanged ? { previousStatus, status: quotation.status } : {}),
        totalAmount: quotation.totalAmount,
      },
      ipAddress,
    });
  }

  await quotation.populate(LIST_POPULATE);
  return toQuotationView(quotation);
};

/**
 * Physical delete, matching the leads convention (the CRM has no soft-delete
 * convention for transactional records). Never touches clients, leads,
 * products or invoices.
 */
const deleteQuotation = async (actor, id, { ipAddress } = {}) => {
  assertDeleteQuotation(actor);
  const quotation = await findByCompanyOr404(Quotation, actor.companyId, id, {}, QUOTATION_NOT_FOUND);

  await Quotation.deleteOne({ _id: quotation._id, companyId: actor.companyId });

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "QUOTATION_DELETED",
    entityType: "QUOTATION",
    entityId: quotation._id,
    description: `Deleted quotation ${quotation.quotationNumber}`,
    metadata: {
      quotationNumber: quotation.quotationNumber,
      status: quotation.status,
      totalAmount: quotation.totalAmount,
    },
    ipAddress,
  });

  return { id: String(quotation._id), quotationNumber: quotation.quotationNumber };
};

module.exports = {
  createQuotation,
  listQuotations,
  getQuotation,
  updateQuotation,
  deleteQuotation,
  assertEditQuotation,
  assertDeleteQuotation,
};
