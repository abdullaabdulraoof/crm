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
