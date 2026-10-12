const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const express = require("express");
const request = require("supertest");
const authenticate = require("../../src/common/middleware/authenticate");
const errorHandler = require("../../src/common/middleware/errorHandler");
const usersService = require("../../src/modules/users/users.service");
const Lead = require("../../src/modules/leads/lead.model");
const { findByCompanyOr404, scopedQuery } = require("../../src/common/utils/scope");
const { createCompanyWithOwner, createLead, signToken } = require("../helpers/factories");

// Routes shaped like future feature routes: company scope always comes from req.user.
const buildApp = () => {
  const tenantApp = express();
  tenantApp.use(express.json());

  tenantApp.get("/tenant/leads/:id", authenticate, async (req, res, next) => {
    try {
      const lead = await findByCompanyOr404(
        Lead,
        req.user.companyId,
        req.params.id,
        {},
        "Resource not found"
      );
      res.json({ success: true, data: { id: String(lead._id), name: lead.name } });
    } catch (err) {
      next(err);
    }
  });

  tenantApp.get("/tenant/leads", authenticate, async (req, res, next) => {
    try {
      const leads = await Lead.find(scopedQuery(req.user.companyId));
      res.json({
        success: true,
        data: leads.map((lead) => ({ id: String(lead._id), name: lead.name })),
      });
    } catch (err) {
      next(err);
    }
  });

  tenantApp.get("/tenant/users/:id", authenticate, async (req, res, next) => {
    try {
      const user = await usersService.getTargetUser(req.user, req.params.id);
      res.json({ success: true, data: { id: String(user._id), email: user.email } });
    } catch (err) {
      next(err);
    }
  });

  tenantApp.use(errorHandler);
  return tenantApp;
};

let tenantApp;
let companyA;
let ownerA;
let tokenA;
let companyB;
let ownerB;
let tokenB;
let leadA;
let leadB;

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
  tenantApp = buildApp();

  const a = await createCompanyWithOwner("OWNER", { name: "Alice A" });
  companyA = a.company;
  ownerA = a.owner;
  tokenA = signToken(ownerA);

  const b = await createCompanyWithOwner("OWNER", { name: "Bob B" });
  companyB = b.company;
  ownerB = b.owner;
  tokenB = signToken(ownerB);

  leadA = await createLead({ companyId: companyA._id, createdBy: ownerA._id, name: "Alpha Lead" });
  leadB = await createLead({ companyId: companyB._id, createdBy: ownerB._id, name: "Beta Lead" });
});

afterAll(async () => {
  await disconnectTestDb();
});

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

describe("multi-company data isolation", () => {
  test("a user from company B cannot read company A's lead", async () => {
    const res = await request(tenantApp)
      .get(`/tenant/leads/${leadA._id}`)
      .set(asUser(tokenB));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.text).not.toContain("Alpha Lead");
    expect(res.text).not.toContain(companyA._id.toString());
  });

  test("the cross-company response is identical to a genuinely missing record", async () => {
    const crossCompany = await request(tenantApp)
      .get(`/tenant/leads/${leadA._id}`)
      .set(asUser(tokenB));
    const missing = await request(tenantApp)
      .get("/tenant/leads/000000000000000000000000")
      .set(asUser(tokenB));

    expect(crossCompany.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(crossCompany.body).toEqual(missing.body);
  });

  test("the owner can read their own lead", async () => {
    const res = await request(tenantApp)
      .get(`/tenant/leads/${leadA._id}`)
      .set(asUser(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Alpha Lead");
  });

  test("malformed ids are a safe 400, not a 500", async () => {
    const res = await request(tenantApp)
      .get("/tenant/leads/not-an-id")
      .set(asUser(tokenA));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
    expect(res.text).not.toContain("CastError");
    expect(res.body).not.toHaveProperty("stack");
  });

  test("list queries only return records of the authenticated company", async () => {
    const listA = await request(tenantApp).get("/tenant/leads").set(asUser(tokenA));
    const listB = await request(tenantApp).get("/tenant/leads").set(asUser(tokenB));

    expect(listA.status).toBe(200);
    expect(listA.body.data.map((l) => l.name)).toEqual(["Alpha Lead"]);
    expect(listB.body.data.map((l) => l.name)).toEqual(["Beta Lead"]);
  });

  test("targeted lookups of another company's user return 404 without leaking data", async () => {
    const res = await request(tenantApp)
      .get(`/tenant/users/${ownerA._id}`)
      .set(asUser(tokenB));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.text).not.toContain(ownerA.email);
  });

  test("service-layer role changes cannot reach a user of another company", async () => {
    const actorB = {
      id: String(ownerB._id),
      companyId: String(companyB._id),
      role: "OWNER",
      name: ownerB.name,
      email: ownerB.email,
      isActive: true,
    };

    await expect(
      usersService.updateUserRole(actorB, String(ownerA._id), "SALES")
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(
      usersService.setUserActiveState(actorB, String(ownerA._id), false)
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(
      usersService.transferOwnership(actorB, String(ownerA._id))
    ).rejects.toMatchObject({ statusCode: 404 });

    const storedOwnerA = await usersService.getTargetUser(
      {
        id: String(ownerA._id),
        companyId: String(companyA._id),
        role: "OWNER",
      },
      String(ownerA._id)
    );
    expect(storedOwnerA.role).toBe("OWNER");
    expect(storedOwnerA.isActive).toBe(true);
  });
});
