// Minimal email abstraction. There is no provider integration yet; this exists so
// the password-reset flow has a single seam to swap in Gmail/SMTP/Resend/etc. later
// without touching callers.

const PASSWORD_RESET_PATH = "/reset-password";

function buildPasswordResetUrl(token) {
  const base = (process.env.CLIENT_URL || "http://localhost:4200").replace(/\/+$/, "");
  return `${base}${PASSWORD_RESET_PATH}?token=${encodeURIComponent(token)}`;
}

// Sends (or development-logs) a password reset email.
//
// Security rules:
//  - Never log passwords or password hashes.
//  - Never expose reset tokens in production logs.
//  - Development mode may log the reset URL so a local reset flow is usable
//    without a configured mail provider.
async function sendPasswordResetEmail(email, resetUrl) {
  const nodeEnv = process.env.NODE_ENV || "development";

  if (nodeEnv === "development") {
    // Development convenience: the URL contains the (generous) 256-bit token.
    console.log(`[email:dev] password reset link for ${email}: ${resetUrl}`);
    return;
  }

  if (nodeEnv === "test") {
    // Keep test output clean. Tests assert against the database directly.
    return;
  }

  // Production: no provider is configured yet. Never log the URL or token.
  console.info("[email] password reset requested (mail provider not configured).");
}

module.exports = { buildPasswordResetUrl, sendPasswordResetEmail };