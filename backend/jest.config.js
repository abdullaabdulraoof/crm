module.exports = {
  testEnvironment: "node",
  globalSetup: "<rootDir>/tests/globalSetup.js",
  globalTeardown: "<rootDir>/tests/globalTeardown.js",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  testTimeout: 120000,
  maxWorkers: 1,
  restoreMocks: true,
};
