import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    landingPage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LandingPage",
      required: true,
    },
    product: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true, min: 1, default: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
    },
    customer: {
      fullName: { type: String, required: true, trim: true, maxlength: 100 },
      phone: { type: String, required: true, match: /^[0-9]{10}$/ },
      email: { type: String, trim: true, lowercase: true, maxlength: 254 },
      address: { type: String, required: true, trim: true, maxlength: 500 },
    },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["New"], default: "New" },
    utm: {
      source: { type: String, trim: true, maxlength: 200 },
      medium: { type: String, trim: true, maxlength: 200 },
      campaign: { type: String, trim: true, maxlength: 200 },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
