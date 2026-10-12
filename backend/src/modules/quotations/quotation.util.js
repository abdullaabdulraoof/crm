// Round half-away-from-zero to 2 decimal places. One rounding helper is used
// for every currency figure so item amounts, tax, discount and totals stay
// consistent with each other.
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

// A reference may be a raw ObjectId (not populated) or a populated document.
const idOf = (value) => (value === null || value === undefined ? null : String(value._id || value));

const personRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, phoneNumber: value.phoneNumber || "" };
};

const userRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, email: value.email || "" };
};

const productRef = (value) => {
  if (!value || typeof value !== "object" || !value._id) return null;
  return { id: String(value._id), name: value.name, sku: value.sku || "" };
};

// API view for a quotation. Item fields are snapshots taken at write time -
// they never change when the referenced product changes later, which is what
// the future Invoice module will rely on. The populated `createdBy` is reduced
// to safe fields only (never passwordHash or tokens).
const toQuotationView = (doc) => ({
  id: String(doc._id),
  companyId: String(doc.companyId),
  quotationNumber: doc.quotationNumber,
  leadId: idOf(doc.leadId),
  lead: personRef(doc.leadId),
  clientId: idOf(doc.clientId),
  client: personRef(doc.clientId),
  createdBy: userRef(doc.createdBy),
  items: (doc.items || []).map((item) => ({
    id: String(item._id),
    productId: idOf(item.productId),
    product: productRef(item.productId),
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    gstRate: item.gstRate,
    amount: item.amount,
  })),
  subtotal: doc.subtotal,
  discountAmount: doc.discountAmount,
  taxAmount: doc.taxAmount,
  totalAmount: doc.totalAmount,
  validUntil: doc.validUntil || null,
  status: doc.status,
  notes: doc.notes || "",
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
});

module.exports = { toQuotationView, round2 };
