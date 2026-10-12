// Normalizes a follow-up document (plain, lean or populated) into a
// client-safe view. Populated refs become { id, name, ... }; unpopulated
// references (ObjectId or hex string) stay plain id strings. passwordHash can
// never appear here because follow-up/user views never select it and this
// serializer only whitelists explicit fields.

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

const toFollowUpView = (followup) => {
  const doc = followup && typeof followup.toObject === "function" ? followup.toObject() : followup;
  if (!doc) return null;

  return {
    id: idOf(doc._id),
    companyId: idOf(doc.companyId),
    leadId: idOf(doc.leadId),
    lead: populatedView(doc.leadId, ["name", "phoneNumber"]),
    clientId: idOf(doc.clientId),
    client: populatedView(doc.clientId, ["name", "phoneNumber"]),
    assignedTo: populatedView(doc.assignedTo, ["name", "email"]),
    type: doc.type,
    subject: doc.subject,
    description: doc.description || "",
    dueAt: doc.dueAt,
    status: doc.status,
    completedAt: doc.completedAt || null,
    createdBy: populatedView(doc.createdBy, ["name", "email"]),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
};

module.exports = { toFollowUpView };
