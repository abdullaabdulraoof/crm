const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv(); // MUST run before requiring the app

const request = require("supertest");
const app = require("../../src/app");
const { createCompanyWithOwner, createUser, createClient, signToken } = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

let companyA;
let ownerA;
let tokenOwner;
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
  tokenOwner = signToken(ownerA);

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
    name: "Inactive Co",
    isActive: false,
  });
  await createClient({ companyId: companyB._id, createdBy: ownerB._id, name: "Other Co" });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("GET /api/clients", () => {
  test("unauthenticated users cannot list clients", async () => {
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("returns only active clients of the actor's company", async () => {
    const res = await request(app).get("/api/clients").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.clients).toHaveLength(1);
    expect(res.body.data.clients[0]).toEqual({
      id: activeClient._id.toString(),
      name: "Zeta Traders",
      phoneNumber: "1111111111",
    });
  });

  test("sorted by name and never exposes private client fields", async () => {
    await createClient({ companyId: companyA._id, createdBy: ownerA._id, name: "Alpha Co" });

    const res = await request(app).get("/api/clients").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    const names = res.body.data.clients.map((c) => c.name);
    expect(names).toEqual([...names].sort());
    expect(res.body.data.clients.some((c) => c.name === "Inactive Co")).toBe(false);
    expect(res.body.data.clients.some((c) => c.name === "Other Co")).toBe(false);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("zeta@example.com");
    expect(raw).not.toContain("internal notes");
    expect(raw).not.toContain("companyId");
    expect(raw).not.toContain("passwordHash");
  });

  test("another company sees only its own clients", async () => {
    const res = await request(app).get("/api/clients").set(asUser(tokenOwnerB));

    expect(res.status).toBe(200);
    expect(res.body.data.clients).toHaveLength(1);
    expect(res.body.data.clients[0].name).toBe("Other Co");
  });
});
