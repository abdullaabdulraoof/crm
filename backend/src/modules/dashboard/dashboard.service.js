const Lead = require("../leads/lead.model");
const Client = require("../client/client.model");
const Product = require("../products/product.model");
const Quotation = require("../quotations/quotation.model");
const Invoice = require("../invoices/invoice.model");
const Payment = require("../payments/payment.model");
const FollowUp = require("../followups/followup.model");
const { round2 } = require("../../common/utils/money");
const { companyObjectId } = require("../../common/utils/scope");
const { overdueCondition } = require("../invoices/invoice.util");
const {
  startOfUtcMonth,
  startOfNextUtcMonth,
  lastNMonthKeys,
  recentLeadView,
  recentQuotationView,
  recentInvoiceView,
  recentFollowUpView,
} = require("./dashboard.util");

const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"];
const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];
const INVOICE_BUCKETS = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED", "OVERDUE"];
const PAYABLE_STATUSES = ["ISSUED", "PARTIALLY_PAID"];

const RECENT_LIMIT = 5;
const MONTHS_OF_PAYMENTS = 6;

// Build a fully zero-filled status map so the API shape never changes with data.
const zeroFill = (keys) => keys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

const countsToMap = (rows, keys) => {
  const map = zeroFill(keys);
  for (const row of rows) {
    if (row._id && Object.prototype.hasOwnProperty.call(map, row._id)) {
      map[row._id] = row.count;
    }
  }
  return map;
};

/**
 * Company-scoped dashboard summary. Every aggregation filters by the
 * authenticated company's ObjectId; nothing is ever loaded in bulk into memory
 * just to be summed. Overdue is derived here (never read from a stored status)
 * so the invoice buckets stay mutually exclusive.
 */
const getDashboardSummary = async (actor) => {
  const companyId = companyObjectId(actor);
  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  const monthEnd = startOfNextUtcMonth(now);
  const monthsStart = startOfUtcMonth(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS_OF_PAYMENTS - 1), 1))
  );
  const overdue = overdueCondition(now);

  const [
    leadRows,
    totalClients,
    activeProducts,
    quotationRows,
    invoiceBuckets,
    invoiceTotals,
    paymentsThisMonth,
    monthlyPayments,
    recentLeads,
    recentQuotations,
    recentInvoices,
    recentFollowUps,
  ] = await Promise.all([
    Lead.aggregate([
      { $match: { companyId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Client.countDocuments({ companyId }),
    Product.countDocuments({ companyId, isActive: true }),
    Quotation.aggregate([
      { $match: { companyId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { companyId } },
      { $addFields: { bucket: { $cond: [overdue, "OVERDUE", "$status"] } } },
      { $group: { _id: "$bucket", count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { companyId } },
      { $addFields: { isOverdue: { $cond: [overdue, 1, 0] } } },
      {
        $group: {
          _id: null,
          outstanding: {
            $sum: { $cond: [{ $in: ["$status", PAYABLE_STATUSES] }, "$balanceDue", 0] },
          },
          overdueCount: { $sum: "$isOverdue" },
          overdueBalance: {
            $sum: { $cond: [{ $eq: ["$isOverdue", 1] }, "$balanceDue", 0] },
          },
          invoicedThisMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$issueDate", monthStart] },
                    { $lt: ["$issueDate", monthEnd] },
                  ],
                },
                "$totalAmount",
                0,
              ],
            },
          },
        },
      },
    ]),
    Payment.aggregate([
      {
        $match: {
          companyId,
          status: "RECORDED",
          paymentDate: { $gte: monthStart, $lt: monthEnd },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      { $match: { companyId, status: "RECORDED", paymentDate: { $gte: monthsStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$paymentDate", timezone: "UTC" } },
          total: { $sum: "$amount" },
        },
      },
    ]),
    Lead.find({ companyId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECENT_LIMIT)
      .select("name status source createdAt")
      .lean(),
    Quotation.find({ companyId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECENT_LIMIT)
      .select("quotationNumber clientId leadId totalAmount status createdAt")
      .populate([
        { path: "clientId", select: "name" },
        { path: "leadId", select: "name" },
      ])
      .lean(),
    Invoice.find({ companyId })
      .sort({ issueDate: -1, _id: -1 })
      .limit(RECENT_LIMIT)
      .select("invoiceNumber clientId totalAmount balanceDue status issueDate dueDate createdAt")
      .populate([{ path: "clientId", select: "name" }])
      .lean(),
    FollowUp.find({ companyId, status: "PENDING" })
      .sort({ dueAt: 1, _id: 1 })
      .limit(RECENT_LIMIT)
      .select("subject type status dueAt leadId clientId assignedTo")
      .populate([
        { path: "leadId", select: "name" },
        { path: "clientId", select: "name" },
        { path: "assignedTo", select: "name email" },
      ])
      .lean(),
  ]);

  const leadsByStatus = countsToMap(leadRows, LEAD_STATUSES);
  const quotationsByStatus = countsToMap(quotationRows, QUOTATION_STATUSES);
  const invoiceStatus = countsToMap(invoiceBuckets, INVOICE_BUCKETS);

  const totals = invoiceTotals[0] || {};
  const totalLeads = LEAD_STATUSES.reduce((sum, key) => sum + leadsByStatus[key], 0);

  const monthlyMap = new Map(monthlyPayments.map((row) => [row._id, row.total]));
  const monthly = lastNMonthKeys(MONTHS_OF_PAYMENTS, now).map((month) => ({
    month,
    total: round2(monthlyMap.get(month) || 0),
  }));

  return {
    generatedAt: now.toISOString(),
    month: { key: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}` },
    cards: {
      totalLeads,
      newLeads: leadsByStatus.NEW,
      totalClients,
      activeProducts,
      quotationsSent: quotationsByStatus.SENT,
      outstandingBalance: round2(totals.outstanding || 0),
      paymentsThisMonth: round2((paymentsThisMonth[0] && paymentsThisMonth[0].total) || 0),
      overdueInvoices: totals.overdueCount || 0,
    },
    leadsByStatus,
    quotationsByStatus,
    invoiceStatus,
    monthlyPayments: monthly,
    totals: {
      invoicedThisMonth: round2(totals.invoicedThisMonth || 0),
      outstandingBalance: round2(totals.outstanding || 0),
      overdueBalance: round2(totals.overdueBalance || 0),
    },
    recent: {
      leads: recentLeads.map(recentLeadView),
      quotations: recentQuotations.map(recentQuotationView),
      invoices: recentInvoices.map(recentInvoiceView),
      followUps: recentFollowUps.map(recentFollowUpView),
    },
  };
};

module.exports = { getDashboardSummary };
