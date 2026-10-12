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
