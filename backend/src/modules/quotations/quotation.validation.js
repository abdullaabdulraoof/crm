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
