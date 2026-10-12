// API view for a product. The shape is intentionally quotation-ready:
// id, name, unitPrice, gstRate and type are exactly what a future quotation
// line needs.
const toProductView = (doc) => ({
  id: String(doc._id),
  companyId: String(doc.companyId),
  name: doc.name,
  description: doc.description || "",
  sku: doc.sku || "",
  unitPrice: doc.unitPrice,
  gstRate: doc.gstRate,
  type: doc.type,
  isActive: doc.isActive,
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
});

module.exports = { toProductView };
