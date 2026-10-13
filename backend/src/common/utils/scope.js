const { Types } = require("mongoose");
const AppError = require("../error/AppError");

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const isObjectId = (value) =>
  typeof value === "string" ? OBJECT_ID_RE.test(value.trim()) : Types.ObjectId.isValid(value);

// Malformed ids are a 400, never a 500 from the Mongo driver.
const parseId = (value, field = "id") => {
  const raw = typeof value === "string" ? value.trim() : value;
  if (!isObjectId(raw)) {
    throw new AppError("Invalid identifier format", 400, "INVALID_ID", [
      { field, message: `${field} must be a valid id` },
    ]);
  }
  return raw;
};

// Always scope filters with the authenticated company id. Never take it from the request.
const scopedQuery = (companyId, filter = {}) => ({ ...filter, companyId });

// Aggregate pipelines bypass Mongoose casting, so company-scoped $match stages
// need a real ObjectId. Built from the authenticated actor, never the request.
const companyObjectId = (actor) => new Types.ObjectId(actor.companyId);

// Company-owned resource lookup: both the resource id and the company id must match.
// Missing or cross-company records both yield the same 404 so existence is not leaked.
async function findByCompanyOr404(Model, companyId, id, filter = {}, message = "Resource not found") {
  const parsedId = parseId(id, "id");
  const doc = await Model.findOne({ ...filter, _id: parsedId, companyId });
  if (!doc) throw AppError.notFound(message);
  return doc;
}

function assertSameCompany(record, companyId, message = "Resource not found") {
  const recordCompanyId = record && record.companyId;
  if (!recordCompanyId || String(recordCompanyId) !== String(companyId)) {
    throw AppError.notFound(message);
  }
}

module.exports = {
  isObjectId,
  parseId,
  scopedQuery,
  companyObjectId,
  findByCompanyOr404,
  assertSameCompany,
};
