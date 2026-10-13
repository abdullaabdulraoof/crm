const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv(); // MUST run before requiring the app

const request = require("supertest");
const app = require("../../src/app");
const Client = require("../../src/modules/client/client.model");
const ActivityLog = require("../../src/modules/activity-logs/activityLog.model");
const {
  createCompanyWithOwner,
  createUser,
  createClient,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

const VALID_CLIENT = {
  name: "Zeta Traders",
  phoneNumber: "9876543210",
  email: "zeta@example.com",
  address: "12 Market Road",
  gstNo: "29ABCDE1234F1Z5",
  clientType: "BUSINESS",
  notes: "Key account",
};

let companyA;
let ownerA;
let managerA;
let salesA;
let tokenOwner;
let tokenManager;
let tokenSales;

let companyB;
let ownerB;
let tokenOwnerB;

let activeClient;
let inactiveClient;

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();

  const a = await createCompanyWithOwner();
  companyA = a.company;
  ownerA = a.owner;
  managerA = await createUser({ companyId: companyA._id, role: "MANAGER" });
  salesA = await createUser({ companyId: companyA._id, role: "SALES" });

  tokenOwner = signToken(ownerA);
  tokenManager = signToken(managerA);
  tokenSales = signToken(salesA);

  const b = await createCompanyWithOwner();
  companyB = b.company;
  ownerB = b.owner;
  tokenOwnerB = signToken(ownerB);

  activeClient = await createClient({
    companyId: companyA._id,
    createdBy: ownerA._id,
    name: "Zeta Traders",
    phoneNumber: "1111111111",
    email: "zeta@example.com",
    notes: "internal notes",
  });
  inactiveClient = await createClient({
    companyId: companyA._id,
    createdBy: ownerA._id,
    name: "Archived Co",
    isActive: false,
  });
  await createClient({ companyId: companyB._id, createdBy: ownerB._id, name: "Other Co" });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("POST /api/clients", () => {
  test("unauthenticated users cannot create a client", async () => {
    const res = await request(app).post("/api/clients").send(VALID_CLIENT);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("a SALES user can create a client", async () => {
    const res = await request(app)
      .post("/api/clients")
      .set(asUser(tokenSales))
      .send(VALID_CLIENT);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Client created successfully");

    const { client } = res.body.data;
    expect(client.name).toBe("Zeta Traders");
    expect(client.phoneNumber).toBe("9876543210");
    expect(client.email).toBe("zeta@example.com");
    expect(client.address).toBe("12 Market Road");
    expect(client.gstNo).toBe("29ABCDE1234F1Z5");
    expect(client.clientType).toBe("BUSINESS");
    expect(client.notes).toBe("Key account");
    expect(client.isActive).toBe(true);
    // companyId/createdBy are internal and never leave the server.
    expect(client.companyId).toBeUndefined();
    expect(client.createdBy).toBeUndefined();
  });

  test("OWNER and MANAGER can also create clients", async () => {
    for (const token of [tokenOwner, tokenManager]) {
      const res = await request(app).post("/api/clients").set(asUser(token)).send(VALID_CLIENT);
      expect(res.status).toBe(201);
    }
  });

  test("defaults clientType to INDIVIDUAL and email is trimmed/lowercased", async () => {
    const res = await request(app)
      .post("/api/clients")
      .set(asUser(tokenOwner))
      .send({ name: "Jane Doe", email: "  Jane@Example.COM  " });

    expect(res.status).toBe(201);
    expect(res.body.data.client.clientType).toBe("INDIVIDUAL");
    expect(res.body.data.client.email).toBe("jane@example.com");
  });

  test("companyId, createdBy and isActive from the frontend are ignored", async () => {
    const res = await request(app)
      .post("/api/clients")
      .set(asUser(tokenOwner))
      .send({
        ...VALID_CLIENT,
        companyId: companyB._id.toString(),
        createdBy: ownerB._id.toString(),
        isActive: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.client.isActive).toBe(true);

    // Always created under the actor's company, never the body's companyId.
    const createdId = res.body.data.client.id;
    const ownList = await request(app).get("/api/clients").set(asUser(tokenOwner));
    expect(ownList.body.data.some((c) => c.id === createdId)).toBe(true);

    const otherList = await request(app).get("/api/clients").set(asUser(tokenOwnerB));
    expect(otherList.body.data.some((c) => c.id === createdId)).toBe(false);
  });

  test("validates required fields, email format and clientType enum", async () => {
    const noName = await request(app).post("/api/clients").set(asUser(tokenOwner)).send({});
    expect(noName.status).toBe(400);
    expect(noName.body.error.details.some((e) => e.field === "name")).toBe(true);

    const badEmail = await request(app)
      .post("/api/clients")
      .set(asUser(tokenOwner))
      .send({ name: "Jane Doe", email: "not-an-email" });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.details.some((e) => e.field === "email")).toBe(true);

    const badType = await request(app)
      .post("/api/clients")
      .set(asUser(tokenOwner))
      .send({ name: "Jane Doe", clientType: "COMPANY" });
    expect(badType.status).toBe(400);
    expect(badType.body.error.details.some((e) => e.field === "clientType")).toBe(true);
  });

  test("records a CLIENT_CREATED activity entry", async () => {
    await request(app).post("/api/clients").set(asUser(tokenOwner)).send(VALID_CLIENT);

    const log = await ActivityLog.findOne({ companyId: companyA._id, action: "CLIENT_CREATED" });
    expect(log).not.toBeNull();
    expect(log.entityType).toBe("CLIENT");
  });
});

describe("GET /api/clients", () => {
  test("unauthenticated users cannot list clients", async () => {
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("returns a paginated, company-scoped list of active clients", async () => {
    const res = await request(app).get("/api/clients").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(activeClient._id.toString());
    expect(res.body.data[0].email).toBe("zeta@example.com");
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });

  test("never exposes passwordHash, companyId or other-company clients", async () => {
    await createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Alpha Co" });

    const res = await request(app).get("/api/clients").set(asUser(tokenOwner));

    const names = res.body.data.map((c) => c.name);
    expect(names).toContain("Alpha Co");
    expect(res.body.data.some((c) => c.name === "Archived Co")).toBe(false);
    expect(res.body.data.some((c) => c.name === "Other Co")).toBe(false);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("companyId");
  });

  test("sorts by name ascending by default", async () => {
    await createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Alpha Co" });
    await createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Mango Co" });

    const res = await request(app).get("/api/clients").set(asUser(tokenOwner));
    const names = res.body.data.map((c) => c.name);

    expect(names).toEqual(["Alpha Co", "Mango Co", "Zeta Traders"]);
  });

  test("searches by name, email and phone number", async () => {
    await createClient({
      companyId: companyA._id,
      createdBy: ownerA._id,
      name: "Beta Retail",
      email: "hello@beta.com",
      phoneNumber: "5550001111",
    });

    const byName = await request(app).get("/api/clients?search=beta").set(asUser(tokenOwner));
    expect(byName.body.data).toHaveLength(1);
    expect(byName.body.data[0].name).toBe("Beta Retail");

    const byEmail = await request(app).get("/api/clients?search=hello@").set(asUser(tokenOwner));
    expect(byEmail.body.data).toHaveLength(1);

    const byPhone = await request(app).get("/api/clients?search=5550001").set(asUser(tokenOwner));
    expect(byPhone.body.data).toHaveLength(1);
  });

  test("filters by clientType", async () => {
    await createClient({
      companyId: companyA._id,
      createdBy: ownerA._id,
      name: "Biz Co",
      clientType: "BUSINESS",
    });

    const res = await request(app).get("/api/clients?clientType=BUSINESS").set(asUser(tokenOwner));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Biz Co");

    const bad = await request(app).get("/api/clients?clientType=COMPANY").set(asUser(tokenOwner));
    expect(bad.status).toBe(400);
  });

  test("paginates with page and limit", async () => {
    await createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Bravo Co" });
    await createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Charlie Co" });

    const first = await request(app).get("/api/clients?page=1&limit=2").set(asUser(tokenOwner));
    expect(first.body.data).toHaveLength(2);
    expect(first.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const second = await request(app).get("/api/clients?page=2&limit=2").set(asUser(tokenOwner));
    expect(second.body.data).toHaveLength(1);
  });

  test("another company sees only its own clients", async () => {
    const res = await request(app).get("/api/clients").set(asUser(tokenOwnerB));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Other Co");
  });
});

describe("GET /api/clients/options", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/api/clients/options");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("returns the picker shape and hides private fields", async () => {
    const res = await request(app).get("/api/clients/options").set(asUser(tokenSales));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.clients).toEqual([
      {
        id: activeClient._id.toString(),
        name: "Zeta Traders",
        phoneNumber: "1111111111",
        email: "zeta@example.com",
      },
    ]);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("internal notes");
    expect(raw).not.toContain("address");
  });
});

describe("GET /api/clients/:id", () => {
  test("returns a single client scoped to the company", async () => {
    const res = await request(app)
      .get(`/api/clients/${activeClient._id}`)
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.data.client.id).toBe(activeClient._id.toString());
    expect(res.body.data.client.name).toBe("Zeta Traders");
  });

  test("returns 404 for another company's client", async () => {
    const res = await request(app)
      .get(`/api/clients/${activeClient._id}`)
      .set(asUser(tokenOwnerB));
    expect(res.status).toBe(404);
  });

  test("returns 400 for a malformed id", async () => {
    const res = await request(app).get("/api/clients/not-an-id").set(asUser(tokenOwner));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/clients/:id", () => {
  test("updates the documented fields and normalizes email", async () => {
    const res = await request(app)
      .put(`/api/clients/${activeClient._id}`)
      .set(asUser(tokenSales))
      .send({ name: "Zeta Traders Ltd", email: " New@Example.COM ", clientType: "BUSINESS" });

    expect(res.status).toBe(200);
    expect(res.body.data.client.name).toBe("Zeta Traders Ltd");
    expect(res.body.data.client.email).toBe("new@example.com");
    expect(res.body.data.client.clientType).toBe("BUSINESS");
  });

  test("clears gstNo when an empty string is sent", async () => {
    const withGst = await createClient({
      companyId: companyA._id,
      createdBy: ownerA._id,
      name: "GST Co",
      gstNo: "29ABCDE1234F1Z5",
    });

    const res = await request(app)
      .put(`/api/clients/${withGst._id}`)
      .set(asUser(tokenOwner))
      .send({ gstNo: "" });

    expect(res.status).toBe(200);
    expect(res.body.data.client.gstNo).toBeNull();
  });

  test("cannot update another company's client", async () => {
    const res = await request(app)
      .put(`/api/clients/${activeClient._id}`)
      .set(asUser(tokenOwnerB))
      .send({ name: "Hijacked" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/clients/:id", () => {
  test("SALES and MANAGER cannot archive clients", async () => {
    for (const token of [tokenSales, tokenManager]) {
      const res = await request(app).delete(`/api/clients/${activeClient._id}`).set(asUser(token));
      expect(res.status).toBe(403);
    }
  });

  test("OWNER archives the client (soft delete) and it disappears from the list", async () => {
    const res = await request(app)
      .delete(`/api/clients/${activeClient._id}`)
      .set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Client deleted successfully");

    const stored = await Client.findById(activeClient._id);
    expect(stored).not.toBeNull();
    expect(stored.isActive).toBe(false);

    const list = await request(app).get("/api/clients").set(asUser(tokenOwner));
    expect(list.body.data.some((c) => c.id === activeClient._id.toString())).toBe(false);
  });

  test("cannot archive another company's client", async () => {
    const res = await request(app)
      .delete(`/api/clients/${activeClient._id}`)
      .set(asUser(tokenOwnerB));
    expect(res.status).toBe(404);
  });
});
