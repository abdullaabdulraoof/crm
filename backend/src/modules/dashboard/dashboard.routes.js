const router = require("express").Router();
const authenticate = require("../../common/middleware/authenticate");
const controller = require("./dashboard.controller");

// Read-only, company-scoped summary. Any authenticated employee may view the
// dashboard - the service restricts every query to req.user.companyId.
router.get("/summary", authenticate, controller.summary);

module.exports = router;
