const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { PAYMENT_EDIT_ROLES, PAYMENT_VOID_ROLES } = require("../../common/constants");
const { createRules, voidRules } = require("./payment.validation");
const controller = require("./payment.controller");

const editRoles = [...PAYMENT_EDIT_ROLES];
const voidRoles = [...PAYMENT_VOID_ROLES];

// Every payment is scoped to the authenticated user's company in the service
// layer. companyId, clientId, paymentNumber, recordedBy and the invoice balance
// are always derived server-side and are never accepted from the payload.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.post("/:id/void", authenticate, authorize(...voidRoles), validate(voidRules), controller.voidPayment);

module.exports = router;
