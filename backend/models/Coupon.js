import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, match: /^[A-Z0-9_-]{3,30}$/ },
    type: { type: String, required: true, enum: ["flat", "percentage"] },
    value: { type: Number, required: true, min: 1 },
    minimumOrderValue: { type: Number, required: true, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },
    usageLimit: { type: Number, required: true, min: 1 },
    usageCount: { type: Number, required: true, min: 0, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model("Coupon", couponSchema);
