const service = require("./client.service");

const create = async (req, res) => {
  const client = await service.createClient(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Client created successfully",
    data: { client },
  });
};

const list = async (req, res) => {
  const { clients, pagination } = await service.listClients(req.user, req.query || {});
  res.status(200).json({ success: true, data: clients, pagination });
};

// Lightweight company directory for picker clients (follow-up/quotation/invoice/payment forms).
const listOptions = async (req, res) => {
  const clients = await service.listClientOptions(req.user);
  res.status(200).json({ success: true, data: { clients } });
};

const getOne = async (req, res) => {
  const client = await service.getClient(req.user, req.params.id);
  res.status(200).json({ success: true, data: { client } });
};

const update = async (req, res) => {
  const client = await service.updateClient(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Client updated successfully",
    data: { client },
  });
};

const remove = async (req, res) => {
  const result = await service.deleteClient(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: "Client deleted successfully",
    data: result,
  });
};

module.exports = { create, list, listOptions, getOne, update, remove };
