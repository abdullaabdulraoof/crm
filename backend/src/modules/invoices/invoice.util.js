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
