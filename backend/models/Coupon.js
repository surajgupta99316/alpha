import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z0-9_-]{3,30}$/ },
    type: { type: String, enum: ["flat", "percentage"], required: true },
    value: { type: Number, required: true, min: 1 },
    minimumOrderValue: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
    usageLimit: { type: Number, required: true, min: 1 },
    usageCount: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model("Coupon", couponSchema);
