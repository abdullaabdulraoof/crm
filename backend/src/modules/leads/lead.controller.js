const service = require("./lead.service");

const create = async (req, res) => {
  const lead = await service.createLead(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Lead created successfully",
    data: { lead },
  });
};

const list = async (req, res) => {
  const { leads, pagination } = await service.listLeads(req.user, req.query || {});
  res.status(200).json({ success: true, data: leads, pagination });
};

const getOne = async (req, res) => {
  const lead = await service.getLead(req.user, req.params.id);
  res.status(200).json({ success: true, data: { lead } });
};

const update = async (req, res) => {
  const lead = await service.updateLead(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Lead updated successfully",
    data: { lead },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteLead(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Lead deleted successfully",
    data: result,
  });
};

module.exports = { create, list, getOne, update, remove };