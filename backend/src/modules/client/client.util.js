// Safe client projection for the paginated list. companyId and createdBy stay
// server-side; every field here is intended for the CRM UI.
const toClientView = (client) => ({
  id: String(client._id),
  name: client.name,
  phoneNumber: client.phoneNumber || "",
  email: client.email || "",
  address: client.address || "",
  gstNo: client.gstNo || null,
  clientType: client.clientType,
  notes: client.notes || "",
  isActive: client.isActive !== false,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
});

// Minimal projection for dropdown pickers (unchanged legacy payload).
const toClientOption = (client) => ({
  id: String(client._id),
  name: client.name,
  phoneNumber: client.phoneNumber || "",
});

module.exports = { toClientView, toClientOption };
