const service = require("./activityLog.service");

const list = async (req, res) => {
  const { activityLogs, pagination } = await service.listActivityLogs(req.user, req.query || {});
  res.status(200).json({ success: true, data: activityLogs, pagination });
};

module.exports = { list };
