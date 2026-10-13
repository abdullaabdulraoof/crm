const router = require("express").Router();
const validate = require("../../common/middleware/validate");
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { CLIENT_EDIT_ROLES, CLIENT_DELETE_ROLES } = require("../../common/constants");
const { createRules, updateRules } = require("./client.validation");
const controller = require("./client.controller");

const editRoles = [...CLIENT_EDIT_ROLES];
const deleteRoles = [...CLIENT_DELETE_ROLES];

// Literal path registered before "/:id" so the directory is never captured as an id.
// GET / is the paginated, company-scoped client list; GET /options is the
// lightweight picker directory consumed by the other modules' forms.
router.get("/options", authenticate, controller.listOptions);

// All clients are scoped to the authenticated user's company in the service layer.
router.post("/", authenticate, authorize(...editRoles), validate(createRules), controller.create);
router.get("/", authenticate, authorize(...editRoles), controller.list);
router.get("/:id", authenticate, authorize(...editRoles), controller.getOne);
router.put("/:id", authenticate, authorize(...editRoles), validate(updateRules), controller.update);
router.delete("/:id", authenticate, authorize(...deleteRoles), controller.remove);

module.exports = router;
