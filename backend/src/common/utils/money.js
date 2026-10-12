// Round half-away-from-zero to 2 decimal places. A single rounding helper is
// used for every currency figure so item amounts, tax, discount and totals stay
// consistent with each other.
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

module.exports = { round2 };
