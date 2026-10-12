const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
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
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["OWNER", "ADMIN", "MANAGER", "SALES"],
      default: "SALES",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    // Password reset: only the SHA-256 hash of the reset token is stored, never
    // the raw token. Cleared after a successful reset.
    passwordResetTokenHash: {
      type: String,
      default: null,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One email account per user across the CRM.
userSchema.index({ email: 1 }, { unique: true });

// Password reset lookups run by token hash.
userSchema.index({ passwordResetTokenHash: 1 });

// Listing users belonging to a company.
userSchema.index({ companyId: 1, role: 1 });

// Defensive normalization: covers registration, password changes, and any
// code path that writes the email directly (in addition to the schema setters).
userSchema.pre("validate", function () {
  if (typeof this.email === "string") {
    this.email = this.email.trim().toLowerCase();
  }
});

module.exports = mongoose.model("User", userSchema);
