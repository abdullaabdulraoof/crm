
require("dotenv").config();

const { getConfig } = require("./config/env");

// Fail fast (and safely) when required configuration is missing or invalid.
let config;
try {
  config = getConfig();
} catch (err) {
  console.error(`[startup] ${err.message}`);
  process.exit(1);
}

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const app = require("./app");

const startServer = async () => {
  try {
    await connectDB(config.mongoUri);

    const server = app.listen(config.port, () => {
      console.log(`CRM API running on port ${config.port}`);
    });

    const shutdown = (signal) => async () => {
      console.log(`${signal} received, shutting down`);
      server.close(async () => {
        try {
          await mongoose.disconnect();
        } catch (err) {
          console.error(`[shutdown] ${err.message}`);
        }
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown("SIGINT"));
    process.on("SIGTERM", shutdown("SIGTERM"));
  } catch (err) {
    console.error(`[startup] Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

startServer();
