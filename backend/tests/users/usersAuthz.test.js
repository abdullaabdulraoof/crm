const { setupTestEnv, connectTestDb, resetDb, disconnectTestDb } = require("../helpers/setup");

setupTestEnv();

const usersService = require("../../src/modules/users/users.service");
const User = require("../../src/modules/user/user.model");
const { createCompanyWithOwner, createUser } = require("../helpers/factories");

let company;
let owner;
let admin;
let manager;
let sales;

const actor = (user, companyId = company._id) => ({
  id: String(user._id),
  companyId: String(companyId),
  role: user.role,
  name: user.name,
  email: user.email,
  isActive: user.isActive,
});

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await resetDb();
  const created = await createCompanyWithOwner();
  company = created.company;
  owner = created.owner;
  admin = await createUser({ companyId: company._id, role: "ADMIN" });
  manager = await createUser({ companyId: company._id, role: "MANAGER" });
  sales = await createUser({ companyId: company._id, role: "SALES" });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("ADMIN cannot demote or deactivate the OWNER", () => {
  test("role change against the OWNER is refused and the owner is unchanged", async () => {
    await expect(
      usersService.updateUserRole(actor(admin), String(owner._id), "SALES")
    ).rejects.toMatchObject({ statusCode: 403, code: "OWNER_PROTECTED" });

    const stored = await User.findById(owner._id);
    expect(stored.role).toBe("OWNER");
    expect(stored.isActive).toBe(true);
  });

  test("deactivating the OWNER is refused and the owner stays active", async () => {
    await expect(
      usersService.setUserActiveState(actor(admin), String(owner._id), false)
    ).rejects.toMatchObject({ statusCode: 403, code: "OWNER_PROTECTED" });

    const stored = await User.findById(owner._id);
    expect(stored.isActive).toBe(true);
    expect(stored.role).toBe("OWNER");
  });

  test("even the OWNER cannot demote themselves outside the transfer workflow", async () => {
    await expect(
      usersService.updateUserRole(actor(owner), String(owner._id), "ADMIN")
    ).rejects.toMatchObject({ statusCode: 403, code: "OWNER_PROTECTED" });

    const stored = await User.findById(owner._id);
    expect(stored.role).toBe("OWNER");
  });
});

describe("self-promotion and self-change protections", () => {
  test("ADMIN cannot change their own role", async () => {
    await expect(
      usersService.updateUserRole(actor(admin), String(admin._id), "OWNER")
    ).rejects.toMatchObject({ statusCode: 403, code: "SELF_OPERATION_FORBIDDEN" });

    const stored = await User.findById(admin._id);
    expect(stored.role).toBe("ADMIN");
  });

  test("ADMIN cannot deactivate their own account", async () => {
    await expect(
      usersService.setUserActiveState(actor(admin), String(admin._id), false)
    ).rejects.toMatchObject({ statusCode: 403, code: "SELF_OPERATION_FORBIDDEN" });
  });

  test("ADMIN cannot grant the OWNER role to anyone", async () => {
    await expect(
      usersService.updateUserRole(actor(admin), String(sales._id), "OWNER")
    ).rejects.toMatchObject({ statusCode: 403, code: "ROLE_NOT_ASSIGNABLE" });

    const stored = await User.findById(sales._id);
    expect(stored.role).toBe("SALES");
  });

  test("MANAGER and SALES cannot manage users at all", async () => {
    await expect(
      usersService.updateUserRole(actor(manager), String(sales._id), "MANAGER")
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      usersService.setUserActiveState(actor(sales), String(manager._id), false)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      usersService.createCompanyUser(actor(sales), {
        name: "New Person",
        email: "new.person@example.com",
        password: "Password123",
      })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});

describe("legitimate role management still works", () => {
  test("ADMIN can promote SALES to MANAGER", async () => {
    const updated = await usersService.updateUserRole(
      actor(admin),
      String(sales._id),
      "MANAGER"
    );

    expect(updated.role).toBe("MANAGER");
    const stored = await User.findById(sales._id);
    expect(stored.role).toBe("MANAGER");
  });

  test("ADMIN can deactivate a SALES account but not an ADMIN account", async () => {
    const updated = await usersService.setUserActiveState(
      actor(admin),
      String(sales._id),
      false
    );
    expect(updated.isActive).toBe(false);

    const otherAdmin = await createUser({ companyId: company._id, role: "ADMIN" });
    await expect(
      usersService.setUserActiveState(actor(admin), String(otherAdmin._id), false)
    ).rejects.toMatchObject({ statusCode: 403, code: "ADMIN_PROTECTED" });

    expect((await User.findById(otherAdmin._id)).isActive).toBe(true);
  });

  test("OWNER can create an employee with a chosen role", async () => {
    const created = await usersService.createCompanyUser(actor(owner), {
      name: "Riley Rep",
      email: "riley.rep@example.com",
      password: "Password123",
      role: "SALES",
      companyId: "attacker-controlled-value",
    });

    expect(created.role).toBe("SALES");
    expect(created.companyId).toBe(String(company._id));

    const stored = await User.findById(created.id);
    expect(String(stored.companyId)).toBe(String(company._id));
    expect(stored.passwordHash).toBeUndefined();
  });
});

describe("ownership transfer workflow", () => {
  test("only the OWNER can transfer ownership, atomically", async () => {
    const result = await usersService.transferOwnership(actor(owner), String(sales._id));

    expect(result.newOwner.role).toBe("OWNER");
    expect(result.previousOwnerRole).toBe("ADMIN");

    const newOwner = await User.findById(sales._id);
    const oldOwner = await User.findById(owner._id);
    expect(newOwner.role).toBe("OWNER");
    expect(oldOwner.role).toBe("ADMIN");
  });

  test("ADMIN cannot transfer ownership", async () => {
    await expect(
      usersService.transferOwnership(actor(admin), String(sales._id))
    ).rejects.toMatchObject({ statusCode: 403 });

    expect((await User.findById(sales._id)).role).toBe("SALES");
    expect((await User.findById(owner._id)).role).toBe("OWNER");
  });

  test("ownership cannot be transferred to yourself or to an inactive user", async () => {
    await expect(
      usersService.transferOwnership(actor(owner), String(owner._id))
    ).rejects.toMatchObject({ statusCode: 400, code: "SELF_OPERATION" });

    await User.updateOne({ _id: sales._id }, { $set: { isActive: false } });
    await expect(
      usersService.transferOwnership(actor(owner), String(sales._id))
    ).rejects.toMatchObject({ statusCode: 400, code: "TARGET_INACTIVE" });
  });
});
