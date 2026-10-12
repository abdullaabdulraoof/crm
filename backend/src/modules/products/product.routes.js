const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { PRODUCT_EDIT_ROLES, PRODUCT_DEACTIVATE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./product.validation");
const controller = require("./product.controller");

const editRoles = [...PRODUCT_EDIT_ROLES];
const deactivateRoles = [...PRODUCT_DEACTIVATE_ROLES];

// All products are scoped to the authenticated user's company in the service
// layer. DELETE performs a soft deactivation (isActive = false), never a
// physical removal, and is limited to the same roles as other delete routes.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deactivateRoles), controller.remove);

module.exports = router;
