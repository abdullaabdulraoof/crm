
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const routes = require("./routes");
const notFound = require("./common/middleware/notFound");
const errorHandler = require("./common/middleware/errorHandler");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Needed so rate limiting and audit logs see the real client IP behind a proxy.
// Set TRUST_PROXY to the number of proxies (e.g. "1") or "true".
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === "true") {
  app.set("trust proxy", true);
} else if (trustProxy !== undefined && trustProxy !== "" && !Number.isNaN(Number(trustProxy))) {
  app.set("trust proxy", Number(trustProxy));
}

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CRM API is running",
  });
});

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
