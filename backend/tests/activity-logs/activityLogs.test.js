const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const ActivityLog = require("../../src/modules/activity-logs/activityLog.model");
const { createCompanyWithOwner, createUser, signToken } = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

let companyA;
let ownerA;
let adminA;
let managerA;
let tokenOwner;
let tokenAdmin;
let tokenManager;
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

  tokenOwner = signToken(ownerA);
  tokenAdmin = signToken(adminA);
  tokenManager = signToken(managerA);

  const b = await createCompanyWithOwner();
  companyB = b.company;
  ownerB = b.owner;
  tokenOwnerB = signToken(ownerB);

  await ActivityLog.create([
    {
      companyId: companyA._id,
      performedBy: adminA._id,
      action: "LEAD_CREATED",
      entityType: "LEAD",
      entityId: companyA._id,
      description: "Created lead Acme",
      metadata: { secret: "not-a-password" },
    },
    {
      companyId: companyA._id,
      performedBy: ownerA._id,
      action: "INVOICE_CREATED",
      entityType: "INVOICE",
      entityId: companyA._id,
      description: "Created invoice INV-2026-0001",
    },
    {
      companyId: companyB._id,
      performedBy: ownerB._id,
      action: "LEAD_CREATED",
      entityType: "LEAD",
      entityId: companyB._id,
      description: "Other company lead",
    },
  ]);
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("GET /api/activity-logs", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/api/activity-logs");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("is restricted to OWNER and ADMIN", async () => {
    const denied = await request(app).get("/api/activity-logs").set(asUser(tokenManager));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  test("returns the company audit trail, newest first, with pagination", async () => {
    const res = await request(app).get("/api/activity-logs").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 2, totalPages: 1 });

    const actions = res.body.data.map((l) => l.action);
    expect(actions).not.toContain("Other company lead");

    for (const log of res.body.data) {
      expect(log).toHaveProperty("id");
      expect(log.performedBy).toHaveProperty("email");
      expect(log.performedBy).not.toHaveProperty("passwordHash");
      expect(log).not.toHaveProperty("companyId");
    }
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  test("filters by action, entityType, performedBy and search", async () => {
    const byAction = await request(app)
      .get("/api/activity-logs")
      .query({ action: "LEAD_CREATED" })
      .set(asUser(tokenOwner));
    expect(byAction.body.data).toHaveLength(1);
    expect(byAction.body.data[0].entityType).toBe("LEAD");

    const byType = await request(app)
      .get("/api/activity-logs")
      .query({ entityType: "INVOICE" })
      .set(asUser(tokenOwner));
    expect(byType.body.data).toHaveLength(1);
    expect(byType.body.data[0].action).toBe("INVOICE_CREATED");

    const byPerformer = await request(app)
      .get("/api/activity-logs")
      .query({ performedBy: String(adminA._id) })
      .set(asUser(tokenOwner));
    expect(byPerformer.body.data).toHaveLength(1);

    const bySearch = await request(app)
      .get("/api/activity-logs")
      .query({ search: "invoice" })
      .set(asUser(tokenOwner));
    expect(bySearch.body.data.map((l) => l.action)).toEqual(["INVOICE_CREATED"]);
  });

  test("filters by createdAt range inclusively", async () => {
    const inRange = await request(app)
      .get("/api/activity-logs")
      .query({ from: "2000-01-01", to: "2999-01-01" })
      .set(asUser(tokenOwner));
    expect(inRange.body.data).toHaveLength(2);

    const outOfRange = await request(app)
      .get("/api/activity-logs")
      .query({ to: "2000-01-01" })
      .set(asUser(tokenOwner));
    expect(outOfRange.body.data).toHaveLength(0);
  });

  test("rejects invalid filters and sort params", async () => {
    const badEntity = await request(app)
      .get("/api/activity-logs")
      .query({ entityType: "WIDGET" })
      .set(asUser(tokenOwner));
    expect(badEntity.status).toBe(400);

    const badPerformer = await request(app)
      .get("/api/activity-logs")
      .query({ performedBy: "nope" })
      .set(asUser(tokenOwner));
    expect(badPerformer.status).toBe(400);

    const badSort = await request(app)
      .get("/api/activity-logs")
      .query({ sortBy: "description" })
      .set(asUser(tokenOwner));
    expect(badSort.status).toBe(400);

    const badRange = await request(app)
      .get("/api/activity-logs")
      .query({ from: "2026-02-01", to: "2026-01-01" })
      .set(asUser(tokenOwner));
    expect(badRange.status).toBe(400);
  });

  test("never leaks another company's activity", async () => {
    const res = await request(app).get("/api/activity-logs").set(asUser(tokenOwnerB));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].description).toBe("Other company lead");
  });
});
