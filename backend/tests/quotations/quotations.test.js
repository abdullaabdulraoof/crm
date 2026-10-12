const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const Quotation = require("../../src/modules/quotations/quotation.model");
const Product = require("../../src/modules/products/product.model");
const ActivityLog = require("../../src/modules/activity-logs/activityLog.model");
const {
  createCompanyWithOwner,
  createUser,
  createLead,
  createClient,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

const manualItem = (overrides = {}) => ({
  description: "Consulting services",
  quantity: 2,
  unitPrice: 1000,
  gstRate: 18,
  ...overrides,
});

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

const seedProduct = async (overrides = {}) =>
  Product.create([
    { companyId: companyA._id, name: "Catalog Widget", unitPrice: 100, gstRate: 18, ...overrides },
  ]).then(([p]) => p);

const seedLead = (overrides = {}) =>
  createLead({ companyId: companyA._id, createdBy: ownerA._id, ...overrides });

const seedClient = (overrides = {}) =>
  createClient({ companyId: companyA._id, createdBy: ownerA._id, ...overrides });

const createQuotation = (token, payload) =>
  request(app).post("/api/quotations").set(asUser(token)).send(payload);

const NUMBER_RE = /^QT-\d{4}-0001$/;

beforeAll(async () => {
  await connectTestDb();
  await Quotation.init();
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

describe("POST /api/quotations", () => {
  test("unauthenticated users cannot create a quotation", async () => {
    const res = await request(app)
      .post("/api/quotations")
      .send({ leadId: String(ownerA._id), items: [manualItem()] });
    expect(res.status).toBe(401);
  });

  test("creates a quotation for a lead with a generated number and computed totals", async () => {
    const lead = await seedLead({ name: "Acme Prospect" });
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [manualItem({ quantity: 2, unitPrice: 1000, gstRate: 18 })],
      discountAmount: 100,
    });

    expect(res.status).toBe(201);
    const q = res.body.data.quotation;
    expect(q.quotationNumber).toMatch(NUMBER_RE);
    expect(q.lead.id).toBe(String(lead._id));
    expect(q.clientId).toBeNull();
    expect(q.subtotal).toBe(2000);
    expect(q.taxAmount).toBe(360);
    expect(q.discountAmount).toBe(100);
    expect(q.totalAmount).toBe(2260);
    expect(q.status).toBe("DRAFT");
    expect(q.items[0].amount).toBe(2000);
    expect(q.createdBy.name).toBeDefined();
    expect(q.createdBy.passwordHash).toBeUndefined();
  });

  test("creates a quotation for a client", async () => {
    const client = await seedClient({ name: "Zephyr Corp" });
    const res = await createQuotation(tokenSales, {
      clientId: String(client._id),
      items: [manualItem()],
      status: "SENT",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.quotation.client.id).toBe(String(client._id));
    expect(res.body.data.quotation.status).toBe("SENT");
  });

  test("rejects a payload with both leadId and clientId", async () => {
    const lead = await seedLead();
    const client = await seedClient();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      clientId: String(client._id),
      items: [manualItem()],
    });
    expect(res.status).toBe(400);
  });

  test("rejects a payload with neither leadId nor clientId", async () => {
    const res = await createQuotation(tokenOwner, { items: [manualItem()] });
    expect(res.status).toBe(400);
  });

  test("rejects a lead from another company", async () => {
    const foreign = await createLead({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "Foreign Lead",
    });
    const res = await createQuotation(tokenOwner, {
      leadId: String(foreign._id),
      items: [manualItem()],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "leadId")).toBe(true);
  });

  test("rejects a client from another company", async () => {
    const foreign = await createClient({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "Foreign Client",
    });
    const res = await createQuotation(tokenOwner, {
      clientId: String(foreign._id),
      items: [manualItem()],
    });
    expect(res.status).toBe(400);
  });

  test("rejects a product from another company", async () => {
    const [foreign] = await Product.create([
      { companyId: companyB._id, name: "Foreign Product", unitPrice: 10, gstRate: 5 },
    ]);
    const res = await createQuotation(tokenOwner, {
      leadId: String((await seedLead())._id),
      items: [{ productId: String(foreign._id), quantity: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "items.0.productId")).toBe(true);
  });

  test("rejects an empty items array", async () => {
    const lead = await seedLead();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [],
    });
    expect(res.status).toBe(400);
  });

  test("reports per-item validation errors with indexed paths", async () => {
    const lead = await seedLead();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [{ description: "", quantity: 0 }],
    });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toContain("items.0.description");
    expect(fields).toContain("items.0.quantity");
  });

  test("computes multi-item subtotal, per-line GST and total", async () => {
    const lead = await seedLead();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [
        { description: "A", quantity: 2, unitPrice: 1000, gstRate: 18 },
        { description: "B", quantity: 1, unitPrice: 500, gstRate: 12 },
      ],
      discountAmount: 100,
    });

    expect(res.status).toBe(201);
    const q = res.body.data.quotation;
    expect(q.subtotal).toBe(2500);
    expect(q.taxAmount).toBe(420);
    expect(q.totalAmount).toBe(2820);
  });

  test("ignores client-supplied money totals and quotation number", async () => {
    const lead = await seedLead();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      quotationNumber: "HACK-9999",
      subtotal: 999999,
      taxAmount: 999999,
      totalAmount: 999999,
      items: [{ ...manualItem(), amount: 999999 }],
    });

    expect(res.status).toBe(201);
    const q = res.body.data.quotation;
    expect(q.quotationNumber).toMatch(NUMBER_RE);
    expect(q.quotationNumber).not.toBe("HACK-9999");
    expect(q.subtotal).toBe(2000);
    expect(q.totalAmount).toBe(2360);
    expect(q.items[0].amount).toBe(2000);
  });

  test("product lines are server authoritative: description, price and GST come from the product", async () => {
    const product = await seedProduct({
      name: "Catalog Widget",
      unitPrice: 100,
      gstRate: 18,
    });
    const lead = await seedLead();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [
        {
          productId: String(product._id),
          quantity: 3,
          description: "Tampered",
          unitPrice: 1,
          gstRate: 99,
        },
      ],
    });

    expect(res.status).toBe(201);
    const item = res.body.data.quotation.items[0];
    expect(item.description).toBe("Catalog Widget");
    expect(item.unitPrice).toBe(100);
    expect(item.gstRate).toBe(18);
    expect(item.amount).toBe(300);
    expect(res.body.data.quotation.taxAmount).toBe(54);
  });

  test("rejects a total that would go negative", async () => {
    const lead = await seedLead();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      discountAmount: 100000,
      items: [manualItem({ quantity: 1, unitPrice: 100, gstRate: 0 })],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "discountAmount")).toBe(true);
  });

  test("increments quotation numbers per company", async () => {
    const lead = await seedLead();
    const first = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [manualItem()],
    });
    const second = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [manualItem()],
    });

    const year = new Date().getUTCFullYear();
    expect(first.body.data.quotation.quotationNumber).toBe(`QT-${year}-0001`);
    expect(second.body.data.quotation.quotationNumber).toBe(`QT-${year}-0002`);
  });

  test("quotation numbers are isolated per company", async () => {
    const otherCompany = await createCompanyWithOwner();
    const leadA = await seedLead();
    const leadB = await createLead({
      companyId: otherCompany.company._id,
      createdBy: otherCompany.owner._id,
      name: "B Lead",
    });

    const resA = await createQuotation(tokenOwner, {
      leadId: String(leadA._id),
      items: [manualItem()],
    });
    const resB = await createQuotation(signToken(otherCompany.owner), {
      leadId: String(leadB._id),
      items: [manualItem()],
    });

    expect(resA.body.data.quotation.quotationNumber).toMatch(NUMBER_RE);
    expect(resB.body.data.quotation.quotationNumber).toMatch(NUMBER_RE);
  });

  test("concurrent creates all succeed with unique numbers", async () => {
    const lead = await seedLead();
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        createQuotation(tokenOwner, { leadId: String(lead._id), items: [manualItem()] })
      )
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 201)).toBe(true);
    const numbers = results.map((r) => r.body.data.quotation.quotationNumber);
    expect(new Set(numbers).size).toBe(5);
  });

  test("records a QUOTATION_CREATED activity log", async () => {
    const lead = await seedLead();
    await createQuotation(tokenOwner, { leadId: String(lead._id), items: [manualItem()] });

    const log = await ActivityLog.findOne({ action: "QUOTATION_CREATED", companyId: companyA._id });
    expect(log).not.toBeNull();
    expect(log.entityType).toBe("QUOTATION");
  });
});

describe("GET /api/quotations", () => {
  const seedMany = async (count, overrides = {}) => {
    const lead = await seedLead();
    const created = [];
    for (let i = 0; i < count; i += 1) {
      const res = await createQuotation(tokenOwner, {
        leadId: String(lead._id),
        items: [manualItem()],
        ...overrides,
      });
      created.push(res.body.data.quotation);
    }
    return created;
  };

  test("returns an empty page with totalPages 0", async () => {
    const res = await request(app).get("/api/quotations").set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.totalPages).toBe(0);
  });

  test("paginates results", async () => {
    await seedMany(3);
    const res = await request(app)
      .get("/api/quotations?page=1&limit=2")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  test("filters by status", async () => {
    const lead = await seedLead();
    await createQuotation(tokenOwner, { leadId: String(lead._id), items: [manualItem()], status: "SENT" });
    await createQuotation(tokenOwner, { leadId: String(lead._id), items: [manualItem()], status: "DRAFT" });

    const res = await request(app)
      .get("/api/quotations?status=SENT")
      .set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("SENT");
  });

  test("rejects an invalid status filter", async () => {
    const res = await request(app)
      .get("/api/quotations?status=NOPE")
      .set(asUser(tokenOwner));
    expect(res.status).toBe(400);
  });

  test("searches by quotation number and by related client name", async () => {
    const client = await seedClient({ name: "Nebula Traders" });
    const created = await createQuotation(tokenOwner, {
      clientId: String(client._id),
      items: [manualItem()],
    });
    const number = created.body.data.quotation.quotationNumber;

    const byNumber = await request(app)
      .get(`/api/quotations?search=${number}`)
      .set(asUser(tokenOwner));
    expect(byNumber.body.data).toHaveLength(1);

    const byName = await request(app)
      .get("/api/quotations?search=Nebula")
      .set(asUser(tokenOwner));
    expect(byName.body.data).toHaveLength(1);
    expect(byName.body.data[0].client.name).toBe("Nebula Traders");
  });

  test("does not list quotations belonging to another company", async () => {
    const leadB = await createLead({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "B Lead",
    });
    await createQuotation(tokenOwnerB, { leadId: String(leadB._id), items: [manualItem()] });

    const res = await request(app).get("/api/quotations").set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /api/quotations/:id", () => {
  test("returns a quotation with populated product snapshot", async () => {
    const product = await seedProduct({ name: "Catalog Widget" });
    const lead = await seedLead();
    const created = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [{ productId: String(product._id), quantity: 2 }],
    });

    const res = await request(app)
      .get(`/api/quotations/${created.body.data.quotation.id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data.quotation.items[0].product.name).toBe("Catalog Widget");
  });

  test("returns 404 for a quotation in another company", async () => {
    const leadB = await createLead({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "B Lead",
    });
    const created = await createQuotation(tokenOwnerB, {
      leadId: String(leadB._id),
      items: [manualItem()],
    });

    const res = await request(app)
      .get(`/api/quotations/${created.body.data.quotation.id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(404);
  });

  test("returns 404 for a missing quotation and 400 for a malformed id", async () => {
    const missing = await request(app)
      .get(`/api/quotations/${ownerA._id}`)
      .set(asUser(tokenOwner));
    expect(missing.status).toBe(404);

    const malformed = await request(app)
      .get("/api/quotations/not-an-id")
      .set(asUser(tokenOwner));
    expect(malformed.status).toBe(400);
  });
});

describe("PUT /api/quotations/:id", () => {
  const createOne = async (overrides = {}) => {
    const lead = await seedLead();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [manualItem()],
      ...overrides,
    });
    return res.body.data.quotation;
  };

  test("recomputes totals when items change", async () => {
    const q = await createOne();
    const res = await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({
        items: [{ description: "Just one", quantity: 1, unitPrice: 100, gstRate: 0 }],
        discountAmount: 0,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.quotation.subtotal).toBe(100);
    expect(res.body.data.quotation.taxAmount).toBe(0);
    expect(res.body.data.quotation.totalAmount).toBe(100);
  });

  test("allows DRAFT -> SENT -> ACCEPTED transitions", async () => {
    const q = await createOne();
    const sent = await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "SENT" });
    expect(sent.status).toBe(200);
    expect(sent.body.data.quotation.status).toBe("SENT");

    const accepted = await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "ACCEPTED" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.quotation.status).toBe("ACCEPTED");
  });

  test("locks a terminal quotation against content edits", async () => {
    const q = await createOne();
    await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "ACCEPTED" });

    const res = await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({ notes: "should not apply" });
    expect(res.status).toBe(400);
  });

  test("locks a terminal quotation against status changes", async () => {
    const q = await createOne();
    await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "ACCEPTED" });

    const res = await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "REJECTED" });
    expect(res.status).toBe(400);
  });

  test("switches the target from a lead to a client", async () => {
    const q = await createOne();
    const client = await seedClient({ name: "New Customer" });
    const res = await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({ clientId: String(client._id), leadId: null });

    expect(res.status).toBe(200);
    expect(res.body.data.quotation.client.id).toBe(String(client._id));
    expect(res.body.data.quotation.leadId).toBeNull();
  });

  test("records a QUOTATION_UPDATED activity log with status transition metadata", async () => {
    const q = await createOne();
    await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "SENT" });

    const log = await ActivityLog.findOne({ action: "QUOTATION_UPDATED", companyId: companyA._id });
    expect(log).not.toBeNull();
    expect(log.metadata.previousStatus).toBe("DRAFT");
    expect(log.metadata.status).toBe("SENT");
  });

  test("a manager and sales can edit quotations", async () => {
    const q = await createOne();
    const manager = await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenManager))
      .send({ notes: "manager note" });
    expect(manager.status).toBe(200);

    const sales = await request(app)
      .put(`/api/quotations/${q.id}`)
      .set(asUser(tokenSales))
      .send({ notes: "sales note" });
    expect(sales.status).toBe(200);
  });

  test("returns 404 when updating another company's quotation", async () => {
    const leadB = await createLead({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "B Lead",
    });
    const created = await createQuotation(tokenOwnerB, {
      leadId: String(leadB._id),
      items: [manualItem()],
    });

    const res = await request(app)
      .put(`/api/quotations/${created.body.data.quotation.id}`)
      .set(asUser(tokenOwner))
      .send({ notes: "nope" });
    expect(res.status).toBe(404);
  });
});

describe("product snapshot immutability", () => {
  test("an existing quotation keeps its item snapshot after the product changes", async () => {
    const product = await seedProduct({ name: "Catalog Widget", unitPrice: 100, gstRate: 18 });
    const lead = await seedLead();
    const created = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [{ productId: String(product._id), quantity: 2 }],
    });

    await Product.updateOne({ _id: product._id }, { $set: { unitPrice: 999, gstRate: 5, name: "Renamed" } });

    const res = await request(app)
      .get(`/api/quotations/${created.body.data.quotation.id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    const item = res.body.data.quotation.items[0];
    expect(item.unitPrice).toBe(100);
    expect(item.gstRate).toBe(18);
    expect(item.description).toBe("Catalog Widget");
    expect(item.amount).toBe(200);
    expect(res.body.data.quotation.totalAmount).toBe(236);
  });
});

describe("DELETE /api/quotations/:id", () => {
  const createOne = async () => {
    const lead = await seedLead();
    const res = await createQuotation(tokenOwner, {
      leadId: String(lead._id),
      items: [manualItem()],
    });
    return res.body.data.quotation;
  };

  test("an owner can delete a quotation and an activity log is recorded", async () => {
    const q = await createOne();
    const res = await request(app)
      .delete(`/api/quotations/${q.id}`)
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(await Quotation.countDocuments({ _id: q.id })).toBe(0);

    const log = await ActivityLog.findOne({ action: "QUOTATION_DELETED", companyId: companyA._id });
    expect(log).not.toBeNull();
  });

  test("sales and managers cannot delete quotations", async () => {
    const q = await createOne();
    const sales = await request(app)
      .delete(`/api/quotations/${q.id}`)
      .set(asUser(tokenSales));
    expect(sales.status).toBe(403);

    const manager = await request(app)
      .delete(`/api/quotations/${q.id}`)
      .set(asUser(tokenManager));
    expect(manager.status).toBe(403);
  });

  test("returns 404 when deleting another company's quotation", async () => {
    const leadB = await createLead({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "B Lead",
    });
    const created = await createQuotation(tokenOwnerB, {
      leadId: String(leadB._id),
      items: [manualItem()],
    });

    const res = await request(app)
      .delete(`/api/quotations/${created.body.data.quotation.id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(404);
  });
});
