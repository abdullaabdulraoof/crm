const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : email;

const normalizeString = (value) => (typeof value === "string" ? value.trim() : value);

module.exports = { normalizeEmail, normalizeString };
