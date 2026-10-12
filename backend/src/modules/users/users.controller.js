const service = require("./users.service");
const { toSafeUser } = require("../user/user.util");

const list = async (req, res) => {
  const users = await service.listCompanyUsers(req.user, req.query || {});
  res.status(200).json({ success: true, data: { users } });
};

const listOptions = async (req, res) => {
  const users = await service.listAssignableUsers(req.user);
  res.status(200).json({ success: true, data: { users } });
};

const create = async (req, res) => {
  const user = await service.createCompanyUser(req.user, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(201).json({
    success: true,
    message: "Employee created successfully",
    data: { user },
  });
};

const getOne = async (req, res) => {
  const target = await service.getTargetUser(req.user, req.params.id);
  res.status(200).json({ success: true, data: { user: toSafeUser(target) } });
};

const update = async (req, res) => {
  const user = await service.updateUserProfile(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: { user },
  });
};

const updateRole = async (req, res) => {
  const user = await service.updateUserRole(
    req.user,
    req.params.id,
    (req.body || {}).role,
    { ipAddress: req.ip }
  );
  res.status(200).json({
    success: true,
    message: "Role updated successfully",
    data: { user },
  });
};

const updateStatus = async (req, res) => {
  const user = await service.setUserActiveState(
    req.user,
    req.params.id,
    (req.body || {}).isActive,
    { ipAddress: req.ip }
  );
  res.status(200).json({
    success: true,
    message: "Employee status updated successfully",
    data: { user },
  });
};

module.exports = { list, listOptions, create, getOne, update, updateRole, updateStatus };
