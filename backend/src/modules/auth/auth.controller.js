const service = require("./auth.service");

const register = async (req, res) => {
  const data = await service.register(req.body || {});
  res.status(201).json({
    success: true,
    message: "Company registered successfully",
    data,
  });
};

const login = async (req, res) => {
  const data = await service.login(req.body || {});
  res.status(200).json({
    success: true,
    message: "Signed in successfully",
    data,
  });
};

const me = async (req, res) => {
  const user = await service.getProfile(req.user.id);
  res.status(200).json({
    success: true,
    data: { user },
  });
};

const logout = async (req, res) => {
  res.status(200).json({
    success: true,
    data: service.logoutMessage(),
  });
};

const forgotPassword = async (req, res) => {
  // Deliberately generic: identical for existing and unknown accounts.
  const { message } = await service.forgotPassword(req.body || {});
  res.status(200).json({ success: true, message });
};

const resetPassword = async (req, res) => {
  const { message } = await service.resetPassword(req.body || {});
  res.status(200).json({ success: true, message });
};

module.exports = { register, login, me, logout, forgotPassword, resetPassword };
