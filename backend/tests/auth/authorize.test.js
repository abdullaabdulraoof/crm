const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const express = require("express");
const request = require("supertest");
const authenticate = require("../../src/common/middleware/authenticate");
const authorize = require("../../src/common/middleware/authorize");
const errorHandler = require("../../src/common/middleware/errorHandler");
const { createCompanyWithOwner, createUser, signToken } = require("../helpers/factories");

// A protected route built exactly the way future feature routes will be.
const buildApp = () => {
  const protectedApp = express();
  protectedApp.use(express.json());
  protectedApp.get(
    "/owner-only",
    authenticate,
    authorize("OWNER"),
    (req, res) => res.status(200).json({ success: true, role: req.user.role })
  );
  protectedApp.get(
    "/management-only",
    authenticate,
    authorize("OWNER", "ADMIN"),
    (req, res) => res.status(200).json({ success: true, role: req.user.role })
  );
  protectedApp.get(
    "/no-roles-configured",
    authenticate,
    authorize(),
    (req, res) => res.status(200).json({ success: true, role: req.user.role })
  );
  protectedApp.use(errorHandler);
  return protectedApp;
};

let protectedApp;
let company;
let owner;
let admin;
let manager;
let sales;

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
  protectedApp = buildApp();
  const created = await createCompanyWithOwner();
  company = created.company;
  owner = created.owner;
  admin = await createUser({ companyId: company._id, role: "ADMIN" });
  manager = await createUser({ companyId: company._id, role: "MANAGER" });
  sales = await createUser({ companyId: company._id, role: "SALES" });
});

afterAll(async () => {
  await disconnectTestDb();
});

const get = (path, user) =>
  request(protectedApp).get(path).set("Authorization", `Bearer ${signToken(user)}`);

describe("authorize() middleware", () => {
  test("401 for unauthenticated requests", async () => {
    const res = await request(protectedApp).get("/owner-only");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("OWNER can access an OWNER-only route", async () => {
    const res = await get("/owner-only", owner);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("OWNER");
  });

  test("SALES cannot access an OWNER-only operation", async () => {
    const res = await get("/owner-only", sales);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.success).toBe(false);
  });

  test("MANAGER and ADMIN are also denied OWNER-only routes", async () => {
    expect((await get("/owner-only", manager)).status).toBe(403);
    expect((await get("/owner-only", admin)).status).toBe(403);
  });

  test("multiple permitted roles are honored", async () => {
    expect((await get("/management-only", owner)).status).toBe(200);
    expect((await get("/management-only", admin)).status).toBe(200);
    expect((await get("/management-only", manager)).status).toBe(403);
    expect((await get("/management-only", sales)).status).toBe(403);
  });

  test("fails closed when no roles are configured", async () => {
    const res = await get("/no-roles-configured", owner);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
