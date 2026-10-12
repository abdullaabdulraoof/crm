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
