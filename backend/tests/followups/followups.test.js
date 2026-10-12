const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv(); // MUST run before requiring the app

const request = require("supertest");
const app = require("../../src/app");
const FollowUp = require("../../src/modules/followups/followup.model");
const ActivityLog = require("../../src/modules/activity-logs/activityLog.model");
const {
  createCompanyWithOwner,
  createUser,
  createLead,
  createClient,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

const VALID_FOLLOWUP = {
  assignedTo: null, // set per-test from the seeded users
  type: "CALL",
  subject: "Follow up regarding quotation",
  description: "Discuss quotation with customer",
  dueAt: "2026-10-10T10:00:00.000Z",
};

let companyA;
let ownerA;
let adminA;
let managerA;
let salesA;
let salesInactiveA;
let tokenOwner;
let tokenAdmin;
let tokenManager;
let tokenSales;
let companyB;
let ownerB;
let tokenOwnerB;
let leadA;
let leadB;
let clientA;
let clientB;

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
  salesInactiveA = await createUser({ companyId: companyA._id, role: "SALES", isActive: false });

  tokenOwner = signToken(ownerA);
  tokenAdmin = signToken(adminA);
  tokenManager = signToken(managerA);
  tokenSales = signToken(salesA);

  leadA = await createLead({ companyId: companyA._id, createdBy: ownerA._id, name: "Lead A" });
  clientA = await createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Client A" });

  const b = await createCompanyWithOwner();
  companyB = b.company;
  ownerB = b.owner;
  tokenOwnerB = signToken(ownerB);
  leadB = await createLead({ companyId: companyB._id, createdBy: ownerB._id, name: "Lead B" });
  clientB = await createClient({ companyId: companyB._id, createdBy: ownerB._id, name: "Client B" });
});

afterAll(async () => {
  await disconnectTestDb();
});

const bodyForLead = (overrides = {}) => ({
  ...VALID_FOLLOWUP,
  leadId: leadA._id.toString(),
  assignedTo: salesA._id.toString(),
  ...overrides,
});

const bodyForClient = (overrides = {}) => ({
  ...VALID_FOLLOWUP,
  clientId: clientA._id.toString(),
  assignedTo: salesA._id.toString(),
  ...overrides,
});

const createForLead = (token = tokenOwner, overrides = {}) =>
  request(app).post("/api/follow-ups").set(asUser(token)).send(bodyForLead(overrides));

const createForClient = (token = tokenOwner, overrides = {}) =>
  request(app).post("/api/follow-ups").set(asUser(token)).send(bodyForClient(overrides));

describe("POST /api/follow-ups", () => {
  test("unauthenticated users cannot create a follow-up", async () => {
    const res = await request(app).post("/api/follow-ups").send(bodyForLead());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("1. authenticated user can create a follow-up for a lead", async () => {
    const res = await createForLead(tokenSales);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Follow-up created successfully");

    const { followup } = res.body.data;
    expect(followup.leadId).toBe(leadA._id.toString());
    expect(followup.lead).toEqual({ id: leadA._id.toString(), name: "Lead A", phoneNumber: "9876543210" });
    expect(followup.clientId).toBeNull();
    expect(followup.client).toBeNull();
    expect(followup.type).toBe("CALL");
    expect(followup.subject).toBe("Follow up regarding quotation");
    expect(followup.status).toBe("PENDING");
    expect(followup.completedAt).toBeNull();
    expect(followup.companyId).toBe(companyA._id.toString());
    expect(followup.createdBy).toEqual({
      id: salesA._id.toString(),
      name: salesA.name,
      email: salesA.email,
    });
    expect(followup.assignedTo).toEqual({
      id: salesA._id.toString(),
      name: salesA.name,
      email: salesA.email,
    });
  });

  test("2. authenticated user can create a follow-up for a client", async () => {
    const res = await createForClient(tokenManager, { type: "MEETING", subject: "AMC renewal discussion" });

    expect(res.status).toBe(201);
    const { followup } = res.body.data;
    expect(followup.clientId).toBe(clientA._id.toString());
    expect(followup.client).toEqual({ id: clientA._id.toString(), name: "Client A", phoneNumber: "9876543210" });
    expect(followup.leadId).toBeNull();
    expect(followup.lead).toBeNull();
    expect(followup.type).toBe("MEETING");
    expect(followup.subject).toBe("AMC renewal discussion");
  });

  test("3. follow-up cannot have both leadId and clientId", async () => {
    const res = await createForLead(tokenOwner, { clientId: clientA._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.details[0].field).toBe("leadId");
    expect(res.body.error.details[0].message).toContain("not both");
  });

  test("4. follow-up cannot have neither leadId nor clientId", async () => {
    const { leadId, ...withoutTarget } = bodyForLead();
    const res = await request(app).post("/api/follow-ups").set(asUser(tokenOwner)).send(withoutTarget);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toContain("Exactly one of leadId or clientId");
  });

  test("5. invalid leadId is rejected", async () => {
    const malformed = await createForLead(tokenOwner, { leadId: "not-an-id" });
    expect(malformed.status).toBe(400);

    const nonexistent = await createForLead(tokenOwner, {
      leadId: "000000000000000000000000",
    });
    expect(nonexistent.status).toBe(400);
    expect(nonexistent.body.error.details[0].field).toBe("leadId");
  });

  test("6. invalid clientId is rejected", async () => {
    const malformed = await createForClient(tokenOwner, { clientId: "not-an-id" });
    expect(malformed.status).toBe(400);

    const nonexistent = await createForClient(tokenOwner, {
      clientId: "000000000000000000000000",
    });
    expect(nonexistent.status).toBe(400);
    expect(nonexistent.body.error.details[0].field).toBe("clientId");
  });

  test("7. cross-company lead is rejected", async () => {
    const res = await createForLead(tokenOwner, { leadId: leadB._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("leadId");
    expect(await FollowUp.countDocuments({})).toBe(0);
  });

  test("8. cross-company client is rejected", async () => {
    const res = await createForClient(tokenOwner, { clientId: clientB._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("clientId");
    expect(await FollowUp.countDocuments({})).toBe(0);
  });

  test("9. cross-company assigned user is rejected", async () => {
    const res = await createForLead(tokenOwner, { assignedTo: ownerB._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("assignedTo");
    expect(await FollowUp.countDocuments({})).toBe(0);
  });

  test("10. inactive assigned user is rejected", async () => {
    const res = await createForLead(tokenOwner, { assignedTo: salesInactiveA._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("assignedTo");
    expect(res.body.error.details[0].message).toContain("active");
  });

  test("missing dueAt, type, subject or assignedTo is rejected", async () => {
    for (const field of ["dueAt", "type", "subject", "assignedTo"]) {
      const body = bodyForLead();
      delete body[field];
      const res = await request(app).post("/api/follow-ups").set(asUser(tokenOwner)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain(field);
    }
  });

  test("invalid enum values are rejected", async () => {
    const badType = await createForLead(tokenOwner, { type: "FAX" });
    expect(badType.status).toBe(400);

    const badStatus = await createForLead(tokenOwner, { status: "DONE" });
    expect(badStatus.status).toBe(400);
  });

  test("malformed dueAt is rejected", async () => {
    const res = await createForLead(tokenOwner, { dueAt: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("dueAt");
  });

  test("client-supplied companyId, createdBy and completedAt are ignored", async () => {
    const res = await createForLead(tokenOwner, {
      companyId: companyB._id.toString(),
      createdBy: ownerB._id.toString(),
      completedAt: "2020-01-01T00:00:00.000Z",
    });

    expect(res.status).toBe(201);
    const { followup } = res.body.data;
    expect(followup.companyId).toBe(companyA._id.toString());
    expect(followup.createdBy.id).toBe(ownerA._id.toString());
    expect(followup.completedAt).toBeNull();
  });

  test("OWNER, ADMIN, MANAGER and SALES can all create follow-ups", async () => {
    for (const token of [tokenOwner, tokenAdmin, tokenManager, tokenSales]) {
      const res = await createForLead(token);
      expect(res.status).toBe(201);
    }
  });
});

describe("GET /api/follow-ups", () => {
  test("11. user can only view follow-ups from their company", async () => {
    await createForLead(tokenOwner, { subject: "Company A follow-up" });
    await createForLead(tokenOwnerB, {
      leadId: leadB._id.toString(),
      assignedTo: ownerB._id.toString(),
      subject: "Company B follow-up",
    });

    const res = await request(app).get("/api/follow-ups").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe("Company A follow-up");
    expect(res.body.data[0].companyId).toBe(companyA._id.toString());
  });

  test("20. pagination works", async () => {
    for (let i = 0; i < 12; i += 1) {
      await createForLead(tokenOwner, {
        subject: `Follow-up ${i + 1}`,
        dueAt: new Date(Date.UTC(2026, 9, 1 + i, 10)).toISOString(),
      });
    }

    const page1 = await request(app).get("/api/follow-ups?page=1&limit=10").set(asUser(tokenOwner));
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(10);
    expect(page1.body.pagination).toEqual({ page: 1, limit: 10, total: 12, totalPages: 2 });

    const page2 = await request(app).get("/api/follow-ups?page=2&limit=10").set(asUser(tokenOwner));
    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.pagination.page).toBe(2);

    const invalid = await request(app).get("/api/follow-ups?page=0").set(asUser(tokenOwner));
    expect(invalid.status).toBe(400);
  });

  test("lists sorted by dueAt ascending", async () => {
    await createForLead(tokenOwner, { subject: "Later", dueAt: "2026-11-20T10:00:00.000Z" });
    await createForLead(tokenOwner, { subject: "Sooner", dueAt: "2026-10-05T10:00:00.000Z" });

    const res = await request(app).get("/api/follow-ups").set(asUser(tokenOwner));

    expect(res.body.data.map((f) => f.subject)).toEqual(["Sooner", "Later"]);
  });

  test("21. status filtering works", async () => {
    await createForLead(tokenOwner, { subject: "Pending one" });
    const completed = await createForLead(tokenOwner, { subject: "Completed one" });
    await request(app)
      .put(`/api/follow-ups/${completed.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "COMPLETED" });

    const res = await request(app)
      .get("/api/follow-ups?status=COMPLETED")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe("Completed one");

    const pending = await request(app).get("/api/follow-ups?status=PENDING").set(asUser(tokenOwner));
    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.data[0].subject).toBe("Pending one");

    const bad = await request(app).get("/api/follow-ups?status=BOGUS").set(asUser(tokenOwner));
    expect(bad.status).toBe(400);
  });

  test("22. assigned-user filtering works", async () => {
    const otherSales = await createUser({ companyId: companyA._id, role: "SALES" });
    await createForLead(tokenOwner, { assignedTo: salesA._id.toString(), subject: "For salesA" });
    await createForLead(tokenOwner, {
      assignedTo: otherSales._id.toString(),
      subject: "For other sales",
    });

    const res = await request(app)
      .get(`/api/follow-ups?assignedTo=${salesA._id.toString()}`)
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe("For salesA");
  });

  test("23. type filtering works", async () => {
    await createForLead(tokenOwner, { type: "CALL", subject: "A call" });
    await createForLead(tokenOwner, { type: "EMAIL", subject: "An email" });

    const res = await request(app).get("/api/follow-ups?type=EMAIL").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe("An email");
    expect(res.body.data[0].type).toBe("EMAIL");
  });

  test("24. lead/client filtering works", async () => {
    await createForLead(tokenOwner, { subject: "Lead follow-up" });
    await createForClient(tokenOwner, { subject: "Client follow-up" });

    const byLead = await request(app)
      .get(`/api/follow-ups?leadId=${leadA._id.toString()}`)
      .set(asUser(tokenOwner));
    expect(byLead.status).toBe(200);
    expect(byLead.body.data).toHaveLength(1);
    expect(byLead.body.data[0].subject).toBe("Lead follow-up");

    const byClient = await request(app)
      .get(`/api/follow-ups?clientId=${clientA._id.toString()}`)
      .set(asUser(tokenOwner));
    expect(byClient.status).toBe(200);
    expect(byClient.body.data).toHaveLength(1);
    expect(byClient.body.data[0].subject).toBe("Client follow-up");
  });

  test("25. date filtering works and malformed dates are rejected", async () => {
    await createForLead(tokenOwner, { subject: "In range", dueAt: "2026-10-15T10:00:00.000Z" });
    await createForLead(tokenOwner, { subject: "Before", dueAt: "2026-09-20T10:00:00.000Z" });
    await createForLead(tokenOwner, { subject: "After", dueAt: "2026-11-05T10:00:00.000Z" });

    const res = await request(app)
      .get("/api/follow-ups?from=2026-10-01&to=2026-10-31")
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe("In range");

    const fromOnly = await request(app)
      .get("/api/follow-ups?from=2026-10-01")
      .set(asUser(tokenOwner));
    expect(fromOnly.body.data.map((f) => f.subject).sort()).toEqual(["After", "In range"]);

    const bad = await request(app)
      .get("/api/follow-ups?from=not-a-date")
      .set(asUser(tokenOwner));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].field).toBe("from");
  });

  test("populated lead/client/assignedTo never expose passwordHash", async () => {
    await createForLead(tokenOwner);
    await createForClient(tokenOwner);

    const res = await request(app).get("/api/follow-ups").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].assignedTo.email).toBe(salesA.email);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("passwordResetTokenHash");
  });
});

describe("GET /api/follow-ups/:id", () => {
  test("12. user cannot view another company's follow-up (404, no leak)", async () => {
    const created = await createForLead(tokenOwnerB, {
      leadId: leadB._id.toString(),
      assignedTo: ownerB._id.toString(),
    });
    const id = created.body.data.followup.id;

    const res = await request(app).get(`/api/follow-ups/${id}`).set(asUser(tokenOwner));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Follow-up not found");
  });

  test("returns the follow-up with populated refs", async () => {
    const created = await createForLead(tokenOwner);

    const res = await request(app)
      .get(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenAdmin));

    expect(res.status).toBe(200);
    const { followup } = res.body.data;
    expect(followup.lead.name).toBe("Lead A");
    expect(followup.assignedTo.email).toBe(salesA.email);
    expect(followup.createdBy.id).toBe(ownerA._id.toString());
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  test("malformed id is a 400, missing id is a 404", async () => {
    const bad = await request(app).get("/api/follow-ups/not-an-id").set(asUser(tokenOwner));
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .get("/api/follow-ups/000000000000000000000000")
      .set(asUser(tokenOwner));
    expect(missing.status).toBe(404);
  });
});

describe("PUT /api/follow-ups/:id", () => {
  test("13. user can update their company's follow-up", async () => {
    const created = await createForLead(tokenOwner);

    const res = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenSales))
      .send({ subject: "Updated subject", type: "WHATSAPP", dueAt: "2026-10-20T09:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.data.followup.subject).toBe("Updated subject");
    expect(res.body.data.followup.type).toBe("WHATSAPP");
    expect(res.body.data.followup.dueAt).toBe("2026-10-20T09:00:00.000Z");
  });

  test("14. user cannot update another company's follow-up", async () => {
    const created = await createForLead(tokenOwnerB, {
      leadId: leadB._id.toString(),
      assignedTo: ownerB._id.toString(),
    });

    const res = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ subject: "Hijacked" });

    expect(res.status).toBe(404);
    const check = await FollowUp.findById(created.body.data.followup.id);
    expect(check.subject).not.toBe("Hijacked");
  });

  test("cannot update companyId or createdBy", async () => {
    const created = await createForLead(tokenOwner);

    const res = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({
        companyId: companyB._id.toString(),
        createdBy: ownerB._id.toString(),
        subject: "Still fine",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.followup.companyId).toBe(companyA._id.toString());
    expect(res.body.data.followup.createdBy.id).toBe(ownerA._id.toString());
  });

  test("switching target from lead to client keeps exactly one", async () => {
    const created = await createForLead(tokenOwner);

    const res = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ clientId: clientA._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data.followup.clientId).toBe(clientA._id.toString());
    expect(res.body.data.followup.leadId).toBeNull();
  });

  test("updating target with both leadId and clientId is rejected", async () => {
    const created = await createForLead(tokenOwner);

    const res = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ leadId: leadA._id.toString(), clientId: clientA._id.toString() });

    expect(res.status).toBe(400);
  });

  test("cross-company target or assignee on update is rejected", async () => {
    const created = await createForLead(tokenOwner);

    const badLead = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ leadId: leadB._id.toString() });
    expect(badLead.status).toBe(400);

    const badUser = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ assignedTo: ownerB._id.toString() });
    expect(badUser.status).toBe(400);

    const inactive = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ assignedTo: salesInactiveA._id.toString() });
    expect(inactive.status).toBe(400);
  });

  test("17. COMPLETED sets completedAt automatically", async () => {
    const created = await createForLead(tokenOwner);

    const res = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(200);
    expect(res.body.data.followup.status).toBe("COMPLETED");
    expect(res.body.data.followup.completedAt).toBeTruthy();
    expect(new Date(res.body.data.followup.completedAt).getTime()).toBeGreaterThan(
      Date.now() - 60000
    );
  });

  test("18. changing COMPLETED back to PENDING clears completedAt", async () => {
    const created = await createForLead(tokenOwner);
    const id = created.body.data.followup.id;

    await request(app).put(`/api/follow-ups/${id}`).set(asUser(tokenOwner)).send({ status: "COMPLETED" });
    const res = await request(app)
      .put(`/api/follow-ups/${id}`)
      .set(asUser(tokenOwner))
      .send({ status: "PENDING" });

    expect(res.status).toBe(200);
    expect(res.body.data.followup.status).toBe("PENDING");
    expect(res.body.data.followup.completedAt).toBeNull();
  });

  test("19. CANCELLED clears completedAt", async () => {
    const created = await createForLead(tokenOwner);
    const id = created.body.data.followup.id;

    await request(app).put(`/api/follow-ups/${id}`).set(asUser(tokenOwner)).send({ status: "COMPLETED" });
    const res = await request(app)
      .put(`/api/follow-ups/${id}`)
      .set(asUser(tokenOwner))
      .send({ status: "CANCELLED" });

    expect(res.status).toBe(200);
    expect(res.body.data.followup.status).toBe("CANCELLED");
    expect(res.body.data.followup.completedAt).toBeNull();
  });

  test("client-supplied completedAt is ignored", async () => {
    const created = await createForLead(tokenOwner);

    const res = await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ status: "COMPLETED", completedAt: "2020-01-01T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(new Date(res.body.data.followup.completedAt).getTime()).toBeGreaterThan(
      Date.now() - 60000
    );
  });
});

describe("DELETE /api/follow-ups/:id", () => {
  test("15. authorized users (OWNER, ADMIN) can delete a follow-up", async () => {
    for (const token of [tokenOwner, tokenAdmin]) {
      const created = await createForLead(token);
      const res = await request(app)
        .delete(`/api/follow-ups/${created.body.data.followup.id}`)
        .set(asUser(token));
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Follow-up deleted successfully");
    }
    expect(await FollowUp.countDocuments({})).toBe(0);
  });

  test("16. unauthorized roles (MANAGER, SALES) cannot delete a follow-up", async () => {
    for (const token of [tokenManager, tokenSales]) {
      const created = await createForLead(tokenOwner);
      const res = await request(app)
        .delete(`/api/follow-ups/${created.body.data.followup.id}`)
        .set(asUser(token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect(await FollowUp.countDocuments({})).toBe(2);
  });

  test("cannot delete another company's follow-up", async () => {
    const created = await createForLead(tokenOwnerB, {
      leadId: leadB._id.toString(),
      assignedTo: ownerB._id.toString(),
    });

    const res = await request(app)
      .delete(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner));

    expect(res.status).toBe(404);
    expect(await FollowUp.countDocuments({})).toBe(1);
  });
});

describe("activity logs", () => {
  test("26. creating a follow-up records FOLLOW_UP_CREATED", async () => {
    const res = await createForLead(tokenOwner, { subject: "Audited follow-up" });

    const log = await ActivityLog.findOne({ action: "FOLLOW_UP_CREATED" });
    expect(log).toBeTruthy();
    expect(log.entityType).toBe("FOLLOW_UP");
    expect(String(log.entityId)).toBe(res.body.data.followup.id);
    expect(String(log.companyId)).toBe(companyA._id.toString());
    expect(String(log.performedBy)).toBe(ownerA._id.toString());
    expect(log.description).toContain("Audited follow-up");
    expect(log.metadata.leadId).toBe(leadA._id.toString());
  });

  test("updating a follow-up records FOLLOW_UP_UPDATED", async () => {
    const created = await createForLead(tokenOwner);
    await request(app)
      .put(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner))
      .send({ subject: "Renamed subject" });

    const log = await ActivityLog.findOne({ action: "FOLLOW_UP_UPDATED" });
    expect(log).toBeTruthy();
    expect(log.entityType).toBe("FOLLOW_UP");
    expect(log.metadata.fields).toContain("subject");
  });

  test("completing records FOLLOW_UP_COMPLETED and cancelling records FOLLOW_UP_CANCELLED", async () => {
    const created = await createForLead(tokenOwner);
    const id = created.body.data.followup.id;

    await request(app).put(`/api/follow-ups/${id}`).set(asUser(tokenOwner)).send({ status: "COMPLETED" });
    const completedLog = await ActivityLog.findOne({ action: "FOLLOW_UP_COMPLETED" });
    expect(completedLog).toBeTruthy();
    expect(completedLog.metadata.status).toBe("COMPLETED");

    await request(app).put(`/api/follow-ups/${id}`).set(asUser(tokenOwner)).send({ status: "CANCELLED" });
    const cancelledLog = await ActivityLog.findOne({ action: "FOLLOW_UP_CANCELLED" });
    expect(cancelledLog).toBeTruthy();
    expect(cancelledLog.metadata.status).toBe("CANCELLED");
  });

  test("deleting records FOLLOW_UP_DELETED", async () => {
    const created = await createForLead(tokenOwner, { subject: "Doomed follow-up" });
    await request(app)
      .delete(`/api/follow-ups/${created.body.data.followup.id}`)
      .set(asUser(tokenOwner));

    const log = await ActivityLog.findOne({ action: "FOLLOW_UP_DELETED" });
    expect(log).toBeTruthy();
    expect(log.entityType).toBe("FOLLOW_UP");
    expect(log.metadata.subject).toBe("Doomed follow-up");
    expect(String(log.companyId)).toBe(companyA._id.toString());
  });

  test("failed operations record no follow-up activity", async () => {
    const crossCompany = await createForLead(tokenOwner, { leadId: leadB._id.toString() });
    expect(crossCompany.status).toBe(400);

    const reverse = await createForLead(tokenOwnerB, {
      leadId: leadA._id.toString(),
      assignedTo: ownerB._id.toString(),
    });
    expect(reverse.status).toBe(400);

    expect(await ActivityLog.countDocuments({})).toBe(0);
    expect(await FollowUp.countDocuments({})).toBe(0);
  });
});

describe("27. password safety", () => {
  test("no follow-up response ever contains passwordHash", async () => {
    const created = await createForLead(tokenOwner);
    const id = created.body.data.followup.id;

    const responses = [
      created,
      await request(app).get("/api/follow-ups").set(asUser(tokenOwner)),
      await request(app).get(`/api/follow-ups/${id}`).set(asUser(tokenOwner)),
      await request(app).put(`/api/follow-ups/${id}`).set(asUser(tokenOwner)).send({ subject: "Safe" }),
    ];

    for (const res of responses) {
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    }
  });
});
