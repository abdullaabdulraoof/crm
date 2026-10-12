const PRODUCT_TYPES = ["PRODUCT", "SERVICE"];

// companyId, isActive (on create) and createdAt/updatedAt are deliberately
// absent: companyId always comes from the authenticated actor, isActive is
// managed through the dedicated activate/deactivate flow, and timestamps are
// set by mongoose. unitPrice/gstRate are numbers and are range-checked by the
// rule middleware.
const createRules = [
  { field: "name", type: "string", required: true, min: 2, max: 200 },
  { field: "description", type: "string", required: false, max: 2000 },
  { field: "sku", type: "string", required: false, max: 100 },
  { field: "unitPrice", type: "number", required: true, min: 0 },
  { field: "gstRate", type: "number", required: false, min: 0, max: 100 },
  { field: "type", type: "string", required: false, enum: PRODUCT_TYPES },
];

const updateRules = [
  { field: "name", type: "string", required: false, min: 2, max: 200 },
  { field: "description", type: "string", required: false, max: 2000 },
  { field: "sku", type: "string", required: false, max: 100 },
  { field: "unitPrice", type: "number", required: false, min: 0 },
  { field: "gstRate", type: "number", required: false, min: 0, max: 100 },
  { field: "type", type: "string", required: false, enum: PRODUCT_TYPES },
  { field: "isActive", type: "boolean", required: false },
];

module.exports = { createRules, updateRules, PRODUCT_TYPES };
