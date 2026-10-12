
const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema(
  {
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

const invoiceSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },

    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quotation",
      default: null,
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [invoiceItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "An invoice must contain at least one item.",
      },
    },

    issueDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    dueDate: {
      type: Date,
      default: null,
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

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceDue: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "ISSUED",
        "PARTIALLY_PAID",
        "PAID",
        "OVERDUE",
        "CANCELLED",
      ],
      default: "DRAFT",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    paymentTerms: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Invoice numbers are unique within each company.
invoiceSchema.index(
  { companyId: 1, invoiceNumber: 1 },
  { unique: true }
);

// Retrieve invoices by company and status.
invoiceSchema.index({
  companyId: 1,
  status: 1,
  issueDate: -1,
});

// Retrieve a client's invoice history.
invoiceSchema.index({
  companyId: 1,
  clientId: 1,
  issueDate: -1,
});

// Find the invoice generated from a particular quotation.
invoiceSchema.index({ companyId: 1, quotationId: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);