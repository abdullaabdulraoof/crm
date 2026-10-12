const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const Lead = require("../../src/modules/leads/lead.model");
const Quotation = require("../../src/modules/quotations/quotation.model");
const Invoice = require("../../src/modules/invoices/invoice.model");
const Payment = require("../../src/modules/payments/payment.model");
const FollowUp = require("../../src/modules/followups/followup.model");
const Product = require("../../src/modules/products/product.model");
const {
  createCompanyWithOwner,
  createUser,
  createLead,
  createClient,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });
const getSummary = (token) => request(app).get("/api/dashboard/summary").set(asUser(token));

const utcMonthStart = (offset = 0, date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

let companyA;
let ownerA;
let tokenA;
let companyB;
let tokenB;

let invoiceCounter = 0;
let quotationCounter = 0;

const seedInvoice = async ({
  companyId,
  createdBy,
  clientId,
  status = "ISSUED",
  totalAmount = 1000,
  amountPaid = 0,
  balanceDue,
  issueDate = new Date(),
  dueDate = null,
}) => {
  invoiceCounter += 1;
  const [invoice] = await Invoice.create([
    {
      companyId,
      createdBy,
      invoiceNumber: `INV-2026-${String(invoiceCounter).padStart(4, "0")}`,
      quotationId: null,
      clientId,
      items: [
        {
          productId: null,
          description: "Line",
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
      balanceDue: balanceDue !== undefined ? balanceDue : totalAmount - amountPaid,
      status,
      issueDate,
      dueDate,
      notes: "",
      paymentTerms: "",
    },
  ]);
  return invoice;
};

const seedQuotation = async ({ companyId, createdBy, clientId, status, totalAmount = 1000 }) => {
  quotationCounter += 1;
  const [quotation] = await Quotation.create([
    {
      companyId,
      createdBy,
      quotationNumber: `QT-2026-${String(quotationCounter).padStart(4, "0")}`,
      leadId: null,
      clientId: clientId || null,
      items: [
        {
          productId: null,
          description: "Line",
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
      status,
    },
  ]);
  return quotation;
};

const seedPayment = async ({
  companyId,
  createdBy,
  invoiceId,
  clientId,
  amount,
  method = "CASH",
  status = "RECORDED",
  paymentDate = new Date(),
}) => {
  const [payment] = await Payment.create([
    {
      companyId,
      invoiceId,
      clientId,
      paymentNumber: `PAY-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      amount,
      paymentDate,
      method,
      status,
      recordedBy: createdBy,
    },
  ]);
  return payment;
};

// Rich fixture for company A used by most assertions.
async function seedCompanyAData() {
  const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  const clients = await Promise.all([
    createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Client One" }),
    createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Client Two" }),
    createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Client Three" }),
  ]);

  await Promise.all([
    createLead({ companyId: companyA._id, createdBy: ownerA._id, status: "NEW" }),
    createLead({ companyId: companyA._id, createdBy: ownerA._id, status: "NEW" }),
    createLead({ companyId: companyA._id, createdBy: ownerA._id, status: "CONTACTED" }),
    createLead({ companyId: companyA._id, createdBy: ownerA._id, status: "QUALIFIED" }),
    createLead({ companyId: companyA._id, createdBy: ownerA._id, status: "WON" }),
  ]);

  await Product.create([
    { companyId: companyA._id, name: "Active A", unitPrice: 10, isActive: true },
    { companyId: companyA._id, name: "Active B", unitPrice: 20, isActive: true },
    { companyId: companyA._id, name: "Inactive", unitPrice: 30, isActive: false },
  ]);

  await Promise.all([
    seedQuotation({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[0]._id, status: "DRAFT" }),
    seedQuotation({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[0]._id, status: "SENT", totalAmount: 2000 }),
    seedQuotation({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[1]._id, status: "SENT", totalAmount: 3000 }),
    seedQuotation({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[1]._id, status: "ACCEPTED", totalAmount: 4000 }),
    seedQuotation({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[2]._id, status: "REJECTED", totalAmount: 5000 }),
  ]);

  const draft = await seedInvoice({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[0]._id, status: "DRAFT", totalAmount: 1000, dueDate: future });
  await seedInvoice({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[0]._id, status: "ISSUED", totalAmount: 1000, dueDate: future });
  await seedInvoice({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[1]._id, status: "PARTIALLY_PAID", totalAmount: 1000, amountPaid: 400, dueDate: future });
  const paid = await seedInvoice({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[1]._id, status: "PAID", totalAmount: 1000, amountPaid: 1000 });
  await seedInvoice({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[2]._id, status: "CANCELLED", totalAmount: 500, balanceDue: 500 });
  await seedInvoice({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[2]._id, status: "ISSUED", totalAmount: 800, dueDate: past });
  await seedInvoice({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[0]._id, status: "PARTIALLY_PAID", totalAmount: 1000, amountPaid: 200, dueDate: past });

  await Promise.all([
    seedPayment({ companyId: companyA._id, createdBy: ownerA._id, invoiceId: paid._id, clientId: clients[1]._id, amount: 500, method: "UPI" }),
    seedPayment({ companyId: companyA._id, createdBy: ownerA._id, invoiceId: paid._id, clientId: clients[1]._id, amount: 300, method: "CASH" }),
    seedPayment({ companyId: companyA._id, createdBy: ownerA._id, invoiceId: paid._id, clientId: clients[1]._id, amount: 1000, method: "CARD", paymentDate: utcMonthStart(-1) }),
    seedPayment({ companyId: companyA._id, createdBy: ownerA._id, invoiceId: paid._id, clientId: clients[1]._id, amount: 999, status: "VOIDED" }),
    seedPayment({ companyId: companyA._id, createdBy: ownerA._id, invoiceId: paid._id, clientId: clients[1]._id, amount: 777, status: "REFUNDED" }),
  ]);

  await FollowUp.create([
    { companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clients[0]._id, type: "CALL", subject: "Overdue call", dueAt: past, status: "PENDING" },
    { companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clients[1]._id, type: "MEETING", subject: "Upcoming meeting", dueAt: future, status: "PENDING" },
    { companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clients[2]._id, type: "EMAIL", subject: "Later email", dueAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), status: "PENDING" },
    { companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clients[0]._id, type: "OTHER", subject: "Done", dueAt: past, status: "COMPLETED" },
    { companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clients[0]._id, type: "OTHER", subject: "Cancelled", dueAt: future, status: "CANCELLED" },
  ]);

  return { clients, draft };
}

beforeAll(async () => {
  await connectTestDb();
  await Invoice.init();
  await Payment.init();
  await Quotation.init();
});

beforeEach(async () => {
  await resetDb();
  invoiceCounter = 0;
  quotationCounter = 0;

  const a = await createCompanyWithOwner();
  companyA = a.company;
  ownerA = a.owner;
  tokenA = signToken(ownerA);

  const b = await createCompanyWithOwner();
  companyB = b.company;
  tokenB = signToken(b.owner);
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("GET /api/dashboard/summary", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(401);
  });

  test("returns a zeroed summary when the company has no data", async () => {
    const res = await getSummary(tokenB);
    expect(res.status).toBe(200);
    const { cards, invoiceStatus, monthlyPayments, recent } = res.body.data;

    expect(cards).toEqual({
      totalLeads: 0,
      newLeads: 0,
      totalClients: 0,
      activeProducts: 0,
      quotationsSent: 0,
      outstandingBalance: 0,
      paymentsThisMonth: 0,
      overdueInvoices: 0,
    });
    expect(invoiceStatus).toEqual({
      DRAFT: 0,
      ISSUED: 0,
      PARTIALLY_PAID: 0,
      PAID: 0,
      CANCELLED: 0,
      OVERDUE: 0,
    });
    expect(monthlyPayments).toHaveLength(6);
    expect(monthlyPayments.every((m) => m.total === 0)).toBe(true);
    expect(recent).toEqual({ leads: [], quotations: [], invoices: [], followUps: [] });
  });

  test("returns the correct summary for existing records", async () => {
    await seedCompanyAData();

    const res = await getSummary(tokenA);
    expect(res.status).toBe(200);
    const { cards } = res.body.data;

    expect(cards.totalLeads).toBe(5);
    expect(cards.newLeads).toBe(2);
    expect(cards.totalClients).toBe(3);
    expect(cards.activeProducts).toBe(2);
    expect(cards.quotationsSent).toBe(2);
    expect(cards.outstandingBalance).toBe(3200);
    expect(cards.paymentsThisMonth).toBe(800);
    expect(cards.overdueInvoices).toBe(2);
  });

  test("counts leads by status", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);

    expect(res.body.data.leadsByStatus).toEqual({
      NEW: 2,
      CONTACTED: 1,
      QUALIFIED: 1,
      PROPOSAL_SENT: 0,
      WON: 1,
      LOST: 0,
    });
  });

  test("counts quotations by status", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);

    expect(res.body.data.quotationsByStatus).toEqual({
      DRAFT: 1,
      SENT: 2,
      ACCEPTED: 1,
      REJECTED: 1,
      EXPIRED: 0,
    });
  });

  test("builds a mutually exclusive invoice status breakdown including OVERDUE", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);

    const invoiceStatus = res.body.data.invoiceStatus;
    expect(invoiceStatus).toEqual({
      DRAFT: 1,
      ISSUED: 1,
      PARTIALLY_PAID: 1,
      PAID: 1,
      CANCELLED: 1,
      OVERDUE: 2,
    });

    // No double counting: every invoice lands in exactly one bucket.
    const total = Object.values(invoiceStatus).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(7);
  });

  test("computes outstanding balance only from payable invoices", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);
    // 1000 (issued) + 600 (partial) + 800 + 800 (overdue) ; DRAFT/PAID/CANCELLED excluded.
    expect(res.body.data.totals.outstandingBalance).toBe(3200);
  });

  test("computes overdue count and balance dynamically", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);
    expect(res.body.data.cards.overdueInvoices).toBe(2);
    expect(res.body.data.totals.overdueBalance).toBe(1600);
  });

  test("excludes VOIDED and REFUNDED payments from monthly totals", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);
    const now = new Date();
    const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const current = res.body.data.monthlyPayments.find((m) => m.month === currentKey);
    // 500 + 300 RECORDED this month; the 999 VOIDED and 777 REFUNDED are ignored.
    expect(current.total).toBe(800);
    const total6 = res.body.data.monthlyPayments.reduce((sum, m) => sum + m.total, 0);
    expect(total6).toBe(1800); // + 1000 from last month
  });

  test("returns six calendar months of payments with the previous month populated", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);
    const months = res.body.data.monthlyPayments;
    expect(months).toHaveLength(6);
    const keys = months.map((m) => m.month);
    const prev = keys[4];
    const last = res.body.data.monthlyPayments.find((m) => m.month === prev);
    expect(last.total).toBe(1000);
    expect(keys[5]).not.toBe(keys[0]);
  });

  test("lists upcoming pending follow-ups soonest first", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);

    const followUps = res.body.data.recent.followUps;
    expect(followUps).toHaveLength(3);
    expect(followUps.every((f) => f.status === "PENDING")).toBe(true);
    const dueTimes = followUps.map((f) => new Date(f.dueAt).getTime());
    expect([...dueTimes].sort((a, b) => a - b)).toEqual(dueTimes);
    expect(followUps[0].subject).toBe("Overdue call");
    expect(followUps[0].assignedTo.name).toBeDefined();
  });

  test("limits each recent section to five records", async () => {
    const clients = await Promise.all([
      createClient({ companyId: companyA._id, createdBy: ownerA._id }),
      createClient({ companyId: companyA._id, createdBy: ownerA._id }),
    ]);
    for (let i = 0; i < 7; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await createLead({ companyId: companyA._id, createdBy: ownerA._id });
    }
    const paid = await seedInvoice({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[0]._id, status: "PAID", totalAmount: 100, amountPaid: 100 });
    await Promise.all([
      seedQuotation({ companyId: companyA._id, createdBy: ownerA._id, clientId: clients[0]._id, status: "SENT" }),
      seedPayment({ companyId: companyA._id, createdBy: ownerA._id, invoiceId: paid._id, clientId: clients[0]._id, amount: 10 }),
    ]);

    const res = await getSummary(tokenA);
    expect(res.body.data.recent.leads).toHaveLength(5);
    expect(res.body.data.recent.quotations.length).toBeLessThanOrEqual(5);
    expect(res.body.data.recent.invoices.length).toBeLessThanOrEqual(5);
  });

  test("never exposes sensitive fields", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("passwordResetTokenHash");
  });

  test("isolates tenants - company B never sees company A data", async () => {
    await seedCompanyAData();

    const resA = await getSummary(tokenA);
    const resB = await getSummary(tokenB);

    expect(resA.body.data.cards.totalLeads).toBe(5);
    expect(resB.body.data.cards.totalLeads).toBe(0);
    expect(resB.body.data.recent.leads).toHaveLength(0);
    expect(resB.body.data.totals.outstandingBalance).toBe(0);
  });

  test("reports invoiced value for the current month", async () => {
    await seedCompanyAData();
    const res = await getSummary(tokenA);
    expect(res.body.data.totals.invoicedThisMonth).toBe(6300);
  });
});
