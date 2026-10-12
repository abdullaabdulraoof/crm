const Payment = require("./payment.model");
const Invoice = require("../invoices/invoice.model");
const AppError = require("../../common/error/AppError");
const { PAYMENT_EDIT_ROLES, PAYMENT_VOID_ROLES } = require("../../common/constants");
const { parseId, scopedQuery, findByCompanyOr404 } = require("../../common/utils/scope");
const { normalizeString } = require("../../common/utils/normalize");
const { recordUserActivity } = require("../activity-logs/activityLog.service");
const { toPaymentView, round2 } = require("./payment.util");
const { PAYMENT_METHODS, PAYMENT_STATUSES } = require("./payment.validation");

const PAYMENT_NOT_FOUND = "Payment not found";
const RECORD_MESSAGE = "You do not have permission to record payments";
const VOID_MESSAGE = "You do not have permission to void payments";

// Statuses of an invoice that can accept a payment. DRAFT has no receivable,
// PAID is settled, CANCELLED is out of the ledger.
const PAYABLE_STATUSES = ["ISSUED", "PARTIALLY_PAID"];

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const LIST_POPULATE = [
  { path: "invoiceId", select: "invoiceNumber status totalAmount amountPaid balanceDue" },
  { path: "clientId", select: "name phoneNumber email" },
  { path: "recordedBy", select: "name email" },
  { path: "voidedBy", select: "name email" },
];

const assertRecordPayment = (actor) => {
  if (!PAYMENT_EDIT_ROLES.includes(actor.role)) {
    throw AppError.forbidden(RECORD_MESSAGE, "FORBIDDEN");
  }
};

const assertVoidPayment = (actor) => {
  if (!PAYMENT_VOID_ROLES.includes(actor.role)) {
    throw AppError.forbidden(VOID_MESSAGE, "FORBIDDEN");
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

const parseOptionalId = (value, field) => {
  if (value === undefined || value === null || value === "") return undefined;
  return parseId(value, field);
};

const parseOptionalDate = (value, field) => {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.badRequest(`Invalid ${field}`, [{ field, message: `${field} must be a valid date` }]);
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

const parseMethodFilter = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = normalizeString(value);
  if (!PAYMENT_METHODS.includes(normalized)) {
    throw AppError.badRequest("Invalid method", [
      { field: "method", message: `method must be one of: ${PAYMENT_METHODS.join(", ")}` },
    ]);
  }
  return normalized;
};

const parseStatusFilter = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = normalizeString(value);
  if (!PAYMENT_STATUSES.includes(normalized)) {
    throw AppError.badRequest("Invalid status", [
      { field: "status", message: `status must be one of: ${PAYMENT_STATUSES.join(", ")}` },
    ]);
  }
  return normalized;
};

const parseAmount = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw AppError.badRequest("Validation failed", [
      { field: "amount", message: "amount must be a number greater than 0" },
    ]);
  }
  const amount = round2(value);
  if (amount <= 0) {
    throw AppError.badRequest("Validation failed", [
      { field: "amount", message: "amount must be greater than 0" },
    ]);
  }
  return amount;
};

const parseMethod = (value) => {
  const method = normalizeString(value);
  if (!PAYMENT_METHODS.includes(method)) {
    throw AppError.badRequest("Validation failed", [
      { field: "method", message: `method must be one of: ${PAYMENT_METHODS.join(", ")}` },
    ]);
  }
  return method;
};

/**
 * PAY-YYYY-NNNN, unique per company. The unique index {companyId,
 * paymentNumber} is the race-proof guarantee: on a concurrent collision
 * (E11000) the caller re-reads the new max and retries a bounded number of
 * times.
 */
const nextPaymentNumber = async (companyId) => {
  const prefix = `PAY-${new Date().getUTCFullYear()}-`;
  const existing = await Payment.find({
    companyId,
    paymentNumber: new RegExp(`^${escapeRegex(prefix)}\\d+$`),
  })
    .select("paymentNumber")
    .lean();

  let max = 0;
  for (const doc of existing) {
    const parsed = parseInt(doc.paymentNumber.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
};

// Loads an invoice scoped to the actor's company. A missing or cross-company
// invoice yields the same 400 so existence is not leaked across tenants.
const loadPayableInvoice = async (actor, invoiceId) => {
  const id = parseId(invoiceId, "invoiceId");
  const invoice = await Invoice.findOne({ _id: id, companyId: actor.companyId });
  if (!invoice) {
    throw AppError.badRequest("Invalid invoiceId", [
      { field: "invoiceId", message: "invoiceId must be an invoice of this company" },
    ]);
  }
  return invoice;
};

/**
 * Records a manual payment and updates the invoice balance.
 *
 * Transactions are unavailable on the target deployment (standalone MongoDB),
 * so atomicity is achieved with a single conditional findOneAndUpdate on the
 * invoice: the update only matches while the invoice is payable AND its
 * balanceDue still covers the amount. Two concurrent payments can therefore
 * never take the balance below zero. The payment is created first so that a
 * missing balance update can be compensated by deleting it; if the guarded
 * update loses the race the freshly created payment is removed and the caller
 * gets a clear error.
 */
const recordPayment = async (actor, input, { ipAddress } = {}) => {
  assertRecordPayment(actor);

  const amount = parseAmount(input.amount);
  const method = parseMethod(input.method);
  const paymentDate = parseOptionalDate(input.paymentDate, "paymentDate") || new Date();
  const transactionReference = normalizeString(input.transactionReference);
  const notes = normalizeString(input.notes);

  const invoice = await loadPayableInvoice(actor, input.invoiceId);

  if (!PAYABLE_STATUSES.includes(invoice.status)) {
    throw AppError.badRequest("Invalid invoice status", [
      {
        field: "invoiceId",
        message: `A ${invoice.status} invoice cannot receive a payment`,
      },
    ]);
  }
  if (round2(amount) > round2(invoice.balanceDue)) {
    throw AppError.badRequest("Validation failed", [
      { field: "amount", message: "amount cannot exceed the invoice balance due" },
    ]);
  }

  const doc = {
    companyId: actor.companyId,
    invoiceId: invoice._id,
    clientId: invoice.clientId,
    amount,
    paymentDate,
    method,
    transactionReference,
    notes,
    status: "RECORDED",
    recordedBy: actor.id,
  };

  // Allocate the number and insert, retrying the whole insert when another
  // concurrent create wins the unique index race.
  let payment = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    doc.paymentNumber = await nextPaymentNumber(actor.companyId);
    try {
      [payment] = await Payment.create([doc]);
      break;
    } catch (err) {
      if (err && err.code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  if (!payment) throw AppError.conflict("Could not allocate a payment number, please retry");

  // Atomic guarded debit. Matching on balanceDue >= amount makes concurrent
  // overpayment impossible; the pipeline recomputes the derived status in the
  // same document write.
  let updatedInvoice = null;
  try {
    updatedInvoice = await Invoice.findOneAndUpdate(
      {
        _id: invoice._id,
        companyId: actor.companyId,
        status: { $in: PAYABLE_STATUSES },
        balanceDue: { $gte: amount },
      },
      [
        {
          $set: {
            amountPaid: { $round: [{ $add: ["$amountPaid", amount] }, 2] },
            balanceDue: { $round: [{ $subtract: ["$balanceDue", amount] }, 2] },
          },
        },
        {
          $set: {
            status: { $cond: [{ $lte: ["$balanceDue", 0] }, "PAID", "PARTIALLY_PAID"] },
          },
        },
      ],
      { new: true, updatePipeline: true }
    );
  } catch (err) {
    // Never leave a payment behind if the balance update errored.
    await Payment.deleteOne({ _id: payment._id, companyId: actor.companyId }).catch(() => {});
    throw err;
  }

  if (!updatedInvoice) {
    // Lost the race between the pre-check and the guarded update: compensate.
    await Payment.deleteOne({ _id: payment._id, companyId: actor.companyId });
    const current = await Invoice.findOne({ _id: invoice._id, companyId: actor.companyId }).select(
      "status balanceDue"
    );
    if (current && !PAYABLE_STATUSES.includes(current.status)) {
      throw AppError.badRequest("Invalid invoice status", [
        { field: "invoiceId", message: `A ${current.status} invoice cannot receive a payment` },
      ]);
    }
    throw AppError.badRequest("Validation failed", [
      { field: "amount", message: "amount cannot exceed the invoice balance due" },
    ]);
  }

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "PAYMENT_RECORDED",
    entityType: "PAYMENT",
    entityId: payment._id,
    description: `Recorded ${payment.paymentNumber} of ${amount} against ${updatedInvoice.invoiceNumber}`,
    metadata: {
      paymentNumber: payment.paymentNumber,
      invoiceId: String(updatedInvoice._id),
      invoiceNumber: updatedInvoice.invoiceNumber,
      amount,
      method,
      invoiceStatus: updatedInvoice.status,
    },
    ipAddress,
  });

  await payment.populate(LIST_POPULATE);
  return toPaymentView(payment);
};

const listPayments = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);
  const filter = scopedQuery(actor.companyId);

  const invoiceId = parseOptionalId(query.invoiceId, "invoiceId");
  if (invoiceId) filter.invoiceId = invoiceId;

  const clientId = parseOptionalId(query.clientId, "clientId");
  if (clientId) filter.clientId = clientId;

  const method = parseMethodFilter(query.method);
  if (method) filter.method = method;

  const status = parseStatusFilter(query.status);
  if (status) filter.status = status;

  const from = parseDateBound(query.from, "from", false);
  const to = parseDateBound(query.to, "to", true);
  if (from || to) {
    filter.paymentDate = {};
    if (from) filter.paymentDate.$gte = from;
    if (to) filter.paymentDate.$lte = to;
  }

  const [total, payments] = await Promise.all([
    Payment.countDocuments(filter),
    Payment.find(filter)
      .sort({ paymentDate: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(LIST_POPULATE),
  ]);

  return {
    payments: payments.map(toPaymentView),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

const getPayment = async (actor, id) => {
  const payment = await findByCompanyOr404(Payment, actor.companyId, id, {}, PAYMENT_NOT_FOUND);
  await payment.populate(LIST_POPULATE);
  return toPaymentView(payment);
};

/**
 * Voids a recorded payment without deleting it, then safely rebuilds the
 * invoice balance. Because the invoice stores the authoritative amountPaid
 * (not a per-payment sum), recalculation simply subtracts the voided amount,
 * which stays correct even when later payments were recorded. A cancelled
 * invoice or a subtraction that would drive the balance negative is rejected.
 */
const voidPayment = async (actor, id, input = {}, { ipAddress } = {}) => {
  assertVoidPayment(actor);

  const reason = normalizeString(input.reason);
  if (!reason) {
    throw AppError.badRequest("Validation failed", [{ field: "reason", message: "reason is required" }]);
  }

  const payment = await findByCompanyOr404(Payment, actor.companyId, id, {}, PAYMENT_NOT_FOUND);
  if (payment.status !== "RECORDED") {
    throw AppError.badRequest(`A ${payment.status} payment cannot be voided`, [
      { field: "status", message: "Only recorded payments can be voided" },
    ]);
  }

  const amount = round2(payment.amount);
  const invoice = await Invoice.findOne({
    _id: payment.invoiceId,
    companyId: actor.companyId,
  }).select("status invoiceNumber amountPaid totalAmount");
  if (!invoice) {
    throw AppError.notFound("Invoice not found");
  }
  if (invoice.status === "CANCELLED") {
    throw AppError.badRequest("Invalid invoice status", [
      { field: "status", message: "Cannot void a payment on a cancelled invoice" },
    ]);
  }
  if (round2(invoice.amountPaid) < amount) {
    throw AppError.conflict("Payment cannot be voided without making the invoice balance negative");
  }

  // Guarded transition first: only one concurrent void can win.
  const voided = await Payment.findOneAndUpdate(
    { _id: payment._id, companyId: actor.companyId, status: "RECORDED" },
    {
      $set: {
        status: "VOIDED",
        voidReason: reason,
        voidedBy: actor.id,
        voidedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!voided) {
    throw AppError.badRequest("A VOIDED payment cannot be voided", [
      { field: "status", message: "Only recorded payments can be voided" },
    ]);
  }

  // Rebuild the invoice balance and derived status in one atomic write.
  let updatedInvoice = null;
  try {
    updatedInvoice = await Invoice.findOneAndUpdate(
      {
        _id: invoice._id,
        companyId: actor.companyId,
        status: { $ne: "CANCELLED" },
        amountPaid: { $gte: amount },
      },
      [
        { $set: { amountPaid: { $round: [{ $subtract: ["$amountPaid", amount] }, 2] } } },
        { $set: { balanceDue: { $round: [{ $subtract: ["$totalAmount", "$amountPaid"] }, 2] } } },
        {
          $set: {
            status: {
              $switch: {
                branches: [
                  { case: { $lte: ["$amountPaid", 0] }, then: "ISSUED" },
                  { case: { $gte: ["$amountPaid", "$totalAmount"] }, then: "PAID" },
                ],
                default: "PARTIALLY_PAID",
              },
            },
          },
        },
      ],
      { new: true, updatePipeline: true }
    );
  } catch (err) {
    await Payment.updateOne(
      { _id: payment._id, companyId: actor.companyId },
      { $set: { status: "RECORDED" }, $unset: { voidReason: "", voidedBy: "", voidedAt: "" } }
    ).catch(() => {});
    throw err;
  }

  if (!updatedInvoice) {
    // Roll the void back so the ledger and the invoice never disagree.
    await Payment.updateOne(
      { _id: payment._id, companyId: actor.companyId },
      { $set: { status: "RECORDED" }, $unset: { voidReason: "", voidedBy: "", voidedAt: "" } }
    );
    throw AppError.conflict("Could not void the payment, please retry");
  }

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "PAYMENT_VOIDED",
    entityType: "PAYMENT",
    entityId: payment._id,
    description: `Voided ${payment.paymentNumber} of ${amount} on ${invoice.invoiceNumber}`,
    metadata: {
      paymentNumber: payment.paymentNumber,
      invoiceId: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      amount,
      reason,
      invoiceStatus: updatedInvoice.status,
    },
    ipAddress,
  });

  await voided.populate(LIST_POPULATE);
  return toPaymentView(voided);
};

module.exports = {
  recordPayment,
  listPayments,
  getPayment,
  voidPayment,
  assertRecordPayment,
  assertVoidPayment,
};
