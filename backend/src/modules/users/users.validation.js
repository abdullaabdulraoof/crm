const { ALL_ROLES } = require("../../common/constants");
const { PASSWORD_RE } = require("../auth/auth.validation");

// OWNER is a valid role value but can never be assigned here: the service
// rejects it with 403 ROLE_NOT_ASSIGNABLE (ownership changes are transfer-only).
const createRules = [
  { field: "name", type: "string", required: true, min: 2, max: 100 },
  { field: "email", type: "email", required: true },
  {
    field: "password",
    type: "string",
    required: true,
    pattern: PASSWORD_RE,
    patternMessage:
      "password must be 8-72 characters and include at least one letter and one digit",
  },
  { field: "role", type: "string", required: false, enum: ALL_ROLES },
  { field: "phone", type: "string", required: false, max: 20 },
];

// Ordinary profile update: only these fields exist in the rules, so role,
// companyId, email and password sent by clients are never accepted.
const updateRules = [
  { field: "name", type: "string", required: true, min: 2, max: 100 },
  { field: "phone", type: "string", required: false, max: 20 },
];

const roleRules = [{ field: "role", type: "string", required: true, enum: ALL_ROLES }];

const statusRules = [{ field: "isActive", type: "boolean", required: true }];

module.exports = { createRules, updateRules, roleRules, statusRules };
