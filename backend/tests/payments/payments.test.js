const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const Invoice = require("../../src/modules/invoices/invoice.model");
const Payment = require("../../src/modules/payments/payment.model");
const ActivityLog = require("../../src/modules/activity-logs/activityLog.model");
const {
  createCompanyWithOwner,
  createUser,
  createClient,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

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

let invoiceCounter = 0;

const seedClientA = (overrides = {}) =>
  createClient({ companyId: companyA._id, createdBy: ownerA._id, ...overrides });

// Seeds an invoice directly in company A. `totalAmount` drives the item;
// `amountPaid` lets us start from a partially-paid state.
const seedInvoice = async ({
  client,
  status = "ISSUED",
  totalAmount = 1000,
  amountPaid = 0,
  balanceDue,
  paymentDate,
  ...overrides
} = {}) => {
  const resolvedClient = client || (await seedClientA());
  invoiceCounter += 1;
  const [invoice] = await Invoice.create([
    {
      companyId: companyA._id,
      createdBy: ownerA._id,
      invoiceNumber: overrides.invoiceNumber || `INV-2026-${String(invoiceCounter).padStart(4, "0")}`,
      quotationId: null,
      clientId: resolvedClient._id,
      items: [
        {
          productId: null,
          description: "Seed line",
          quantity: 1,
          unitPrice: totalAmount,
          gstRate: 0,
          amount: totalAmount,
        },
      ],
      subtotal: totalAmount,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount,
      amountPaid,
      balanceDue: balanceDue !== undefined ? balanceDue : round2(totalAmount - amountPaid),
      status,
      issueDate: new Date(),
      dueDate: null,
      notes: "",
      paymentTerms: "",
    },
  ]);
  return invoice;
};

const postPayment = (token, payload) =>
  request(app).post("/api/payments").set(asUser(token)).send(payload);

const listPayments = (token, query = "") =>
  request(app).get(`/api/payments${query}`).set(asUser(token));

const voidPayment = (token, id, payload) =>
  request(app).post(`/api/payments/${id}/void`).set(asUser(token)).send(payload);

const NUMBER_RE = /^PAY-\d{4}-0001$/;

beforeAll(async () => {
  await connectTestDb();
  await Invoice.init();
  await Payment.init();
});

beforeEach(async () => {
  await resetDb();
  invoiceCounter = 0;

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

describe("POST /api/payments", () => {
  test("unauthenticated users cannot record a payment", async () => {
    const invoice = await seedInvoice();
    const res = await request(app)
      .post("/api/payments")
      .send({ invoiceId: String(invoice._id), amount: 100, method: "CASH" });
    expect(res.status).toBe(401);
  });

  test("records a payment against an issued invoice and updates the balance", async () => {
    const client = await seedClientA({ name: "Zephyr Corp" });
    const invoice = await seedInvoice({ client, totalAmount: 1000, status: "ISSUED" });

    const res = await postPayment(tokenSales, {
      invoiceId: String(invoice._id),
      amount: 400,
      method: "UPI",
      transactionReference: "UPI-123",
      notes: "First instalment",
    });

    expect(res.status).toBe(201);
    const payment = res.body.data.payment;
    expect(payment.paymentNumber).toMatch(NUMBER_RE);
    expect(payment.status).toBe("RECORDED");
    expect(payment.amount).toBe(400);
    expect(payment.method).toBe("UPI");
    expect(payment.transactionReference).toBe("UPI-123");
    expect(payment.clientId).toBe(String(client._id));
    expect(payment.invoice.invoiceNumber).toBe(invoice.invoiceNumber);
    expect(payment.recordedBy.name).toBeDefined();

    const updated = await Invoice.findById(invoice._id);
    expect(updated.amountPaid).toBe(400);
    expect(updated.balanceDue).toBe(600);
    expect(updated.status).toBe("PARTIALLY_PAID");
  });

  test("a partial payment moves the invoice to PARTIALLY_PAID", async () => {
    const invoice = await seedInvoice({ totalAmount: 500 });
    await postPayment(tokenOwner, { invoiceId: String(invoice._id), amount: 100, method: "CASH" });

    const updated = await Invoice.findById(invoice._id);
    expect(updated.status).toBe("PARTIALLY_PAID");
    expect(updated.amountPaid).toBe(100);
    expect(updated.balanceDue).toBe(400);
  });

  test("paying the full balance moves the invoice to PAID", async () => {
    const invoice = await seedInvoice({ totalAmount: 750 });
    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 750,
      method: "BANK_TRANSFER",
    });

    expect(res.status).toBe(201);
    const updated = await Invoice.findById(invoice._id);
    expect(updated.status).toBe("PAID");
    expect(updated.amountPaid).toBe(750);
    expect(updated.balanceDue).toBe(0);
  });

  test("rounds amounts and balances to two decimals", async () => {
    const invoice = await seedInvoice({ totalAmount: 100 });
    await postPayment(tokenOwner, { invoiceId: String(invoice._id), amount: 33.33, method: "CARD" });

    const updated = await Invoice.findById(invoice._id);
    expect(updated.amountPaid).toBe(33.33);
    expect(updated.balanceDue).toBe(66.67);
    expect(updated.status).toBe("PARTIALLY_PAID");
  });

  test("rejects a zero amount", async () => {
    const invoice = await seedInvoice();
    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 0,
      method: "CASH",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "amount")).toBe(true);
  });

  test("rejects a negative amount", async () => {
    const invoice = await seedInvoice();
    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: -50,
      method: "CASH",
    });
    expect(res.status).toBe(400);
  });

  test("rejects an amount that exceeds the balance due", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000, amountPaid: 400, status: "PARTIALLY_PAID" });
    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 700,
      method: "CASH",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "amount")).toBe(true);
    const unchanged = await Invoice.findById(invoice._id);
    expect(unchanged.amountPaid).toBe(400);
  });

  test("rejects a payment against a DRAFT invoice", async () => {
    const invoice = await seedInvoice({ status: "DRAFT" });
    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    expect(res.status).toBe(400);
  });

  test("rejects a payment against a PAID invoice", async () => {
    const invoice = await seedInvoice({ status: "PAID", amountPaid: 1000 });
    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    expect(res.status).toBe(400);
  });

  test("rejects a payment against a CANCELLED invoice", async () => {
    const invoice = await seedInvoice({ status: "CANCELLED" });
    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    expect(res.status).toBe(400);
  });

  test("rejects an invoice belonging to another company", async () => {
    const foreignClient = await createClient({
      companyId: companyB._id,
      createdBy: ownerB._id,
      name: "Foreign Client",
    });
    const [foreignInvoice] = await Invoice.create([
      {
        companyId: companyB._id,
        createdBy: ownerB._id,
        invoiceNumber: "INV-2026-9001",
        clientId: foreignClient._id,
        items: [{ description: "x", quantity: 1, unitPrice: 100, gstRate: 0, amount: 100 }],
        subtotal: 100,
        taxAmount: 0,
        totalAmount: 100,
        amountPaid: 0,
        balanceDue: 100,
        status: "ISSUED",
      },
    ]);

    const res = await postPayment(tokenOwner, {
      invoiceId: String(foreignInvoice._id),
      amount: 50,
      method: "CASH",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "invoiceId")).toBe(true);
  });

  test("rejects an invalid payment method", async () => {
    const invoice = await seedInvoice();
    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 50,
      method: "BITCOIN",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "method")).toBe(true);
  });

  test("requires an invoice id", async () => {
    const res = await postPayment(tokenOwner, { amount: 50, method: "CASH" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "invoiceId")).toBe(true);
  });

  test("ignores client-supplied tenant, identity, number, balance and status fields", async () => {
    const client = await seedClientA();
    const invoice = await seedInvoice({ client, totalAmount: 1000 });

    const res = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
      companyId: String(companyB._id),
      clientId: String(companyB._id),
      paymentNumber: "PAY-1999-9999",
      recordedBy: String(ownerB._id),
      status: "VOIDED",
      amountPaid: 1000,
      balanceDue: 0,
    });

    expect(res.status).toBe(201);
    const payment = res.body.data.payment;
    expect(payment.paymentNumber).toMatch(NUMBER_RE);
    expect(payment.status).toBe("RECORDED");
    expect(payment.companyId).toBe(String(companyA._id));
    expect(payment.clientId).toBe(String(client._id));

    const updated = await Invoice.findById(invoice._id);
    expect(updated.amountPaid).toBe(100);
    expect(updated.balanceDue).toBe(900);
  });

  test("allocates sequential, company-scoped payment numbers", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const first = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    const second = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    expect(first.body.data.payment.paymentNumber).toMatch(/^PAY-\d{4}-0001$/);
    expect(second.body.data.payment.paymentNumber).toMatch(/^PAY-\d{4}-0002$/);
  });

  test("concurrent payments never exceed the balance due", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000, status: "ISSUED" });

    const results = await Promise.all(
      Array.from({ length: 5 }).map((_, i) =>
        postPayment(tokenOwner, {
          invoiceId: String(invoice._id),
          amount: 400,
          method: "CASH",
          transactionReference: `conc-${i}`,
        })
      )
    );

    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(2);

    const updated = await Invoice.findById(invoice._id);
    expect(updated.amountPaid).toBe(800);
    expect(updated.balanceDue).toBe(200);
    expect(updated.status).toBe("PARTIALLY_PAID");

    const recorded = await Payment.countDocuments({ invoiceId: invoice._id, status: "RECORDED" });
    expect(recorded).toBe(2);
    const total = await Payment.countDocuments({ invoiceId: invoice._id });
    expect(total).toBe(2);
  });

  test("logging records PAYMENT_RECORDED with useful metadata", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    await postPayment(tokenOwner, { invoiceId: String(invoice._id), amount: 250, method: "CHEQUE" });

    const log = await ActivityLog.findOne({ action: "PAYMENT_RECORDED" });
    expect(log).not.toBeNull();
    expect(log.entityType).toBe("PAYMENT");
    expect(log.metadata.amount).toBe(250);
    expect(log.metadata.invoiceNumber).toBe(invoice.invoiceNumber);
    expect(JSON.stringify(log.metadata)).not.toMatch(/password|token/i);
  });
});

describe("GET /api/payments", () => {
  test("lists payments with server-side pagination", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    for (let i = 0; i < 3; i += 1) {
      await postPayment(tokenOwner, { invoiceId: String(invoice._id), amount: 50, method: "CASH" });
    }

    const res = await listPayments(tokenOwner, "?page=1&limit=2");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  test("filters by invoice, client, method, status and date range", async () => {
    const clientA = await seedClientA({ name: "Alpha" });
    const clientB = await seedClientA({ name: "Beta" });
    const invoiceA = await seedInvoice({ client: clientA, totalAmount: 1000 });
    const invoiceB = await seedInvoice({ client: clientB, totalAmount: 1000 });

    const p1 = await postPayment(tokenOwner, {
      invoiceId: String(invoiceA._id),
      amount: 100,
      method: "CASH",
      paymentDate: "2026-01-10T10:00:00.000Z",
    });
    await postPayment(tokenOwner, {
      invoiceId: String(invoiceB._id),
      amount: 100,
      method: "UPI",
      paymentDate: "2026-02-15T10:00:00.000Z",
    });

    const byInvoice = await listPayments(tokenOwner, `?invoiceId=${invoiceA._id}`);
    expect(byInvoice.body.data.length).toBe(1);
    expect(byInvoice.body.data[0].id).toBe(p1.body.data.payment.id);

    const byClient = await listPayments(tokenOwner, `?clientId=${clientB._id}`);
    expect(byClient.body.data.length).toBe(1);
    expect(byClient.body.data[0].client.name).toBe("Beta");

    const byMethod = await listPayments(tokenOwner, "?method=UPI");
    expect(byMethod.body.data.length).toBe(1);
    expect(byMethod.body.data[0].method).toBe("UPI");

    const byStatus = await listPayments(tokenOwner, "?status=RECORDED");
    expect(byStatus.body.data.length).toBe(2);

    const byDate = await listPayments(tokenOwner, "?from=2026-02-01&to=2026-02-28");
    expect(byDate.body.data.length).toBe(1);
    expect(byDate.body.data[0].method).toBe("UPI");
  });

  test("orders by payment date, newest first", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
      paymentDate: "2026-01-01T00:00:00.000Z",
    });
    await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
      paymentDate: "2026-03-01T00:00:00.000Z",
    });

    const res = await listPayments(tokenOwner);
    expect(res.body.data[0].paymentDate).toBe("2026-03-01T00:00:00.000Z");
  });

  test("rejects an invalid filter value", async () => {
    const res = await listPayments(tokenOwner, "?method=BITCOIN");
    expect(res.status).toBe(400);
  });

  test("never exposes sensitive user fields", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    await postPayment(tokenOwner, { invoiceId: String(invoice._id), amount: 100, method: "CASH" });

    const res = await listPayments(tokenOwner);
    const payment = res.body.data[0];
    expect(payment.recordedBy).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      email: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password|token/i);
  });

  test("all four company roles may list payments", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    await postPayment(tokenOwner, { invoiceId: String(invoice._id), amount: 100, method: "CASH" });
    for (const token of [tokenOwner, tokenAdmin, tokenManager, tokenSales]) {
      const res = await listPayments(token);
      expect(res.status).toBe(200);
    }
  });

  test("another company cannot see this company's payments", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    await postPayment(tokenOwner, { invoiceId: String(invoice._id), amount: 100, method: "CASH" });

    const res = await listPayments(tokenOwnerB);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });
});

describe("GET /api/payments/:id", () => {
  test("returns a single payment with safe refs", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    const id = created.body.data.payment.id;

    const res = await request(app).get(`/api/payments/${id}`).set(asUser(tokenSales));
    expect(res.status).toBe(200);
    expect(res.body.data.payment.id).toBe(id);
    expect(res.body.data.payment.invoice.invoiceNumber).toBe(invoice.invoiceNumber);
  });

  test("a cross-company payment id yields 404", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    const id = created.body.data.payment.id;

    const res = await request(app).get(`/api/payments/${id}`).set(asUser(tokenOwnerB));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/payments/:id/void", () => {
  test("only OWNER and ADMIN may void payments", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    const id = created.body.data.payment.id;

    const asManager = await voidPayment(tokenManager, id, { reason: "duplicate" });
    expect(asManager.status).toBe(403);
    const asSales = await voidPayment(tokenSales, id, { reason: "duplicate" });
    expect(asSales.status).toBe(403);
  });

  test("voiding a recorded payment rebuilds the invoice balance", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 400,
      method: "CASH",
    });
    const id = created.body.data.payment.id;

    const res = await voidPayment(tokenAdmin, id, { reason: "Customer reversed the transfer" });
    expect(res.status).toBe(200);
    const payment = res.body.data.payment;
    expect(payment.status).toBe("VOIDED");
    expect(payment.voidReason).toBe("Customer reversed the transfer");
    expect(payment.voidedAt).not.toBeNull();
    expect(payment.voidedBy.name).toBeDefined();

    const updated = await Invoice.findById(invoice._id);
    expect(updated.amountPaid).toBe(0);
    expect(updated.balanceDue).toBe(1000);
    expect(updated.status).toBe("ISSUED");
  });

  test("recalculates correctly when later payments exist", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const first = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 400,
      method: "CASH",
    });
    await postPayment(tokenOwner, { invoiceId: String(invoice._id), amount: 200, method: "UPI" });
    const firstId = first.body.data.payment.id;

    const res = await voidPayment(tokenOwner, firstId, { reason: "wrong invoice" });
    expect(res.status).toBe(200);

    const updated = await Invoice.findById(invoice._id);
    expect(updated.amountPaid).toBe(200);
    expect(updated.balanceDue).toBe(800);
    expect(updated.status).toBe("PARTIALLY_PAID");
  });

  test("voiding the only remaining payment reopens the full balance", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 1000,
      method: "BANK_TRANSFER",
    });
    let updated = await Invoice.findById(invoice._id);
    expect(updated.status).toBe("PAID");

    const res = await voidPayment(tokenOwner, created.body.data.payment.id, { reason: "bounced" });
    expect(res.status).toBe(200);
    updated = await Invoice.findById(invoice._id);
    expect(updated.amountPaid).toBe(0);
    expect(updated.balanceDue).toBe(1000);
    expect(updated.status).toBe("ISSUED");
  });

  test("preserves the payment record and audit trail", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    const id = created.body.data.payment.id;
    await voidPayment(tokenOwner, id, { reason: "test audit" });

    const stored = await Payment.findById(id);
    expect(stored).not.toBeNull();
    expect(stored.status).toBe("VOIDED");
    expect(stored.voidReason).toBe("test audit");
    expect(stored.voidedAt).toBeInstanceOf(Date);

    const log = await ActivityLog.findOne({ action: "PAYMENT_VOIDED" });
    expect(log).not.toBeNull();
    expect(log.metadata.reason).toBe("test audit");
    expect(log.metadata.paymentNumber).toBe(stored.paymentNumber);
  });

  test("rejects voiding an already voided payment", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    const id = created.body.data.payment.id;
    const first = await voidPayment(tokenOwner, id, { reason: "first" });
    expect(first.status).toBe(200);
    const second = await voidPayment(tokenOwner, id, { reason: "second" });
    expect(second.status).toBe(400);
  });

  test("requires a reason", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    const res = await voidPayment(tokenOwner, created.body.data.payment.id, {});
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === "reason")).toBe(true);
  });

  test("rejects voiding a payment on a cancelled invoice", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "CANCELLED" } });

    const res = await voidPayment(tokenOwner, created.body.data.payment.id, { reason: "x" });
    expect(res.status).toBe(400);
  });

  test("another company cannot void this company's payment", async () => {
    const invoice = await seedInvoice({ totalAmount: 1000 });
    const created = await postPayment(tokenOwner, {
      invoiceId: String(invoice._id),
      amount: 100,
      method: "CASH",
    });
    const res = await voidPayment(tokenOwnerB, created.body.data.payment.id, { reason: "x" });
    expect(res.status).toBe(404);
  });
});
