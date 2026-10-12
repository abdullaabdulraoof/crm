const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const app = require("../../src/app");
const Company = require("../../src/modules/companies/company.model");
const User = require("../../src/modules/user/user.model");
const {
  isTransactionSupported,
  setTransactionSupportForTests,
  resetTransactionSupport,
} = require("../../src/common/utils/transaction");
const { uniqueCompanyData, uniqueEmail, createCompany } = require("../helpers/factories");

const validPayload = () => ({
  company: uniqueCompanyData("RegCo"),
  owner: {
    name: "Jane Owner",
    email: uniqueEmail("owner"),
    phone: "9876500000",
    password: "SecurePass1",
  },
});

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
  resetTransactionSupport();
});

afterAll(async () => {
  resetTransactionSupport();
  await disconnectTestDb();
});

describe("POST /api/auth/register", () => {
  test("creates a company and its first owner in one operation", async () => {
    const payload = validPayload();

    const res = await request(app).post("/api/auth/register").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe("OWNER");
    expect(res.body.data.company.id).toBeTruthy();
    expect(res.body.data.user.companyId).toBe(res.body.data.company.id);

    expect(await Company.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(1);

    const stored = await User.findOne({ email: payload.owner.email.toLowerCase() });
    expect(stored).toBeTruthy();
    expect(stored.role).toBe("OWNER");
    expect(String(stored.companyId)).toBe(res.body.data.company.id);
    expect(stored.isActive).toBe(true);
  });

  test("hashes the password and never returns it", async () => {
    const payload = validPayload();

    const res = await request(app).post("/api/auth/register").send(payload);

    expect(res.status).toBe(201);
    expect(res.text).not.toContain("password");
    expect(res.text).not.toContain(payload.owner.password);
    expect(res.body.data.user).not.toHaveProperty("passwordHash");

    // select:false keeps the hash out of normal queries.
    const plain = await User.findById(res.body.data.user.id);
    expect(plain.passwordHash).toBeUndefined();

    const withHash = await User.findById(res.body.data.user.id).select("+passwordHash");
    expect(withHash.passwordHash).toMatch(/^\$2/);
    expect(withHash.passwordHash).not.toBe(payload.owner.password);
    expect(withHash.passwordHash.length).toBeGreaterThan(30);
  });

  test("rejects duplicate registration and does not create a second company", async () => {
    const payload = validPayload();

    const first = await request(app).post("/api/auth/register").send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/auth/register").send(payload);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("EMAIL_TAKEN");

    expect(await Company.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(1);
  });

  test("ignores client-supplied role, companyId and admin flags", async () => {
    const otherCompany = await createCompany();
    const payload = validPayload();
    payload.role = "ADMIN";
    payload.companyId = String(otherCompany._id);
    payload.owner.role = "ADMIN";
    payload.owner.companyId = "attacker-controlled";
    payload.owner.isAdmin = true;

    const res = await request(app).post("/api/auth/register").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("OWNER");
    expect(res.body.data.user.companyId).not.toBe(String(otherCompany._id));

    const stored = await User.findById(res.body.data.user.id);
    expect(stored.role).toBe("OWNER");
    expect(String(stored.companyId)).toBe(res.body.data.company.id);
    expect(await User.countDocuments({ role: { $ne: "OWNER" } })).toBe(0);
  });

  test("validates company details, email format and password policy", async () => {
    const weak = validPayload();
    weak.owner.password = "short";

    const weakRes = await request(app).post("/api/auth/register").send(weak);
    expect(weakRes.status).toBe(400);
    expect(weakRes.body.error.code).toBe("BAD_REQUEST");
    expect(weakRes.body.error.details.some((d) => d.field === "owner.password")).toBe(true);

    const badEmail = validPayload();
    badEmail.owner.email = "not-an-email";

    const emailRes = await request(app).post("/api/auth/register").send(badEmail);
    expect(emailRes.status).toBe(400);
    expect(emailRes.body.error.details.some((d) => d.field === "owner.email")).toBe(true);

    const noPasswordLetter = validPayload();
    noPasswordLetter.owner.password = "12345678";

    const numericRes = await request(app).post("/api/auth/register").send(noPasswordLetter);
    expect(numericRes.status).toBe(400);

    const missingCompany = validPayload();
    delete missingCompany.company.address;

    const companyRes = await request(app).post("/api/auth/register").send(missingCompany);
    expect(companyRes.status).toBe(400);
    expect(companyRes.body.error.details.some((d) => d.field === "company.address")).toBe(true);

    expect(await Company.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });

  test("transaction failure leaves no orphaned company records", async () => {
    expect(await isTransactionSupported()).toBe(true);

    jest.spyOn(User, "create").mockRejectedValueOnce(new Error("forced db failure"));

    const res = await request(app).post("/api/auth/register").send(validPayload());

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe("Something went wrong");
    expect(res.text).not.toContain("forced db failure");
    expect(res.text).not.toContain("stack");

    expect(await Company.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });

  test("fallback path (no transactions) compensates by deleting the company", async () => {
    setTransactionSupportForTests(false);

    jest.spyOn(User, "create").mockRejectedValueOnce(new Error("forced db failure"));

    const res = await request(app).post("/api/auth/register").send(validPayload());

    expect(res.status).toBe(500);
    expect(res.text).not.toContain("forced db failure");

    expect(await Company.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });
});
