
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    paymentNumber: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    paymentDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    method: {
      type: String,
      enum: [
        "CASH",
        "BANK_TRANSFER",
        "UPI",
        "CARD",
        "CHEQUE",
        "OTHER",
      ],
      required: true,
    },

    transactionReference: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["RECORDED", "VOIDED", "REFUNDED"],
      default: "RECORDED",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Void audit trail. Populated only when a RECORDED payment is voided; the
    // document is never physically deleted so history stays intact.
    voidReason: {
      type: String,
      trim: true,
      default: "",
    },

    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    voidedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Payment numbers must be unique within each company.
paymentSchema.index(
  { companyId: 1, paymentNumber: 1 },
  { unique: true }
);

// Retrieve payment history for an invoice.
paymentSchema.index({
  companyId: 1,
  invoiceId: 1,
  paymentDate: -1,
});

// Retrieve a client's payment history.
paymentSchema.index({
  companyId: 1,
  clientId: 1,
  paymentDate: -1,
});

module.exports = mongoose.model("Payment", paymentSchema);