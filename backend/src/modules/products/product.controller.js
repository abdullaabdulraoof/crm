const service = require("./product.service");

const create = async (req, res) => {
  const product = await service.createProduct(req.user, req.body || {}, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: "Product created successfully",
    data: { product },
  });
};

const list = async (req, res) => {
  const { products, pagination } = await service.listProducts(req.user, req.query || {});
  res.status(200).json({ success: true, data: products, pagination });
};

const getOne = async (req, res) => {
  const product = await service.getProduct(req.user, req.params.id);
  res.status(200).json({ success: true, data: { product } });
};

const update = async (req, res) => {
  const product = await service.updateProduct(req.user, req.params.id, req.body || {}, {
    ipAddress: req.ip,
  });
  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    data: { product },
  });
};

const remove = async (req, res) => {
  const result = await service.deactivateProduct(req.user, req.params.id, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: result.message || "Product deactivated successfully",
    data: { id: result.product.id, isActive: result.product.isActive },
  });
};

module.exports = { create, list, getOne, update, remove };
