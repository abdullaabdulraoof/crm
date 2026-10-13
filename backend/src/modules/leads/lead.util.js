// Normalizes a lead document (plain, lean or populated) into a client-safe view.
// A populated assignedTo/createdBy becomes { id, name, email }; an unpopulated
// reference (an ObjectId or a hex string) stays a plain id string. passwordHash
// can never appear here because the lead/user views never select it.

const isObjectId = (value) =>
  !!value && typeof value === "object" && value._bsontype === "ObjectId";

const idOf = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return String(value._id || value);
};

const populatedView = (value, fields) => {
  if (!value) return null;
  if (!isObjectId(value) && typeof value === "object" && value._id) {
    const view = { id: String(value._id) };
    for (const field of fields) {
      view[field] = value[field] !== undefined && value[field] !== null ? value[field] : null;
    }
    return view;
  }
  return idOf(value);
};

const toLeadView = (lead) => {
  const doc = lead && typeof lead.toObject === "function" ? lead.toObject() : lead;
  if (!doc) return null;

  return {
    id: idOf(doc._id),
    companyId: idOf(doc.companyId),
    name: doc.name,
    phoneNumber: doc.phoneNumber,
    email: doc.email || null,
    source: doc.source,
    status: doc.status,
    assignedTo: populatedView(doc.assignedTo, ["name", "email"]),
    notes: doc.notes || null,
    nextFollowUpAt: doc.nextFollowUpAt || null,
    clientId: idOf(doc.clientId),
    convertedClientId: idOf(doc.convertedClientId),
    createdBy: populatedView(doc.createdBy, ["name"]),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
};

module.exports = { toLeadView };