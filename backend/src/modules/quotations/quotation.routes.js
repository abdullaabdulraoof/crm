const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { QUOTATION_EDIT_ROLES, QUOTATION_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./quotation.validation");
const controller = require("./quotation.controller");

const editRoles = [...QUOTATION_EDIT_ROLES];
const deleteRoles = [...QUOTATION_DELETE_ROLES];

// Every quotation is scoped to the authenticated user's company in the
// service layer. Money totals and the quotation number are always computed
// server-side; the validation rules never accept them from the payload.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;
