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
