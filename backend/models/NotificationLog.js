import mongoose from "mongoose";

const deliverySchema = new mongoose.Schema(
  {
    provider: { type: String, maxlength: 40, default: "" },
    status: { type: String, enum: ["pending", "sent", "failed", "skipped"], default: "pending" },
    error: { type: String, maxlength: 500, default: "" },
  },
  { _id: false },
);

const notificationLogSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, unique: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNumber: { type: String, required: true },
    event: { type: String, enum: ["order_placed", "shipped", "delivered"], required: true },
    email: { type: deliverySchema, default: () => ({}) },
    message: { type: deliverySchema, default: () => ({}) },
    status: { type: String, enum: ["queued", "processing", "sent", "partial", "failed"], default: "queued", index: true },
    attempts: { type: Number, min: 0, default: 0 },
    lock: { type: String, select: false },
  },
  { timestamps: true },
);

export default mongoose.model("NotificationLog", notificationLogSchema);
