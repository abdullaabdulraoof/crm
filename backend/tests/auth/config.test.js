// Deliberately configured with a missing JWT_SECRET: verifies that both
// startup validation and runtime requests fail safely instead of crashing
// or leaking configuration details.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "";
process.env.JWT_EXPIRES_IN = "15m";
delete process.env.TRUST_PROXY;

const { getJwtConfig, loadConfig, ConfigError } = require("../../src/config/env");
const request = require("supertest");

describe("missing/invalid JWT configuration", () => {
  test("getJwtConfig throws ConfigError when JWT_SECRET is missing", () => {
    expect(() => getJwtConfig()).toThrow(ConfigError);
    try {
      getJwtConfig();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.message).toContain("JWT_SECRET is required");
    }
  });

  test("loadConfig reports every missing variable by name only", () => {
    try {
      loadConfig({});
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.message).toContain("JWT_SECRET is required");
      expect(err.message).toContain("JWT_EXPIRES_IN is required");
      expect(err.message).toContain("MONGODB_URI is required");
    }
  });

  test("invalid values are rejected without echoing the values", () => {
    try {
      loadConfig({
        JWT_SECRET: "tiny",
        JWT_EXPIRES_IN: "banana",
        MONGODB_URI: "mongodb://secret-host:27017/private-db",
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.message).toContain("JWT_SECRET must be at least 32 characters");
      expect(err.message).toContain("JWT_EXPIRES_IN must match");
      expect(err.message).not.toContain("secret-host");
      expect(err.message).not.toContain("private-db");
      expect(err.message).not.toContain("banana");
    }
  });

  test("short secrets are rejected", () => {
    expect(() => getJwtConfig({ JWT_SECRET: "abc", JWT_EXPIRES_IN: "15m" })).toThrow(
      /at least 32 characters/
    );
  });

  test("malformed expiry values are rejected", () => {
    expect(() =>
      getJwtConfig({ JWT_SECRET: "x".repeat(40), JWT_EXPIRES_IN: "tomorrow" })
    ).toThrow(/JWT_EXPIRES_IN/);
  });

  test("placeholder secrets are rejected in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "replace-with-a-real-secret-value-32+",
        JWT_EXPIRES_IN: "15m",
        MONGODB_URI: "mongodb://localhost:27017/crm",
      })
    ).toThrow(/placeholder/);
  });

  test("a valid configuration is accepted and frozen", () => {
    const config = loadConfig({
      JWT_SECRET: "a-real-looking-secret-value-with-plenty-of-length",
      JWT_EXPIRES_IN: "15m",
      MONGODB_URI: "mongodb://localhost:27017/crm",
      PORT: "4000",
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.port).toBe(4000);
    expect(config.jwt.expiresIn).toBe("15m");
  });
});

describe("runtime behavior when JWT configuration is missing", () => {
  let app;

  beforeAll(() => {
    app = require("../../src/app");
  });

  test("protected endpoints return a sanitized 500 instead of crashing", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer some-token");

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe("Authentication service is not configured");
    expect(res.body.error.code).toBe("CONFIG_ERROR");
    expect(res.body).not.toHaveProperty("stack");
    expect(res.text).not.toContain("JWT_SECRET");
  });

  test("authentication failure is distinguished from an invalid token", async () => {
    const withToken = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer some-token");
    const withoutToken = await request(app).get("/api/auth/me");

    expect(withToken.status).toBe(500);
    expect(withoutToken.status).toBe(401);
    expect(withoutToken.body.error.code).toBe("TOKEN_MISSING");
  });
});

afterAll(() => {
  // Restore for the remaining test files (process.env is shared in-band).
  process.env.JWT_SECRET = "jest-secret-jest-secret-jest-secret-123456";
  process.env.JWT_EXPIRES_IN = "15m";
});
