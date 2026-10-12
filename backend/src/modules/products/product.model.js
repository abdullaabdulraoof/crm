
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    sku: {
      type: String,
      trim: true,
      default: "",
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    gstRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    type: {
      type: String,
      enum: ["PRODUCT", "SERVICE"],
      default: "PRODUCT",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helps list active products for a company's quotations.
productSchema.index({ companyId: 1, isActive: 1, name: 1 });

// SKU must be unique within a company when supplied.
productSchema.index(
  { companyId: 1, sku: 1 },
  {
    unique: true,
    partialFilterExpression: { sku: { $gt: "" } },
  }
);

module.exports = mongoose.model("Product", productSchema);