const Lead = require("../leads/lead.model");
const Quotation = require("../quotations/quotation.model");
const Invoice = require("../invoices/invoice.model");
const Payment = require("../payments/payment.model");
const FollowUp = require("../followups/followup.model");
const { round2 } = require("../../common/utils/money");
const { companyObjectId } = require("../../common/utils/scope");
const { overdueCondition } = require("../invoices/invoice.util");
const { parseReportRange, rangeFilter, countsToMap, rangeEcho } = require("./report.util");

const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"];
const LEAD_SOURCES = ["WEBSITE", "PHONE", "WHATSAPP", "REFERRAL", "SOCIAL_MEDIA", "OTHER"];
const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];
const INVOICE_BUCKETS = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED", "OVERDUE"];
const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "OTHER"];
const FOLLOWUP_STATUSES = ["PENDING", "COMPLETED", "CANCELLED"];
const PAYABLE_STATUSES = ["ISSUED", "PARTIALLY_PAID"];

// ---- A. Lead report ---------------------------------------------------------
const getLeadReport = async (actor, query = {}) => {
  const range = parseReportRange(query);
  const match = { companyId: companyObjectId(actor), ...(rangeFilter("createdAt", range) || {}) };

  const [total, statusRows, sourceRows] = await Promise.all([
    Lead.countDocuments(match),
    Lead.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: match }, { $group: { _id: "$source", count: { $sum: 1 } } }]),
  ]);

  return {
    range: rangeEcho(range),
    total,
    byStatus: countsToMap(statusRows, LEAD_STATUSES),
    bySource: countsToMap(sourceRows, LEAD_SOURCES),
  };
};

// ---- B. Quotation report ----------------------------------------------------
const getQuotationReport = async (actor, query = {}) => {
  const range = parseReportRange(query);
  const match = { companyId: companyObjectId(actor), ...(rangeFilter("createdAt", range) || {}) };

  const [total, statusRows, valueRows] = await Promise.all([
    Quotation.countDocuments(match),
    Quotation.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Quotation.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalValue: { $sum: "$totalAmount" },
          acceptedValue: {
            $sum: { $cond: [{ $eq: ["$status", "ACCEPTED"] }, "$totalAmount", 0] },
          },
        },
      },
    ]),
  ]);

  const values = valueRows[0] || {};
  return {
    range: rangeEcho(range),
    total,
    byStatus: countsToMap(statusRows, QUOTATION_STATUSES),
    totalValue: round2(values.totalValue || 0),
    acceptedValue: round2(values.acceptedValue || 0),
  };
};

// ---- C. Invoice report ------------------------------------------------------
// totals are invoice-derived (issued value, amount already paid against those
// invoices, remaining balance); they are deliberately independent of the
// Payments report, which counts actual recorded payments.
const getInvoiceReport = async (actor, query = {}) => {
  const range = parseReportRange(query);
  const now = new Date();
  const match = { companyId: companyObjectId(actor), ...(rangeFilter("issueDate", range) || {}) };
  const overdue = overdueCondition(now);

  const [total, bucketRows, valueRows] = await Promise.all([
    Invoice.countDocuments(match),
    Invoice.aggregate([
      { $match: match },
      { $addFields: { bucket: { $cond: [overdue, "OVERDUE", "$status"] } } },
      { $group: { _id: "$bucket", count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: match },
      {
        $addFields: {
          isOverdue: { $cond: [overdue, 1, 0] },
          payable: { $in: ["$status", PAYABLE_STATUSES] },
        },
      },
      {
        $group: {
          _id: null,
          totalInvoiced: { $sum: "$totalAmount" },
          amountCollected: { $sum: "$amountPaid" },
          outstandingBalance: { $sum: { $cond: ["$payable", "$balanceDue", 0] } },
          overdueCount: { $sum: "$isOverdue" },
          overdueBalance: { $sum: { $cond: [{ $eq: ["$isOverdue", 1] }, "$balanceDue", 0] } },
        },
      },
    ]),
  ]);

  const values = valueRows[0] || {};
  return {
    range: rangeEcho(range),
    total,
    byStatus: countsToMap(bucketRows, INVOICE_BUCKETS),
    totalInvoiced: round2(values.totalInvoiced || 0),
    amountCollected: round2(values.amountCollected || 0),
    outstandingBalance: round2(values.outstandingBalance || 0),
    overdueCount: values.overdueCount || 0,
    overdueBalance: round2(values.overdueBalance || 0),
  };
};

// ---- D. Payment report ------------------------------------------------------
// Only RECORDED payments count as received; VOIDED and REFUNDED are excluded.
const getPaymentReport = async (actor, query = {}) => {
  const range = parseReportRange(query);
  const match = {
    companyId: companyObjectId(actor),
    status: "RECORDED",
    ...(rangeFilter("paymentDate", range) || {}),
  };

  const [totalRecorded, methodRows] = await Promise.all([
    Payment.countDocuments(match),
    Payment.aggregate([
      { $match: match },
      { $group: { _id: "$method", count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ]),
  ]);

  const byMethod = PAYMENT_METHODS.reduce(
    (acc, method) => ({ ...acc, [method]: { count: 0, total: 0 } }),
    {}
  );
  let totalAmount = 0;
  for (const row of methodRows) {
    if (row._id && Object.prototype.hasOwnProperty.call(byMethod, row._id)) {
      byMethod[row._id] = { count: row.count, total: round2(row.total || 0) };
    }
    totalAmount += row.total || 0;
  }

  return {
    range: rangeEcho(range),
    totalRecorded,
    totalAmount: round2(totalAmount),
    byMethod,
  };
};

// ---- E. Follow-up report ----------------------------------------------------
const getFollowUpReport = async (actor, query = {}) => {
  const range = parseReportRange(query);
  const now = new Date();
  const base = { companyId: companyObjectId(actor), ...(rangeFilter("dueAt", range) || {}) };
  // Merge the optional upper bound with the overdue cut-off without clobbering.
  const overdueMatch = { ...base, status: "PENDING", dueAt: { ...(base.dueAt || {}), $lt: now } };

  const [total, statusRows, overduePending] = await Promise.all([
    FollowUp.countDocuments(base),
    FollowUp.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    FollowUp.countDocuments(overdueMatch),
  ]);

  const byStatus = countsToMap(statusRows, FOLLOWUP_STATUSES);
  return {
    range: rangeEcho(range),
    total,
    pending: byStatus.PENDING,
    completed: byStatus.COMPLETED,
    cancelled: byStatus.CANCELLED,
    overduePending,
  };
};

module.exports = {
  getLeadReport,
  getQuotationReport,
  getInvoiceReport,
  getPaymentReport,
  getFollowUpReport,
};
