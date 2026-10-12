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
