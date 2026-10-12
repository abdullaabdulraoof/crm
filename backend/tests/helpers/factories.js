const jwt = require("jsonwebtoken");
const Company = require("../../src/modules/companies/company.model");
const User = require("../../src/modules/user/user.model");
const Lead = require("../../src/modules/leads/lead.model");
const Client = require("../../src/modules/client/client.model");
const { hashPassword } = require("../../src/common/utils/password");

const TEST_PASSWORD = "Password123";

let counter = 0;
const uniqueEmail = (prefix = "user") =>
  `${prefix}-${(counter += 1)}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const uniqueCompanyData = (prefix = "Acme") => ({
  name: `${prefix} Industries ${(counter += 1)}`,
  email: uniqueEmail("company"),
  phone: "9876543210",
  gstNumber: "29ABCDE1234F1Z5",
  address: "123 Test Street, Test City",
});

// One bcrypt hash for every factory user: identical policy, far fewer rounds
// spent per test. The password under test still round-trips through bcrypt.
let sharedHashPromise = null;
const sharedPasswordHash = () => {
  if (!sharedHashPromise) sharedHashPromise = hashPassword(TEST_PASSWORD);
  return sharedHashPromise;
};

async function createCompany(overrides = {}) {
  const [company] = await Company.create([{ ...uniqueCompanyData(), ...overrides }]);
  return company;
}

async function createUser({ companyId, role = "SALES", isActive = true, email, name } = {}) {
  const passwordHash = await sharedPasswordHash();
  const [user] = await User.create([
    {
      companyId,
      name: name || `Test ${role}`,
      email: email || uniqueEmail(role.toLowerCase()),
      phone: "",
      passwordHash,
      role,
      isActive,
    },
  ]);
  return user;
}

async function createCompanyWithOwner(role = "OWNER", overrides = {}) {
  const company = await createCompany();
  const owner = await createUser({ companyId: company._id, role, ...overrides });
  return { company, owner, password: TEST_PASSWORD };
}

async function createLead({ companyId, createdBy, name = "Isolated Lead", ...overrides } = {}) {
  const [lead] = await Lead.create([
    {
      companyId,
      createdBy,
      name,
      phoneNumber: "9876543210",
      status: "NEW",
      ...overrides,
    },
  ]);
  return lead;
}

async function createClient({ companyId, createdBy, name = "Isolated Client", ...overrides } = {}) {
  const [client] = await Client.create([
    {
      companyId,
      createdBy,
      name,
      phoneNumber: "9876543210",
      ...overrides,
    },
  ]);
  return client;
}

function signToken(user, options = {}) {
  const { secret = process.env.JWT_SECRET, expiresIn = "15m", type = "access", sub } = options;
  return jwt.sign({ sub: sub !== undefined ? sub : String(user._id), type }, secret, {
    algorithm: "HS256",
    expiresIn,
  });
}

module.exports = {
  TEST_PASSWORD,
  uniqueEmail,
  uniqueCompanyData,
  createCompany,
  createUser,
  createCompanyWithOwner,
  createLead,
  createClient,
  signToken,
};
