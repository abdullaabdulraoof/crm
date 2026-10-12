const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const User = require("../../src/modules/user/user.model");
const ActivityLog = require("../../src/modules/activity-logs/activityLog.model");
const { comparePassword } = require("../../src/common/utils/password");
const {
  TEST_PASSWORD,
  uniqueEmail,
  createCompanyWithOwner,
  createUser,
  signToken,
} = require("../helpers/factories");

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

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

describe("access control", () => {
  test("management endpoints require a token", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("MANAGER and SALES are denied every management endpoint", async () => {
    for (const token of [tokenManager, tokenSales]) {
      const responses = [
        await request(app).get("/api/users").set(asUser(token)),
        await request(app)
          .post("/api/users")
          .set(asUser(token))
          .send({ name: "New Person", email: uniqueEmail(), password: TEST_PASSWORD }),
        await request(app).get(`/api/users/${adminA._id}`).set(asUser(token)),
        await request(app)
          .patch(`/api/users/${salesA._id}/role`)
          .set(asUser(token))
          .send({ role: "MANAGER" }),
        await request(app)
          .patch(`/api/users/${salesA._id}/status`)
          .set(asUser(token))
          .send({ isActive: false }),
      ];

      for (const res of responses) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      }
    }

    expect((await User.findById(salesA._id)).isActive).toBe(true);
    expect((await User.findById(salesA._id)).role).toBe("SALES");
  });

  test("any authenticated user can still update their own profile", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}`)
      .set(asUser(tokenSales))
      .send({ name: "Self Service", phone: "5550001111" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Self Service");
  });
});

describe("listing employees", () => {
  test("OWNER and ADMIN list only their own company's employees", async () => {
    for (const token of [tokenOwner, tokenAdmin]) {
      const res = await request(app).get("/api/users").set(asUser(token));

      expect(res.status).toBe(200);
      const emails = res.body.data.users.map((u) => u.email);
      expect(emails).toHaveLength(4);
      expect(emails.sort()).toEqual(
        [ownerA.email, adminA.email, managerA.email, salesA.email].sort()
      );
      expect(emails).not.toContain(ownerB.email);
    }
  });

  test("list is sorted by name and never exposes password hashes", async () => {
    const res = await request(app).get("/api/users").set(asUser(tokenOwner));

    expect(res.status).toBe(200);
    const names = res.body.data.users.map((u) => u.name);
    expect(names).toEqual([...names].sort());
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  test("another company's list contains only its own users", async () => {
    const res = await request(app).get("/api/users").set(asUser(tokenOwnerB));

    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.data.users[0].email).toBe(ownerB.email);
  });

  test("filters by role, isActive and search term", async () => {
    const byRole = await request(app).get("/api/users").query({ role: "ADMIN" }).set(asUser(tokenOwner));
    expect(byRole.status).toBe(200);
    expect(byRole.body.data.users.map((u) => u.email)).toEqual([adminA.email]);

    await createUser({ companyId: companyA._id, role: "SALES", isActive: false });
    const inactive = await request(app)
      .get("/api/users")
      .query({ isActive: "false" })
      .set(asUser(tokenOwner));
    expect(inactive.status).toBe(200);
    expect(inactive.body.data.users).toHaveLength(1);
    expect(inactive.body.data.users[0].isActive).toBe(false);

    const bySearch = await request(app)
      .get("/api/users")
      .query({ q: "test manager" })
      .set(asUser(tokenOwner));
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.data.users.map((u) => u.email)).toEqual([managerA.email]);
  });

  test("invalid filters are rejected and regex characters are escaped", async () => {
    const badRole = await request(app).get("/api/users").query({ role: "SUPERADMIN" }).set(asUser(tokenOwner));
    expect(badRole.status).toBe(400);
    expect(badRole.body.error.code).toBe("BAD_REQUEST");

    const badIsActive = await request(app).get("/api/users").query({ isActive: "maybe" }).set(asUser(tokenOwner));
    expect(badIsActive.status).toBe(400);

    const regexAttempt = await request(app).get("/api/users").query({ q: "(test" }).set(asUser(tokenOwner));
    expect(regexAttempt.status).toBe(200);
    expect(regexAttempt.body.data.users).toHaveLength(0);
  });
});

describe("creating employees", () => {
  const newEmployee = (overrides = {}) => ({
    name: "Riley Rep",
    email: uniqueEmail("riley"),
    password: TEST_PASSWORD,
    role: "SALES",
    ...overrides,
  });

  test("OWNER creates an employee hashed, safe and scoped to their company", async () => {
    const res = await request(app)
      .post("/api/users")
      .set(asUser(tokenOwner))
      .send(newEmployee({ companyId: String(companyB._id), role: "MANAGER" }));

    expect(res.status).toBe(201);
    const user = res.body.data.user;
    expect(user.role).toBe("MANAGER");
    expect(user.companyId).toBe(String(companyA._id));
    expect(user).not.toHaveProperty("passwordHash");

    const stored = await User.findById(user.id).select("+passwordHash");
    expect(String(stored.companyId)).toBe(String(companyA._id));
    expect(await comparePassword(TEST_PASSWORD, stored.passwordHash)).toBe(true);
  });

  test("ADMIN can create ADMIN, MANAGER and SALES employees; role defaults to SALES", async () => {
    for (const role of ["ADMIN", "MANAGER", "SALES"]) {
      const res = await request(app)
        .post("/api/users")
        .set(asUser(tokenAdmin))
        .send(newEmployee({ role }));
      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe(role);
    }

    const defaulted = await request(app)
      .post("/api/users")
      .set(asUser(tokenAdmin))
      .send(newEmployee());
    expect(defaulted.status).toBe(201);
    expect(defaulted.body.data.user.role).toBe("SALES");
  });

  test("OWNER role cannot be created by anyone", async () => {
    const countBefore = await User.countDocuments();

    const res = await request(app)
      .post("/api/users")
      .set(asUser(tokenOwner))
      .send(newEmployee({ role: "OWNER" }));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ASSIGNABLE");
    expect(await User.countDocuments()).toBe(countBefore);
  });

  test("validation rejects bogus roles, weak passwords, missing and invalid fields", async () => {
    const bogusRole = await request(app)
      .post("/api/users")
      .set(asUser(tokenOwner))
      .send(newEmployee({ role: "SUPERADMIN" }));
    expect(bogusRole.status).toBe(400);
    expect(bogusRole.body.error.code).toBe("BAD_REQUEST");

    const weakPassword = await request(app)
      .post("/api/users")
      .set(asUser(tokenOwner))
      .send(newEmployee({ password: "short" }));
    expect(weakPassword.status).toBe(400);
    expect(weakPassword.body.error.details.some((d) => d.field === "password")).toBe(true);

    const missingName = await request(app)
      .post("/api/users")
      .set(asUser(tokenOwner))
      .send(newEmployee({ name: "" }));
    expect(missingName.status).toBe(400);

    const badEmail = await request(app)
      .post("/api/users")
      .set(asUser(tokenOwner))
      .send(newEmployee({ email: "not-an-email" }));
    expect(badEmail.status).toBe(400);
  });

  test("duplicate emails are refused after normalization", async () => {
    const res = await request(app)
      .post("/api/users")
      .set(asUser(tokenOwner))
      .send(newEmployee({ email: `  ${ownerA.email.toUpperCase()}  ` }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  test("creation records a USER_CREATED activity entry", async () => {
    const res = await request(app)
      .post("/api/users")
      .set(asUser(tokenAdmin))
      .send(newEmployee({ role: "MANAGER" }));

    expect(res.status).toBe(201);
    const createdId = res.body.data.user.id;

    const log = await ActivityLog.findOne({ action: "USER_CREATED", entityId: createdId });
    expect(log).not.toBeNull();
    expect(log.entityType).toBe("USER");
    expect(String(log.companyId)).toBe(String(companyA._id));
    expect(String(log.performedBy)).toBe(String(adminA._id));
    expect(log.metadata.role).toBe("MANAGER");
    expect(log.ipAddress).toBeTruthy();
  });

  test("failed creation attempts record no activity", async () => {
    await request(app)
      .post("/api/users")
      .set(asUser(tokenOwner))
      .send(newEmployee({ role: "OWNER" }));

    expect(await ActivityLog.countDocuments({ action: "USER_CREATED" })).toBe(0);
  });
});

describe("viewing employees", () => {
  test("OWNER and ADMIN can view employees of their company", async () => {
    const res = await request(app).get(`/api/users/${adminA._id}`).set(asUser(tokenOwner));
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(adminA.email);
    expect(res.body.data.user).not.toHaveProperty("passwordHash");

    const byAdmin = await request(app).get(`/api/users/${ownerA._id}`).set(asUser(tokenAdmin));
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data.user.role).toBe("OWNER");
  });

  test("a user from another company gets the same 404 as a missing user", async () => {
    const crossCompany = await request(app)
      .get(`/api/users/${salesA._id}`)
      .set(asUser(tokenOwnerB));
    const missing = await request(app)
      .get(`/api/users/${new mongoose.Types.ObjectId()}`)
      .set(asUser(tokenOwnerB));

    expect(crossCompany.status).toBe(404);
    expect(crossCompany.body).toEqual(missing.body);
    expect(JSON.stringify(crossCompany.body)).not.toContain(salesA.email);
  });

  test("malformed ids are a safe 400, not a 500", async () => {
    const res = await request(app).get("/api/users/not-an-id").set(asUser(tokenOwner));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
    expect(res.text).not.toContain("CastError");
  });
});

describe("profile updates", () => {
  test("ordinary updates change name and phone only - never role, company, email or password", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}`)
      .set(asUser(tokenSales))
      .send({
        name: "Renamed Sales",
        phone: "5551234567",
        role: "OWNER",
        companyId: String(companyB._id),
        email: uniqueEmail("hijack"),
        password: "Hijacked123",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Renamed Sales");

    const stored = await User.findById(salesA._id).select("+passwordHash");
    expect(stored.name).toBe("Renamed Sales");
    expect(stored.phone).toBe("5551234567");
    expect(stored.role).toBe("SALES");
    expect(String(stored.companyId)).toBe(String(companyA._id));
    expect(stored.email).toBe(salesA.email);
    expect(await comparePassword("Hijacked123", stored.passwordHash)).toBe(false);
    expect(await comparePassword(TEST_PASSWORD, stored.passwordHash)).toBe(true);
  });

  test("MANAGER and SALES cannot edit other users", async () => {
    for (const token of [tokenManager, tokenSales]) {
      const res = await request(app)
        .patch(`/api/users/${adminA._id}`)
        .set(asUser(token))
        .send({ name: "Not Allowed" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect((await User.findById(adminA._id)).name).toBe(adminA.name);
  });

  test("ADMIN cannot modify the OWNER, OWNER can modify anyone", async () => {
    const blocked = await request(app)
      .patch(`/api/users/${ownerA._id}`)
      .set(asUser(tokenAdmin))
      .send({ name: "Touched Owner" });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("OWNER_PROTECTED");
    expect((await User.findById(ownerA._id)).name).toBe(ownerA.name);

    const allowed = await request(app)
      .patch(`/api/users/${adminA._id}`)
      .set(asUser(tokenOwner))
      .send({ name: "Owner Edited Admin" });

    expect(allowed.status).toBe(200);
    expect((await User.findById(adminA._id)).name).toBe("Owner Edited Admin");
  });

  test("validation rejects missing or too-short names", async () => {
    const missing = await request(app)
      .patch(`/api/users/${salesA._id}`)
      .set(asUser(tokenOwner))
      .send({ phone: "123" });
    expect(missing.status).toBe(400);

    const tooShort = await request(app)
      .patch(`/api/users/${salesA._id}`)
      .set(asUser(tokenOwner))
      .send({ name: "x" });
    expect(tooShort.status).toBe(400);
  });

  test("cross-company profile updates are a 404", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}`)
      .set(asUser(tokenOwnerB))
      .send({ name: "Cross Border" });

    expect(res.status).toBe(404);
    expect((await User.findById(salesA._id)).name).toBe(salesA.name);
  });

  test("profile updates are recorded in the activity log", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}`)
      .set(asUser(tokenAdmin))
      .send({ name: "Audited Name" });

    expect(res.status).toBe(200);
    const log = await ActivityLog.findOne({
      action: "USER_PROFILE_UPDATED",
      entityId: salesA._id,
    });
    expect(log).not.toBeNull();
    expect(String(log.performedBy)).toBe(String(adminA._id));
    expect(log.metadata.fields).toEqual(["name"]);
  });
});

describe("role changes", () => {
  test("ADMIN promotes an employee and the change is audited", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}/role`)
      .set(asUser(tokenAdmin))
      .send({ role: "MANAGER" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("MANAGER");
    expect((await User.findById(salesA._id)).role).toBe("MANAGER");

    const log = await ActivityLog.findOne({
      action: "USER_ROLE_CHANGED",
      entityId: salesA._id,
    });
    expect(log).not.toBeNull();
    expect(String(log.companyId)).toBe(String(companyA._id));
    expect(String(log.performedBy)).toBe(String(adminA._id));
    expect(log.metadata.from).toBe("SALES");
    expect(log.metadata.to).toBe("MANAGER");
  });

  test("the OWNER account cannot be demoted by an ADMIN", async () => {
    const res = await request(app)
      .patch(`/api/users/${ownerA._id}/role`)
      .set(asUser(tokenAdmin))
      .send({ role: "SALES" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OWNER_PROTECTED");
    expect((await User.findById(ownerA._id)).role).toBe("OWNER");
    expect(await ActivityLog.countDocuments({ action: "USER_ROLE_CHANGED" })).toBe(0);
  });

  test("nobody can change their own role", async () => {
    const res = await request(app)
      .patch(`/api/users/${adminA._id}/role`)
      .set(asUser(tokenAdmin))
      .send({ role: "MANAGER" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SELF_OPERATION_FORBIDDEN");
    expect((await User.findById(adminA._id)).role).toBe("ADMIN");
  });

  test("the OWNER role cannot be granted through this endpoint", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}/role`)
      .set(asUser(tokenOwner))
      .send({ role: "OWNER" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ASSIGNABLE");
    expect((await User.findById(salesA._id)).role).toBe("SALES");
  });

  test("unknown roles are rejected as validation errors", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}/role`)
      .set(asUser(tokenAdmin))
      .send({ role: "SUPERADMIN" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect((await User.findById(salesA._id)).role).toBe("SALES");
  });

  test("cross-company role changes are a 404", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}/role`)
      .set(asUser(tokenOwnerB))
      .send({ role: "ADMIN" });

    expect(res.status).toBe(404);
    expect((await User.findById(salesA._id)).role).toBe("SALES");
  });
});

describe("deactivation (soft delete)", () => {
  test("ADMIN deactivates an employee: record kept, login blocked, action audited", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}/status`)
      .set(asUser(tokenAdmin))
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.user.isActive).toBe(false);

    const stored = await User.findById(salesA._id);
    expect(stored).not.toBeNull();
    expect(stored.isActive).toBe(false);

    const log = await ActivityLog.findOne({ action: "USER_DEACTIVATED", entityId: salesA._id });
    expect(log).not.toBeNull();
    expect(String(log.performedBy)).toBe(String(adminA._id));

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: salesA.email, password: TEST_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  test("reactivation works and is audited separately", async () => {
    await request(app)
      .patch(`/api/users/${salesA._id}/status`)
      .set(asUser(tokenAdmin))
      .send({ isActive: false });

    const res = await request(app)
      .patch(`/api/users/${salesA._id}/status`)
      .set(asUser(tokenAdmin))
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect((await User.findById(salesA._id)).isActive).toBe(true);
    expect(await ActivityLog.countDocuments({ action: "USER_ACTIVATED" })).toBe(1);
    expect(await ActivityLog.countDocuments({ action: "USER_DEACTIVATED" })).toBe(1);
  });

  test("ADMIN cannot deactivate the OWNER", async () => {
    const res = await request(app)
      .patch(`/api/users/${ownerA._id}/status`)
      .set(asUser(tokenAdmin))
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OWNER_PROTECTED");
    expect((await User.findById(ownerA._id)).isActive).toBe(true);
  });

  test("ADMIN cannot deactivate another ADMIN, only the OWNER can", async () => {
    const otherAdmin = await createUser({ companyId: companyA._id, role: "ADMIN" });

    const blocked = await request(app)
      .patch(`/api/users/${otherAdmin._id}/status`)
      .set(asUser(tokenAdmin))
      .send({ isActive: false });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("ADMIN_PROTECTED");
    expect((await User.findById(otherAdmin._id)).isActive).toBe(true);

    const allowed = await request(app)
      .patch(`/api/users/${otherAdmin._id}/status`)
      .set(asUser(tokenOwner))
      .send({ isActive: false });

    expect(allowed.status).toBe(200);
    expect((await User.findById(otherAdmin._id)).isActive).toBe(false);
  });

  test("nobody deactivates their own account", async () => {
    const res = await request(app)
      .patch(`/api/users/${adminA._id}/status`)
      .set(asUser(tokenAdmin))
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SELF_OPERATION_FORBIDDEN");
    expect((await User.findById(adminA._id)).isActive).toBe(true);
  });

  test("status payloads must be explicit booleans", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}/status`)
      .set(asUser(tokenAdmin))
      .send({ isActive: "maybe" });
    expect(res.status).toBe(400);

    const missing = await request(app)
      .patch(`/api/users/${salesA._id}/status`)
      .set(asUser(tokenAdmin))
      .send({});
    expect(missing.status).toBe(400);
  });

  test("there is no physical delete endpoint", async () => {
    const res = await request(app).delete(`/api/users/${salesA._id}`).set(asUser(tokenOwner));
    expect(res.status).toBe(404);
    expect(await User.findById(salesA._id)).not.toBeNull();
  });

  test("cross-company status changes are a 404", async () => {
    const res = await request(app)
      .patch(`/api/users/${salesA._id}/status`)
      .set(asUser(tokenOwnerB))
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect((await User.findById(salesA._id)).isActive).toBe(true);
  });
});
