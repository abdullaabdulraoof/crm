const ROLES = Object.freeze({
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  SALES: "SALES",
});

const ALL_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]);

// Roles allowed to create employees and change employee roles/status.
const USER_MANAGEMENT_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Roles allowed to create, view and edit leads.
const LEAD_EDIT_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]);

// Roles allowed to delete leads. SALES and MANAGER never delete.
const LEAD_DELETE_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Roles allowed to create, view and edit clients.
const CLIENT_EDIT_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]);

// Roles allowed to archive (soft-delete) clients. SALES and MANAGER never archive.
const CLIENT_DELETE_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Roles allowed to create, view and edit follow-ups.
const FOLLOWUP_EDIT_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]);

// Roles allowed to delete follow-ups. SALES and MANAGER never delete.
const FOLLOWUP_DELETE_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Roles allowed to create, view and edit products.
const PRODUCT_EDIT_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]);

// Roles allowed to deactivate/activate products. Follows the delete
// convention: SALES and MANAGER never remove or deactivate records.
const PRODUCT_DEACTIVATE_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Roles allowed to create, view and edit quotations.
const QUOTATION_EDIT_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]);

// Roles allowed to delete quotations. SALES and MANAGER never delete.
const QUOTATION_DELETE_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Roles allowed to create, view and edit invoices.
const INVOICE_EDIT_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]);

// Roles allowed to delete invoices. SALES and MANAGER never delete.
const INVOICE_DELETE_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Roles allowed to record and view payments.
const PAYMENT_EDIT_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]);

// Roles allowed to void a recorded payment. Follows the delete convention:
// SALES and MANAGER never reverse financial records.
const PAYMENT_VOID_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Roles an actor is allowed to assign to another user.
// OWNER is deliberately absent for everyone: granting OWNER only happens
// through the dedicated transferOwnership workflow.
const ROLES_ASSIGNABLE_BY = Object.freeze({
  [ROLES.OWNER]: Object.freeze([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]),
  [ROLES.ADMIN]: Object.freeze([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES]),
  [ROLES.MANAGER]: Object.freeze([]),
  [ROLES.SALES]: Object.freeze([]),
});

// The company owner account can only be altered through dedicated workflows.
const PROTECTED_FROM_ROLE_CHANGE = Object.freeze([ROLES.OWNER]);

module.exports = {
  ROLES,
  ALL_ROLES,
  USER_MANAGEMENT_ROLES,
  LEAD_EDIT_ROLES,
  LEAD_DELETE_ROLES,
  CLIENT_EDIT_ROLES,
  CLIENT_DELETE_ROLES,
  FOLLOWUP_EDIT_ROLES,
  FOLLOWUP_DELETE_ROLES,
  PRODUCT_EDIT_ROLES,
  PRODUCT_DEACTIVATE_ROLES,
  QUOTATION_EDIT_ROLES,
  QUOTATION_DELETE_ROLES,
  INVOICE_EDIT_ROLES,
  INVOICE_DELETE_ROLES,
  PAYMENT_EDIT_ROLES,
  PAYMENT_VOID_ROLES,
  ROLES_ASSIGNABLE_BY,
  PROTECTED_FROM_ROLE_CHANGE,
};
