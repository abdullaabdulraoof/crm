const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

// Fixed comparison target so "unknown email" and "wrong password" take
// a similar amount of time (mitigates user-enumeration timing probes).
let dummyHashPromise = null;
const getDummyHash = () => {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash("timing-equalization-only", SALT_ROUNDS);
  }
  return dummyHashPromise;
};

const hashPassword = (plainPassword) => bcrypt.hash(plainPassword, SALT_ROUNDS);

const comparePassword = (plainPassword, hash) => bcrypt.compare(plainPassword, hash);

const dummyCompare = async (plainPassword) => {
  const hash = await getDummyHash();
  return bcrypt.compare(plainPassword, hash);
};

module.exports = { hashPassword, comparePassword, dummyCompare, SALT_ROUNDS };
