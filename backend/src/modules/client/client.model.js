const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
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

    phoneNumber: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    gstNo: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    clientType: {
      type: String,
      enum: ["INDIVIDUAL", "BUSINESS"],
      default: "INDIVIDUAL",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

// Helps retrieve clients belonging to a company.
clientSchema.index({ companyId: 1 });

// Helps search clients by name within a company.
clientSchema.index({ companyId: 1, name: 1 });

module.exports = mongoose.model("Client", clientSchema);