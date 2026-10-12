
const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
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
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    source: {
      type: String,
      enum: [
        "WEBSITE",
        "PHONE",
        "WHATSAPP",
        "REFERRAL",
        "SOCIAL_MEDIA",
        "OTHER",
      ],
      default: "OTHER",
    },

    status: {
      type: String,
      enum: [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "PROPOSAL_SENT",
        "WON",
        "LOST",
      ],
      default: "NEW",
      required: true,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    nextFollowUpAt: {
      type: Date,
      default: null,
    },

    convertedClientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
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

// List leads belonging to a company.
leadSchema.index({ companyId: 1, status: 1, createdAt: -1 });

// Find leads assigned to an employee.
leadSchema.index({ companyId: 1, assignedTo: 1, status: 1 });

// Find leads that need follow-up.
leadSchema.index({ companyId: 1, nextFollowUpAt: 1 });

module.exports = mongoose.model("Lead", leadSchema);