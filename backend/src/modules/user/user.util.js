const toSafeUser = (user) => ({
  id: String(user._id),
  companyId: user.companyId ? String(user.companyId) : undefined,
  name: user.name,
  email: user.email,
  phone: user.phone || "",
  role: user.role,
  isActive: user.isActive,
  lastLogin: user.lastLogin || null,
  createdAt: user.createdAt,
});

module.exports = { toSafeUser };
