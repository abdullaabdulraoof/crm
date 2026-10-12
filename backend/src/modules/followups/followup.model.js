
const mongoose = require("mongoose");

const followUpSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["CALL", "MEETING", "EMAIL", "WHATSAPP", "OTHER"],
      required: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    dueAt: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },

    completedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Find a company's upcoming follow-ups efficiently.
followUpSchema.index({ companyId: 1, status: 1, dueAt: 1 });

// Find follow-ups assigned to a particular employee.
followUpSchema.index({ companyId: 1, assignedTo: 1, status: 1 });

// Filter follow-ups by their lead or client target.
followUpSchema.index({ companyId: 1, leadId: 1 });
followUpSchema.index({ companyId: 1, clientId: 1 });

module.exports = mongoose.model("FollowUp", followUpSchema);