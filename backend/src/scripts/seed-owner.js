require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Company = require("../modules/companies/company.model");
const User = require("../modules/user/user.model");
const { hashPassword } = require("../common/utils/password");
const { PASSWORD_RE } = require("../modules/auth/auth.validation");
const { normalizeEmail, normalizeString } = require("../common/utils/normalize");

/**
 * Creates the initial Company + OWNER account. Idempotent: safe to run many
 * times, never creates duplicates. Returns { created, company, user }.
 */
async function seedOwner({ companyName, ownerName, ownerEmail, ownerPassword }) {
  if (mongoose.connection.readyState !== 1) {
    await connectDB(process.env.MONGODB_URI);
  }

  const name = normalizeString(companyName) || "My CRM";
  const owner = normalizeString(ownerName);
  const email = normalizeEmail(ownerEmail);

  if (!email || !owner || !ownerPassword) {
    throw new Error("SEED_OWNER_EMAIL, SEED_OWNER_NAME and SEED_OWNER_PASSWORD are required");
  }
  if (!PASSWORD_RE.test(ownerPassword)) {
    throw new Error("Seed password must be 8-72 characters and include at least one letter and one digit");
  }

  let company = await Company.findOne({ name });
  if (!company) {
    // Company fields are required (non-empty), so use placeholder values. The
    // owner can update them later from the CRM.
    company = await Company.create({
      name,
      email,
      phone: "0000000000",
      gstNumber: "NA",
      address: name,
    });
    console.log(`[seed] Company "${name}" created.`);
  } else {
    console.log(`[seed] Company "${name}" already exists.`);
  }

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[seed] Owner ${email} already exists; nothing to do.`);
    return { created: false, company };
  }

  const passwordHash = await hashPassword(ownerPassword);
  const user = await User.create({
    companyId: company._id,
    name: owner,
    email,
    phone: "",
    passwordHash,
    role: "OWNER",
    isActive: true,
  });

  console.log(`[seed] Owner ${email} created.`);
  return { created: true, company, user };
}

function main() {
  seedOwner({
    companyName: process.env.SEED_COMPANY_NAME,
    ownerName: process.env.SEED_OWNER_NAME,
    ownerEmail: process.env.SEED_OWNER_EMAIL,
    ownerPassword: process.env.SEED_OWNER_PASSWORD,
  })
    .then(async ({ created }) => {
      console.log(`[seed] Done (${created ? "seed created" : "no changes required"}).`);
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(`[seed] Failed: ${err.message}`);
      try {
        await mongoose.disconnect();
      } catch {
        // already disconnected
      }
      process.exit(1);
    });
}

if (require.main === module) {
  main();
}

module.exports = { seedOwner, main };