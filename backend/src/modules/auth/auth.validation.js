const { EMAIL_RE } = require("../../common/middleware/validate");

// 8-72 chars (bcrypt practical limit) with at least one letter and one digit.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,72}$/;

const registerRules = [
  { field: "company", type: "object", required: true },
  { field: "company.name", type: "string", required: true, min: 2, max: 120 },
  { field: "company.email", type: "email", required: true },
  { field: "company.phone", type: "string", required: true, min: 5, max: 20 },
  { field: "company.gstNumber", type: "string", required: true, min: 3, max: 30 },
  { field: "company.address", type: "string", required: true, min: 3, max: 300 },
  { field: "owner", type: "object", required: true },
  { field: "owner.name", type: "string", required: true, min: 2, max: 100 },
  { field: "owner.email", type: "email", required: true },
  { field: "owner.password", type: "string", required: true, pattern: PASSWORD_RE, patternMessage: "owner.password must be 8-72 characters and include at least one letter and one digit" },
  { field: "owner.phone", type: "string", required: false, max: 20 },
];

const loginRules = [
  { field: "email", type: "email", required: true },
  { field: "password", type: "string", required: true, min: 1, max: 128 },
];

const forgotPasswordRules = [
  { field: "email", type: "email", required: true },
];

// The token is only checked for presence here; its validity is checked in the
// service and maps to the same generic message for every failure reason.
const resetPasswordRules = [
  { field: "token", type: "string", required: true, min: 1, max: 512 },
  { field: "password", type: "string", required: true, pattern: PASSWORD_RE, patternMessage: "password must be 8-72 characters and include at least one letter and one digit" },
];

module.exports = { registerRules, loginRules, forgotPasswordRules, resetPasswordRules, PASSWORD_RE };
