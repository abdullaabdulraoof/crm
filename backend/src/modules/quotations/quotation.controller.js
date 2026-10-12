const service = require("./quotation.service");

const create = async (req, res) => {
  const quotation = await service.createQuotation(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Quotation created successfully",
    data: { quotation },
  });
};

const list = async (req, res) => {
  const { quotations, pagination } = await service.listQuotations(req.user, req.query || {});
  res.status(200).json({ success: true, data: quotations, pagination });
};

const getOne = async (req, res) => {
  const quotation = await service.getQuotation(req.user, req.params.id);
  res.status(200).json({ success: true, data: { quotation } });
};

const update = async (req, res) => {
  const quotation = await service.updateQuotation(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Quotation updated successfully",
    data: { quotation },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteQuotation(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Quotation deleted successfully",
    data: result,
  });
};

module.exports = { create, list, getOne, update, remove };
