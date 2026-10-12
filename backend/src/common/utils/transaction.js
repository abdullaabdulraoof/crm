const mongoose = require("mongoose");

let supportOverride = null;
let cachedSupport = null;

// Transactions need a replica set or mongos. Detect once and cache so
// standalone deployments can fall back to compensation logic instead of crashing.
async function isTransactionSupported() {
  if (supportOverride !== null) return supportOverride;
  if (cachedSupport !== null) return cachedSupport;

  try {
    const db = mongoose.connection.db;
    if (!db) {
      cachedSupport = false;
      return cachedSupport;
    }
    const hello = await db.admin().command({ hello: 1 });
    cachedSupport = Boolean(hello.setName) || hello.msg === "isdbgrid";
  } catch (err) {
    cachedSupport = false;
  }
  return cachedSupport;
}

/**
 * Runs `work(session)` inside a transaction when the deployment supports it.
 * Returns { result, usedTransaction }. On unsupported deployments `work`
 * runs without a session and the caller is responsible for compensating
 * (deleting partially created records).
 */
async function runInTransaction(work) {
  const supported = await isTransactionSupported();

  if (!supported) {
    const result = await work(null);
    return { result, usedTransaction: false };
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return { result, usedTransaction: true };
  } finally {
    await session.endSession();
  }
}

// Test hooks: force the fallback path (or force transaction usage).
function setTransactionSupportForTests(value) {
  supportOverride = value;
}

function resetTransactionSupport() {
  supportOverride = null;
  cachedSupport = null;
}

module.exports = {
  isTransactionSupported,
  runInTransaction,
  setTransactionSupportForTests,
  resetTransactionSupport,
};
