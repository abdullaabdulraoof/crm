const service = require("./client.service");

const list = async (req, res) => {
  const clients = await service.listClients(req.user);
  res.status(200).json({ success: true, data: { clients } });
};

module.exports = { list };
