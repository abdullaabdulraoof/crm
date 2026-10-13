const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { LEAD_EDIT_ROLES, LEAD_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./lead.validation");
const controller = require("./lead.controller");

const editRoles = [...LEAD_EDIT_ROLES];
const deleteRoles = [...LEAD_DELETE_ROLES];

// All leads are scoped to the authenticated user's company in the service layer.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
// Registered before "/:id" so the literal path is never captured as an id.
router.get("/summary", authenticate, authorize(...editRoles), controller.summary);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;