const CLIENT_TYPES = ["INDIVIDUAL", "BUSINESS"];

// companyId and createdBy are deliberately absent: they always come from the
// authenticated actor (req.user) and are never accepted from the payload.
const createRules = [
  { field: "name", type: "string", required: true, min: 2, max: 200 },
  { field: "phoneNumber", type: "string", required: false, max: 20 },
  { field: "email", type: "email", required: false },
  { field: "address", type: "string", required: false, max: 500 },
  { field: "gstNo", type: "string", required: false, max: 15 },
  { field: "clientType", type: "string", required: false, enum: CLIENT_TYPES },
  { field: "notes", type: "string", required: false, max: 2000 },
];

const updateRules = [
  { field: "name", type: "string", required: false, min: 2, max: 200 },
  { field: "phoneNumber", type: "string", required: false, max: 20 },
  { field: "email", type: "email", required: false },
  { field: "address", type: "string", required: false, max: 500 },
  { field: "gstNo", type: "string", required: false, max: 15 },
  { field: "clientType", type: "string", required: false, enum: CLIENT_TYPES },
  { field: "notes", type: "string", required: false, max: 2000 },
];

module.exports = { createRules, updateRules, CLIENT_TYPES };
