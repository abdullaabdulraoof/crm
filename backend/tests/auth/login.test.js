const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const User = require("../../src/modules/user/user.model");
const { createCompanyWithOwner, uniqueEmail, TEST_PASSWORD } = require("../helpers/factories");

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("POST /api/auth/login", () => {
  test("returns a signed JWT and safe user info, and updates lastLogin", async () => {
    const { owner } = await createCompanyWithOwner();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: owner.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokenType).toBe("Bearer");
    expect(res.body.data.expiresIn).toBe("15m");
    expect(res.body.data.user.id).toBe(String(owner._id));
    expect(res.body.data.user.role).toBe("OWNER");
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
    expect(res.text).not.toContain("password");

    const payload = jwt.verify(res.body.data.token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    expect(payload.sub).toBe(String(owner._id));
    expect(payload.type).toBe("access");
    expect(payload.companyId).toBeUndefined();
    expect(payload.role).toBeUndefined();
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub", "type"]);

    const stored = await User.findById(owner._id);
    expect(stored.lastLogin).toBeInstanceOf(Date);
    expect(stored.lastLogin).not.toBeNull();
  });

  test("normalizes the email before lookup", async () => {
    const { owner } = await createCompanyWithOwner();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: `  ${owner.email.toUpperCase()}  `, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(owner.email.toLowerCase());
  });

  test("unknown email and wrong password produce the same generic failure", async () => {
    const { owner } = await createCompanyWithOwner();

    const unknownEmailRes = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail("nobody"), password: TEST_PASSWORD });

    const wrongPasswordRes = await request(app)
      .post("/api/auth/login")
      .send({ email: owner.email, password: "WrongPass999" });

    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownEmailRes.body.error.message).toBe("Invalid email or password");
    expect(wrongPasswordRes.body.error.message).toBe("Invalid email or password");
    expect(unknownEmailRes.body).toEqual(wrongPasswordRes.body);
    expect(unknownEmailRes.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknownEmailRes.text).not.toContain("stack");
  });

  test("inactive accounts cannot log in even with the correct password", async () => {
    const { owner } = await createCompanyWithOwner();
    await User.updateOne({ _id: owner._id }, { $set: { isActive: false } });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: owner.email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_INACTIVE");
    expect(res.body.data).toBeUndefined();
    expect(res.text).not.toContain(TEST_PASSWORD);
  });

  test("rejects missing credentials with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(["email", "password"]);
  });
});
