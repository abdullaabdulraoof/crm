const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const Invoice = require("../../src/modules/invoices/invoice.model");
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

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

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

const seedClient = (overrides = {}) =>
  createClient({ companyId: companyA._id, createdBy: ownerA._id, ...overrides });

const seedLead = (overrides = {}) =>
  createLead({ companyId: companyA._id, createdBy: ownerA._id, ...overrides });

let quotationCounter = 0;
const seedQuotation = async (overrides = {}) => {
  const {
    items = [{ description: "Q item", quantity: 2, unitPrice: 500, gstRate: 18 }],
    status = "ACCEPTED",
    discountAmount = 0,
    ...rest
  } = overrides;

  const normalized = items.map((item) => ({
    productId: item.productId || null,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    gstRate: item.gstRate || 0,
    amount: round2(item.quantity * item.unitPrice),
  }));
  const subtotal = round2(normalized.reduce((sum, item) => sum + item.amount, 0));
  const taxAmount = round2(
    normalized.reduce((sum, item) => sum + round2((item.amount * (item.gstRate || 0)) / 100), 0)
  );
  const totalAmount = round2(subtotal - discountAmount + taxAmount);

  quotationCounter += 1;
  const [quotation] = await Quotation.create([
    {
      companyId: companyA._id,
      createdBy: ownerA._id,
      quotationNumber: `QT-2026-${String(quotationCounter).padStart(4, "0")}`,
      leadId: null,
      clientId: null,
      items: normalized,
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      status,
      ...rest,
    },
  ]);
  return quotation;
};

const createInvoice = (token, payload) =>
  request(app).post("/api/invoices").set(asUser(token)).send(payload);

const createDirect = async (token, payload = {}) => {
  const client = payload.clientId === undefined ? await seedClient() : null;
  return createInvoice(token, {
    clientId: payload.clientId !== undefined ? payload.clientId : String(client._id),
    items: payload.items || [manualItem()],
    ...payload,
  });
};

const issueInvoice = async (token, id, extra = {}) =>
  request(app).put(`/api/invoices/${id}`).set(asUser(token)).send({ status: "ISSUED", ...extra });

const NUMBER_RE = /^INV-\d{4}-0001$/;

beforeAll(async () => {
  await connectTestDb();
  await Invoice.init();
  await Quotation.init();
});

beforeEach(async () => {
  await resetDb();
  quotationCounter = 0;

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

describe("POST /api/invoices (direct)", () => {
  test("unauthenticated users cannot create an invoice", async () => {
    const client = await seedClient();
    const res = await request(app)
      .post("/api/invoices")
      .send({ clientId: String(client._id), items: [manualItem()] });
    expect(res.status).toBe(401);
  });

  test("creates a direct invoice with a generated number and computed totals", async () => {
    const client = await seedClient({ name: "Zephyr Corp" });
    const res = await createDirect(tokenSales, {
      clientId: String(client._id),
      items: [manualItem({ quantity: 2, unitPrice: 1000, gstRate: 18 })],
      discountAmount: 100,
    });

    expect(res.status).toBe(201);
    const inv = res.body.data.invoice;
    expect(inv.invoiceNumber).toMatch(NUMBER_RE);
    expect(inv.quotationId).toBeNull();
    expect(inv.client.id).toBe(String(client._id));
    expect(inv.subtotal).toBe(2000);
    expect(inv.taxAmount).toBe(360);
    expect(inv.discountAmount).toBe(100);
    expect(inv.totalAmount).toBe(2260);
    expect(inv.amountPaid).toBe(0);
    expect(inv.balanceDue).toBe(2260);
    expect(inv.status).toBe("DRAFT");
    expect(inv.isOverdue).toBe(false);
    expect(inv.effectiveStatus).toBe("DRAFT");
    expect(inv.items[0].amount).toBe(2000);
    expect(inv.createdBy.name).toBeDefined();
    expect(inv.createdBy.passwordHash).toBeUndefined();
  });

  test("ignores client-supplied totals, number, amountPaid and balanceDue", async () => {
    const res = await createDirect(tokenOwner, {
      invoiceNumber: "HACK-9999",
      subtotal: 999999,
      taxAmount: 999999,
      totalAmount: 999999,
      amountPaid: 500,
      balanceDue: 0,
      items: [{ ...manualItem(), amount: 999999 }],
    });

    expect(res.status).toBe(201);
    const inv = res.body.data.invoice;
    expect(inv.invoiceNumber).toMatch(NUMBER_RE);
    expect(inv.invoiceNumber).not.toBe("HACK-9999");
    expect(inv.subtotal).toBe(2000);
    expect(inv.totalAmount).toBe(2360);
    expect(inv.amountPaid).toBe(0);
    expect(inv.balanceDue).toBe(2360);
    expect(inv.items[0].amount).toBe(2000);
  });

  test("rejects a create that sets a non-draft status", async () => {
    const res = await createDirect(tokenOwner, { status: "ISSUED" });
    expect(res.status).toBe(400);
  });

  test("requires a clientId", async () => {
    const res = await createInvoice(tokenOwner, { items: [manualItem()] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "clientId")).toBe(true);
  });

  test("requires at least one item", async () => {
    const client = await seedClient();
    const res = await createDirect(tokenOwner, { clientId: String(client._id), items: [] });
    expect(res.status).toBe(400);
  });

  test("rejects a client from another company", async () => {
    const foreign = await createClient({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "Foreign Client",
    });
    const res = await createDirect(tokenOwner, { clientId: String(foreign._id) });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "clientId")).toBe(true);
  });

  test("rejects a product from another company", async () => {
    const [foreign] = await Product.create([
      { companyId: companyB._id, name: "Foreign Product", unitPrice: 10, gstRate: 5 },
    ]);
    const client = await seedClient();
    const res = await createDirect(tokenOwner, {
      clientId: String(client._id),
      items: [{ productId: String(foreign._id), quantity: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "items.0.productId")).toBe(true);
  });

  test("product lines are server authoritative: description, price and GST come from the product", async () => {
    const product = await seedProduct({ name: "Catalog Widget", unitPrice: 100, gstRate: 18 });
    const client = await seedClient();
    const res = await createDirect(tokenOwner, {
      clientId: String(client._id),
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
    const item = res.body.data.invoice.items[0];
    expect(item.description).toBe("Catalog Widget");
    expect(item.unitPrice).toBe(100);
    expect(item.gstRate).toBe(18);
    expect(item.amount).toBe(300);
    expect(res.body.data.invoice.taxAmount).toBe(54);
  });

  test("rejects a total that would go negative", async () => {
    const res = await createDirect(tokenOwner, {
      discountAmount: 100000,
      items: [manualItem({ quantity: 1, unitPrice: 100, gstRate: 0 })],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "discountAmount")).toBe(true);
  });

  test("increments invoice numbers per company", async () => {
    const first = await createDirect(tokenOwner);
    const second = await createDirect(tokenOwner);
    const year = new Date().getUTCFullYear();
    expect(first.body.data.invoice.invoiceNumber).toBe(`INV-${year}-0001`);
    expect(second.body.data.invoice.invoiceNumber).toBe(`INV-${year}-0002`);
  });

  test("invoice numbers are isolated per company", async () => {
    const other = await createCompanyWithOwner();
    const clientB = await createClient({
      companyId: other.company._id,
      createdBy: other.owner._id,
      name: "B Client",
    });
    const resA = await createDirect(tokenOwner);
    const resB = await createInvoice(signToken(other.owner), {
      clientId: String(clientB._id),
      items: [manualItem()],
    });
    const year = new Date().getUTCFullYear();
    expect(resA.body.data.invoice.invoiceNumber).toBe(`INV-${year}-0001`);
    expect(resB.body.data.invoice.invoiceNumber).toBe(`INV-${year}-0001`);
  });

  test("concurrent creates all succeed with unique numbers", async () => {
    const client = await seedClient();
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        createInvoice(tokenOwner, { clientId: String(client._id), items: [manualItem()] })
      )
    );

    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.body.data.invoice.invoiceNumber);
    expect(new Set(numbers).size).toBe(5);
  });

  test("records an INVOICE_CREATED activity log", async () => {
    await createDirect(tokenOwner);
    const log = await ActivityLog.findOne({ action: "INVOICE_CREATED", companyId: companyA._id });
    expect(log).not.toBeNull();
    expect(log.entityType).toBe("INVOICE");
    expect(log.metadata.source).toBe("direct");
  });
});

describe("POST /api/invoices (from quotation)", () => {
  test("copies an accepted quotation's items, client and discount", async () => {
    const client = await seedClient({ name: "Accepted Customer" });
    const quotation = await seedQuotation({
      clientId: client._id,
      status: "ACCEPTED",
      discountAmount: 50,
      items: [{ description: "Q item", quantity: 2, unitPrice: 500, gstRate: 18 }],
    });

    const res = await createInvoice(tokenOwner, { quotationId: String(quotation._id) });
    expect(res.status).toBe(201);
    const inv = res.body.data.invoice;
    expect(inv.quotationId).toBe(String(quotation._id));
    expect(inv.quotation.quotationNumber).toBe(quotation.quotationNumber);
    expect(inv.client.id).toBe(String(client._id));
    expect(inv.subtotal).toBe(1000);
    expect(inv.taxAmount).toBe(180);
    expect(inv.discountAmount).toBe(50);
    expect(inv.totalAmount).toBe(1130);
    expect(inv.items[0].description).toBe("Q item");
  });

  test("rejects a quotation that is not ACCEPTED", async () => {
    const quotation = await seedQuotation({ status: "SENT" });
    const res = await createInvoice(tokenOwner, { quotationId: String(quotation._id) });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "quotationId")).toBe(true);
  });

  test("rejects a quotation from another company", async () => {
    const [foreign] = await Quotation.create([
      {
        companyId: companyB._id,
        createdBy: ownerB._id,
        quotationNumber: "QT-2026-9001",
        items: [{ description: "B", quantity: 1, unitPrice: 10, gstRate: 0, amount: 10 }],
        subtotal: 10,
        taxAmount: 0,
        totalAmount: 10,
        status: "ACCEPTED",
      },
    ]);
    const res = await createInvoice(tokenOwner, { quotationId: String(foreign._id) });
    expect(res.status).toBe(400);
  });

  test("resolves the client from a converted lead when the quotation has none", async () => {
    const client = await seedClient({ name: "Converted Customer" });
    const lead = await seedLead({ name: "Converted Lead", convertedClientId: client._id });
    const quotation = await seedQuotation({ leadId: lead._id, status: "ACCEPTED" });

    const res = await createInvoice(tokenOwner, { quotationId: String(quotation._id) });
    expect(res.status).toBe(201);
    expect(res.body.data.invoice.client.id).toBe(String(client._id));
  });

  test("rejects an accepted quotation with no resolvable client", async () => {
    const lead = await seedLead({ name: "Unconverted" });
    const quotation = await seedQuotation({ leadId: lead._id, status: "ACCEPTED" });
    const res = await createInvoice(tokenOwner, { quotationId: String(quotation._id) });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "quotationId")).toBe(true);
  });

  test("copies the quotation snapshot, not the product's current price", async () => {
    const product = await seedProduct({ name: "Widget", unitPrice: 100, gstRate: 18 });
    const client = await seedClient();
    const quotation = await seedQuotation({
      clientId: client._id,
      status: "ACCEPTED",
      items: [{ productId: product._id, description: "Widget", quantity: 2, unitPrice: 100, gstRate: 18 }],
    });

    await Product.updateOne({ _id: product._id }, { $set: { unitPrice: 999, gstRate: 5 } });

    const res = await createInvoice(tokenOwner, { quotationId: String(quotation._id) });
    expect(res.status).toBe(201);
    const item = res.body.data.invoice.items[0];
    expect(item.unitPrice).toBe(100);
    expect(item.gstRate).toBe(18);
    expect(res.body.data.invoice.totalAmount).toBe(236);
  });

  test("does not modify the source quotation", async () => {
    const quotation = await seedQuotation({ status: "ACCEPTED" });
    await createInvoice(tokenOwner, { quotationId: String(quotation._id) });
    const fresh = await Quotation.findById(quotation._id);
    expect(fresh.status).toBe("ACCEPTED");
    expect(fresh.totalAmount).toBe(quotation.totalAmount);
  });
});

describe("GET /api/invoices", () => {
  const seedMany = async (count) => {
    const created = [];
    for (let i = 0; i < count; i += 1) {
      const res = await createDirect(tokenOwner);
      created.push(res.body.data.invoice);
    }
    return created;
  };

  test("returns an empty page with totalPages 0", async () => {
    const res = await request(app).get("/api/invoices").set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.totalPages).toBe(0);
  });

  test("paginates results", async () => {
    await seedMany(3);
    const res = await request(app).get("/api/invoices?page=1&limit=2").set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  test("filters by status", async () => {
    const draft = await createDirect(tokenOwner);
    const toIssue = await createDirect(tokenOwner);
    await issueInvoice(tokenOwner, toIssue.body.data.invoice.id);

    const res = await request(app).get("/api/invoices?status=ISSUED").set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("ISSUED");
    expect(res.body.data[0].id).toBe(toIssue.body.data.invoice.id);
    expect(draft.body.data.invoice.status).toBe("DRAFT");
  });

  test("rejects an invalid status filter", async () => {
    const res = await request(app).get("/api/invoices?status=NOPE").set(asUser(tokenOwner));
    expect(res.status).toBe(400);
  });

  test("filters by client", async () => {
    const clientA = await seedClient({ name: "Filter A" });
    const clientB = await seedClient({ name: "Filter B" });
    await createDirect(tokenOwner, { clientId: String(clientA._id) });
    await createDirect(tokenOwner, { clientId: String(clientB._id) });

    const res = await request(app)
      .get(`/api/invoices?clientId=${clientA._id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].client.id).toBe(String(clientA._id));
  });

  test("filters by issue-date range", async () => {
    await createDirect(tokenOwner, { issueDate: "2026-01-15" });
    await createDirect(tokenOwner, { issueDate: "2026-06-15" });

    const res = await request(app)
      .get("/api/invoices?from=2026-05-01&to=2026-12-31")
      .set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].issueDate.startsWith("2026-06")).toBe(true);
  });

  test("filters OVERDUE and omits paid invoices with past due dates", async () => {
    const overdue = await createDirect(tokenOwner, { dueDate: "2020-01-01" });
    await issueInvoice(tokenOwner, overdue.body.data.invoice.id);

    const future = await createDirect(tokenOwner, { dueDate: "2099-01-01" });
    await issueInvoice(tokenOwner, future.body.data.invoice.id);

    const paid = await createDirect(tokenOwner, { dueDate: "2020-01-01" });
    await issueInvoice(tokenOwner, paid.body.data.invoice.id);
    await Invoice.updateOne(
      { _id: paid.body.data.invoice.id },
      { $set: { status: "PAID", amountPaid: paid.body.data.invoice.totalAmount, balanceDue: 0 } }
    );

    const res = await request(app).get("/api/invoices?status=OVERDUE").set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(overdue.body.data.invoice.id);
    expect(res.body.data[0].status).toBe("ISSUED");
    expect(res.body.data[0].isOverdue).toBe(true);
    expect(res.body.data[0].effectiveStatus).toBe("OVERDUE");
  });

  test("searches by invoice number and by client name", async () => {
    const client = await seedClient({ name: "Nebula Traders" });
    const created = await createDirect(tokenOwner, { clientId: String(client._id) });
    const number = created.body.data.invoice.invoiceNumber;

    const byNumber = await request(app)
      .get(`/api/invoices?search=${number}`)
      .set(asUser(tokenOwner));
    expect(byNumber.body.data).toHaveLength(1);

    const byName = await request(app).get("/api/invoices?search=Nebula").set(asUser(tokenOwner));
    expect(byName.body.data).toHaveLength(1);
    expect(byName.body.data[0].client.name).toBe("Nebula Traders");
  });

  test("does not list invoices belonging to another company", async () => {
    const clientB = await createClient({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "B Client",
    });
    await createInvoice(tokenOwnerB, { clientId: String(clientB._id), items: [manualItem()] });

    const res = await request(app).get("/api/invoices").set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /api/invoices/:id", () => {
  test("returns an invoice with a populated product snapshot", async () => {
    const product = await seedProduct({ name: "Catalog Widget" });
    const client = await seedClient();
    const created = await createDirect(tokenOwner, {
      clientId: String(client._id),
      items: [{ productId: String(product._id), quantity: 2 }],
    });

    const res = await request(app)
      .get(`/api/invoices/${created.body.data.invoice.id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data.invoice.items[0].product.name).toBe("Catalog Widget");
  });

  test("returns 404 for another company's invoice", async () => {
    const clientB = await createClient({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "B Client",
    });
    const created = await createInvoice(tokenOwnerB, {
      clientId: String(clientB._id),
      items: [manualItem()],
    });

    const res = await request(app)
      .get(`/api/invoices/${created.body.data.invoice.id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(404);
  });

  test("returns 404 for a missing invoice and 400 for a malformed id", async () => {
    const missing = await request(app)
      .get(`/api/invoices/${ownerA._id}`)
      .set(asUser(tokenOwner));
    expect(missing.status).toBe(404);

    const malformed = await request(app).get("/api/invoices/not-an-id").set(asUser(tokenOwner));
    expect(malformed.status).toBe(400);
  });
});

describe("PUT /api/invoices/:id", () => {
  const createOne = async (payload = {}) => {
    const res = await createDirect(tokenOwner, payload);
    return res.body.data.invoice;
  };

  test("recomputes totals when items change and keeps balanceDue in sync", async () => {
    const inv = await createOne();
    const res = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({
        items: [{ description: "Just one", quantity: 1, unitPrice: 100, gstRate: 0 }],
        discountAmount: 0,
      });

    expect(res.status).toBe(200);
    const updated = res.body.data.invoice;
    expect(updated.subtotal).toBe(100);
    expect(updated.taxAmount).toBe(0);
    expect(updated.totalAmount).toBe(100);
    expect(updated.balanceDue).toBe(100);
  });

  test("allows DRAFT -> ISSUED", async () => {
    const inv = await createOne();
    const res = await issueInvoice(tokenOwner, inv.id);
    expect(res.status).toBe(200);
    expect(res.body.data.invoice.status).toBe("ISSUED");
  });

  test("allows DRAFT -> CANCELLED", async () => {
    const inv = await createOne();
    const res = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.data.invoice.status).toBe("CANCELLED");
  });

  test("blocks re-opening an issued invoice to DRAFT", async () => {
    const inv = await createOne();
    await issueInvoice(tokenOwner, inv.id);
    const res = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "DRAFT" });
    expect(res.status).toBe(400);
  });

  test("refuses setting PARTIALLY_PAID or PAID through the API", async () => {
    const inv = await createOne();
    await issueInvoice(tokenOwner, inv.id);
    const partial = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "PARTIALLY_PAID" });
    expect(partial.status).toBe(400);

    const paid = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "PAID" });
    expect(paid.status).toBe(400);

    const neverPaid = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ amountPaid: 100, balanceDue: 0 });
    expect(neverPaid.status).toBe(200);
    expect(neverPaid.body.data.invoice.amountPaid).toBe(0);
  });

  test("locks an issued invoice against content edits but allows metadata edits", async () => {
    const inv = await createOne();
    await issueInvoice(tokenOwner, inv.id);

    const content = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ items: [{ description: "X", quantity: 1, unitPrice: 5, gstRate: 0 }] });
    expect(content.status).toBe(400);

    const metadata = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ notes: "thanks", paymentTerms: "Net 15", dueDate: "2099-01-01" });
    expect(metadata.status).toBe(200);
    expect(metadata.body.data.invoice.notes).toBe("thanks");
    expect(metadata.body.data.invoice.paymentTerms).toBe("Net 15");
  });

  test("fully locks a paid invoice", async () => {
    const inv = await createOne();
    await Invoice.updateOne(
      { _id: inv.id },
      { $set: { status: "PAID", amountPaid: inv.totalAmount, balanceDue: 0 } }
    );

    const res = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ notes: "nope" });
    expect(res.status).toBe(400);
  });

  test("fully locks a cancelled invoice", async () => {
    const inv = await createOne();
    await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "CANCELLED" });

    const res = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenOwner))
      .send({ notes: "nope" });
    expect(res.status).toBe(400);
  });

  test("records INVOICE_STATUS_CHANGED with previous and new status", async () => {
    const inv = await createOne();
    await issueInvoice(tokenOwner, inv.id);

    const log = await ActivityLog.findOne({
      action: "INVOICE_STATUS_CHANGED",
      companyId: companyA._id,
    });
    expect(log).not.toBeNull();
    expect(log.metadata.previousStatus).toBe("DRAFT");
    expect(log.metadata.status).toBe("ISSUED");
  });

  test("a manager and sales can edit draft invoices", async () => {
    const inv = await createOne();
    const manager = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenManager))
      .send({ notes: "manager note" });
    expect(manager.status).toBe(200);

    const sales = await request(app)
      .put(`/api/invoices/${inv.id}`)
      .set(asUser(tokenSales))
      .send({ notes: "sales note" });
    expect(sales.status).toBe(200);
  });

  test("returns 404 when updating another company's invoice", async () => {
    const clientB = await createClient({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "B Client",
    });
    const created = await createInvoice(tokenOwnerB, {
      clientId: String(clientB._id),
      items: [manualItem()],
    });

    const res = await request(app)
      .put(`/api/invoices/${created.body.data.invoice.id}`)
      .set(asUser(tokenOwner))
      .send({ notes: "nope" });
    expect(res.status).toBe(404);
  });
});

describe("invoice snapshot immutability", () => {
  test("an existing invoice keeps its item snapshot after the product changes", async () => {
    const product = await seedProduct({ name: "Catalog Widget", unitPrice: 100, gstRate: 18 });
    const client = await seedClient();
    const created = await createDirect(tokenOwner, {
      clientId: String(client._id),
      items: [{ productId: String(product._id), quantity: 2 }],
    });

    await Product.updateOne(
      { _id: product._id },
      { $set: { unitPrice: 999, gstRate: 5, name: "Renamed" } }
    );

    const res = await request(app)
      .get(`/api/invoices/${created.body.data.invoice.id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    const item = res.body.data.invoice.items[0];
    expect(item.unitPrice).toBe(100);
    expect(item.gstRate).toBe(18);
    expect(item.description).toBe("Catalog Widget");
    expect(res.body.data.invoice.totalAmount).toBe(236);
  });
});

describe("DELETE /api/invoices/:id", () => {
  test("an owner can delete a draft invoice and an activity log is recorded", async () => {
    const created = await createDirect(tokenOwner);
    const id = created.body.data.invoice.id;

    const res = await request(app).delete(`/api/invoices/${id}`).set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(await Invoice.countDocuments({ _id: id })).toBe(0);

    const log = await ActivityLog.findOne({ action: "INVOICE_DELETED", companyId: companyA._id });
    expect(log).not.toBeNull();
  });

  test("an issued invoice cannot be deleted", async () => {
    const created = await createDirect(tokenOwner);
    const id = created.body.data.invoice.id;
    await issueInvoice(tokenOwner, id);

    const res = await request(app).delete(`/api/invoices/${id}`).set(asUser(tokenOwner));
    expect(res.status).toBe(400);
    expect(await Invoice.countDocuments({ _id: id })).toBe(1);
  });

  test("sales and managers cannot delete invoices", async () => {
    const created = await createDirect(tokenOwner);
    const id = created.body.data.invoice.id;

    const sales = await request(app).delete(`/api/invoices/${id}`).set(asUser(tokenSales));
    expect(sales.status).toBe(403);

    const manager = await request(app).delete(`/api/invoices/${id}`).set(asUser(tokenManager));
    expect(manager.status).toBe(403);
  });

  test("returns 404 when deleting another company's invoice", async () => {
    const clientB = await createClient({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "B Client",
    });
    const created = await createInvoice(tokenOwnerB, {
      clientId: String(clientB._id),
      items: [manualItem()],
    });

    const res = await request(app)
      .delete(`/api/invoices/${created.body.data.invoice.id}`)
      .set(asUser(tokenOwner));
    expect(res.status).toBe(404);
  });
});
