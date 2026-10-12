const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { FOLLOWUP_EDIT_ROLES, FOLLOWUP_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./followup.validation");
const controller = require("./followup.controller");

const editRoles = [...FOLLOWUP_EDIT_ROLES];
const deleteRoles = [...FOLLOWUP_DELETE_ROLES];

// All follow-ups are scoped to the authenticated user's company in the service layer.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;
