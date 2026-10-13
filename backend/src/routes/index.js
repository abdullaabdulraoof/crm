const router = require("express").Router();

router.use("/auth", require("../modules/auth/auth.routes"));
router.use("/users", require("../modules/users/users.routes"));
router.use("/activity-logs", require("../modules/activity-logs/activityLog.routes"));
router.use("/dashboard", require("../modules/dashboard/dashboard.routes"));
router.use("/reports", require("../modules/reports/report.routes"));
router.use("/leads", require("../modules/leads/lead.routes"));
router.use("/clients", require("../modules/client/client.routes"));
router.use("/follow-ups", require("../modules/followups/followup.routes"));
router.use("/products", require("../modules/products/product.routes"));
router.use("/quotations", require("../modules/quotations/quotation.routes"));
router.use("/invoices", require("../modules/invoices/invoice.routes"));
router.use("/payments", require("../modules/payments/payment.routes"));

module.exports = router;
