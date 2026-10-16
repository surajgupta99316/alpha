import mongoose from "mongoose";

const abandonedCartSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    orderNumber: { type: String, required: true, index: true },
    fullName: { type: String, required: true, maxlength: 100 },
    phone: { type: String, required: true, match: /^[0-9]{10}$/ },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    items: [{
      name: { type: String, required: true, maxlength: 150 },
      quantity: { type: Number, required: true, min: 1 },
    }],
    amount: { type: Number, min: 0, required: true },
    status: { type: String, enum: ["pending", "converted", "contacted"], default: "pending", index: true },
    emailStatus: { type: String, enum: ["not_eligible", "queued", "sent", "failed"], default: "not_eligible" },
    emailAttempts: { type: Number, min: 0, default: 0 },
    emailSentAt: { type: Date },
    nextEmailAt: { type: Date, index: true },
    emailLock: { type: String, select: false },
  },
  { timestamps: true },
);

export default mongoose.model("AbandonedCart", abandonedCartSchema);
