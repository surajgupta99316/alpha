import mongoose from "mongoose";

const returnRequestSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, unique: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    orderNumber: { type: String, required: true, index: true },
    phone: { type: String, required: true, match: /^[0-9]{10}$/ },
    items: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      name: { type: String, required: true, maxlength: 150 },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
    }],
    reason: {
      type: String,
      required: true,
      enum: ["damaged", "wrong_item", "not_as_described", "quality_issue", "other"],
    },
    message: { type: String, maxlength: 1000, default: "" },
    photoDataUrl: { type: String, maxlength: 1_400_000, select: false },
    hasPhoto: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["Requested", "Approved", "Rejected", "Picked up", "Refunded"],
      default: "Requested",
      index: true,
    },
    statusTimeline: [{
      status: { type: String, required: true, maxlength: 40 },
      actor: { type: String, required: true, maxlength: 100 },
      changedAt: { type: Date, required: true, default: Date.now },
      note: { type: String, maxlength: 500 },
    }],
    refundAmount: { type: Number, min: 0, default: 0 },
    razorpayRefundId: { type: String, maxlength: 100 },
    refundProviderStatus: { type: String, enum: ["pending", "processed"] },
    refundAttemptedAt: { type: Date },
    manualRefundReference: { type: String, maxlength: 100 },
  },
  { timestamps: true },
);

export default mongoose.model("ReturnRequest", returnRequestSchema);
