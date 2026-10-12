const service = require("./payment.service");

const create = async (req, res) => {
  const payment = await service.recordPayment(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Payment recorded successfully",
    data: { payment },
  });
};

const list = async (req, res) => {
  const { payments, pagination } = await service.listPayments(req.user, req.query || {});
  res.status(200).json({ success: true, data: payments, pagination });
};

const getOne = async (req, res) => {
  const payment = await service.getPayment(req.user, req.params.id);
  res.status(200).json({ success: true, data: { payment } });
};

const voidPayment = async (req, res) => {
  const payment = await service.voidPayment(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Payment voided successfully",
    data: { payment },
  });
};

module.exports = { create, list, getOne, voidPayment };
