const service = require("./followup.service");

const create = async (req, res) => {
  const followup = await service.createFollowup(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Follow-up created successfully",
    data: { followup },
  });
};

const list = async (req, res) => {
  const { followups, pagination } = await service.listFollowups(req.user, req.query || {});
  res.status(200).json({ success: true, data: followups, pagination });
};

const getOne = async (req, res) => {
  const followup = await service.getFollowup(req.user, req.params.id);
  res.status(200).json({ success: true, data: { followup } });
};

const update = async (req, res) => {
  const followup = await service.updateFollowup(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Follow-up updated successfully",
    data: { followup },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteFollowup(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Follow-up deleted successfully",
    data: result,
  });
};

module.exports = { create, list, getOne, update, remove };
