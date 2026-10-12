const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { USER_MANAGEMENT_ROLES } = require("../../common/constants");
const { createRules, updateRules, roleRules, statusRules } = require("./users.validation");
const controller = require("./users.controller");

const manageRoles = [...USER_MANAGEMENT_ROLES];

// GET /api/users — list employees (OWNER, ADMIN).
router.get("/", authenticate, authorize(...manageRoles), controller.list);

// POST /api/users — create an employee (OWNER, ADMIN). companyId is ignored.
router.post("/", authenticate, authorize(...manageRoles), validate(createRules), controller.create);

// GET /api/users/options — lightweight company directory for pickers.
// Any authenticated company member may load it (before the /:id route).
router.get("/options", authenticate, controller.listOptions);

// GET /api/users/:id — view an employee (OWNER, ADMIN).
router.get("/:id", authenticate, authorize(...manageRoles), controller.getOne);

// PATCH /api/users/:id/role — dedicated role change; ordinary updates cannot touch role.
router.patch(
  "/:id/role",
  authenticate,
  authorize(...manageRoles),
  validate(roleRules),
  controller.updateRole
);

// PATCH /api/users/:id/status — activate/deactivate (soft delete, no DELETE route).
router.patch(
  "/:id/status",
  authenticate,
  authorize(...manageRoles),
  validate(statusRules),
  controller.updateStatus
);

// PATCH /api/users/:id — ordinary profile update (name/phone). Any authenticated
// user may edit their own record; the service decides who may edit others and
// never reads role/companyId/email/password from the payload.
router.patch("/:id", authenticate, validate(updateRules), controller.update);

module.exports = router;
