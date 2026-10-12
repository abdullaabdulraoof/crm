const service = require("./report.service");

const leads = async (req, res) => {
  const data = await service.getLeadReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

const quotations = async (req, res) => {
  const data = await service.getQuotationReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

const invoices = async (req, res) => {
  const data = await service.getInvoiceReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

const payments = async (req, res) => {
  const data = await service.getPaymentReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

const followUps = async (req, res) => {
  const data = await service.getFollowUpReport(req.user, req.query || {});
  res.status(200).json({ success: true, data });
};

module.exports = { leads, quotations, invoices, payments, followUps };
