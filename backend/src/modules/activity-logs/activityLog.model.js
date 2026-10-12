
const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    action: {
      type: String,
      required: true,
      trim: true,
    },

    entityType: {
      type: String,
      enum: [
        "COMPANY",
        "USER",
        "LEAD",
        "CLIENT",
        "PRODUCT",
        "FOLLOW_UP",
        "QUOTATION",
        "INVOICE",
        "PAYMENT",
      ],
      required: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Company activity timeline, newest first.
activityLogSchema.index({
  companyId: 1,
  createdAt: -1,
});

// Activity history for a particular record.
activityLogSchema.index({
  companyId: 1,
  entityType: 1,
  entityId: 1,
  createdAt: -1,
});

// Activity performed by a particular employee.
activityLogSchema.index({
  companyId: 1,
  performedBy: 1,
  createdAt: -1,
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);