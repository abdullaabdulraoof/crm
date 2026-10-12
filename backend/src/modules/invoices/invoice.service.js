const Invoice = require("./invoice.model");
const Quotation = require("../quotations/quotation.model");
const Lead = require("../leads/lead.model");
const Client = require("../client/client.model");
const Product = require("../products/product.model");
const AppError = require("../../common/error/AppError");
const { INVOICE_EDIT_ROLES, INVOICE_DELETE_ROLES } = require("../../common/constants");
const { parseId, scopedQuery, findByCompanyOr404 } = require("../../common/utils/scope");
const { normalizeString } = require("../../common/utils/normalize");
const { recordUserActivity } = require("../activity-logs/activityLog.service");
const { toInvoiceView, round2 } = require("./invoice.util");
const { INVOICE_STATUSES } = require("./invoice.validation");

const INVOICE_NOT_FOUND = "Invoice not found";
const EDIT_MESSAGE = "You do not have permission to manage invoices";
const DELETE_MESSAGE = "You do not have permission to delete invoices";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Statuses whose content is entirely locked (no field or status change).
const FULLY_LOCKED = ["PAID", "CANCELLED"];
// Statuses where only metadata (notes/paymentTerms/dueDate) may still change.
const METADATA_ONLY = ["ISSUED", "PARTIALLY_PAID"];

// Simple transition map - no workflow engine. PARTIALLY_PAID / PAID are only
// ever entered by the future Payments module; CANCELLED is reachable from
// DRAFT and ISSUED only.
const TRANSITIONS = {
  DRAFT: ["DRAFT", "ISSUED", "CANCELLED"],
  ISSUED: ["ISSUED", "CANCELLED"],
};

const LIST_POPULATE = [
  { path: "clientId", select: "name phoneNumber email" },
  { path: "quotationId", select: "quotationNumber" },
  { path: "createdBy", select: "name email" },
];
const SINGLE_POPULATE = [
  ...LIST_POPULATE,
  { path: "items.productId", select: "name sku" },
];

const assertEditInvoice = (actor) => {
  if (!INVOICE_EDIT_ROLES.includes(actor.role)) {
    throw AppError.forbidden(EDIT_MESSAGE, "FORBIDDEN");
  }
};

const assertDeleteInvoice = (actor) => {
  if (!INVOICE_DELETE_ROLES.includes(actor.role)) {
    throw AppError.forbidden(DELETE_MESSAGE, "FORBIDDEN");
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
  if (!INVOICE_STATUSES.includes(normalized)) {
    throw AppError.badRequest("Invalid status", [
      { field: "status", message: `status must be one of: ${INVOICE_STATUSES.join(", ")}` },
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

// Date-range bound; a date-only string covers the whole day on the `to` side.
const parseDateBound = (value, field, endOfDay) => {
  const date = parseOptionalDate(value, field);
  if (date === undefined) return undefined;
  if (endOfDay && typeof value === "string" && DATE_ONLY_RE.test(value.trim())) {
    return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
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

    if (details.length > errorsBefore) continue;

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

  return summarize(items);
};

// Subtotal and per-line tax are recomputed from the stored item snapshots so
// converted and direct invoices share exactly one arithmetic path.
const summarize = (items) => {
  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const taxAmount = round2(
    items.reduce((sum, item) => sum + round2((item.amount * item.gstRate) / 100), 0)
  );
  return { items, subtotal, taxAmount };
};

// totalAmount = subtotal - discount + taxAmount, never negative.
const resolveTotals = (subtotal, taxAmount, rawDiscount, label = "invoice") => {
  const discountAmount = round2(rawDiscount === undefined || rawDiscount === null ? 0 : rawDiscount);
  const totalAmount = round2(subtotal - discountAmount + taxAmount);
  if (totalAmount < 0) {
    throw AppError.badRequest("Validation failed", [
      { field: "discountAmount", message: `discountAmount is too large for this ${label}` },
    ]);
  }
  return { discountAmount, totalAmount };
};

/**
 * INV-YYYY-NNNN, unique per company. The unique index {companyId,
 * invoiceNumber} is the race-proof guarantee: on a concurrent collision
 * (E11000) the caller re-reads the new max and retries a bounded number of
 * times.
 */
const nextInvoiceNumber = async (companyId) => {
  const prefix = `INV-${new Date().getUTCFullYear()}-`;
  const existing = await Invoice.find({
    companyId,
    invoiceNumber: new RegExp(`^${escapeRegex(prefix)}\\d+$`),
  })
    .select("invoiceNumber")
    .lean();

  let max = 0;
  for (const doc of existing) {
    const parsed = parseInt(doc.invoiceNumber.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
};

// Resolves the client for a create-from-quotation: the quotation's client, or
// the client its lead was converted into, or a clear 400.
const resolveClientFromQuotation = async (actor, quotation) => {
  if (quotation.clientId) {
    return sameCompanyRef(Client, actor, quotation.clientId, "clientId", "client");
  }

  if (quotation.leadId) {
    const lead = await Lead.findOne({ _id: quotation.leadId, companyId: actor.companyId }).select(
      "convertedClientId"
    );
    if (lead && lead.convertedClientId) {
      const converted = await Client.findOne({
        _id: lead.convertedClientId,
        companyId: actor.companyId,
      }).select("_id");
      if (converted) return converted._id;
    }
  }

  throw AppError.badRequest("Invalid quotation", [
    {
      field: "quotationId",
      message: "quotation has no client to invoice; convert its lead to a client first",
    },
  ]);
};

// Ensures at least one usable item without trusting client-sent totals.
const requireItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw AppError.badRequest("Validation failed", [
      { field: "items", message: "items must contain at least one item" },
    ]);
  }
};

const createInvoice = async (actor, input, { ipAddress } = {}) => {
  assertEditInvoice(actor);

  const hasQuotation =
    input.quotationId !== undefined && input.quotationId !== null && input.quotationId !== "";

  let clientId;
  let quotationId = null;
  let items;
  let subtotal;
  let taxAmount;
  let rawDiscount;
  let defaultNotes;

  if (hasQuotation) {
    quotationId = parseId(input.quotationId, "quotationId");
    const quotation = await Quotation.findOne({ _id: quotationId, companyId: actor.companyId });
    if (!quotation) {
      throw AppError.badRequest("Invalid quotationId", [
        { field: "quotationId", message: "quotationId must be a quotation of this company" },
      ]);
    }
    if (quotation.status !== "ACCEPTED") {
      throw AppError.badRequest("Invalid quotation", [
        { field: "quotationId", message: "quotation must be ACCEPTED to generate an invoice" },
      ]);
    }

    clientId = await resolveClientFromQuotation(actor, quotation);

    // Copy the accepted snapshot verbatim, then recompute totals server-side.
    requireItems(quotation.items);
    items = quotation.items.map((item) => ({
      productId: item.productId || null,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      gstRate: item.gstRate,
      amount: round2(item.quantity * item.unitPrice),
    }));
    ({ subtotal, taxAmount } = summarize(items));
    rawDiscount = quotation.discountAmount;
    defaultNotes = quotation.notes;
  } else {
    clientId = await sameCompanyRef(Client, actor, input.clientId, "clientId", "client");
    ({ items, subtotal, taxAmount } = await buildItems(actor, input.items));
    rawDiscount = input.discountAmount;
    defaultNotes = undefined;
  }

  const { discountAmount, totalAmount } = resolveTotals(subtotal, taxAmount, rawDiscount);
  const issueDate = parseOptionalDate(input.issueDate, "issueDate") || new Date();
  const dueDate = parseOptionalDate(input.dueDate, "dueDate") || null;

  const doc = {
    companyId: actor.companyId,
    createdBy: actor.id,
    quotationId,
    clientId,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    amountPaid: 0,
    balanceDue: totalAmount,
    issueDate,
    dueDate,
    status: "DRAFT",
    notes: input.notes !== undefined ? normalizeString(input.notes) : defaultNotes || "",
    paymentTerms: input.paymentTerms !== undefined ? normalizeString(input.paymentTerms) : "",
  };

  // Allocate the number and insert, retrying the whole insert when another
  // concurrent create wins the unique index race.
  let invoice = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    doc.invoiceNumber = await nextInvoiceNumber(actor.companyId);
    try {
      [invoice] = await Invoice.create([doc]);
      break;
    } catch (err) {
      if (err && err.code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  if (!invoice) throw AppError.conflict("Could not allocate an invoice number, please retry");

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "INVOICE_CREATED",
    entityType: "INVOICE",
    entityId: invoice._id,
    description: `Created invoice ${invoice.invoiceNumber}`,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      source: quotationId ? "quotation" : "direct",
    },
    ipAddress,
  });

  await invoice.populate(LIST_POPULATE);
  return toInvoiceView(invoice);
};

const listInvoices = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);
  const filter = scopedQuery(actor.companyId);

  const status = parseStatusFilter(query.status);
  if (status === "OVERDUE") {
    filter.status = { $in: ["ISSUED", "PARTIALLY_PAID"] };
    filter.dueDate = { $ne: null, $lt: new Date() };
    filter.balanceDue = { $gt: 0 };
  } else if (status) {
    filter.status = status;
  }

  const clientId = parseOptionalId(query.clientId, "clientId");
  if (clientId) filter.clientId = clientId;

  const from = parseDateBound(query.from, "from", false);
  const to = parseDateBound(query.to, "to", true);
  if (from || to) {
    filter.issueDate = {};
    if (from) filter.issueDate.$gte = from;
    if (to) filter.issueDate.$lte = to;
  }

  const search =
    query.search === undefined || query.search === null ? "" : normalizeString(String(query.search));
  if (search.length > 100) {
    throw AppError.badRequest("Invalid search", [
      { field: "search", message: "search must be at most 100 characters" },
    ]);
  }
  if (search) {
    const safe = new RegExp(escapeRegex(search), "i");
    const matchingClients = await Client.find({ companyId: actor.companyId, name: safe })
      .select("_id")
      .lean();
    filter.$or = [
      { invoiceNumber: safe },
      { clientId: { $in: matchingClients.map((d) => d._id) } },
    ];
  }

  const [total, invoices] = await Promise.all([
    Invoice.countDocuments(filter),
    Invoice.find(filter)
      .sort({ issueDate: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(LIST_POPULATE),
  ]);

  return {
    invoices: invoices.map(toInvoiceView),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

const getInvoice = async (actor, id) => {
  const invoice = await findByCompanyOr404(Invoice, actor.companyId, id, {}, INVOICE_NOT_FOUND);
  await invoice.populate(SINGLE_POPULATE);
  return toInvoiceView(invoice);
};

const assertStatusChange = (from, to) => {
  if (from === to) return;
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw AppError.badRequest(`Cannot change status from ${from}`, [
      {
        field: "status",
        message: `A ${from} invoice cannot change status to ${to}`,
      },
    ]);
  }
};

/**
 * Updates an invoice. companyId, createdBy and invoiceNumber are immutable and
 * amountPaid is never touched here (the future Payments module owns it); money
 * totals are always recomputed server-side. DRAFT invoices allow full edits;
 * ISSUED / PARTIALLY_PAID allow metadata only; PAID / CANCELLED are locked.
 */
const updateInvoice = async (actor, id, input, { ipAddress } = {}) => {
  assertEditInvoice(actor);
  const invoice = await findByCompanyOr404(Invoice, actor.companyId, id, {}, INVOICE_NOT_FOUND);

  const locked = FULLY_LOCKED.includes(invoice.status);
  const metadataOnly = METADATA_ONLY.includes(invoice.status);

  const touchesContent =
    input.clientId !== undefined ||
    input.items !== undefined ||
    input.discountAmount !== undefined ||
    input.issueDate !== undefined;

  if (locked && (touchesContent || input.notes !== undefined || input.paymentTerms !== undefined ||
      input.dueDate !== undefined || input.status !== undefined)) {
    throw AppError.badRequest(`A ${invoice.status} invoice can no longer be edited`, [
      { field: "status", message: `A ${invoice.status} invoice can no longer be edited` },
    ]);
  }
  if (metadataOnly && touchesContent) {
    throw AppError.badRequest(`A ${invoice.status} invoice can no longer change its content`, [
      { field: "status", message: `A ${invoice.status} invoice cannot change content once issued` },
    ]);
  }

  const changed = [];
  const previousStatus = invoice.status;

  if (input.clientId !== undefined) {
    invoice.clientId = await sameCompanyRef(Client, actor, input.clientId, "clientId", "client");
    changed.push("clientId");
  }

  if (input.items !== undefined) {
    const { items, subtotal, taxAmount } = await buildItems(actor, input.items);
    const discount = input.discountAmount !== undefined ? input.discountAmount : invoice.discountAmount;
    const { discountAmount, totalAmount } = resolveTotals(subtotal, taxAmount, discount);
    invoice.items = items;
    invoice.subtotal = subtotal;
    invoice.taxAmount = taxAmount;
    invoice.discountAmount = discountAmount;
    invoice.totalAmount = totalAmount;
    changed.push("items", "subtotal", "taxAmount", "totalAmount");
    if (input.discountAmount !== undefined) changed.push("discountAmount");
  } else if (input.discountAmount !== undefined) {
    const { discountAmount, totalAmount } = resolveTotals(
      invoice.subtotal,
      invoice.taxAmount,
      input.discountAmount
    );
    invoice.discountAmount = discountAmount;
    invoice.totalAmount = totalAmount;
    changed.push("discountAmount", "totalAmount");
  }

  if (input.issueDate !== undefined) {
    invoice.issueDate = parseOptionalDate(input.issueDate, "issueDate") || invoice.issueDate;
    changed.push("issueDate");
  }
  if (input.dueDate !== undefined) {
    invoice.dueDate = parseOptionalDate(input.dueDate, "dueDate") || null;
    changed.push("dueDate");
  }
  if (input.notes !== undefined) {
    invoice.notes = normalizeString(input.notes);
    changed.push("notes");
  }
  if (input.paymentTerms !== undefined) {
    invoice.paymentTerms = normalizeString(input.paymentTerms);
    changed.push("paymentTerms");
  }

  // Recompute the outstanding balance whenever the total moved. amountPaid is
  // only ever changed by payments, so a total that drops below it is rejected.
  if (changed.includes("totalAmount")) {
    if (round2(invoice.totalAmount) < round2(invoice.amountPaid)) {
      throw AppError.badRequest("Validation failed", [
        { field: "totalAmount", message: "totalAmount cannot be less than the amount already paid" },
      ]);
    }
    invoice.balanceDue = round2(invoice.totalAmount - invoice.amountPaid);
    changed.push("balanceDue");
  }

  if (input.status !== undefined) {
    const nextStatus = normalizeString(input.status);
    if (nextStatus) {
      assertStatusChange(invoice.status, nextStatus);
      if (nextStatus !== invoice.status) {
        invoice.status = nextStatus;
        changed.push("status");
      }
    }
  }

  if (changed.length > 0) {
    await invoice.save();

    const statusChanged = changed.includes("status");
    await recordUserActivity({
      companyId: actor.companyId,
      performedBy: actor.id,
      action: statusChanged ? "INVOICE_STATUS_CHANGED" : "INVOICE_UPDATED",
      entityType: "INVOICE",
      entityId: invoice._id,
      description: statusChanged
        ? `Changed status of ${invoice.invoiceNumber} from ${previousStatus} to ${invoice.status}`
        : `Updated ${changed.join(", ")} of invoice ${invoice.invoiceNumber}`,
      metadata: {
        fields: changed,
        ...(statusChanged ? { previousStatus, status: invoice.status } : {}),
        totalAmount: invoice.totalAmount,
      },
      ipAddress,
    });
  }

  await invoice.populate(LIST_POPULATE);
  return toInvoiceView(invoice);
};

/**
 * Physical delete, matching the leads/quotations convention (the CRM has no
 * soft-delete convention for transactional records). Only DRAFT invoices may be
 * deleted; issued or paid invoices must be cancelled instead. Never touches
 * clients, quotations, products or payments.
 */
const deleteInvoice = async (actor, id, { ipAddress } = {}) => {
  assertDeleteInvoice(actor);
  const invoice = await findByCompanyOr404(Invoice, actor.companyId, id, {}, INVOICE_NOT_FOUND);

  if (invoice.status !== "DRAFT") {
    throw AppError.badRequest(`A ${invoice.status} invoice cannot be deleted`, [
      { field: "status", message: "Only draft invoices can be deleted; cancel it instead" },
    ]);
  }

  await Invoice.deleteOne({ _id: invoice._id, companyId: actor.companyId });

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "INVOICE_DELETED",
    entityType: "INVOICE",
    entityId: invoice._id,
    description: `Deleted invoice ${invoice.invoiceNumber}`,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
    },
    ipAddress,
  });

  return { id: String(invoice._id), invoiceNumber: invoice.invoiceNumber };
};

module.exports = {
  createInvoice,
  listInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  assertEditInvoice,
  assertDeleteInvoice,
};
