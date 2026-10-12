const EXPIRES_RE = /^\d+[smhd]$/;
const MIN_SECRET_LENGTH = 32;

// Known template secrets. Rejected outright in production, warned about elsewhere.
const PLACEHOLDER_SECRET_RE =
  /^(replace|changeme|change[-_ ]?me|your[-_ ]|placeholder|example[-_ ]?secret|secret[-_ ]?here)/i;

class ConfigError extends Error {
  constructor(problems) {
    // Problems only ever contain variable names and rules, never values.
    super(`Invalid environment configuration: ${problems.join("; ")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

function jwtProblems(source) {
  const problems = [];
  const secret = typeof source.JWT_SECRET === "string" ? source.JWT_SECRET.trim() : "";
  const expiresIn = typeof source.JWT_EXPIRES_IN === "string" ? source.JWT_EXPIRES_IN.trim() : "";
  const nodeEnv = source.NODE_ENV || "development";

  if (!secret) {
    problems.push("JWT_SECRET is required");
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  } else if (PLACEHOLDER_SECRET_RE.test(secret)) {
    if (nodeEnv === "production") {
      problems.push("JWT_SECRET is a placeholder value and cannot be used in production");
    } else if (!source.__JWT_PLACEHOLDER_WARNED) {
      console.warn("[env] JWT_SECRET looks like a placeholder. Generate a real secret before deploying.");
    }
  }

  if (!expiresIn) {
    problems.push("JWT_EXPIRES_IN is required (e.g. 15m, 1h)");
  } else if (!EXPIRES_RE.test(expiresIn)) {
    problems.push("JWT_EXPIRES_IN must match <number><s|m|h|d>, e.g. 15m or 1h");
  }

  return problems;
}

// Validates only the auth-related configuration. Cheap enough to call per request,
// so a request never runs with a half-read configuration.
function getJwtConfig(source = process.env) {
  const problems = jwtProblems(source);
  if (problems.length > 0) throw new ConfigError(problems);
  return Object.freeze({
    secret: source.JWT_SECRET.trim(),
    expiresIn: source.JWT_EXPIRES_IN.trim(),
  });
}

// Full startup configuration. Called once at boot; failure stops the process.
function loadConfig(source = process.env) {
  const problems = jwtProblems(source);

  const mongoUri = typeof source.MONGODB_URI === "string" ? source.MONGODB_URI.trim() : "";
  if (!mongoUri) problems.push("MONGODB_URI is required");

  let port = 5000;
  if (source.PORT !== undefined && source.PORT !== "") {
    const parsed = Number(source.PORT);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      problems.push("PORT must be an integer between 1 and 65535");
    } else {
      port = parsed;
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return Object.freeze({
    mongoUri,
    port,
    nodeEnv: source.NODE_ENV || "development",
    clientUrl: source.CLIENT_URL || undefined,
    jwt: getJwtConfig(source),
  });
}

let cachedConfig = null;

function getConfig() {
  if (!cachedConfig) cachedConfig = loadConfig();
  return cachedConfig;
}

function resetConfig() {
  cachedConfig = null;
}

module.exports = {
  ConfigError,
  loadConfig,
  getConfig,
  getJwtConfig,
  resetConfig,
  MIN_SECRET_LENGTH,
};
