const router = require("express").Router();
const authenticate = require("../../common/middleware/authenticate");
const controller = require("./client.controller");

// GET /api/clients — lightweight company directory for pickers.
// Any authenticated company member may load it.
router.get("/", authenticate, controller.list);

module.exports = router;
