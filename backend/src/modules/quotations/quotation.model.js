
const mongoose = require("mongoose");

const quotationItemSchema = new mongoose.Schema(
  {
    // Null when the employee enters a custom item manually.
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.01,
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

    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const quotationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    quotationNumber: {
      type: String,
      required: true,
      trim: true,
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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [quotationItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "A quotation must contain at least one item.",
      },
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    validUntil: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "SENT",
        "ACCEPTED",
        "REJECTED",
        "EXPIRED",
      ],
      default: "DRAFT",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Unique quotation number within each company.
quotationSchema.index(
  { companyId: 1, quotationNumber: 1 },
  { unique: true }
);

// Filter quotations by company and status.
quotationSchema.index({
  companyId: 1,
  status: 1,
  createdAt: -1,
});

// Find quotations for a particular client.
quotationSchema.index({ companyId: 1, clientId: 1, createdAt: -1 });

// Find quotations for a particular lead.
quotationSchema.index({ companyId: 1, leadId: 1, createdAt: -1 });

module.exports = mongoose.model("Quotation", quotationSchema);