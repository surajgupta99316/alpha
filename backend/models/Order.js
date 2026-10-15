import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    landingPage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LandingPage",
    },
    product: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true, min: 1, default: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
    },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: { type: String, required: true },
        imageUrl: { type: String, default: "" },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        lineTotal: { type: Number, required: true, min: 0 },
      },
    ],
    customer: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
      fullName: { type: String, required: true, trim: true, maxlength: 100 },
      phone: { type: String, required: true, match: /^[0-9]{10}$/ },
      email: { type: String, trim: true, lowercase: true, maxlength: 254 },
      address: { type: String, required: true, trim: true, maxlength: 500 },
      pincode: { type: String, match: /^[0-9]{6}$/ },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
    },
    subtotal: { type: Number, min: 0 },
    discount: { type: Number, min: 0, default: 0 },
    shipping: { type: Number, min: 0, default: 0 },
    couponCode: { type: String, trim: true, uppercase: true },
    amount: { type: Number, required: true, min: 0 },
    checkoutToken: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ["New", "PendingPayment"], default: "New" },
    utm: {
      source: { type: String, trim: true, maxlength: 200 },
      medium: { type: String, trim: true, maxlength: 200 },
      campaign: { type: String, trim: true, maxlength: 200 },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
