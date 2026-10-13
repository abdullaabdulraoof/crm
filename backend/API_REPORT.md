# CRM Backend API - Comprehensive Endpoints & Response Shapes Report

**Source of Truth: C:\crm\backend\src**

All endpoints are company-scoped (req.user.companyId). Auth is via Bearer token (JWT). Base path: /api (mounted in app.js). Routes mounted in routes/index.js.

- app.js (src/app.js): Express app mounted at /api via app.use('/api', routes). Trust proxy configurable via TRUST_PROXY. CORS uses CLIENT_URL.
- routes/index.js: /auth, /users, /activity-logs, /dashboard, /reports, /leads, /clients, /follow-ups, /products, /quotations, /invoices, /payments ? corresponding module routes.


**Auth middleware (authenticate.js):** Expects Authorization: Bearer <token>. Verifies JWT (HS256), requires type=access, valid ObjectId sub. Loads user from DB selecting companyId role isActive name email phone lastLogin. Attaches req.user { id, companyId, role, name, email, isActive }. Returns 401/500 as appropriate.

**Authorize middleware (authorize.js):** accepts role list; denies if no roles configured or role not permitted (401 if unauthenticated, 403 if unauthorized).

**Role constants (common/constants/index.js):** ROLES {OWNER,ADMIN,MANAGER,SALES}, USER_MANAGEMENT_ROLES [OWNER,ADMIN], LEAD_EDIT/CLIENT_EDIT/FOLLOWUP_EDIT/PRODUCT_EDIT/QUOTATION_EDIT/INVOICE_EDIT/PAYMENT_EDIT include all roles; LEAD_DELETE/CLIENT_DELETE/FOLLOWUP_DELETE/PRODUCT_DEACTIVATE/QUOTATION_DELETE/INVOICE_DELETE/PAYMENT_VOID typically [OWNER,ADMIN].


---

## 2) DASHBOARD
**Module:** src/modules/dashboard/
- dashboard.routes.js: router.get('/summary', authenticate, controller.summary)
- dashboard.controller.js: summary() -> service.getDashboardSummary(req.user) -> res.status(200).json({ success:true, data })
- dashboard.service.js: company-scoped summary. Aggregates with Promise.all:


Notes: invoiceStatus includes OVERDUE bucket (computed as derived status - OVERDUE condition in service uses  on overdue predicate); recent.invoice.effectiveStatus reflects derived OVERDUE if applicable.


---

## 3) REPORTS
**Module:** src/modules/reports/
- report.routes.js: GET /leads, /quotations, /invoices, /payments, /follow-ups (authenticate)
- report.controller.js: delegates to report.service
- report.service.js: company-scoped; range parsed via parseReportRange from common/utils/query (parseDateBounds); uses overdueCondition for invoices.


- GET /api/reports/invoices
  - Query: from,to (date range on issueDate)
  - data: { range:{from:null|string,to:null|string}, total:number, byStatus:{DRAFT,ISSUED,PARTIALLY_PAID,PAID,CANCELLED,OVERDUE}, totalInvoiced:number(rounded), amountCollected:number(rounded), outstandingBalance:number(rounded), overdueCount:number, overdueBalance:number(rounded) } (OVERDUE bucket computed using overdueCondition(now))
- GET /api/reports/payments
  - Query: from,to (range on paymentDate); only RECORDED payments counted
  - data: { range:{from:null|string,to:null|string}, totalRecorded:number, totalAmount:number(rounded), byMethod:{CASH:{count,total(rounded)},BANK_TRANSFER:{count,total(rounded)},UPI:{count,total(rounded)},CARD:{count,total(rounded)},CHEQUE:{count,total(rounded)},OTHER:{count,total(rounded)}} }
- GET /api/reports/follow-ups
  - Query: from,to (range on dueAt)
  - data: { range:{from:null|string,to:null|string}, total:number, pending:number, completed:number, cancelled:number, overduePending:number } (overduePending = PENDING and dueAt < now)

---

## 4) ACTIVITY LOGS
Module: src/modules/activity-logs/
- model: activityLog.model.js
- routes: activityLog.routes.js (GET /)
- controller: activityLog.controller.js (list)
- service: activityLog.service.js (listActivityLogs, recordUserActivity)
- util: activityLog.util.js (toActivityLogView)

Model fields (ActivityLog): companyId(ObjectId, required, index), performedBy(ObjectId ref User, default null), action(String, required, trim), entityType(Enum: COMPANY,USER,LEAD,CLIENT,PRODUCT,FOLLOW_UP,QUOTATION,INVOICE,PAYMENT, required), entityId(ObjectId, required), description(String, required, trim), metadata(Mixed, default {}), ipAddress(String, default null), timestamps createdAt true updatedAt false. Indexes: (companyId,createdAt,-1), (companyId,entityType,entityId,createdAt,-1), (companyId,performedBy,createdAt,-1).

Endpoints:
- GET /api/activity-logs
  - Auth: required
  - Authorization: authorize(USER_MANAGEMENT_ROLES) - so OWNER, ADMIN only
  - Query: page,limit, entityType, action, performedBy, from,to (date range on createdAt), search (description/action)
  - Response: { success:true, data: [...activityLogs], pagination }

ActivityLog view (toActivityLogView): { id, action, entityType, entityId(string|null), description, metadata, performedBy:{id,name,email}|null, ipAddress|null, createdAt }

recordUserActivity(params): creates ActivityLog; catches/logs errors so it never breaks operation. Called from: clients, followups, invoices, leads, payments, products services.

Product view: { id, companyId, name, description, sku, unitPrice, gstRate, type, isActive, createdAt, updatedAt }

---

## 12) REPORTS MODULE - WHAT IT ALREADY RETURNS (SUMMARY)
Reports service (report.service.js) returns company-scoped aggregations:
- Leads: total, byStatus (all 6), bySource (all 6), range
- Quotations: total, byStatus (all 5), totalValue, acceptedValue, range
- Invoices: total, byStatus includes OVERDUE bucket (computed via overdueCondition), totalInvoiced, amountCollected, outstandingBalance, overdueCount, overdueBalance, range (range on issueDate)
- Payments: totalRecorded (only RECORDED, status filter), totalAmount (sum of amounts), byMethod with count and total per method (CASH,BANK_TRANSFER,UPI,CARD,CHEQUE,OTHER), range (paymentDate)
- Follow-ups: total, pending, completed, cancelled, overduePending, range (dueAt). overduePending = PENDING with dueAt < now.

Utils: parseReportRange uses parseDateBounds from common/utils/query; rangeFilter; countsToMap with zeroFill; rangeEcho returns ISO strings or null.

---

## 13) BACKEND ROUTES INDEX & AUTH/PERMISSION SUMMARY
- Mounted under /api: see routes/index.js mapping above.
- Auth: Bearer JWT via authenticate middleware (all routes shown use authenticate where needed). Most module routes call authenticate; activity-logs adds authorize(USER_MANAGEMENT_ROLES). Reports/routes generally authenticate.
- Permissions: authorize() used with role constants. Delete/archive/void actions restricted to higher roles (typically OWNER,ADMIN). Edit/view generally allow OWNER,ADMIN,MANAGER,SALES.
- Company scoping: every DB query in services filters by companyId = companyObjectId(actor). findByCompanyOr404 enforces same-company. scopedQuery helper used.
- Activity logging: recordUserActivity called on create/update/delete/archive/void in relevant modules with entityType, entityId, action, description, metadata, ipAddress. Never blocks operation on failure.

---

## APPENDIX: CONTROLLER & SERVICE CODE SNIPPETS (FULL KEY FILES)

### Dashboard - controller (full)
const service = require("./dashboard.service");

const summary = async (req, res) => {
  const data = await service.getDashboardSummary(req.user);
  res.status(200).json({ success: true, data });
};

module.exports = { summary };


### Dashboard - service (full)
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


### Dashboard - routes (full)
const router = require("express").Router();
const authenticate = require("../../common/middleware/authenticate");
const controller = require("./dashboard.controller");

// Read-only, company-scoped summary. Any authenticated employee may view the
// dashboard - the service restricts every query to req.user.companyId.
router.get("/summary", authenticate, controller.summary);

module.exports = router;


### Dashboard - util (full)
const startOfUtcMonth = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const startOfNextUtcMonth = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

const monthKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// Ascending list of "YYYY-MM" keys ending with the current UTC month.
const lastNMonthKeys = (n, date = new Date()) => {
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - i, 1));
    keys.push(monthKey(d));
  }
  return keys;
};

const idOf = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return String(value._id || value);
};

// Explicit whitelist views: only safe fields ever leave the API. Populated refs
// become { id, ...fields }; unpopulated ids stay strings.
const populatedRef = (value, fields) => {
  if (!value) return null;
  if (typeof value === "object" && value._id) {
    const view = { id: String(value._id) };
    for (const field of fields) {
      view[field] = value[field] !== undefined && value[field] !== null ? value[field] : null;
    }
    return view;
  }
  return idOf(value);
};

const recentLeadView = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  status: doc.status,
  source: doc.source || "OTHER",
  createdAt: doc.createdAt || null,
});

const recentQuotationView = (doc) => {
  const target = doc.clientId || doc.leadId;
  return {
    id: String(doc._id),
    quotationNumber: doc.quotationNumber,
    client: populatedRef(doc.clientId, ["name"]),
    lead: populatedRef(doc.leadId, ["name"]),
    targetName: target && typeof target === "object" ? target.name || null : null,
    totalAmount: doc.totalAmount || 0,
    status: doc.status,
    createdAt: doc.createdAt || null,
  };
};

const recentInvoiceView = (doc) => {
  const overdue =
    ["ISSUED", "PARTIALLY_PAID"].includes(doc.status) &&
    !!doc.dueDate &&
    new Date(doc.dueDate).getTime() < Date.now() &&
    (doc.balanceDue || 0) > 0;
  return {
    id: String(doc._id),
    invoiceNumber: doc.invoiceNumber,
    client: populatedRef(doc.clientId, ["name"]),
    totalAmount: doc.totalAmount || 0,
    balanceDue: doc.balanceDue || 0,
    status: doc.status,
    effectiveStatus: overdue ? "OVERDUE" : doc.status,
    issueDate: doc.issueDate || null,
    dueDate: doc.dueDate || null,
    createdAt: doc.createdAt || null,
  };
};

const recentFollowUpView = (doc) => ({
  id: String(doc._id),
  subject: doc.subject,
  type: doc.type,
  status: doc.status,
  dueAt: doc.dueAt || null,
  lead: populatedRef(doc.leadId, ["name"]),
  client: populatedRef(doc.clientId, ["name"]),
  assignedTo: populatedRef(doc.assignedTo, ["name", "email"]),
});

module.exports = {
  startOfUtcMonth,
  startOfNextUtcMonth,
  monthKey,
  lastNMonthKeys,
  recentLeadView,
  recentQuotationView,
  recentInvoiceView,
  recentFollowUpView,
};


### Reports - controller (full)
const service = require("./report.service");

const leads = async (req, res) => {
  const data = await service.getLeadReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

const quotations = async (req, res) => {
  const data = await service.getQuotationReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

const invoices = async (req, res) => {
  const data = await service.getInvoiceReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

const payments = async (req, res) => {
  const data = await service.getPaymentReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

const followUps = async (req, res) => {
  const data = await service.getFollowUpReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

module.exports = { leads, quotations, invoices, payments, followUps };


### Reports - service (full)
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


### Reports - routes (full)
const router = require("express").Router();
const authenticate = require("../../common/middleware/authenticate");
const controller = require("./report.controller");

// Read-only, company-scoped reports. Any authenticated employee may run them
// (consistent with the rest of the read APIs); the service restricts every
// aggregation to req.user.companyId. Optional from/to query params are
// validated per report.
router.get("/leads", authenticate, controller.leads);
router.get("/quotations", authenticate, controller.quotations);
router.get("/invoices", authenticate, controller.invoices);
router.get("/payments", authenticate, controller.payments);
router.get("/follow-ups", authenticate, controller.followUps);

module.exports = router;


### Reports - util (full)
const { parseDateBounds, rangeFilter } = require("../../common/utils/query");

/**
 * Parses the optional from/to query params shared by every report. Rejects
 * unparseable dates and an inverted range with a 400 so the frontend can show a
 * clear message instead of an empty report. Delegates to the shared query util
 * so list endpoints and reports use identical date semantics.
 */
const parseReportRange = (query = {}) => parseDateBounds(query);

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

const rangeEcho = ({ from, to }) => ({
  from: from ? from.toISOString() : null,
  to: to ? to.toISOString() : null,
});

module.exports = { parseReportRange, rangeFilter, zeroFill, countsToMap, rangeEcho };


### ActivityLogs - controller (full)
const service = require("./activityLog.service");

const list = async (req, res) => {
  const { activityLogs, pagination } = await service.listActivityLogs(req.user, req.query || {});
  res.status(200).json({ success: true, data: activityLogs, pagination });
};

module.exports = { list };


### ActivityLogs - service (full)
const ActivityLog = require("./activityLog.model");
const { toActivityLogView } = require("./activityLog.util");
const {
  parsePagination,
  paginationMeta,
  parseSearch,
  searchRegex,
  parseEnumFilter,
  parseIdFilter,
  parseDateBounds,
  rangeFilter,
  parseSort,
} = require("../../common/utils/query");
const { companyObjectId } = require("../../common/utils/scope");
const { normalizeString } = require("../../common/utils/normalize");

// The audit entity allowlist is the schema's own enum, so validation can never
// drift from what is actually persistable.
const ENTITY_TYPES = ActivityLog.schema.path("entityType").enumValues;
const SORTABLE = ["createdAt"];

/**
 * Company-scoped, paginated audit trail, newest first. Every filter is combined
 * with the authenticated company id so one tenant can never read another's
 * history. Unknown entity types, malformed ids, inverted date ranges and
 * unsupported sort fields are rejected with a 400 by the shared query helpers.
 */
const listActivityLogs = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);
  const filter = { companyId: companyObjectId(actor) };

  const entityType = parseEnumFilter(query.entityType, ENTITY_TYPES, "entityType");
  if (entityType) filter.entityType = entityType;

  const action = normalizeString(query.action);
  if (action) filter.action = action;

  const performedBy = parseIdFilter(query.performedBy, "performedBy");
  if (performedBy) filter.performedBy = performedBy;

  const range = rangeFilter("createdAt", parseDateBounds(query));
  if (range) filter.createdAt = range.createdAt;

  const term = parseSearch(query.search);
  if (term) {
    const regex = searchRegex(term);
    filter.$or = [{ description: regex }, { action: regex }];
  }

  const sort = parseSort(query, { allowlist: SORTABLE, default: { createdAt: -1 } });

  const [docs, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("performedBy", "name email")
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  return {
    activityLogs: docs.map(toActivityLogView),
    pagination: paginationMeta(page, limit, total),
  };
};

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

module.exports = { recordUserActivity, listActivityLogs };


### ActivityLogs - routes (full)
const router = require("express").Router();
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { USER_MANAGEMENT_ROLES } = require("../../common/constants");
const controller = require("./activityLog.controller");

// GET /api/activity-logs — company audit trail (OWNER, ADMIN).
router.get("/", authenticate, authorize(...USER_MANAGEMENT_ROLES), controller.list);

module.exports = router;


### ActivityLogs - util (full)
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


### ActivityLogs - model (full)

const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    action: {
      type: String,
      required: true,
      trim: true,
    },

    entityType: {
      type: String,
      enum: [
        "COMPANY",
        "USER",
        "LEAD",
        "CLIENT",
        "PRODUCT",
        "FOLLOW_UP",
        "QUOTATION",
        "INVOICE",
        "PAYMENT",
      ],
      required: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Company activity timeline, newest first.
activityLogSchema.index({
  companyId: 1,
  createdAt: -1,
});

// Activity history for a particular record.
activityLogSchema.index({
  companyId: 1,
  entityType: 1,
  entityId: 1,
  createdAt: -1,
});

// Activity performed by a particular employee.
activityLogSchema.index({
  companyId: 1,
  performedBy: 1,
  createdAt: -1,
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);

### Leads - model (full)

const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    source: {
      type: String,
      enum: [
        "WEBSITE",
        "PHONE",
        "WHATSAPP",
        "REFERRAL",
        "SOCIAL_MEDIA",
        "OTHER",
      ],
      default: "OTHER",
    },

    status: {
      type: String,
      enum: [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "PROPOSAL_SENT",
        "WON",
        "LOST",
      ],
      default: "NEW",
      required: true,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    nextFollowUpAt: {
      type: Date,
      default: null,
    },

    // Optional association with an existing client (same company, active).
    // Distinct from convertedClientId, which records the client a lead was
    // converted INTO and is consumed by invoicing.
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    convertedClientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// List leads belonging to a company.
leadSchema.index({ companyId: 1, status: 1, createdAt: -1 });

// Find leads assigned to an employee.
leadSchema.index({ companyId: 1, assignedTo: 1, status: 1 });

// Find leads that need follow-up.
leadSchema.index({ companyId: 1, nextFollowUpAt: 1 });

module.exports = mongoose.model("Lead", leadSchema);

### Leads - controller (full)
const service = require("./lead.service");

const create = async (req, res) => {
  const lead = await service.createLead(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Lead created successfully",
    data: { lead },
  });
};

const list = async (req, res) => {
  const { leads, pagination } = await service.listLeads(req.user, req.query || {});
  res.status(200).json({ success: true, data: leads, pagination });
};

const summary = async (req, res) => {
  const data = await service.getLeadSummary(req.user);
  res.status(200).json({ success: true, data });
};

const getOne = async (req, res) => {
  const lead = await service.getLead(req.user, req.params.id);
  res.status(200).json({ success: true, data: { lead } });
};

const update = async (req, res) => {
  const lead = await service.updateLead(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Lead updated successfully",
    data: { lead },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteLead(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Lead deleted successfully",
    data: result,
  });
};

module.exports = { create, list, summary, getOne, update, remove };

### Leads - service (full)
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
// When requireActive is set, the referenced record must also be active (used for
// linking a lead to a client so archived clients can never be selected).
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
  if (input.clientId !== undefined && input.clientId !== null && input.clientId !== "") {
    doc.clientId = await sameCompanyRef(Client, actor, input.clientId, "clientId", "client", {
      requireActive: true,
    });
  }
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
  if (input.clientId !== undefined) {
    lead.clientId =
      input.clientId === null || input.clientId === ""
        ? null
        : await sameCompanyRef(Client, actor, input.clientId, "clientId", "client", {
            requireActive: true,
          });
    changed.push("clientId");
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

### Leads - routes (full)
const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { LEAD_EDIT_ROLES, LEAD_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./lead.validation");
const controller = require("./lead.controller");

const editRoles = [...LEAD_EDIT_ROLES];
const deleteRoles = [...LEAD_DELETE_ROLES];

// All leads are scoped to the authenticated user's company in the service layer.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
// Registered before "/:id" so the literal path is never captured as an id.
router.get("/summary", authenticate, authorize(...editRoles), controller.summary);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;

### Leads - util (full)
// Normalizes a lead document (plain, lean or populated) into a client-safe view.
// A populated assignedTo/createdBy becomes { id, name, email }; an unpopulated
// reference (an ObjectId or a hex string) stays a plain id string. passwordHash
// can never appear here because the lead/user views never select it.

const isObjectId = (value) =>
  !!value && typeof value === "object" && value._bsontype === "ObjectId";

const idOf = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return String(value._id || value);
};

const populatedView = (value, fields) => {
  if (!value) return null;
  if (!isObjectId(value) && typeof value === "object" && value._id) {
    const view = { id: String(value._id) };
    for (const field of fields) {
      view[field] = value[field] !== undefined && value[field] !== null ? value[field] : null;
    }
    return view;
  }
  return idOf(value);
};

const toLeadView = (lead) => {
  const doc = lead && typeof lead.toObject === "function" ? lead.toObject() : lead;
  if (!doc) return null;

  return {
    id: idOf(doc._id),
    companyId: idOf(doc.companyId),
    name: doc.name,
    phoneNumber: doc.phoneNumber,
    email: doc.email || null,
    source: doc.source,
    status: doc.status,
    assignedTo: populatedView(doc.assignedTo, ["name", "email"]),
    notes: doc.notes || null,
    nextFollowUpAt: doc.nextFollowUpAt || null,
    clientId: idOf(doc.clientId),
    convertedClientId: idOf(doc.convertedClientId),
    createdBy: populatedView(doc.createdBy, ["name"]),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
};

module.exports = { toLeadView };

### Leads - validation (full)
const { EMAIL_RE } = require("../../common/middleware/validate");

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const LEAD_SOURCES = ["WEBSITE", "PHONE", "WHATSAPP", "REFERRAL", "SOCIAL_MEDIA", "OTHER"];
const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"];

// companyId and createdBy are deliberately absent: they always come from the
// authenticated actor (req.user) and are never accepted from the payload.
const createRules = [
  { field: "name", type: "string", required: true, min: 2, max: 200 },
  { field: "phoneNumber", type: "string", required: true, max: 20 },
  { field: "email", type: "email", required: false },
  { field: "source", type: "string", required: false, enum: LEAD_SOURCES },
  { field: "status", type: "string", required: false, enum: LEAD_STATUSES },
  {
    field: "assignedTo",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "assignedTo must be a valid user id",
  },
  {
    field: "clientId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "clientId must be a valid client id",
  },
  { field: "notes", type: "string", required: false, max: 2000 },
];

const updateRules = [
  { field: "name", type: "string", required: false, min: 2, max: 200 },
  { field: "phoneNumber", type: "string", required: false, max: 20 },
  { field: "email", type: "email", required: false },
  { field: "source", type: "string", required: false, enum: LEAD_SOURCES },
  { field: "status", type: "string", required: false, enum: LEAD_STATUSES },
  {
    field: "assignedTo",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "assignedTo must be a valid user id",
  },
  {
    field: "clientId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "clientId must be a valid client id",
  },
  { field: "notes", type: "string", required: false, max: 2000 },
];

module.exports = { createRules, updateRules, LEAD_SOURCES, LEAD_STATUSES };
module.exports.EMAIL_RE = EMAIL_RE;
module.exports.OBJECT_ID_RE = OBJECT_ID_RE;

### Client - model (full)
const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    gstNo: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    clientType: {
      type: String,
      enum: ["INDIVIDUAL", "BUSINESS"],
      default: "INDIVIDUAL",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helps retrieve clients belonging to a company.
clientSchema.index({ companyId: 1 });

// Helps search clients by name within a company.
clientSchema.index({ companyId: 1, name: 1 });

module.exports = mongoose.model("Client", clientSchema);

### Client - controller (full)
const service = require("./client.service");

const create = async (req, res) => {
  const client = await service.createClient(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Client created successfully",
    data: { client },
  });
};

const list = async (req, res) => {
  const { clients, pagination } = await service.listClients(req.user, req.query || {});
  res.status(200).json({ success: true, data: clients, pagination });
};

// Lightweight company directory for picker clients (follow-up/quotation/invoice/payment forms).
const listOptions = async (req, res) => {
  const clients = await service.listClientOptions(req.user);
  res.status(200).json({ success: true, data: { clients } });
};

const getOne = async (req, res) => {
  const client = await service.getClient(req.user, req.params.id);
  res.status(200).json({ success: true, data: { client } });
};

const update = async (req, res) => {
  const client = await service.updateClient(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Client updated successfully",
    data: { client },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteClient(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Client deleted successfully",
    data: result,
  });
};

module.exports = { create, list, listOptions, getOne, update, remove };


### Client - routes (full)
const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { CLIENT_EDIT_ROLES, CLIENT_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./client.validation");
const controller = require("./client.controller");

const editRoles = [...CLIENT_EDIT_ROLES];
const deleteRoles = [...CLIENT_DELETE_ROLES];

// Literal path registered before "/:id" so the directory is never captured as an id.
// GET / is the paginated, company-scoped client list; GET /options is the
// lightweight picker directory consumed by the other modules' forms.
router.get("/options", authenticate, controller.listOptions);

// All clients are scoped to the authenticated user's company in the service layer.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;


### Client - util (full)
// Safe client projection for the paginated list. companyId and createdBy stay
// server-side; every field here is intended for the CRM UI.
const toClientView = (client) => ({
  id: String(client._id),
  name: client.name,
  phoneNumber: client.phoneNumber || "",
  email: client.email || "",
  address: client.address || "",
  gstNo: client.gstNo || null,
  clientType: client.clientType,
  notes: client.notes || "",
  isActive: client.isActive !== false,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
});

// Minimal projection for dropdown pickers.
const toClientOption = (client) => ({
  id: String(client._id),
  name: client.name,
  phoneNumber: client.phoneNumber || "",
  email: client.email || "",
});

module.exports = { toClientView, toClientOption };


### Client - validation (full)
const CLIENT_TYPES = ["INDIVIDUAL", "BUSINESS"];

// companyId and createdBy are deliberately absent: they always come from the
// authenticated actor (req.user) and are never accepted from the payload.
const createRules = [
  { field: "name", type: "string", required: true, min: 2, max: 200 },
  { field: "phoneNumber", type: "string", required: false, max: 20 },
  { field: "email", type: "email", required: false },
  { field: "address", type: "string", required: false, max: 500 },
  { field: "gstNo", type: "string", required: false, max: 15 },
  { field: "clientType", type: "string", required: false, enum: CLIENT_TYPES },
  { field: "notes", type: "string", required: false, max: 2000 },
];

const updateRules = [
  { field: "name", type: "string", required: false, min: 2, max: 200 },
  { field: "phoneNumber", type: "string", required: false, max: 20 },
  { field: "email", type: "email", required: false },
  { field: "address", type: "string", required: false, max: 500 },
  { field: "gstNo", type: "string", required: false, max: 15 },
  { field: "clientType", type: "string", required: false, enum: CLIENT_TYPES },
  { field: "notes", type: "string", required: false, max: 2000 },
];

module.exports = { createRules, updateRules, CLIENT_TYPES };


### Products - model (full)

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    sku: {
      type: String,
      trim: true,
      default: "",
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    gstRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    type: {
      type: String,
      enum: ["PRODUCT", "SERVICE"],
      default: "PRODUCT",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helps list active products for a company's quotations.
productSchema.index({ companyId: 1, isActive: 1, name: 1 });

// SKU must be unique within a company when supplied.
productSchema.index(
  { companyId: 1, sku: 1 },
  {
    unique: true,
    partialFilterExpression: { sku: { $gt: "" } },
  }
);

module.exports = mongoose.model("Product", productSchema);

### Products - controller (full)
const service = require("./product.service");

const create = async (req, res) => {
  const product = await service.createProduct(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Product created successfully",
    data: { product },
  });
};

const list = async (req, res) => {
  const { products, pagination } = await service.listProducts(req.user, req.query || {});
  res.status(200).json({ success: true, data: products, pagination });
};

const getOne = async (req, res) => {
  const product = await service.getProduct(req.user, req.params.id);
  res.status(200).json({ success: true, data: { product } });
};

const update = async (req, res) => {
  const product = await service.updateProduct(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    data: { product },
  });
};

const remove = async (req, res) => {
  const result = await service.deactivateProduct(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: result.message || "Product deactivated successfully",
    data: { id: result.product.id, isActive: result.product.isActive },
  });
};

module.exports = { create, list, getOne, update, remove };


### Products - routes (full)
const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { PRODUCT_EDIT_ROLES, PRODUCT_DEACTIVATE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./product.validation");
const controller = require("./product.controller");

const editRoles = [...PRODUCT_EDIT_ROLES];
const deactivateRoles = [...PRODUCT_DEACTIVATE_ROLES];

// All products are scoped to the authenticated user's company in the service
// layer. DELETE performs a soft deactivation (isActive = false), never a
// physical removal, and is limited to the same roles as other delete routes.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deactivateRoles), controller.remove);

module.exports = router;


### Products - util (full)
// API view for a product. The shape is intentionally quotation-ready:
// id, name, unitPrice, gstRate and type are exactly what a future quotation
// line needs.
const toProductView = (doc) => ({
  id: String(doc._id),
  companyId: String(doc.companyId),
  name: doc.name,
  description: doc.description || "",
  sku: doc.sku || "",
  unitPrice: doc.unitPrice,
  gstRate: doc.gstRate,
  type: doc.type,
  isActive: doc.isActive,
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
});

module.exports = { toProductView };


### Products - validation (full)
const PRODUCT_TYPES = ["PRODUCT", "SERVICE"];

// companyId, isActive (on create) and createdAt/updatedAt are deliberately
// absent: companyId always comes from the authenticated actor, isActive is
// managed through the dedicated activate/deactivate flow, and timestamps are
// set by mongoose. unitPrice/gstRate are numbers and are range-checked by the
// rule middleware.
const createRules = [
  { field: "name", type: "string", required: true, min: 2, max: 200 },
  { field: "description", type: "string", required: false, max: 2000 },
  { field: "sku", type: "string", required: false, max: 100 },
  { field: "unitPrice", type: "number", required: true, min: 0 },
  { field: "gstRate", type: "number", required: false, min: 0, max: 100 },
  { field: "type", type: "string", required: false, enum: PRODUCT_TYPES },
];

const updateRules = [
  { field: "name", type: "string", required: false, min: 2, max: 200 },
  { field: "description", type: "string", required: false, max: 2000 },
  { field: "sku", type: "string", required: false, max: 100 },
  { field: "unitPrice", type: "number", required: false, min: 0 },
  { field: "gstRate", type: "number", required: false, min: 0, max: 100 },
  { field: "type", type: "string", required: false, enum: PRODUCT_TYPES },
  { field: "isActive", type: "boolean", required: false },
];

module.exports = { createRules, updateRules, PRODUCT_TYPES };


### Followups - model (full)

const mongoose = require("mongoose");

const followUpSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["CALL", "MEETING", "EMAIL", "WHATSAPP", "OTHER"],
      required: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    dueAt: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },

    completedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Find a company's upcoming follow-ups efficiently.
followUpSchema.index({ companyId: 1, status: 1, dueAt: 1 });

// Find follow-ups assigned to a particular employee.
followUpSchema.index({ companyId: 1, assignedTo: 1, status: 1 });

// Filter follow-ups by their lead or client target.
followUpSchema.index({ companyId: 1, leadId: 1 });
followUpSchema.index({ companyId: 1, clientId: 1 });

module.exports = mongoose.model("FollowUp", followUpSchema);

### Followups - controller (full)
const service = require("./followup.service");

const create = async (req, res) => {
  const followup = await service.createFollowup(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Follow-up created successfully",
    data: { followup },
  });
};

const list = async (req, res) => {
  const { followups, pagination } = await service.listFollowups(req.user, req.query || {});
  res.status(200).json({ success: true, data: followups, pagination });
};

const summary = async (req, res) => {
  const data = await service.getFollowUpSummary(req.user);
  res.status(200).json({ success: true, data });
};

const getOne = async (req, res) => {
  const followup = await service.getFollowup(req.user, req.params.id);
  res.status(200).json({ success: true, data: { followup } });
};

const update = async (req, res) => {
  const followup = await service.updateFollowup(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Follow-up updated successfully",
    data: { followup },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteFollowup(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Follow-up deleted successfully",
    data: result,
  });
};

module.exports = { create, list, summary, getOne, update, remove };


### Followups - routes (full)
const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { FOLLOWUP_EDIT_ROLES, FOLLOWUP_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./followup.validation");
const controller = require("./followup.controller");

const editRoles = [...FOLLOWUP_EDIT_ROLES];
const deleteRoles = [...FOLLOWUP_DELETE_ROLES];

// All follow-ups are scoped to the authenticated user's company in the service layer.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
// Registered before "/:id" so the literal path is never captured as an id.
router.get("/summary", authenticate, authorize(...editRoles), controller.summary);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;


### Followups - util (full)
// Normalizes a follow-up document (plain, lean or populated) into a
// client-safe view. Populated refs become { id, name, ... }; unpopulated
// references (ObjectId or hex string) stay plain id strings. passwordHash can
// never appear here because follow-up/user views never select it and this
// serializer only whitelists explicit fields.

const isObjectId = (value) =>
  !!value && typeof value === "object" && value._bsontype === "ObjectId";

const idOf = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return String(value._id || value);
};

const populatedView = (value, fields) => {
  if (!value) return null;
  if (!isObjectId(value) && typeof value === "object" && value._id) {
    const view = { id: String(value._id) };
    for (const field of fields) {
      view[field] = value[field] !== undefined && value[field] !== null ? value[field] : null;
    }
    return view;
  }
  return idOf(value);
};

const toFollowUpView = (followup) => {
  const doc = followup && typeof followup.toObject === "function" ? followup.toObject() : followup;
  if (!doc) return null;

  return {
    id: idOf(doc._id),
    companyId: idOf(doc.companyId),
    leadId: idOf(doc.leadId),
    lead: populatedView(doc.leadId, ["name", "phoneNumber"]),
    clientId: idOf(doc.clientId),
    client: populatedView(doc.clientId, ["name", "phoneNumber"]),
    assignedTo: populatedView(doc.assignedTo, ["name", "email"]),
    type: doc.type,
    subject: doc.subject,
    description: doc.description || "",
    dueAt: doc.dueAt,
    status: doc.status,
    completedAt: doc.completedAt || null,
    createdBy: populatedView(doc.createdBy, ["name", "email"]),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
};

module.exports = { toFollowUpView };


### Followups - validation (full)
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const FOLLOWUP_TYPES = ["CALL", "MEETING", "EMAIL", "WHATSAPP", "OTHER"];
const FOLLOWUP_STATUSES = ["PENDING", "COMPLETED", "CANCELLED"];

// companyId, createdBy and completedAt are deliberately absent: they always
// come from the authenticated actor (or the backend completion logic) and are
// never accepted from the payload. dueAt is a date and is validated in the
// service (the rule middleware has no date type).
//
// Exactly one of leadId/clientId is required - that cross-field rule is
// enforced in the service, where both values are available together.
const createRules = [
  {
    field: "leadId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "leadId must be a valid lead id",
  },
  {
    field: "clientId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "clientId must be a valid client id",
  },
  {
    field: "assignedTo",
    type: "string",
    required: true,
    pattern: OBJECT_ID_RE,
    patternMessage: "assignedTo must be a valid user id",
  },
  { field: "type", type: "string", required: true, enum: FOLLOWUP_TYPES },
  { field: "subject", type: "string", required: true, min: 2, max: 200 },
  { field: "description", type: "string", required: false, max: 2000 },
  { field: "status", type: "string", required: false, enum: FOLLOWUP_STATUSES },
];

const updateRules = [
  {
    field: "leadId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "leadId must be a valid lead id",
  },
  {
    field: "clientId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "clientId must be a valid client id",
  },
  {
    field: "assignedTo",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "assignedTo must be a valid user id",
  },
  { field: "type", type: "string", required: false, enum: FOLLOWUP_TYPES },
  { field: "subject", type: "string", required: false, min: 2, max: 200 },
  { field: "description", type: "string", required: false, max: 2000 },
  { field: "status", type: "string", required: false, enum: FOLLOWUP_STATUSES },
];

module.exports = { createRules, updateRules, FOLLOWUP_TYPES, FOLLOWUP_STATUSES };
module.exports.OBJECT_ID_RE = OBJECT_ID_RE;


### Quotations - model (full)

const mongoose = require("mongoose");

const quotationItemSchema = new mongoose.Schema(
  {
    // Null when the employee enters a custom item manually.
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    gstRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const quotationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    quotationNumber: {
      type: String,
      required: true,
      trim: true,
    },

    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [quotationItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "A quotation must contain at least one item.",
      },
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    validUntil: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "SENT",
        "ACCEPTED",
        "REJECTED",
        "EXPIRED",
      ],
      default: "DRAFT",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Unique quotation number within each company.
quotationSchema.index(
  { companyId: 1, quotationNumber: 1 },
  { unique: true }
);

// Filter quotations by company and status.
quotationSchema.index({
  companyId: 1,
  status: 1,
  createdAt: -1,
});

// Find quotations for a particular client.
quotationSchema.index({ companyId: 1, clientId: 1, createdAt: -1 });

// Find quotations for a particular lead.
quotationSchema.index({ companyId: 1, leadId: 1, createdAt: -1 });

module.exports = mongoose.model("Quotation", quotationSchema);

### Quotations - controller (full)
const service = require("./quotation.service");

const create = async (req, res) => {
  const quotation = await service.createQuotation(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Quotation created successfully",
    data: { quotation },
  });
};

const list = async (req, res) => {
  const { quotations, pagination } = await service.listQuotations(req.user, req.query || {});
  res.status(200).json({ success: true, data: quotations, pagination });
};

const getOne = async (req, res) => {
  const quotation = await service.getQuotation(req.user, req.params.id);
  res.status(200).json({ success: true, data: { quotation } });
};

const update = async (req, res) => {
  const quotation = await service.updateQuotation(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Quotation updated successfully",
    data: { quotation },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteQuotation(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Quotation deleted successfully",
    data: result,
  });
};

module.exports = { create, list, getOne, update, remove };


### Quotations - routes (full)
const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { QUOTATION_EDIT_ROLES, QUOTATION_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./quotation.validation");
const controller = require("./quotation.controller");

const editRoles = [...QUOTATION_EDIT_ROLES];
const deleteRoles = [...QUOTATION_DELETE_ROLES];

// Every quotation is scoped to the authenticated user's company in the
// service layer. Money totals and the quotation number are always computed
// server-side; the validation rules never accept them from the payload.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;


### Quotations - util (full)
// Round half-away-from-zero to 2 decimal places. One rounding helper is used
// for every currency figure so item amounts, tax, discount and totals stay
// consistent with each other.
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

// A reference may be a raw ObjectId (not populated) or a populated document.
const idOf = (value) => (value === null || value === undefined ? null : String(value._id || value));

const personRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, phoneNumber: value.phoneNumber || "" };
};

const userRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, email: value.email || "" };
};

const productRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, sku: value.sku || "" };
};

// API view for a quotation. Item fields are snapshots taken at write time -
// they never change when the referenced product changes later, which is what
// the future Invoice module will rely on. The populated `createdBy` is reduced
// to safe fields only (never passwordHash or tokens).
const toQuotationView = (doc) => ({
  id: String(doc._id),
  companyId: String(doc.companyId),
  quotationNumber: doc.quotationNumber,
  leadId: idOf(doc.leadId),
  lead: personRef(doc.leadId),
  clientId: idOf(doc.clientId),
  client: personRef(doc.clientId),
  createdBy: userRef(doc.createdBy),
  items: (doc.items || []).map((item) => ({
    id: String(item._id),
    productId: idOf(item.productId),
    product: productRef(item.productId),
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    gstRate: item.gstRate,
    amount: item.amount,
  })),
  subtotal: doc.subtotal,
  discountAmount: doc.discountAmount,
  taxAmount: doc.taxAmount,
  totalAmount: doc.totalAmount,
  validUntil: doc.validUntil || null,
  status: doc.status,
  notes: doc.notes || "",
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
});

module.exports = { toQuotationView, round2 };


### Quotations - validation (full)
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

// A quotation can only start its life as a draft or as sent.
const CREATE_STATUSES = ["DRAFT", "SENT"];

// Statuses that can never be changed to another status.
const TERMINAL_STATUSES = ["ACCEPTED", "REJECTED", "EXPIRED"];

// companyId, createdBy, quotationNumber and all money totals are deliberately
// absent: they are always computed/assigned by the backend (actor context,
// sequence generation, server-side arithmetic) and never accepted from the
// payload. The exactly-one-of leadId/clientId rule and the per-item number
// checks live in the service, where both values (and each item) are available
// together. validUntil is a date and has no rule-middleware type.
const createRules = [
  {
    field: "leadId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "leadId must be a valid lead id",
  },
  {
    field: "clientId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "clientId must be a valid client id",
  },
  { field: "items", type: "array", required: true },
  { field: "discountAmount", type: "number", required: false, min: 0 },
  { field: "notes", type: "string", required: false, max: 2000 },
  { field: "status", type: "string", required: false, enum: CREATE_STATUSES },
];

const updateRules = [
  {
    field: "leadId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "leadId must be a valid lead id",
  },
  {
    field: "clientId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "clientId must be a valid client id",
  },
  { field: "items", type: "array", required: false },
  { field: "discountAmount", type: "number", required: false, min: 0 },
  { field: "notes", type: "string", required: false, max: 2000 },
  { field: "status", type: "string", required: false, enum: QUOTATION_STATUSES },
];

module.exports = {
  createRules,
  updateRules,
  QUOTATION_STATUSES,
  CREATE_STATUSES,
  TERMINAL_STATUSES,
  OBJECT_ID_RE,
};


### Invoices - model (full)

const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    gstRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },

    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quotation",
      default: null,
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [invoiceItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "An invoice must contain at least one item.",
      },
    },

    issueDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceDue: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "ISSUED",
        "PARTIALLY_PAID",
        "PAID",
        "OVERDUE",
        "CANCELLED",
      ],
      default: "DRAFT",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    paymentTerms: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Invoice numbers are unique within each company.
invoiceSchema.index(
  { companyId: 1, invoiceNumber: 1 },
  { unique: true }
);

// Retrieve invoices by company and status.
invoiceSchema.index({
  companyId: 1,
  status: 1,
  issueDate: -1,
});

// Retrieve a client's invoice history.
invoiceSchema.index({
  companyId: 1,
  clientId: 1,
  issueDate: -1,
});

// Find the invoice generated from a particular quotation.
invoiceSchema.index({ companyId: 1, quotationId: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);

### Invoices - controller (full)
const service = require("./invoice.service");

const create = async (req, res) => {
  const invoice = await service.createInvoice(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Invoice created successfully",
    data: { invoice },
  });
};

const list = async (req, res) => {
  const { invoices, pagination } = await service.listInvoices(req.user, req.query || {});
  res.status(200).json({ success: true, data: invoices, pagination });
};

const getOne = async (req, res) => {
  const invoice = await service.getInvoice(req.user, req.params.id);
  res.status(200).json({ success: true, data: { invoice } });
};

const update = async (req, res) => {
  const invoice = await service.updateInvoice(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Invoice updated successfully",
    data: { invoice },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteInvoice(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Invoice deleted successfully",
    data: result,
  });
};

module.exports = { create, list, getOne, update, remove };


### Invoices - routes (full)
const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { INVOICE_EDIT_ROLES, INVOICE_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./invoice.validation");
const controller = require("./invoice.controller");

const editRoles = [...INVOICE_EDIT_ROLES];
const deleteRoles = [...INVOICE_DELETE_ROLES];

// Every invoice is scoped to the authenticated user's company in the service
// layer. Money totals, the invoice number and amountPaid are always computed
// server-side; the validation rules never accept them from the payload.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;


### Invoices - util (full)
// Round half-away-from-zero to 2 decimal places. Kept in the shared money
// helper so invoices and quotations cannot drift apart.
const { round2 } = require("../../common/utils/money");

// A reference may be a raw ObjectId (not populated) or a populated document.
const idOf = (value) => (value === null || value === undefined ? null : String(value._id || value));

const clientRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return {
    id: String(value._id),
    name: value.name,
    phoneNumber: value.phoneNumber || "",
    email: value.email || "",
    address: value.address || "",
    gstNo: value.gstNo || null,
  };
};

// The invoice's owning company. Only ever the actor's own company (the invoice
// was already scoped by companyId), so no cross-company data is exposed.
const companyRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return {
    id: String(value._id),
    name: value.name,
    email: value.email || "",
    phone: value.phone || "",
    gstNumber: value.gstNumber || "",
    address: value.address || "",
  };
};

const quotationRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), quotationNumber: value.quotationNumber || "" };
};

const userRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, email: value.email || "" };
};

const productRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, sku: value.sku || "" };
};

// An invoice is overdue when it has been issued (or partially paid), carries a
// due date that has passed, and still has an outstanding balance. This is
// derived on read - never persisted and never run by a cron job.
const computeOverdue = (doc) => {
  if (doc.status !== "ISSUED" && doc.status !== "PARTIALLY_PAID") return false;
  if (!doc.dueDate) return false;
  if (round2(doc.balanceDue) <= 0) return false;
  return new Date(doc.dueDate).getTime() < Date.now();
};

// Aggregation expression that mirrors computeOverdue, so dashboards and reports
// can split an invoice into an OVERDUE bucket inside a single $group instead of
// persisting a derived status. `now` is injected for deterministic tests.
const overdueCondition = (now = new Date()) => ({
  $and: [
    { $in: ["$status", ["ISSUED", "PARTIALLY_PAID"]] },
    { $ne: [{ $ifNull: ["$dueDate", null] }, null] },
    { $gt: ["$balanceDue", 0] },
    { $lt: ["$dueDate", now] },
  ],
});

// API view for an invoice. Item fields are snapshots taken at write time - they
// never change when the referenced product changes later. `status` is the
// stored lifecycle status; `effectiveStatus` adds the derived OVERDUE value for
// display. The populated `createdBy` is reduced to safe fields only (never
// passwordHash or tokens).
const toInvoiceView = (doc) => {
  const isOverdue = computeOverdue(doc);
  return {
    id: String(doc._id),
    companyId: idOf(doc.companyId),
    company: companyRef(doc.companyId),
    invoiceNumber: doc.invoiceNumber,
    quotationId: idOf(doc.quotationId),
    quotation: quotationRef(doc.quotationId),
    clientId: idOf(doc.clientId),
    client: clientRef(doc.clientId),
    createdBy: userRef(doc.createdBy),
    items: (doc.items || []).map((item) => ({
      id: String(item._id),
      productId: idOf(item.productId),
      product: productRef(item.productId),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      gstRate: item.gstRate,
      amount: item.amount,
    })),
    subtotal: doc.subtotal,
    discountAmount: doc.discountAmount,
    taxAmount: doc.taxAmount,
    totalAmount: doc.totalAmount,
    amountPaid: doc.amountPaid,
    balanceDue: doc.balanceDue,
    issueDate: doc.issueDate || null,
    dueDate: doc.dueDate || null,
    status: doc.status,
    isOverdue,
    effectiveStatus: isOverdue ? "OVERDUE" : doc.status,
    notes: doc.notes || "",
    paymentTerms: doc.paymentTerms || "",
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
};

module.exports = { toInvoiceView, computeOverdue, overdueCondition, round2 };


### Invoices - validation (full)
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

// Persisted statuses. OVERDUE is never stored: it is derived at read time from
// the issue status + dueDate + balanceDue and exposed as `effectiveStatus`.
const INVOICE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
];

// Statuses a client may request on create. Every invoice starts its life as a
// draft; it is issued through an explicit update.
const CREATE_STATUSES = ["DRAFT"];

// Statuses a client may request on update. PARTIALLY_PAID / PAID are driven by
// the future Payments module and are never set directly through this API.
const UPDATE_STATUSES = ["ISSUED", "CANCELLED"];

// companyId, createdBy, invoiceNumber, amountPaid, balanceDue and every money
// total are deliberately absent from the rules: they are always computed or
// assigned by the backend (actor context, sequence generation, server-side
// arithmetic) and never accepted from the payload. The quotation-vs-direct
// requirement lives in the service, where both values are available together.
// issueDate/dueDate are dates and have no rule-middleware type, so they are
// parsed and validated in the service.
const createRules = [
  {
    field: "quotationId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "quotationId must be a valid quotation id",
  },
  {
    field: "clientId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "clientId must be a valid client id",
  },
  { field: "items", type: "array", required: false },
  { field: "discountAmount", type: "number", required: false, min: 0 },
  { field: "notes", type: "string", required: false, max: 2000 },
  { field: "paymentTerms", type: "string", required: false, max: 1000 },
  { field: "status", type: "string", required: false, enum: CREATE_STATUSES },
];

const updateRules = [
  {
    field: "clientId",
    type: "string",
    required: false,
    pattern: OBJECT_ID_RE,
    patternMessage: "clientId must be a valid client id",
  },
  { field: "items", type: "array", required: false },
  { field: "discountAmount", type: "number", required: false, min: 0 },
  { field: "notes", type: "string", required: false, max: 2000 },
  { field: "paymentTerms", type: "string", required: false, max: 1000 },
  { field: "status", type: "string", required: false, enum: UPDATE_STATUSES },
];

module.exports = {
  createRules,
  updateRules,
  INVOICE_STATUSES,
  CREATE_STATUSES,
  UPDATE_STATUSES,
  OBJECT_ID_RE,
};


### Payments - model (full)

const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    paymentNumber: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    paymentDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    method: {
      type: String,
      enum: [
        "CASH",
        "BANK_TRANSFER",
        "UPI",
        "CARD",
        "CHEQUE",
        "OTHER",
      ],
      required: true,
    },

    transactionReference: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["RECORDED", "VOIDED", "REFUNDED"],
      default: "RECORDED",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Void audit trail. Populated only when a RECORDED payment is voided; the
    // document is never physically deleted so history stays intact.
    voidReason: {
      type: String,
      trim: true,
      default: "",
    },

    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    voidedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Payment numbers must be unique within each company.
paymentSchema.index(
  { companyId: 1, paymentNumber: 1 },
  { unique: true }
);

// Retrieve payment history for an invoice.
paymentSchema.index({
  companyId: 1,
  invoiceId: 1,
  paymentDate: -1,
});

// Retrieve a client's payment history.
paymentSchema.index({
  companyId: 1,
  clientId: 1,
  paymentDate: -1,
});

module.exports = mongoose.model("Payment", paymentSchema);

### Payments - controller (full)
const service = require("./payment.service");

const create = async (req, res) => {
  const payment = await service.recordPayment(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Payment recorded successfully",
    data: { payment },
  });
};

const list = async (req, res) => {
  const { payments, pagination } = await service.listPayments(req.user, req.query || {});
  res.status(200).json({ success: true, data: payments, pagination });
};

const getOne = async (req, res) => {
  const payment = await service.getPayment(req.user, req.params.id);
  res.status(200).json({ success: true, data: { payment } });
};

const voidPayment = async (req, res) => {
  const payment = await service.voidPayment(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Payment voided successfully",
    data: { payment },
  });
};

module.exports = { create, list, getOne, voidPayment };


### Payments - routes (full)
const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { PAYMENT_EDIT_ROLES, PAYMENT_VOID_ROLES } = require("../../common/constants");
const { createRules, voidRules } = require("./payment.validation");
const controller = require("./payment.controller");

const editRoles = [...PAYMENT_EDIT_ROLES];
const voidRoles = [...PAYMENT_VOID_ROLES];

// Every payment is scoped to the authenticated user's company in the service
// layer. companyId, clientId, paymentNumber, recordedBy and the invoice balance
// are always derived server-side and are never accepted from the payload.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.post("/:id/void", authenticate, authorize(...voidRoles), validate(voidRules), controller.voidPayment);

module.exports = router;


### Payments - util (full)
const { round2 } = require("../../common/utils/money");

// A reference may be a raw ObjectId (not populated) or a populated document.
const idOf = (value) => (value === null || value === undefined ? null : String(value._id || value));

const clientRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return {
    id: String(value._id),
    name: value.name,
    phoneNumber: value.phoneNumber || "",
    email: value.email || "",
  };
};

const invoiceRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return {
    id: String(value._id),
    invoiceNumber: value.invoiceNumber || "",
    status: value.status || "",
    totalAmount: value.totalAmount,
    amountPaid: value.amountPaid,
    balanceDue: value.balanceDue,
  };
};

// Safe user projection - never exposes passwordHash or tokens.
const userRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, email: value.email || "" };
};

// API view for a payment. Populated refs are reduced to safe fields only.
const toPaymentView = (doc) => ({
  id: String(doc._id),
  companyId: String(doc.companyId),
  paymentNumber: doc.paymentNumber,
  invoiceId: idOf(doc.invoiceId),
  invoice: invoiceRef(doc.invoiceId),
  clientId: idOf(doc.clientId),
  client: clientRef(doc.clientId),
  amount: round2(doc.amount),
  paymentDate: doc.paymentDate || null,
  method: doc.method,
  transactionReference: doc.transactionReference || "",
  status: doc.status,
  notes: doc.notes || "",
  recordedBy: userRef(doc.recordedBy),
  voidReason: doc.voidReason || "",
  voidedBy: userRef(doc.voidedBy),
  voidedAt: doc.voidedAt || null,
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
});

module.exports = { toPaymentView, round2 };


### Payments - validation (full)
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

// Supported manual payment methods. Scope deliberately excludes gateways.
const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "OTHER"];

// Lifecycle of a payment. REFUNDED is reserved for a future refund workflow and
// is never set by this module.
const PAYMENT_STATUSES = ["RECORDED", "VOIDED", "REFUNDED"];

// companyId, clientId, paymentNumber, recordedBy and status are deliberately
// absent: they are always derived by the backend (actor context, invoice, and
// the sequence generator) and never accepted from the payload. paymentDate is a
// date and has no rule-middleware type, so it is parsed and validated in the
// service. amount is only checked as a positive-integer-free number here; the
// "greater than zero" and "not more than balance due" checks live in the
// service where the invoice is available.
const createRules = [
  {
    field: "invoiceId",
    type: "string",
    required: true,
    pattern: OBJECT_ID_RE,
    patternMessage: "invoiceId must be a valid invoice id",
  },
  { field: "amount", type: "number", required: true },
  { field: "method", type: "string", required: true, enum: PAYMENT_METHODS },
  { field: "transactionReference", type: "string", required: false, max: 200 },
  { field: "notes", type: "string", required: false, max: 2000 },
];

// A void must always carry a reason for the audit trail.
const voidRules = [
  { field: "reason", type: "string", required: true, min: 1, max: 1000 },
];

module.exports = {
  createRules,
  voidRules,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  OBJECT_ID_RE,
};
