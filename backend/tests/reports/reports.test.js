const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const Lead = require("../../src/modules/leads/lead.model");
const Quotation = require("../../src/modules/quotations/quotation.model");
const Invoice = require("../../src/modules/invoices/invoice.model");
const Payment = require("../../src/modules/payments/payment.model");
const FollowUp = require("../../src/modules/followups/followup.model");
const {
  createCompanyWithOwner,
  createUser,
  createClient,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });
const getReport = (path, token, query = "") =>
  request(app).get(`/api/reports/${path}${query}`).set(asUser(token));

const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const daysAhead = (n) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
const RECENT = daysAgo(5);
const OLD = daysAgo(100);
const RANGE_FROM = daysAgo(30).toISOString().slice(0, 10);

let companyA;
let ownerA;
let tokenA;
let companyB;
let tokenB;
let clientA;
let invoiceCounter = 0;
let quotationCounter = 0;

const setCreatedAt = (Model, id, date) =>
  Model.collection.updateOne({ _id: id }, { $set: { createdAt: date } }, { timestamps: false });

const seedLead = async (overrides = {}) => {
  const [lead] = await Lead.create([
    {
      companyId: companyA._id,
      createdBy: ownerA._id,
      name: "Lead",
      phoneNumber: "9000000000",
      status: "NEW",
      source: "WEBSITE",
      ...overrides,
    },
  ]);
  const { createdAt } = overrides;
  if (createdAt) await setCreatedAt(Lead, lead._id, createdAt);
  return lead;
};

const seedQuotation = async ({ status, totalAmount, createdAt = RECENT }) => {
  quotationCounter += 1;
  const [quotation] = await Quotation.create([
    {
      companyId: companyA._id,
      createdBy: ownerA._id,
      quotationNumber: `QT-2026-${String(quotationCounter).padStart(4, "0")}`,
      clientId: clientA._id,
      items: [{ productId: null, description: "L", quantity: 1, unitPrice: totalAmount, gstRate: 0, amount: totalAmount }],
      subtotal: totalAmount,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount,
      status,
    },
  ]);
  await setCreatedAt(Quotation, quotation._id, createdAt);
  return quotation;
};

const seedInvoice = async ({ status, totalAmount, amountPaid = 0, balanceDue, issueDate = RECENT, dueDate = null }) => {
  invoiceCounter += 1;
  const [invoice] = await Invoice.create([
    {
      companyId: companyA._id,
      createdBy: ownerA._id,
      invoiceNumber: `INV-2026-${String(invoiceCounter).padStart(4, "0")}`,
      clientId: clientA._id,
      items: [{ productId: null, description: "L", quantity: 1, unitPrice: totalAmount, gstRate: 0, amount: totalAmount }],
      subtotal: totalAmount,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount,
      amountPaid,
      balanceDue: balanceDue !== undefined ? balanceDue : totalAmount - amountPaid,
      status,
      issueDate,
      dueDate,
    },
  ]);
  return invoice;
};

const seedPayment = async ({ invoiceId, amount, method, status = "RECORDED", paymentDate = RECENT }) => {
  const [payment] = await Payment.create([
    {
      companyId: companyA._id,
      invoiceId,
      clientId: clientA._id,
      paymentNumber: `PAY-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      amount,
      method,
      status,
      paymentDate,
      recordedBy: ownerA._id,
    },
  ]);
  return payment;
};

async function seedAll() {
  clientA = await createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Report Client" });

  await Promise.all([
    seedLead({ status: "NEW", source: "WEBSITE", createdAt: RECENT }),
    seedLead({ status: "NEW", source: "WEBSITE", createdAt: RECENT }),
    seedLead({ status: "CONTACTED", source: "PHONE", createdAt: RECENT }),
    seedLead({ status: "WON", source: "REFERRAL", createdAt: RECENT }),
    seedLead({ status: "NEW", source: "REFERRAL", createdAt: RECENT }),
    seedLead({ status: "NEW", source: "WEBSITE", createdAt: OLD }),
  ]);

  await Promise.all([
    seedQuotation({ status: "DRAFT", totalAmount: 1000 }),
    seedQuotation({ status: "SENT", totalAmount: 2000 }),
    seedQuotation({ status: "SENT", totalAmount: 3000 }),
    seedQuotation({ status: "ACCEPTED", totalAmount: 4000 }),
    seedQuotation({ status: "REJECTED", totalAmount: 5000 }),
    seedQuotation({ status: "ACCEPTED", totalAmount: 10000, createdAt: OLD }),
  ]);

  const paid = await seedInvoice({ status: "PAID", totalAmount: 1000, amountPaid: 1000 });
  await Promise.all([
    seedInvoice({ status: "DRAFT", totalAmount: 1000 }),
    seedInvoice({ status: "ISSUED", totalAmount: 1000, dueDate: daysAhead(5) }),
    seedInvoice({ status: "PARTIALLY_PAID", totalAmount: 1000, amountPaid: 400, dueDate: daysAhead(5) }),
    paid,
    seedInvoice({ status: "CANCELLED", totalAmount: 500, balanceDue: 500 }),
    seedInvoice({ status: "ISSUED", totalAmount: 800, dueDate: daysAgo(5) }),
    seedInvoice({ status: "PARTIALLY_PAID", totalAmount: 1000, amountPaid: 200, dueDate: daysAgo(5) }),
    seedInvoice({ status: "ISSUED", totalAmount: 2000, dueDate: daysAhead(5), issueDate: OLD }),
  ]);

  await Promise.all([
    seedPayment({ invoiceId: paid._id, amount: 500, method: "CASH" }),
    seedPayment({ invoiceId: paid._id, amount: 300, method: "UPI" }),
    seedPayment({ invoiceId: paid._id, amount: 1000, method: "CARD", paymentDate: OLD }),
    seedPayment({ invoiceId: paid._id, amount: 999, method: "CASH", status: "VOIDED" }),
    seedPayment({ invoiceId: paid._id, amount: 777, method: "UPI", status: "REFUNDED" }),
  ]);

  await Promise.all([
    FollowUp.create([{ companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clientA._id, type: "CALL", subject: "F1", dueAt: daysAgo(2), status: "PENDING" }]),
    FollowUp.create([{ companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clientA._id, type: "CALL", subject: "F2", dueAt: daysAhead(2), status: "PENDING" }]),
    FollowUp.create([{ companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clientA._id, type: "CALL", subject: "F3", dueAt: daysAgo(1), status: "COMPLETED" }]),
    FollowUp.create([{ companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clientA._id, type: "CALL", subject: "F4", dueAt: daysAhead(1), status: "CANCELLED" }]),
    FollowUp.create([{ companyId: companyA._id, createdBy: ownerA._id, assignedTo: ownerA._id, clientId: clientA._id, type: "CALL", subject: "F5", dueAt: OLD, status: "PENDING" }]),
  ]);
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

describe("reports authentication", () => {
  const paths = ["leads", "quotations", "invoices", "payments", "follow-ups"];
  test.each(paths)("GET /api/reports/%s requires authentication", async (path) => {
    const res = await request(app).get(`/api/reports/${path}`);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/reports/leads", () => {
  test("returns zeroes for an empty company", async () => {
    const res = await getReport("leads", tokenB);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.byStatus.NEW).toBe(0);
    expect(res.body.data.bySource.WEBSITE).toBe(0);
  });

  test("returns totals and breakdowns", async () => {
    await seedAll();
    const res = await getReport("leads", tokenA);
    expect(res.status).toBe(200);
    const { total, byStatus, bySource } = res.body.data;
    expect(total).toBe(6);
    expect(byStatus).toEqual({ NEW: 4, CONTACTED: 1, QUALIFIED: 0, PROPOSAL_SENT: 0, WON: 1, LOST: 0 });
    expect(bySource).toEqual({ WEBSITE: 3, PHONE: 1, WHATSAPP: 0, REFERRAL: 2, SOCIAL_MEDIA: 0, OTHER: 0 });
  });

  test("applies the date range filter on createdAt", async () => {
    await seedAll();
    const res = await getReport("leads", tokenA, `?from=${RANGE_FROM}`);
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.byStatus.NEW).toBe(3);
  });
});

describe("GET /api/reports/quotations", () => {
  test("returns totals, status counts and values", async () => {
    await seedAll();
    const res = await getReport("quotations", tokenA);
    const { total, byStatus, totalValue, acceptedValue } = res.body.data;
    expect(total).toBe(6);
    expect(byStatus).toEqual({ DRAFT: 1, SENT: 2, ACCEPTED: 2, REJECTED: 1, EXPIRED: 0 });
    expect(totalValue).toBe(25000);
    expect(acceptedValue).toBe(14000);
  });

  test("applies the date range filter", async () => {
    await seedAll();
    const res = await getReport("quotations", tokenA, `?from=${RANGE_FROM}`);
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.totalValue).toBe(15000);
    expect(res.body.data.acceptedValue).toBe(4000);
  });
});

describe("GET /api/reports/invoices", () => {
  test("distinguishes invoiced value, collected value and outstanding balance", async () => {
    await seedAll();
    const res = await getReport("invoices", tokenA);
    const d = res.body.data;
    expect(d.total).toBe(8);
    expect(d.totalInvoiced).toBe(8300);
    expect(d.amountCollected).toBe(1600);
    expect(d.outstandingBalance).toBe(5200);
    expect(d.overdueCount).toBe(2);
    expect(d.overdueBalance).toBe(1600);
  });

  test("uses mutually exclusive status buckets including OVERDUE", async () => {
    await seedAll();
    const res = await getReport("invoices", tokenA);
    const byStatus = res.body.data.byStatus;
    expect(byStatus).toEqual({ DRAFT: 1, ISSUED: 2, PARTIALLY_PAID: 1, PAID: 1, CANCELLED: 1, OVERDUE: 2 });
    const sum = Object.values(byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(8);
  });

  test("applies the date range filter on issueDate", async () => {
    await seedAll();
    const res = await getReport("invoices", tokenA, `?from=${RANGE_FROM}`);
    expect(res.body.data.total).toBe(7);
    expect(res.body.data.totalInvoiced).toBe(6300);
    expect(res.body.data.outstandingBalance).toBe(3200);
  });
});

describe("GET /api/reports/payments", () => {
  test("counts only recorded payments and groups by method", async () => {
    await seedAll();
    const res = await getReport("payments", tokenA);
    const d = res.body.data;
    expect(d.totalRecorded).toBe(3);
    expect(d.totalAmount).toBe(1800);
    expect(d.byMethod.CASH).toEqual({ count: 1, total: 500 });
    expect(d.byMethod.UPI).toEqual({ count: 1, total: 300 });
    expect(d.byMethod.CARD).toEqual({ count: 1, total: 1000 });
    expect(d.byMethod.CHEQUE).toEqual({ count: 0, total: 0 });
    // VOIDED 999 and REFUNDED 777 are excluded from the 1800 total.
  });

  test("applies the date range filter on paymentDate", async () => {
    await seedAll();
    const res = await getReport("payments", tokenA, `?from=${RANGE_FROM}`);
    expect(res.body.data.totalRecorded).toBe(2);
    expect(res.body.data.totalAmount).toBe(800);
    expect(res.body.data.byMethod.CARD).toEqual({ count: 0, total: 0 });
  });
});

describe("GET /api/reports/follow-ups", () => {
  test("returns counts by status and overdue pending", async () => {
    await seedAll();
    const res = await getReport("follow-ups", tokenA);
    const d = res.body.data;
    expect(d.total).toBe(5);
    expect(d.pending).toBe(3);
    expect(d.completed).toBe(1);
    expect(d.cancelled).toBe(1);
    expect(d.overduePending).toBe(2);
  });

  test("applies the date range filter on dueAt", async () => {
    await seedAll();
    const res = await getReport("follow-ups", tokenA, `?from=${RANGE_FROM}`);
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.pending).toBe(2);
    expect(res.body.data.overduePending).toBe(1);
  });
});

describe("date validation", () => {
  test("rejects an unparseable date", async () => {
    const res = await getReport("leads", tokenA, "?from=not-a-date");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("rejects an inverted range", async () => {
    const res = await getReport(
      "invoices",
      tokenA,
      `?from=${daysAgo(-1).toISOString().slice(0, 10)}&to=${daysAgo(30).toISOString().slice(0, 10)}`
    );
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("from");
  });
});

describe("reports tenant isolation", () => {
  test("company B never sees company A data in any report", async () => {
    await seedAll();

    const leads = await getReport("leads", tokenB);
    const quotations = await getReport("quotations", tokenB);
    const invoices = await getReport("invoices", tokenB);
    const payments = await getReport("payments", tokenB);
    const followUps = await getReport("follow-ups", tokenB);

    expect(leads.body.data.total).toBe(0);
    expect(quotations.body.data.totalValue).toBe(0);
    expect(invoices.body.data.totalInvoiced).toBe(0);
    expect(payments.body.data.totalRecorded).toBe(0);
    expect(followUps.body.data.total).toBe(0);
  });
});
