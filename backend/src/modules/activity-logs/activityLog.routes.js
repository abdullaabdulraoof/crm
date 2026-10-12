const router = require("express").Router();
const authenticate = require("../../common/middleware/authenticate");
const authorize = require("../../common/middleware/authorize");
const { USER_MANAGEMENT_ROLES } = require("../../common/constants");
const controller = require("./activityLog.controller");

// GET /api/activity-logs — company audit trail (OWNER, ADMIN).
router.get("/", authenticate, authorize(...USER_MANAGEMENT_ROLES), controller.list);

module.exports = router;
