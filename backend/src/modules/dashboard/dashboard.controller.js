const service = require("./dashboard.service");

const summary = async (req, res) => {
  const data = await service.getDashboardSummary(req.user);
  res.status(200).json({ success: true, data });
};

module.exports = { summary };
