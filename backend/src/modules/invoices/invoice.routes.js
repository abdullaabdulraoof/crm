const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { INVOICE_EDIT_ROLES, INVOICE_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./invoice.validation");
const controller = require("./invoice.controller");

const editRoles = [...INVOICE_EDIT_ROLES];
const deleteRoles = [...INVOICE_DELETE_ROLES];

// Every invoice is scoped to the authenticated user's company in the service
// layer. Money totals, the invoice number and amountPaid are always computed
// server-side; the validation rules never accept them from the payload.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;
