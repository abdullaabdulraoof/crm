const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const Product = require("../../src/modules/products/product.model");
const ActivityLog = require("../../src/modules/activity-logs/activityLog.model");
const {
  createCompanyWithOwner,
  createUser,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

const VALID_PRODUCT = {
  name: "CRM License",
  description: "Annual subscription",
  sku: "SKU-100",
  unitPrice: 1200,
  gstRate: 18,
  type: "PRODUCT",
};

let companyA;
let ownerA;
let adminA;
let managerA;
let salesA;
let tokenOwner;
let tokenAdmin;
let tokenManager;
let tokenSales;

let companyB;
let ownerB;
let tokenOwnerB;

const seedProduct = async (overrides = {}) => {
  const [product] = await Product.create([
    { companyId: companyA._id, name: "Seeded Product", unitPrice: 100, ...overrides },
  ]);
  return product;
};

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();

  const a = await createCompanyWithOwner();
  companyA = a.company;
  ownerA = a.owner;
  adminA = await createUser({ companyId: companyA._id, role: "ADMIN" });
  managerA = await createUser({ companyId: companyA._id, role: "MANAGER" });
  salesA = await createUser({ companyId: companyA._id, role: "SALES" });

  tokenOwner = signToken(ownerA);
  tokenAdmin = signToken(adminA);
  tokenManager = signToken(managerA);
  tokenSales = signToken(salesA);

  const b = await createCompanyWithOwner();
  companyB = b.company;
  ownerB = b.owner;
  tokenOwnerB = signToken(ownerB);
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("POST /api/products", () => {
  test("unauthenticated users cannot create a product", async () => {
    const res = await request(app).post("/api/products").send(VALID_PRODUCT);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("an authenticated user can create a product", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send(VALID_PRODUCT);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product).toMatchObject({
      name: "CRM License",
      sku: "SKU-100",
      unitPrice: 1200,
      gstRate: 18,
      type: "PRODUCT",
      isActive: true,
      companyId: companyA._id.toString(),
    });
    expect(res.body.data.product.id).toBeDefined();
    expect(res.body.data.product.createdAt).toBeTruthy();
  });

  test("required name validation", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "name")).toBe(true);
  });

  test("invalid unitPrice is rejected (negative)", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, unitPrice: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "unitPrice")).toBe(true);
  });

  test("invalid unitPrice is rejected (not a number)", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, unitPrice: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "unitPrice")).toBe(true);
  });

  test("invalid gstRate is rejected (negative)", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, gstRate: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "gstRate")).toBe(true);
  });

  test("invalid gstRate is rejected (above 100)", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, gstRate: 101 });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "gstRate")).toBe(true);
  });

  test("invalid type is rejected", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, type: "DIGITAL" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "type")).toBe(true);
  });

  test("missing unitPrice is rejected", async () => {
    const { unitPrice, ...withoutPrice } = VALID_PRODUCT;
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send(withoutPrice);

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "unitPrice")).toBe(true);
  });

  test("duplicate SKU in the same company is rejected", async () => {
    await seedProduct({ sku: "SKU-100" });

    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, name: "Another Product" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "sku")).toBe(true);
  });

  test("the same SKU is allowed in a different company", async () => {
    await seedProduct({ sku: "SKU-100" });

    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwnerB))
      .send({ ...VALID_PRODUCT });

    expect(res.status).toBe(201);
    expect(res.body.data.product.sku).toBe("SKU-100");
    expect(res.body.data.product.companyId).toBe(companyB._id.toString());
  });

  test("empty sku is allowed and does not collide with another empty sku", async () => {
    await seedProduct({ sku: "" });
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, sku: "" });

    expect(res.status).toBe(201);
    expect(res.body.data.product.sku).toBe("");
  });

  test("names and skus are trimmed", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, name: "  Padded Name  ", sku: "  PAD-1  " });

    expect(res.status).toBe(201);
    expect(res.body.data.product.name).toBe("Padded Name");
    expect(res.body.data.product.sku).toBe("PAD-1");
  });

  test("companyId, isActive and createdAt from the frontend are ignored", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({
        ...VALID_PRODUCT,
        companyId: companyB._id.toString(),
        isActive: false,
        createdAt: "2000-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.product.companyId).toBe(companyA._id.toString());
    expect(res.body.data.product.isActive).toBe(true);
    expect(res.body.data.product.createdAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  test("defaults are applied when optional fields are omitted", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ name: "Basic Service", unitPrice: 50 });

    expect(res.status).toBe(201);
    expect(res.body.data.product.type).toBe("PRODUCT");
    expect(res.body.data.product.gstRate).toBe(0);
    expect(res.body.data.product.isActive).toBe(true);
    expect(res.body.data.product.description).toBe("");
  });

  test("a SALES user can create products", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenSales))
      .send(VALID_PRODUCT);

    expect(res.status).toBe(201);
  });
});

describe("GET /api/products", () => {
  beforeEach(async () => {
    await seedProduct({ name: "Alpha Widget", sku: "WID-A" });
    await seedProduct({ name: "Beta Service", sku: "SRV-B", type: "SERVICE", unitPrice: 50 });
    await seedProduct({ name: "Retired Thing", sku: "OLD-C", isActive: false });
    await Product.create([
      { companyId: companyB._id, name: "Foreign Product", sku: "FOR-1", unitPrice: 10 },
    ]);
  });

  test("unauthenticated users cannot list products", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  test("lists only products of the authenticated company", async () => {
    const res = await request(app).get("/api/products").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.some((p) => p.name === "Foreign Product")).toBe(false);
  });

  test("pagination metadata is consistent with other CRM APIs", async () => {
    const res = await request(app).get("/api/products?page=2&limit=2").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.data).toHaveLength(1);
  });

  test("newest products come first", async () => {
    const res = await request(app).get("/api/products").set(asUser(tokenOwner));
    const names = res.body.data.map((p) => p.name);
    expect(names[0]).toBe("Retired Thing");
  });

  test("empty result returns totalPages 0", async () => {
    const res = await request(app)
      .get("/api/products?search=nomatch")
      .set(asUser(tokenOwnerB));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.totalPages).toBe(0);
  });

  test("search by name", async () => {
    const res = await request(app)
      .get("/api/products?search=alpha")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Alpha Widget");
  });

  test("search by SKU", async () => {
    const res = await request(app)
      .get("/api/products?search=srv-b")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sku).toBe("SRV-B");
  });

  test("search never leaks across companies", async () => {
    const res = await request(app)
      .get("/api/products?search=foreign")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test("search treats regex special characters literally", async () => {
    await seedProduct({ name: "Literal Dot", sku: "A.B" });
    const res = await request(app)
      .get("/api/products?search=A.B")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sku).toBe("A.B");
  });

  test("filter by type", async () => {
    const res = await request(app)
      .get("/api/products?type=SERVICE")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe("SERVICE");
  });

  test("invalid type filter is rejected", async () => {
    const res = await request(app)
      .get("/api/products?type=BOGUS")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "type")).toBe(true);
  });

  test("filter by active products", async () => {
    const res = await request(app)
      .get("/api/products?isActive=true")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((p) => p.isActive === true)).toBe(true);
  });

  test("filter by inactive products", async () => {
    const res = await request(app)
      .get("/api/products?isActive=false")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Retired Thing");
  });

  test("invalid isActive filter is rejected", async () => {
    const res = await request(app)
      .get("/api/products?isActive=yes")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "isActive")).toBe(true);
  });

  test("invalid pagination values are rejected", async () => {
    const res = await request(app).get("/api/products?page=0").set(asUser(tokenOwner));
    expect(res.status).toBe(400);

    const res2 = await request(app).get("/api/products?limit=1000").set(asUser(tokenOwner));
    expect(res2.status).toBe(400);
  });

  test("a user from another company sees only their own products", async () => {
    const res = await request(app).get("/api/products").set(asUser(tokenOwnerB));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Foreign Product");
  });
});

describe("GET /api/products/:id", () => {
  test("returns the product for the owning company", async () => {
    const product = await seedProduct({ name: "Mine", sku: "MINE-1" });

    const res = await request(app)
      .get(`/api/products/${product._id}`)
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data.product.id).toBe(String(product._id));
    expect(res.body.data.product.name).toBe("Mine");
  });

  test("a user from another company gets 404 (no existence leak)", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .get(`/api/products/${product._id}`)
      .set(asUser(tokenOwnerB));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  test("a missing product returns 404", async () => {
    const res = await request(app)
      .get("/api/products/aaaaaaaaaaaaaaaaaaaaaaaa")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(404);
  });

  test("a malformed id is a safe 400", async () => {
    const res = await request(app).get("/api/products/not-an-id").set(asUser(tokenOwner));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
  });

  test("unauthenticated users cannot read a product", async () => {
    const product = await seedProduct();
    const res = await request(app).get(`/api/products/${product._id}`);
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/products/:id", () => {
  test("updates allowed fields", async () => {
    const product = await seedProduct({ sku: "OLD-1" });

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwner))
      .send({ name: "Renamed", unitPrice: 99.5, gstRate: 12, type: "SERVICE", sku: "NEW-1" });

    expect(res.status).toBe(200);
    expect(res.body.data.product).toMatchObject({
      name: "Renamed",
      unitPrice: 99.5,
      gstRate: 12,
      type: "SERVICE",
      sku: "NEW-1",
    });
  });

  test("validation rules apply on update too", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwner))
      .send({ unitPrice: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "unitPrice")).toBe(true);
  });

  test("companyId cannot be changed", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwner))
      .send({ companyId: companyB._id.toString(), name: "Still Mine" });

    expect(res.status).toBe(200);
    expect(res.body.data.product.companyId).toBe(companyA._id.toString());

    const dbDoc = await Product.findById(product._id);
    expect(String(dbDoc.companyId)).toBe(String(companyA._id));
  });

  test("updatedAt changes but createdAt does not", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwner))
      .send({ name: "Touched" });

    expect(res.status).toBe(200);
    expect(res.body.data.product.createdAt).toBe(product.createdAt.toISOString());
    expect(new Date(res.body.data.product.updatedAt).getTime()).toBeGreaterThanOrEqual(
      product.updatedAt.getTime()
    );
  });

  test("duplicate SKU within the company is rejected on update", async () => {
    await seedProduct({ sku: "TAKEN" });
    const product = await seedProduct({ sku: "FREE" });

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwner))
      .send({ sku: "TAKEN" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "sku")).toBe(true);
  });

  test("keeping the same SKU on update is allowed", async () => {
    const product = await seedProduct({ sku: "SAME" });

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwner))
      .send({ sku: "SAME", name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.data.product.sku).toBe("SAME");
  });

  test("a user from another company cannot update (404)", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwnerB))
      .send({ name: "Hijacked" });

    expect(res.status).toBe(404);
    const dbDoc = await Product.findById(product._id);
    expect(dbDoc.name).toBe("Seeded Product");
  });

  test("SALES can update products", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenSales))
      .send({ name: "Sales Edited" });

    expect(res.status).toBe(200);
    expect(res.body.data.product.name).toBe("Sales Edited");
  });

  test("SALES cannot change isActive through PUT (no bypass)", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenSales))
      .send({ isActive: false });

    expect(res.status).toBe(403);
    const dbDoc = await Product.findById(product._id);
    expect(dbDoc.isActive).toBe(true);
  });

  test("MANAGER cannot change isActive through PUT (no bypass)", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenManager))
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });

  test("ADMIN can change isActive through PUT", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenAdmin))
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.product.isActive).toBe(false);
  });
});

describe("DELETE /api/products/:id (soft deactivation)", () => {
  test("OWNER deactivates a product without removing the document", async () => {
    const product = await seedProduct({ name: "Deletable" });

    const res = await request(app)
      .delete(`/api/products/${product._id}`)
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(false);

    const dbDoc = await Product.findById(product._id);
    expect(dbDoc).not.toBeNull();
    expect(dbDoc.isActive).toBe(false);
  });

  test("deactivating an already-inactive product returns a calm 200", async () => {
    const product = await seedProduct({ isActive: false });

    const res = await request(app)
      .delete(`/api/products/${product._id}`)
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Product is already inactive");
    expect(res.body.data.isActive).toBe(false);
  });

  test("SALES and MANAGER cannot deactivate", async () => {
    const product = await seedProduct();

    const salesRes = await request(app)
      .delete(`/api/products/${product._id}`)
      .set(asUser(tokenSales));
    expect(salesRes.status).toBe(403);

    const managerRes = await request(app)
      .delete(`/api/products/${product._id}`)
      .set(asUser(tokenManager));
    expect(managerRes.status).toBe(403);

    const dbDoc = await Product.findById(product._id);
    expect(dbDoc.isActive).toBe(true);
  });

  test("ADMIN can deactivate", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .delete(`/api/products/${product._id}`)
      .set(asUser(tokenAdmin));

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  test("a user from another company cannot deactivate (404)", async () => {
    const product = await seedProduct();

    const res = await request(app)
      .delete(`/api/products/${product._id}`)
      .set(asUser(tokenOwnerB));

    expect(res.status).toBe(404);
    const dbDoc = await Product.findById(product._id);
    expect(dbDoc.isActive).toBe(true);
  });

  test("an inactive product can be reactivated via PUT", async () => {
    const product = await seedProduct({ isActive: false });

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwner))
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.data.product.isActive).toBe(true);
  });

  test("no product is ever physically removed", async () => {
    const product = await seedProduct();
    await request(app).delete(`/api/products/${product._id}`).set(asUser(tokenOwner));

    const count = await Product.countDocuments({ _id: product._id });
    expect(count).toBe(1);
  });
});

describe("activity logs", () => {
  test("creating a product records PRODUCT_CREATED", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send(VALID_PRODUCT);
    expect(res.status).toBe(201);

    const log = await ActivityLog.findOne({
      action: "PRODUCT_CREATED",
      companyId: companyA._id,
    });
    expect(log).not.toBeNull();
    expect(log.entityType).toBe("PRODUCT");
    expect(String(log.entityId)).toBe(res.body.data.product.id);
    expect(String(log.performedBy)).toBe(String(ownerA._id));
    expect(log.description).toContain("CRM License");
    expect(JSON.stringify(log.metadata)).not.toMatch(/password|token|secret/i);
  });

  test("updating a product records PRODUCT_UPDATED", async () => {
    const product = await seedProduct();

    await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenOwner))
      .send({ name: "Updated Name" });

    const log = await ActivityLog.findOne({
      action: "PRODUCT_UPDATED",
      companyId: companyA._id,
    });
    expect(log).not.toBeNull();
    expect(log.metadata.fields).toContain("name");
  });

  test("deactivation records PRODUCT_DEACTIVATED", async () => {
    const product = await seedProduct();

    await request(app)
      .delete(`/api/products/${product._id}`)
      .set(asUser(tokenOwner));

    const log = await ActivityLog.findOne({
      action: "PRODUCT_DEACTIVATED",
      companyId: companyA._id,
    });
    expect(log).not.toBeNull();
    expect(String(log.entityId)).toBe(String(product._id));
  });

  test("deactivation through PUT also records PRODUCT_DEACTIVATED", async () => {
    const product = await seedProduct();

    await request(app)
      .put(`/api/products/${product._id}`)
      .set(asUser(tokenAdmin))
      .send({ isActive: false });

    const log = await ActivityLog.findOne({
      action: "PRODUCT_DEACTIVATED",
      companyId: companyA._id,
    });
    expect(log).not.toBeNull();
  });

  test("re-deactivating an inactive product logs nothing new", async () => {
    const product = await seedProduct({ isActive: false });
    const before = await ActivityLog.countDocuments({ companyId: companyA._id });

    await request(app)
      .delete(`/api/products/${product._id}`)
      .set(asUser(tokenOwner));

    const after = await ActivityLog.countDocuments({ companyId: companyA._id });
    expect(after).toBe(before);
  });

  test("failed operations record no product activity", async () => {
    await request(app)
      .post("/api/products")
      .set(asUser(tokenOwner))
      .send({ ...VALID_PRODUCT, unitPrice: -1 });

    const count = await ActivityLog.countDocuments({
      companyId: companyA._id,
      entityType: "PRODUCT",
    });
    expect(count).toBe(0);
  });

  test("activity logs are company-scoped", async () => {
    await request(app)
      .post("/api/products")
      .set(asUser(tokenOwnerB))
      .send(VALID_PRODUCT);

    const logsA = await ActivityLog.countDocuments({ companyId: companyA._id });
    const logsB = await ActivityLog.countDocuments({ companyId: companyB._id });
    expect(logsA).toBe(0);
    expect(logsB).toBe(1);
  });
});

describe("authorization matrix", () => {
  test("OWNER, ADMIN, MANAGER and SALES can all view products", async () => {
    const product = await seedProduct();
    const tokens = [tokenOwner, tokenAdmin, tokenManager, tokenSales];

    for (const token of tokens) {
      const res = await request(app).get(`/api/products/${product._id}`).set(asUser(token));
      expect(res.status).toBe(200);
    }
  });

  test("OWNER, ADMIN, MANAGER and SALES can all create products", async () => {
    const tokens = [tokenOwner, tokenAdmin, tokenManager, tokenSales];

    for (const token of tokens) {
      const res = await request(app)
        .post("/api/products")
        .set(asUser(token))
        .send({ ...VALID_PRODUCT, name: `Product ${token.slice(-4)}`, sku: `S-${token.slice(-6)}` });
      expect(res.status).toBe(201);
    }
  });
});
