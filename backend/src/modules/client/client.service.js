const Client = require("./client.model");

// Lightweight company directory for pickers (follow-up form). Any authenticated
// member may load it; only the minimal fields ever leave the server.
const listClients = async (actor) => {
  const clients = await Client.find({ companyId: actor.companyId, isActive: true })
    .sort({ name: 1 })
    .select("name phoneNumber");

  return clients.map((client) => ({
    id: String(client._id),
    name: client.name,
    phoneNumber: client.phoneNumber || "",
  }));
};

module.exports = { listClients };
