const { parseDateBounds, rangeFilter } = require("../../common/utils/query");

/**
 * Parses the optional from/to query params shared by every report. Rejects
 * unparseable dates and an inverted range with a 400 so the frontend can show a
 * clear message instead of an empty report. Delegates to the shared query util
 * so list endpoints and reports use identical date semantics.
 */
const parseReportRange = (query = {}) => parseDateBounds(query);

const zeroFill = (keys) => keys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

const countsToMap = (rows, keys) => {
  const map = zeroFill(keys);
  for (const row of rows) {
    if (row._id && Object.prototype.hasOwnProperty.call(map, row._id)) {
      map[row._id] = row.count;
    }
  }
  return map;
};

const rangeEcho = ({ from, to }) => ({
  from: from ? from.toISOString() : null,
  to: to ? to.toISOString() : null,
});

module.exports = { parseReportRange, rangeFilter, zeroFill, countsToMap, rangeEcho };
