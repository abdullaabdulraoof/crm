const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { Types } = require("mongoose");
const app = require("../../src/app");
const { createCompanyWithOwner, signToken } = require("../helpers/factories");

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let owner;
let token;

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
  ({ owner } = await createCompanyWithOwner());
  token = signToken(owner);
});

afterAll(async () => {
  await disconnectTestDb();
});

const expectRejected = async (res, code = "TOKEN_INVALID") => {
  expect(res.status).toBe(401);
  expect(res.body.success).toBe(false);
  expect(res.body.error.code).toBe(code);
  expect(res.body).not.toHaveProperty("stack");
  expect(res.text).not.toContain("jwt");
  expect(res.text).not.toContain("JsonWebToken");
};

describe("JWT rejection rules", () => {
  test("missing Authorization header is rejected", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_MISSING");
  });

  test("non-Bearer schemes and malformed headers are rejected", async () => {
    const basic = await request(app).get("/api/auth/me").set("Authorization", `Basic ${token}`);
    expectRejected(basic);

    const noScheme = await request(app).get("/api/auth/me").set("Authorization", token);
    expectRejected(noScheme);

    const emptyBearer = await request(app).get("/api/auth/me").set("Authorization", "Bearer");
    expectRejected(emptyBearer);

    const multiPart = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer token extra");
    expectRejected(multiPart);
  });

  test("garbage and malformed JWTs are rejected", async () => {
    for (const bad of ["garbage", "a.b.c", "eyJhbGciOiJIUzI1NiJ9", "..", "null"]) {
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${bad}`);
      expectRejected(res);
    }
  });

  test("tokens signed with the wrong secret are rejected", async () => {
    const forged = jwt.sign({ sub: String(owner._id), type: "access" }, "some-other-secret-entirely-32", {
      algorithm: "HS256",
      expiresIn: "15m",
    });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);
    expectRejected(res);
  });

  test("tokens with a tampered signature are rejected", async () => {
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]
      .split("")
      .reverse()
      .join("")}`;
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tampered}`);
    expectRejected(res);
  });

  test("expired tokens are rejected", async () => {
    const expired = signToken(owner, { expiresIn: "-1s" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
    expect(res.body).not.toHaveProperty("stack");
  });

  test("alg:none tokens are rejected", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: String(owner._id),
        type: "access",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      })
    ).toString("base64url");
    const unsigned = `${header}.${payload}.`;

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${unsigned}`);
    expectRejected(res);
  });

  test("wrong token types are rejected", async () => {
    const refreshToken = signToken(owner, { type: "refresh" });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshToken}`);
    expectRejected(res);
  });

  test("validly signed tokens with an invalid subject are rejected", async () => {
    const badSubject = signToken(owner, { sub: "not-an-object-id" });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${badSubject}`);
    expectRejected(res);

    const randomSubject = signToken(owner, { sub: String(new Types.ObjectId()) });
    const res2 = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${randomSubject}`);
    expectRejected(res2);
  });

  test("a valid token is accepted (control case)", async () => {
    const res = await request(app).get("/api/auth/me").set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(String(owner._id));
  });
});
