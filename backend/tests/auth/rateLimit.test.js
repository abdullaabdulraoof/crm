const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

// Low limits so the limiter trips quickly; values are read at module load time.
setupTestEnv({ AUTH_RATE_LIMIT_REGISTER_MAX: "2", AUTH_RATE_LIMIT_LOGIN_MAX: "2" });

const request = require("supertest");
const app = require("../../src/app");

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("auth rate limiting", () => {
  test("register returns 429 after the configured limit", async () => {
    const first = await request(app).post("/api/auth/register").send({});
    expect(first.status).toBe(400);

    const second = await request(app).post("/api/auth/register").send({});
    expect(second.status).toBe(400);

    const third = await request(app).post("/api/auth/register").send({});
    expect(third.status).toBe(429);
    expect(third.body.success).toBe(false);
    expect(third.body.error.code).toBe("RATE_LIMITED");
    expect(third.body).not.toHaveProperty("stack");

    const rateLimitHeader = Object.keys(third.headers).find((h) => h.startsWith("ratelimit"));
    expect(rateLimitHeader).toBeTruthy();
  });

  test("login is rate limited independently from register", async () => {
    const first = await request(app).post("/api/auth/login").send({});
    expect(first.status).toBe(400);

    const second = await request(app).post("/api/auth/login").send({});
    expect(second.status).toBe(400);

    const third = await request(app).post("/api/auth/login").send({});
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
  });
});
