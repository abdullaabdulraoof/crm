const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/modules/user/user.model");
const { createCompanyWithOwner, signToken, TEST_PASSWORD } = require("../helpers/factories");

let owner;
let company;
let token;

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
  const created = await createCompanyWithOwner();
  company = created.company;
  owner = created.owner;
  token = signToken(owner);
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("GET /api/auth/me", () => {
  test("returns the authenticated user's profile", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = res.body.data.user;
    expect(user.id).toBe(String(owner._id));
    expect(user.name).toBe(owner.name);
    expect(user.email).toBe(owner.email);
    expect(user.role).toBe("OWNER");
    expect(user.companyId).toBe(String(company._id));
    expect(user.isActive).toBe(true);
    expect(user).not.toHaveProperty("passwordHash");
    expect(res.text).not.toContain("$2b$");
    expect(res.text).not.toContain("$2a$");
  });

  test("rejects requests without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("loads status from the database: a deactivated user's old token stops working", async () => {
    const beforeDeactivation = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(beforeDeactivation.status).toBe(200);

    await User.updateOne({ _id: owner._id }, { $set: { isActive: false } });

    const afterDeactivation = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(afterDeactivation.status).toBe(401);
    expect(afterDeactivation.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  test("rejects a token for a deleted user", async () => {
    await User.deleteOne({ _id: owner._id });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_INVALID");
  });
});

describe("POST /api/auth/logout", () => {
  test("confirms logout and documents that tokens are stateless", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toMatch(/stateless/i);
    expect(res.body.data.message).toMatch(/discard/i);
  });

  test("does not claim server-side revocation: the token keeps working until expiry", async () => {
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // Honest behavior test: stateless JWTs cannot be revoked server-side.
    const afterLogout = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(afterLogout.status).toBe(200);
  });

  test("requires authentication", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(401);
  });
});
