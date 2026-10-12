const mongoose = require("mongoose");

const TEST_DB_NAME = "crm_auth_test";

// Must be called BEFORE the app (and its rate limiters) is required,
// because configuration is read at module load time.
function setupTestEnv(overrides = {}) {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "jest-secret-jest-secret-jest-secret-123456";
  process.env.JWT_EXPIRES_IN = "15m";
  process.env.CLIENT_URL = "http://localhost:4200";
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.AUTH_RATE_LIMIT_REGISTER_MAX = overrides.AUTH_RATE_LIMIT_REGISTER_MAX || "1000";
  process.env.AUTH_RATE_LIMIT_LOGIN_MAX = overrides.AUTH_RATE_LIMIT_LOGIN_MAX || "1000";
  process.env.AUTH_RATE_LIMIT_FORGOT_MAX = overrides.AUTH_RATE_LIMIT_FORGOT_MAX || "1000";
}

async function connectTestDb() {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) throw new Error("TEST_MONGODB_URI is missing - globalSetup did not run");
  // runtimeAdapters skips the driver's dynamic import('os'), which Jest's VM blocks
  // (metadata would silently become {} and the handshake would be rejected).
  await mongoose.connect(uri, {
    dbName: TEST_DB_NAME,
    runtimeAdapters: { os: require("os") },
  });
}

async function resetDb() {
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.deleteMany({}))
  );
}

async function disconnectTestDb() {
  await mongoose.disconnect();
}

module.exports = { setupTestEnv, connectTestDb, resetDb, disconnectTestDb, TEST_DB_NAME };
