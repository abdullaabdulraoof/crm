const User = require("../user/user.model");
const AppError = require("../../common/error/AppError");
const {
  ROLES,
  ALL_ROLES,
  USER_MANAGEMENT_ROLES,
  ROLES_ASSIGNABLE_BY,
} = require("../../common/constants");
const { parseId } = require("../../common/utils/scope");
const { hashPassword } = require("../../common/utils/password");
const { normalizeEmail, normalizeString } = require("../../common/utils/normalize");
const { runInTransaction } = require("../../common/utils/transaction");
const { recordUserActivity } = require("../activity-logs/activityLog.service");
const { toSafeUser } = require("../user/user.util");

const assertCanManageUsers = (actor) => {
  if (!USER_MANAGEMENT_ROLES.includes(actor.role)) {
    throw AppError.forbidden("You do not have permission to manage users", "FORBIDDEN");
  }
};

// Target users are always looked up inside the actor's company.
const getTargetUser = async (actor, targetId) => {
  const id = parseId(targetId, "userId");
  const target = await User.findOne({ _id: id, companyId: actor.companyId });
  if (!target) throw AppError.notFound("User not found");
  return target;
};

const assertNotSelf = (actor, target, message) => {
  if (String(target._id) === actor.id) {
    throw AppError.forbidden(message, "SELF_OPERATION_FORBIDDEN");
  }
};

/**
 * Creates an employee inside the actor's company.
 * The company id always comes from the authenticated actor.
 */
const createCompanyUser = async (actor, input, { ipAddress } = {}) => {
  assertCanManageUsers(actor);

  const role = normalizeString(input.role) || ROLES.SALES;
  const allowed = ROLES_ASSIGNABLE_BY[actor.role] || [];
  if (!allowed.includes(role)) {
    throw AppError.forbidden(
      role === ROLES.OWNER
        ? "Only an ownership transfer can grant the OWNER role"
        : "You are not allowed to assign this role",
      "ROLE_NOT_ASSIGNABLE"
    );
  }

  const email = normalizeEmail(input.email);
  const existing = await User.findOne({ email });
  if (existing) throw AppError.conflict("An account with this email already exists", "EMAIL_TAKEN");

  const passwordHash = await hashPassword(input.password);
  const [user] = await User.create([
    {
      companyId: actor.companyId,
      name: normalizeString(input.name),
      email,
      phone: normalizeString(input.phone || ""),
      passwordHash,
      role,
      isActive: true,
    },
  ]);

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "USER_CREATED",
    entityId: user._id,
    description: `Created employee ${user.email} with role ${role}`,
    metadata: { role, email: user.email },
    ipAddress,
  });

  return toSafeUser(user);
};

/**
 * Changes another user's role. Hard rules:
 * - only OWNER/ADMIN may call it;
 * - the OWNER account can never be demoted here (ownership changes go through
 *   transferOwnership);
 * - nobody can change their own role;
 * - only OWNER may assign OWNER, and only via transferOwnership (blocked here).
 */
const updateUserRole = async (actor, targetId, newRole, { ipAddress } = {}) => {
  assertCanManageUsers(actor);

  const role = normalizeString(newRole);
  if (!ALL_ROLES.includes(role)) {
    throw AppError.badRequest("Invalid role", [
      { field: "role", message: `role must be one of: ${ALL_ROLES.join(", ")}` },
    ]);
  }

  const target = await getTargetUser(actor, targetId);

  if (target.role === ROLES.OWNER) {
    throw AppError.forbidden("The OWNER role cannot be changed here", "OWNER_PROTECTED");
  }

  assertNotSelf(actor, target, "You cannot change your own role");

  const allowed = ROLES_ASSIGNABLE_BY[actor.role] || [];
  if (!allowed.includes(role)) {
    throw AppError.forbidden("You are not allowed to assign this role", "ROLE_NOT_ASSIGNABLE");
  }

  const previousRole = target.role;
  target.role = role;
  await target.save();

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: "USER_ROLE_CHANGED",
    entityId: target._id,
    description: `Changed role of ${target.email} from ${previousRole} to ${role}`,
    metadata: { from: previousRole, to: role, email: target.email },
    ipAddress,
  });

  return toSafeUser(target);
};

/**
 * Activates or deactivates an employee. Hard rules:
 * - only OWNER/ADMIN may call it;
 * - the OWNER account can never be deactivated by anyone here;
 * - nobody can deactivate themselves;
 * - an ADMIN can only be changed by the OWNER.
 */
const setUserActiveState = async (actor, targetId, isActive, { ipAddress } = {}) => {
  assertCanManageUsers(actor);

  const target = await getTargetUser(actor, targetId);

  if (target.role === ROLES.OWNER) {
    throw AppError.forbidden("The OWNER account cannot be deactivated", "OWNER_PROTECTED");
  }

  assertNotSelf(actor, target, "You cannot change your own account status");

  if (target.role === ROLES.ADMIN && actor.role !== ROLES.OWNER) {
    throw AppError.forbidden("Only the OWNER can change an ADMIN account", "ADMIN_PROTECTED");
  }

  target.isActive = Boolean(isActive);
  await target.save();

  await recordUserActivity({
    companyId: actor.companyId,
    performedBy: actor.id,
    action: target.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityId: target._id,
    description: `${target.isActive ? "Activated" : "Deactivated"} ${target.email}`,
    metadata: { isActive: target.isActive, email: target.email },
    ipAddress,
  });

  return toSafeUser(target);
};

/**
 * Lists the actor's company employees. Only OWNER/ADMIN may call it.
 * Filters: role, isActive ("true"/"false"), q (case-insensitive name/email search).
 */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseListFilters = (query) => {
  const filter = {};

  if (query.role !== undefined && query.role !== "") {
    const role = normalizeString(query.role);
    if (!ALL_ROLES.includes(role)) {
      throw AppError.badRequest("Invalid role filter", [
        { field: "role", message: `role must be one of: ${ALL_ROLES.join(", ")}` },
      ]);
    }
    filter.role = role;
  }

  if (query.isActive !== undefined && query.isActive !== "") {
    if (query.isActive !== "true" && query.isActive !== "false") {
      throw AppError.badRequest("Invalid isActive filter", [
        { field: "isActive", message: "isActive must be true or false" },
      ]);
    }
    filter.isActive = query.isActive === "true";
  }

  if (query.q !== undefined && query.q !== "") {
    const term = normalizeString(query.q);
    if (term.length > 100) {
      throw AppError.badRequest("Search term is too long", [
        { field: "q", message: "q must be at most 100 characters" },
      ]);
    }
    const pattern = new RegExp(escapeRegExp(term), "i");
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  return filter;
};

const listCompanyUsers = async (actor, query = {}) => {
  assertCanManageUsers(actor);

  const filter = { ...parseListFilters(query), companyId: actor.companyId };
  const users = await User.find(filter).sort({ name: 1 });
  return users.map(toSafeUser);
};

/**
 * Ordinary profile update (name and phone only).
 *
 * role, companyId, email and password are deliberately never read from the
 * input: role changes go through updateUserRole/transferOwnership and the
 * company is always the authenticated actor's one.
 * - any authenticated user may edit their own record;
 * - OWNER/ADMIN may edit anyone else's record inside the company;
 * - nobody but the OWNER may modify the OWNER account.
 */
const updateUserProfile = async (actor, targetId, input, { ipAddress } = {}) => {
  const target = await getTargetUser(actor, targetId);

  const isSelf = String(target._id) === actor.id;
  if (!isSelf) {
    if (!USER_MANAGEMENT_ROLES.includes(actor.role)) {
      throw AppError.forbidden("You do not have permission to update this user", "FORBIDDEN");
    }
    if (target.role === ROLES.OWNER && actor.role !== ROLES.OWNER) {
      throw AppError.forbidden("The OWNER account cannot be modified here", "OWNER_PROTECTED");
    }
  }

  const changed = [];
  if (typeof input.name === "string") {
    target.name = normalizeString(input.name);
    changed.push("name");
  }
  if (input.phone !== undefined) {
    target.phone = normalizeString(input.phone || "");
    changed.push("phone");
  }

  if (changed.length > 0) {
    await target.save();

    await recordUserActivity({
      companyId: actor.companyId,
      performedBy: actor.id,
      action: "USER_PROFILE_UPDATED",
      entityId: target._id,
      description: `Updated ${changed.join(" and ")} of ${target.email}`,
      metadata: { fields: changed, email: target.email },
      ipAddress,
    });
  }

  return toSafeUser(target);
};

/**
 * Dedicated ownership transfer. Only the current OWNER may call it; the target
 * must be an active user of the same company and becomes OWNER while the
 * previous owner is demoted to ADMIN, atomically.
 */
const transferOwnership = async (actor, targetId) => {
  if (actor.role !== ROLES.OWNER) {
    throw AppError.forbidden("Only the OWNER can transfer ownership", "FORBIDDEN");
  }

  const id = parseId(targetId, "userId");
  if (id === actor.id) {
    throw new AppError("You cannot transfer ownership to yourself", 400, "SELF_OPERATION");
  }

  const target = await User.findOne({ _id: id, companyId: actor.companyId });
  if (!target) throw AppError.notFound("User not found");
  if (!target.isActive) {
    throw new AppError("Cannot transfer ownership to an inactive user", 400, "TARGET_INACTIVE");
  }

  const { result } = await runInTransaction(async (session) => {
    await User.updateOne({ _id: target._id }, { $set: { role: ROLES.OWNER } }, { session });
    await User.updateOne({ _id: actor.id }, { $set: { role: ROLES.ADMIN } }, { session });
    target.role = ROLES.OWNER;
    return { newOwner: target };
  });

  return {
    newOwner: toSafeUser(result.newOwner),
    previousOwnerRole: ROLES.ADMIN,
  };
};

/**
 * Lightweight directory of the actor's company (any authenticated member may
 * load it). Used for "assigned to" pickers: only id/name/role are exposed,
 * never emails, password hashes or account status.
 */
const listAssignableUsers = async (actor) => {
  const users = await User.find({ companyId: actor.companyId, isActive: true }).sort({
    name: 1,
  });
  return users.map((user) => ({
    id: String(user._id),
    name: user.name,
    role: user.role,
  }));
};

module.exports = {
  createCompanyUser,
  updateUserRole,
  setUserActiveState,
  updateUserProfile,
  listCompanyUsers,
  listAssignableUsers,
  transferOwnership,
  getTargetUser,
  assertCanManageUsers,
};
