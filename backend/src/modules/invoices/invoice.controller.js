const service = require("./invoice.service");

const create = async (req, res) => {
  const invoice = await service.createInvoice(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Invoice created successfully",
    data: { invoice },
  });
};

const list = async (req, res) => {
  const { invoices, pagination } = await service.listInvoices(req.user, req.query || {});
  res.status(200).json({ success: true, data: invoices, pagination });
};

const getOne = async (req, res) => {
  const invoice = await service.getInvoice(req.user, req.params.id);
  res.status(200).json({ success: true, data: { invoice } });
};

const update = async (req, res) => {
  const invoice = await service.updateInvoice(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Invoice updated successfully",
    data: { invoice },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteInvoice(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Invoice deleted successfully",
    data: result,
  });
};

module.exports = { create, list, getOne, update, remove };
