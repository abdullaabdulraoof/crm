const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const Lead = require("../../src/modules/leads/lead.model");
const ActivityLog = require("../../src/modules/activity-logs/activityLog.model");
const {
  createCompanyWithOwner,
  createUser,
  createLead,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

const VALID_LEAD = {
  name: "John Thomas",
  phoneNumber: "9876543210",
  email: "john@example.com",
  source: "WEBSITE",
  status: "NEW",
  notes: "Interested in annual service",
  nextFollowUpAt: "2026-10-10T10:00:00.000Z",
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

describe("POST /api/leads", () => {
  test("unauthenticated users cannot create a lead", async () => {
    const res = await request(app).post("/api/leads").send(VALID_LEAD);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("an authenticated user can create a lead", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenSales))
      .send(VALID_LEAD);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Lead created successfully");

    const { lead } = res.body.data;
    expect(lead.name).toBe("John Thomas");
    expect(lead.phoneNumber).toBe("9876543210");
    expect(lead.email).toBe("john@example.com");
    expect(lead.source).toBe("WEBSITE");
    expect(lead.status).toBe("NEW");
    expect(lead.notes).toBe("Interested in annual service");
    expect(lead.companyId).toBe(companyA._id.toString());
    expect(lead.createdBy).toBe(salesA._id.toString());
    expect(lead.nextFollowUpAt).toBe("2026-10-10T10:00:00.000Z");
  });

  test("OWNER, ADMIN and MANAGER can also create leads", async () => {
    for (const token of [tokenOwner, tokenAdmin, tokenManager]) {
      const res = await request(app).post("/api/leads").set(asUser(token)).send(VALID_LEAD);
      expect(res.status).toBe(201);
    }
  });

  test("email is trimmed and lowercased", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, email: "  John@Example.COM  " });

    expect(res.status).toBe(201);
    expect(res.body.data.lead.email).toBe("john@example.com");
  });

  test("companyId and createdBy from the frontend are ignored", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, companyId: companyB._id.toString(), createdBy: ownerB._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.lead.companyId).toBe(companyA._id.toString());
    expect(res.body.data.lead.createdBy).toBe(ownerA._id.toString());
  });

  test("required fields are validated (name and phoneNumber)", async () => {
    const missingName = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ phoneNumber: "9876543210" });
    expect(missingName.status).toBe(400);
    expect(missingName.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "name" })])
    );

    const missingPhone = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ name: "John Thomas" });
    expect(missingPhone.status).toBe(400);
    expect(missingPhone.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "phoneNumber" })])
    );
  });

  test("invalid enum values are rejected", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, source: "SPAM" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "source" })])
    );
  });

  test("an invalid email is rejected", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "email" })])
    );
  });

  test("assignedTo from another company is rejected", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, assignedTo: ownerB._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "assignedTo",
          message: "assignedTo must be a user of this company",
        }),
      ])
    );
  });

  test("a malformed assignedTo id is rejected", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, assignedTo: "not-an-object-id" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "assignedTo" })])
    );
  });

  test("an invalid nextFollowUpAt date is rejected", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, nextFollowUpAt: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "nextFollowUpAt" })])
    );
  });
});

describe("GET /api/leads", () => {
  beforeEach(async () => {
    await createLead({ companyId: companyA._id, createdBy: ownerA._id, name: "Sorted Lead" });
  });

  test("lists only leads of the authenticated company", async () => {
    const res = await request(app).get("/api/leads").set(asUser(tokenOwner));
    expect(res.status).toBe(200);

    const {
      body: { data: responseLeads },
    } = res;
    expect(responseLeads).toHaveLength(1);
    expect(responseLeads[0].name).toBe("Sorted Lead");
  });

  test("a user from another company never sees this company's leads", async () => {
    const res = await request(app).get("/api/leads").set(asUser(tokenOwnerB));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test("pagination works", async () => {
    // The beforeEach "Sorted Lead" was created before this insert, so it is the
    // newest record. These 12 are all stamped strictly older (strictly
    // increasing createdAt over the insert run), keeping the descending order
    // deterministic regardless of clock precision.
    const base = Date.now();
    await Lead.insertMany(
      Array.from({ length: 12 }, (_, index) => ({
        companyId: companyA._id,
        createdBy: ownerA._id,
        name: `Paginated Lead ${index + 1}`,
        phoneNumber: "9876543210",
        status: "NEW",
        createdAt: new Date(base - (12 - index) * 1000),
      })),
      { timestamps: false }
    );

    const res = await request(app).get("/api/leads?page=2&limit=5").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 13,
      totalPages: 3,
    });

    const names = res.body.data.map((lead) => lead.name);
    expect(names).toEqual([
      "Paginated Lead 8",
      "Paginated Lead 7",
      "Paginated Lead 6",
      "Paginated Lead 5",
      "Paginated Lead 4",
    ]);
  });

  test("invalid pagination values are rejected", async () => {
    const res = await request(app).get("/api/leads?page=0&limit=10").set(asUser(tokenOwner));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("the list never exposes password hashes", async () => {
    const res = await request(app).get("/api/leads").set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("passwordHash");
    expect(res.text).not.toContain('"password"');
  });

  test("assignedTo is populated with name and email only", async () => {
    await createLead({
      companyId: companyA._id,
      createdBy: ownerA._id,
      name: "Assigned Lead",
    });
    const created = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, name: "Assigned To", assignedTo: salesA._id.toString() });

    const res = await request(app).get(`/api/leads/${created.body.data.lead.id}`).set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data.lead.assignedTo).toEqual({
      id: salesA._id.toString(),
      name: salesA.name,
      email: salesA.email,
    });
    expect(res.text).not.toContain("passwordHash");
  });

  test("list quotas are enforced (limit capped at 100)", async () => {
    const res = await request(app).get("/api/leads?limit=500").set(asUser(tokenOwner));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/leads/:id", () => {
  test("an owner can read their own lead", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });
    const res = await request(app).get(`/api/leads/${lead._id}`).set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data.lead.id).toBe(lead._id.toString());
    expect(res.body.data.lead.name).toBe("Isolated Lead");
  });

  test("a user from another company cannot read this lead (404, no leak)", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id, name: "Secret Lead" });

    const crossCompany = await request(app)
      .get(`/api/leads/${lead._id}`)
      .set(asUser(tokenOwnerB));
    expect(crossCompany.status).toBe(404);
    expect(crossCompany.body.error.code).toBe("NOT_FOUND");
    expect(crossCompany.text).not.toContain("Secret Lead");
  });

  test("the cross-company response is identical to a missing record", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    const crossCompany = await request(app)
      .get(`/api/leads/${lead._id}`)
      .set(asUser(tokenOwnerB));
    const missing = await request(app)
      .get("/api/leads/000000000000000000000000")
      .set(asUser(tokenOwnerB));

    expect(crossCompany.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(crossCompany.body).toEqual(missing.body);
  });

  test("a malformed id is a safe 400", async () => {
    const res = await request(app).get("/api/leads/not-an-id").set(asUser(tokenOwner));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
  });
});

describe("PUT /api/leads/:id", () => {
  test("an authorized user can update their company's lead", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    const res = await request(app)
      .put(`/api/leads/${lead._id}`)
      .set(asUser(tokenManager))
      .send({ name: "Updated Name", status: "CONTACTED", assignedTo: salesA._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Lead updated successfully");
    expect(res.body.data.lead.name).toBe("Updated Name");
    expect(res.body.data.lead.status).toBe("CONTACTED");
    expect(res.body.data.lead.assignedTo.id).toBe(salesA._id.toString());
  });

  test("a user cannot update another company's lead", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    const res = await request(app)
      .put(`/api/leads/${lead._id}`)
      .set(asUser(tokenOwnerB))
      .send({ name: "Hijacked" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    const stored = await Lead.findById(lead._id);
    expect(stored.name).toBe("Isolated Lead");
  });

  test("assignedTo from another company is rejected on update", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    const res = await request(app)
      .put(`/api/leads/${lead._id}`)
      .set(asUser(tokenOwner))
      .send({ assignedTo: ownerB._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "assignedTo",
          message: "assignedTo must be a user of this company",
        }),
      ])
    );
  });

  test("companyId and createdBy can never be changed", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    const res = await request(app)
      .put(`/api/leads/${lead._id}`)
      .set(asUser(tokenOwner))
      .send({ companyId: companyB._id.toString(), createdBy: ownerB._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data.lead.companyId).toBe(companyA._id.toString());
    expect(res.body.data.lead.createdBy).toBe(ownerA._id.toString());
    const stored = await Lead.findById(lead._id);
    expect(String(stored.companyId)).toBe(companyA._id.toString());
    expect(String(stored.createdBy)).toBe(ownerA._id.toString());
  });

  test("invalid enum values are rejected on update", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    const res = await request(app)
      .put(`/api/leads/${lead._id}`)
      .set(asUser(tokenOwner))
      .send({ status: "SOMETHING_ELSE" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "status" })])
    );
  });
});

describe("DELETE /api/leads/:id", () => {
  test("the owner can delete a lead", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    const res = await request(app).delete(`/api/leads/${lead._id}`).set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Lead deleted successfully");
    expect(res.body.data.id).toBe(lead._id.toString());
    expect(await Lead.findById(lead._id)).toBeNull();
  });

  test("an admin can delete a lead", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });
    const res = await request(app).delete(`/api/leads/${lead._id}`).set(asUser(tokenAdmin));
    expect(res.status).toBe(200);
  });

  test("SALES and MANAGER cannot delete leads", async () => {
    for (const token of [tokenManager, tokenSales]) {
      const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

      const res = await request(app).delete(`/api/leads/${lead._id}`).set(asUser(token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(await Lead.findById(lead._id)).not.toBeNull();
    }
  });

  test("a user cannot delete another company's lead", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    const res = await request(app).delete(`/api/leads/${lead._id}`).set(asUser(tokenOwnerB));
    expect(res.status).toBe(404);
    expect(await Lead.findById(lead._id)).not.toBeNull();
  });
});

describe("activity logs", () => {
  test("creating a lead records LEAD_CREATED", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, name: "Audited Lead" });

    const log = await ActivityLog.findOne({ entityId: res.body.data.lead.id });
    expect(log).toBeTruthy();
    expect(log.action).toBe("LEAD_CREATED");
    expect(log.entityType).toBe("LEAD");
    expect(String(log.companyId)).toBe(companyA._id.toString());
    expect(String(log.performedBy)).toBe(ownerA._id.toString());
    expect(log.description).toContain("Audited Lead");
  });

  test("updating a lead records LEAD_UPDATED", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    await request(app)
      .put(`/api/leads/${lead._id}`)
      .set(asUser(tokenOwner))
      .send({ status: "QUALIFIED" });

    const log = await ActivityLog.findOne({ entityId: lead._id, action: "LEAD_UPDATED" });
    expect(log).toBeTruthy();
    expect(log.entityType).toBe("LEAD");
    expect(log.metadata.fields).toContain("status");
  });

  test("deleting a lead records LEAD_DELETED", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    await request(app).delete(`/api/leads/${lead._id}`).set(asUser(tokenOwner));

    const log = await ActivityLog.findOne({ entityId: lead._id, action: "LEAD_DELETED" });
    expect(log).toBeTruthy();
    expect(log.entityType).toBe("LEAD");
    expect(log.metadata.name).toBe("Isolated Lead");
  });

  test("failed operations record no lead activity", async () => {
    const lead = await createLead({ companyId: companyA._id, createdBy: ownerA._id });

    await request(app).put(`/api/leads/${lead._id}`).set(asUser(tokenOwnerB)).send({ name: "x" });
    await request(app).post("/api/leads").set(asUser(tokenOwner)).send({ name: "No Phone" });

    expect(await ActivityLog.countDocuments({ entityType: "LEAD" })).toBe(0);
  });
});

describe("no sensitive data", () => {
  test("order of lead fields excludes password and passwordHash", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(asUser(tokenOwner))
      .send({ ...VALID_LEAD, assignedTo: salesA._id.toString() });

    expect(res.status).toBe(201);
    expect(res.text).not.toContain("passwordHash");
    expect(res.text).not.toContain('"password"');
  });
});

describe("assigned-to options", () => {
  test("any authenticated member can list assignable users (no emails)", async () => {
    const res = await request(app).get("/api/users/options").set(asUser(tokenSales));

    expect(res.status).toBe(200);
    const users = res.body.data.users;
    expect(users).toHaveLength(4);
    expect(users.map((user) => user.name).sort()).toEqual(
      ["Test ADMIN", "Test MANAGER", "Test OWNER", "Test SALES"].sort()
    );

    for (const user of users) {
      expect(user).not.toHaveProperty("email");
      expect(user).not.toHaveProperty("passwordHash");
    }
  });

  test("assignable users are scoped to the actor's company", async () => {
    const res = await request(app).get("/api/users/options").set(asUser(tokenOwnerB));
    const users = res.body.data.users;
expect(users.map((user) => user.id)).toEqual([ownerB._id.toString()]);
  });
});
