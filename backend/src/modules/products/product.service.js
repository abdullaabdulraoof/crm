const Product = require("./product.model");
const AppError = require("../../common/error/AppError");
const { PRODUCT_EDIT_ROLES, PRODUCT_DEACTIVATE_ROLES } = require("../../common/constants");
const { scopedQuery, findByCompanyOr404 } = require("../../common/utils/scope");
const { normalizeString } = require("../../common/utils/normalize");
const { recordUserActivity } = require("../activity-logs/activityLog.service");
const { toProductView } = require("./product.util");

const PRODUCT_NOT_FOUND = "Product not found";
const PRODUCT_TYPES = ["PRODUCT", "SERVICE"];

const assertEditProduct = (actor) => {
  if (!PRODUCT_EDIT_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to manage products", "FORBIDDEN");
  }
};

const assertDeactivateProduct = (actor) => {
  if (!PRODUCT_DEACTIVATE_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to deactivate products", "FORBIDDEN");
  }
};

const parsePagination = (query = {}) => {
  const page = query.page === undefined || query.page === "" ? 1 : Number(query.page);
  const limit = query.limit === undefined || query.limit === "" ? 10 : Number(query.limit);

  if (!Number.isInteger(page) || page < 1) {
    throw AppError.badRequest("Invalid page", [
      { field: "page", message: "page must be a positive integer" },
    ]);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw AppError.badRequest("Invalid limit", [
      { field: "limit", message: "limit must be an integer between 1 and 100" },
    ]);
  }

  return { page, limit };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseTypeFilter = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = normalizeString(value);
  if (!PRODUCT_TYPES.includes(normalized)) {
    throw AppError.badRequest("Invalid type", [
      { field: "type", message: `type must be one of: ${PRODUCT_TYPES.join(", ")}` },
    ]);
  }
  return normalized;
};

const parseActiveFilter = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw AppError.badRequest("Invalid isActive", [
    { field: "isActive", message: "isActive must be true or false" },
  ]);
};

// SKU uniqueness is company-scoped: the same sku may exist in another company.
// The pre-check gives a field-level 400; the partial unique index is the race
// backstop (mapped to 409 by the global error handler).
const assertSkuAvailable = async (companyId, sku, excludeId = null) => {
  if (!sku) return;
  const filter = { companyId, sku };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await Product.findOne(filter).select("_id");
  if (existing) {
    throw AppError.badRequest("Duplicate value for: sku", [
      { field: "sku", message: "SKU already exists for this company" },
    ]);
  }
};

/**
 * Creates a product for the actor's company. companyId always comes from the
 * authenticated actor; isActive/createdAt/updatedAt are never read from input.
 */
const createProduct = async (actor, input, { ipAddress } = {}) => {
  assertEditProduct(actor);

  const sku = input.sku === undefined ? "" : normalizeString(input.sku) || "";
  await assertSkuAvailable(actor.companyId, sku);

  const doc = {
    companyId: actor.companyId,
    name: normalizeString(input.name),
    unitPrice: input.unitPrice,
  };
  if (input.description !== undefined) doc.description = normalizeString(input.description);
  if (sku) doc.sku = sku;
  if (input.gstRate !== undefined) doc.gstRate = input.gstRate;
  if (input.type !== undefined) doc.type = normalizeString(input.type) || "PRODUCT";

  const [product] = await Product.create([doc]);

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "PRODUCT_CREATED",
    entityType: "PRODUCT",
    entityId: product._id,
    description: `Created product ${product.name}`,
    metadata: { name: product.name, sku: product.sku || "", type: product.type, unitPrice: product.unitPrice },
    ipAddress,
  });

  return toProductView(product);
};

const listProducts = async (actor, query = {}) => {
  const { page, limit } = parsePagination(query);
  const filter = scopedQuery(actor.companyId);

  const search = query.search === undefined || query.search === null ? "" : normalizeString(String(query.search));
  if (search.length > 100) {
    throw AppError.badRequest("Invalid search", [
      { field: "search", message: "search must be at most 100 characters" },
    ]);
  }
  if (search) {
    const safe = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: safe }, { sku: safe }];
  }

  const type = parseTypeFilter(query.type);
  if (type) filter.type = type;

  const isActive = parseActiveFilter(query.isActive);
  if (isActive !== undefined) filter.isActive = isActive;

  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return {
    products: products.map(toProductView),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

const getProduct = async (actor, id) => {
  const product = await findByCompanyOr404(Product, actor.companyId, id, {}, PRODUCT_NOT_FOUND);
  return toProductView(product);
};

/**
 * Updates a product. Only the documented fields are ever read from the
 * payload; companyId and createdAt are immutable. isActive changes follow the
 * deactivate permission rule so PUT cannot bypass the role restriction.
 */
const updateProduct = async (actor, id, input, { ipAddress } = {}) => {
  assertEditProduct(actor);
  const product = await findByCompanyOr404(Product, actor.companyId, id, {}, PRODUCT_NOT_FOUND);

  const changed = [];

  if (input.name !== undefined) {
    product.name = normalizeString(input.name);
    changed.push("name");
  }
  if (input.description !== undefined) {
    product.description = normalizeString(input.description);
    changed.push("description");
  }
  if (input.sku !== undefined) {
    const sku = normalizeString(input.sku) || "";
    await assertSkuAvailable(actor.companyId, sku, product._id);
    product.sku = sku;
    changed.push("sku");
  }
  if (input.unitPrice !== undefined) {
    product.unitPrice = input.unitPrice;
    changed.push("unitPrice");
  }
  if (input.gstRate !== undefined) {
    product.gstRate = input.gstRate;
    changed.push("gstRate");
  }
  if (input.type !== undefined) {
    product.type = normalizeString(input.type);
    changed.push("type");
  }
  if (input.isActive !== undefined) {
    // Lifecycle changes (activate or deactivate) follow the deactivate
    // permission rule so PUT cannot bypass the role restriction.
    assertDeactivateProduct(actor);
    if (input.isActive !== product.isActive) {
      product.isActive = input.isActive;
      changed.push("isActive");
    }
  }

  if (changed.length > 0) {
    await product.save();

    const deactivated = changed.includes("isActive") && product.isActive === false;
    await recordUserActivity({
      companyId: actor.companyId,
      performedBy: actor.id,
      action: deactivated ? "PRODUCT_DEACTIVATED" : "PRODUCT_UPDATED",
      entityType: "PRODUCT",
      entityId: product._id,
      description: deactivated
        ? `Deactivated product ${product.name}`
        : `Updated ${changed.join(", ")} of product ${product.name}`,
      metadata: { fields: changed, isActive: product.isActive },
      ipAddress,
    });
  }

  return toProductView(product);
};

/**
 * Soft deletion: flips isActive to false. Idempotent - deactivating an
 * already-inactive product returns a calm 200 instead of failing. Existing
 * quotations/invoices referencing the product are never touched.
 */
const deactivateProduct = async (actor, id, { ipAddress } = {}) => {
  assertDeactivateProduct(actor);
  const product = await findByCompanyOr404(Product, actor.companyId, id, {}, PRODUCT_NOT_FOUND);

  if (product.isActive === false) {
    return {
      product: toProductView(product),
      alreadyInactive: true,
      message: "Product is already inactive",
    };
  }

  product.isActive = false;
  await product.save();

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "PRODUCT_DEACTIVATED",
    entityType: "PRODUCT",
    entityId: product._id,
    description: `Deactivated product ${product.name}`,
    metadata: { name: product.name, sku: product.sku || "" },
    ipAddress,
  });

  return { product: toProductView(product), alreadyInactive: false };
};

module.exports = {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deactivateProduct,
  assertEditProduct,
  assertDeactivateProduct,
};
