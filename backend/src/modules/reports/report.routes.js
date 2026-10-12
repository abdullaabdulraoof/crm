const router = require("express").Router();
const authenticate = require("../../common/middleware/authenticate");
const controller = require("./report.controller");

// Read-only, company-scoped reports. Any authenticated employee may run them
// (consistent with the rest of the read APIs); the service restricts every
// aggregation to req.user.companyId. Optional from/to query params are
// validated per report.
router.get("/leads", authenticate, controller.leads);
router.get("/quotations", authenticate, controller.quotations);
router.get("/invoices", authenticate, controller.invoices);
router.get("/payments", authenticate, controller.payments);
router.get("/follow-ups", authenticate, controller.followUps);

module.exports = router;
