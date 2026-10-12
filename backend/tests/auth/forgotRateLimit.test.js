const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

// Low limit so the limiter trips quickly; read at module load time.
setupTestEnv({ AUTH_RATE_LIMIT_FORGOT_MAX: "2" });

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

describe("forgot-password rate limiting", () => {
  test("returns 429 after the configured limit", async () => {
    const first = await request(app).post("/api/auth/forgot-password").send({});
    expect(first.status).toBe(400);

    const second = await request(app).post("/api/auth/forgot-password").send({});
    expect(second.status).toBe(400);

    const third = await request(app).post("/api/auth/forgot-password").send({});
    expect(third.status).toBe(429);
    expect(third.body.success).toBe(false);
    expect(third.body.error.code).toBe("RATE_LIMITED");

    const rateLimitHeader = Object.keys(third.headers).find((h) => h.startsWith("ratelimit"));
    expect(rateLimitHeader).toBeTruthy();
  });
});