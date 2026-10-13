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