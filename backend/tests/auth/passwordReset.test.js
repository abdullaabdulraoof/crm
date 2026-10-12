const crypto = require("crypto");
const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const mongoose = require("mongoose");
const Company = require("../../src/modules/companies/company.model");
const User = require("../../src/modules/user/user.model");
const { seedOwner } = require("../../src/scripts/seed-owner");
const { hashResetToken } = require("../../src/modules/auth/auth.service");
const { comparePassword } = require("../../src/common/utils/password");
const { createCompanyWithOwner, TEST_PASSWORD } = require("../helpers/factories");

const SEED = {
  companyName: "Seed Co",
  ownerName: "Seed Owner",
  ownerEmail: "seed-owner@example.com",
  ownerPassword: "SeedPass123",
};

const makeResetToken = (user, ttlMs = 60 * 1000) => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetTokenHash = hashResetToken(rawToken);
  user.passwordResetExpiresAt = new Date(Date.now() + ttlMs);
  return rawToken;
};

const GENERIC_RESET_MESSAGE = "Invalid or expired password reset link.";

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("seed:owner", () => {
  test("creates the initial company and OWNER account", async () => {
    const { created, company, user } = await seedOwner(SEED);

    expect(created).toBe(true);
    expect(company.name).toBe(SEED.companyName);
    expect(user.role).toBe("OWNER");
    expect(user.isActive).toBe(true);
    expect(String(user.companyId)).toBe(String(company._id));
    expect(await User.countDocuments()).toBe(1);
    expect(await Company.countDocuments()).toBe(1);
  });

  test("running seed twice does not create duplicates", async () => {
    const first = await seedOwner(SEED);
    const second = await seedOwner(SEED);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await User.countDocuments({ email: SEED.ownerEmail })).toBe(1);
    expect(await Company.countDocuments({ name: SEED.companyName })).toBe(1);
  });

  test("the seeded password is stored hashed, never plain text", async () => {
    await seedOwner(SEED);
    const user = await User.findOne({ email: SEED.ownerEmail }).select("+passwordHash");

    expect(user.passwordHash).toBeTruthy();
    expect(user.passwordHash).not.toBe(SEED.ownerPassword);
    expect(await comparePassword(SEED.ownerPassword, user.passwordHash)).toBe(true);
  });

  test("login works with the seeded account", async () => {
    await seedOwner(SEED);

    const res = await request(app).post("/api/auth/login").send({
      email: SEED.ownerEmail,
      password: SEED.ownerPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("OWNER");
    expect(res.body.data.token).toBeTruthy();
  });
});

describe("POST /api/auth/forgot-password", () => {
  test("validates the email", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(JSON.stringify(res.body.error.details)).toContain("email");
  });

  test("does not reveal whether an account exists", async () => {
    await createCompanyWithOwner();
    const existing = await User.findOne();

    const knownRes = await request(app).post("/api/auth/forgot-password").send({ email: existing.email });
    const unknownRes = await request(app).post("/api/auth/forgot-password").send({ email: "no-such-user@example.com" });

    expect(knownRes.status).toBe(200);
    expect(unknownRes.status).toBe(200);
    expect(knownRes.body).toEqual(unknownRes.body);
    expect(knownRes.body).toEqual({
      success: true,
      message: "If an account exists with this email, a password reset link has been sent.",
    });
    expect(knownRes.text).not.toContain("token");
  });

  test("stores only a hash of the reset token with an expiration", async () => {
    const { owner } = await createCompanyWithOwner();

    const res = await request(app).post("/api/auth/forgot-password").send({ email: owner.email });
    expect(res.status).toBe(200);

    const stored = await User.findById(owner._id);
    expect(stored.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.passwordResetExpiresAt).toBeInstanceOf(Date);
    expect(stored.passwordResetExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(res.text).not.toContain("passwordResetTokenHash");
  });

  test("a new request invalidates the previous reset token", async () => {
    const { owner } = await createCompanyWithOwner();

    await request(app).post("/api/auth/forgot-password").send({ email: owner.email });
    const firstHash = (await User.findById(owner._id)).passwordResetTokenHash;

    await request(app).post("/api/auth/forgot-password").send({ email: owner.email });
    const refreshed = await User.findById(owner._id);

    expect(refreshed.passwordResetTokenHash).not.toBe(firstHash);
  });
});

describe("POST /api/auth/reset-password", () => {
  test("a valid token resets the password and existing login still works", async () => {
    const { owner } = await createCompanyWithOwner();
    const rawToken = makeResetToken(owner);
    await owner.save();

    const resetRes = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      password: "BrandNewPass9",
    });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toBe("Password reset successfully");
    expect(resetRes.text).not.toContain("passwordHash");

    const loginRes = await request(app).post("/api/auth/login").send({
      email: owner.email,
      password: "BrandNewPass9",
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeTruthy();

    const oldPassRes = await request(app).post("/api/auth/login").send({
      email: owner.email,
      password: TEST_PASSWORD,
    });
    expect(oldPassRes.status).toBe(401);
  });

  test("the reset token is single-use", async () => {
    const { owner } = await createCompanyWithOwner();
    const rawToken = makeResetToken(owner);
    await owner.save();

    const first = await request(app).post("/api/auth/reset-password").send({ token: rawToken, password: "NewPass123" });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/reset-password").send({ token: rawToken, password: "NewPass456" });
    expect(second.status).toBe(400);
    expect(second.body.error.message).toBe(GENERIC_RESET_MESSAGE);
  });

  test("an invalid token is rejected with a generic error", async () => {
    const { owner } = await createCompanyWithOwner();
    makeResetToken(owner);
    await owner.save();

    const res = await request(app).post("/api/auth/reset-password").send({
      token: crypto.randomBytes(32).toString("hex"),
      password: "RandomPass1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(GENERIC_RESET_MESSAGE);
    expect(res.body.error.code).toBe("INVALID_RESET_TOKEN");
  });

  test("an expired token is rejected", async () => {
    const { owner } = await createCompanyWithOwner();
    const rawToken = makeResetToken(owner, -1000);
    await owner.save();

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      password: "ExpiredPass1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(GENERIC_RESET_MESSAGE);
  });

  test("a missing token is rejected", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ password: "MissingTok1" });
    expect(res.status).toBe(400);
  });

  test("the new password follows the shared password rules", async () => {
    const { owner } = await createCompanyWithOwner();
    const rawToken = makeResetToken(owner);
    await owner.save();

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      password: "short",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("the password is hashed after reset", async () => {
    const { owner } = await createCompanyWithOwner();
    const rawToken = makeResetToken(owner);
    await owner.save();

    await request(app).post("/api/auth/reset-password").send({ token: rawToken, password: "HashedAfter1" });

    const stored = await User.findById(owner._id).select("+passwordHash");
    expect(stored.passwordHash).not.toBe("HashedAfter1");
    expect(await comparePassword("HashedAfter1", stored.passwordHash)).toBe(true);
    expect(stored.passwordResetTokenHash).toBeNull();
    expect(stored.passwordResetExpiresAt).toBeNull();
  });

  test("the raw reset token does not remain in the database", async () => {
    const { owner } = await createCompanyWithOwner();
    const rawToken = makeResetToken(owner);
    await owner.save();

    const storedBefore = await User.findById(owner._id);
    expect(storedBefore.passwordResetTokenHash).not.toBe(rawToken);

    await request(app).post("/api/auth/reset-password").send({ token: rawToken, password: "RawGonePass1" });

    const storedAfter = await User.findById(owner._id);
    expect(storedAfter.passwordResetTokenHash).toBeNull();
  });
});

describe("auth responses never leak password hashes", () => {
  test("login and profile responses do not expose passwordHash", async () => {
    const { owner } = await createCompanyWithOwner();

    const loginRes = await request(app).post("/api/auth/login").send({ email: owner.email, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.text).not.toContain("passwordHash");

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.data.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.text).not.toContain("passwordHash");
    expect(meRes.text).not.toContain('"password":');
  });
});

describe("protected routes require authentication", () => {
  test("unauthenticated users are rejected", async () => {
    const meRes = await request(app).get("/api/auth/me");
    expect(meRes.status).toBe(401);

    const leadsRes = await request(app).get("/api/leads");
    expect(leadsRes.status).toBe(401);
  });
});