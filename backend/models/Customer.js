import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, match: /^[0-9]{10}$/ },
    fullName: { type: String, trim: true, maxlength: 100, default: "" },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    lastLoginAt: { type: Date },
    firstUtm: {
      source: { type: String, trim: true, maxlength: 200, default: "" },
      medium: { type: String, trim: true, maxlength: 200, default: "" },
      campaign: { type: String, trim: true, maxlength: 200, default: "" },
    },
    tags: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    teamNotes: {
      type: [{
        body: { type: String, required: true, maxlength: 1000 },
        author: { type: String, required: true, maxlength: 100 },
        createdAt: { type: Date, required: true, default: Date.now },
      }],
      default: [],
    },
    loyaltyPoints: { type: Number, min: 0, default: 0 },
    loyaltyAwardOrderIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }], default: [], select: false },
    referralCode: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  },
  { timestamps: true },
);

export default mongoose.model("Customer", customerSchema);
