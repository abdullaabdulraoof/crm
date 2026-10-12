const { MongoMemoryReplSet } = require("mongodb-memory-server");

// Singleton so globalSetup (start) and globalTeardown (stop) share the same
// server handle inside the Jest main process. Tests themselves read the URI
// from process.env.TEST_MONGODB_URI.
let server = null;

async function start() {
  if (server) return server;
  server = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: "crm-auth-test" },
  });
  return server;
}

async function stop() {
  if (!server) return;
  try {
    await server.stop();
  } finally {
    server = null;
  }
}

function getUri() {
  if (!server) throw new Error("MongoMemoryReplSet has not been started");
  return server.getUri();
}

module.exports = { start, stop, getUri };
