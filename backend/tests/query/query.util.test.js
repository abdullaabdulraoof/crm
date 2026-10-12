const {
  parsePagination,
  paginationMeta,
  escapeRegex,
  parseSearch,
  searchRegex,
  parseEnumFilter,
  parseBooleanFilter,
  parseIdFilter,
  parseDateBounds,
  parseDateRange,
  parseSort,
} = require("../../src/common/utils/query");

const OID_A = "507f1f77bcf86cd799439011";
const OID_B = "507f191e810c19729de860ea";

describe("parsePagination", () => {
  test("applies defaults of page 1 and limit 10", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 10 });
    expect(parsePagination()).toEqual({ page: 1, limit: 10 });
  });

  test("parses valid page and limit", () => {
    expect(parsePagination({ page: "3", limit: "25" })).toEqual({ page: 3, limit: 25 });
  });

  test("treats empty strings as absent", () => {
    expect(parsePagination({ page: "", limit: "" })).toEqual({ page: 1, limit: 10 });
  });

  test("rejects non-integer, zero, negative and over-max values", () => {
    expect(() => parsePagination({ page: "abc" })).toThrow();
    expect(() => parsePagination({ page: "1.5" })).toThrow();
    expect(() => parsePagination({ page: "0" })).toThrow();
    expect(() => parsePagination({ page: "-2" })).toThrow();
    expect(() => parsePagination({ limit: "0" })).toThrow();
    expect(() => parsePagination({ limit: "101" })).toThrow();
  });
});

describe("paginationMeta", () => {
  test("computes totalPages and handles the empty case", () => {
    expect(paginationMeta(1, 10, 0)).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
    expect(paginationMeta(1, 10, 25)).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
    expect(paginationMeta(2, 5, 5)).toEqual({ page: 2, limit: 5, total: 5, totalPages: 1 });
  });
});

describe("escapeRegex / searchRegex", () => {
  test("escapes regex metacharacters so they match literally", () => {
    expect(escapeRegex("a.b*c")).toBe("a\\.b\\*c");
    const re = searchRegex("(test");
    expect(re.test("(test")).toBe(true);
    expect(re.test("test")).toBe(false);
  });

  test("is case-insensitive", () => {
    expect(searchRegex("zeta").test("ZETA Traders")).toBe(true);
  });
});

describe("parseSearch", () => {
  test("trims and returns the term; absent/blank yields undefined", () => {
    expect(parseSearch("  hello  ")).toBe("hello");
    expect(parseSearch("")).toBeUndefined();
    expect(parseSearch(undefined)).toBeUndefined();
    expect(parseSearch(null)).toBeUndefined();
  });

  test("rejects terms longer than the cap", () => {
    expect(() => parseSearch("x".repeat(101))).toThrow();
    expect(parseSearch("x".repeat(100))).toHaveLength(100);
  });
});

describe("parseEnumFilter", () => {
  const allowed = ["A", "B"];
  test("returns the value when allowed and undefined when absent", () => {
    expect(parseEnumFilter("A", allowed, "f")).toBe("A");
    expect(parseEnumFilter("", allowed, "f")).toBeUndefined();
    expect(parseEnumFilter(undefined, allowed, "f")).toBeUndefined();
  });

  test("rejects values outside the allowlist", () => {
    expect(() => parseEnumFilter("C", allowed, "f")).toThrow();
  });
});

describe("parseBooleanFilter", () => {
  test("parses true/false strings and passes through booleans", () => {
    expect(parseBooleanFilter("true", "isActive")).toBe(true);
    expect(parseBooleanFilter("false", "isActive")).toBe(false);
    expect(parseBooleanFilter(true, "isActive")).toBe(true);
    expect(parseBooleanFilter(undefined, "isActive")).toBeUndefined();
  });

  test("rejects non-boolean strings", () => {
    expect(() => parseBooleanFilter("maybe", "isActive")).toThrow();
  });
});

describe("parseIdFilter", () => {
  test("returns a valid id and undefined when absent", () => {
    expect(parseIdFilter(OID_A, "clientId")).toBe(OID_A);
    expect(parseIdFilter(undefined, "clientId")).toBeUndefined();
    expect(parseIdFilter("", "clientId")).toBeUndefined();
  });

  test("rejects malformed ids", () => {
    expect(() => parseIdFilter("not-an-id", "clientId")).toThrow();
  });
});

describe("parseDateBounds / parseDateRange", () => {
  test("returns undefined bounds when neither param is set", () => {
    expect(parseDateBounds({})).toEqual({ from: undefined, to: undefined });
    expect(parseDateRange({}, "createdAt")).toBeUndefined();
  });

  test("extends a date-only upper bound to the end of the day", () => {
    const { to } = parseDateBounds({ to: "2026-01-31" });
    expect(to.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  test("builds an inclusive range filter", () => {
    const filter = parseDateRange({ from: "2026-01-01", to: "2026-01-31" }, "createdAt");
    expect(filter.createdAt.$gte.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(filter.createdAt.$lte.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  test("rejects unparseable dates and inverted ranges", () => {
    expect(() => parseDateRange({ from: "not-a-date" }, "createdAt")).toThrow();
    expect(() => parseDateRange({ to: "not-a-date" }, "createdAt")).toThrow();
    expect(() => parseDateRange({ from: "2026-02-01", to: "2026-01-01" }, "createdAt")).toThrow();
  });
});

describe("parseSort", () => {
  const opts = { allowlist: ["name", "createdAt"], default: { name: 1 } };

  test("applies the default and guarantees an _id tie-breaker", () => {
    expect(parseSort({}, opts)).toEqual({ name: 1, _id: 1 });
  });

  test("derives direction from the default map when sortOrder is omitted", () => {
    expect(parseSort({ sortBy: "createdAt" }, { allowlist: ["createdAt"], default: { createdAt: -1 } })).toEqual(
      { createdAt: -1, _id: -1 }
    );
    expect(parseSort({ sortBy: "name" }, opts)).toEqual({ name: 1, _id: 1 });
  });

  test("honours an explicit sortOrder", () => {
    expect(parseSort({ sortBy: "name", sortOrder: "desc" }, opts)).toEqual({ name: -1, _id: -1 });
    expect(parseSort({ sortBy: "createdAt", sortOrder: "asc" }, { allowlist: ["createdAt"], default: { createdAt: -1 } })).toEqual(
      { createdAt: 1, _id: 1 }
    );
  });

  test("rejects sortBy outside the allowlist and invalid sortOrder", () => {
    expect(() => parseSort({ sortBy: "secret" }, opts)).toThrow();
    expect(() => parseSort({ sortBy: "name", sortOrder: "up" }, opts)).toThrow();
  });

  test("keeps a default that already includes _id", () => {
    expect(parseSort({}, { allowlist: ["x"], default: { x: -1, _id: -1 } })).toEqual({ x: -1, _id: -1 });
  });
});
