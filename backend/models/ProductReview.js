import mongoose from "mongoose";

const productReviewSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    orderNumber: { type: String, required: true },
    customerName: { type: String, required: true, maxlength: 100 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100, default: "" },
    body: { type: String, required: true, trim: true, maxlength: 1500 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    moderationNote: { type: String, maxlength: 300, default: "" },
  },
  { timestamps: true },
);

productReviewSchema.index({ order: 1, product: 1 }, { unique: true });

export default mongoose.model("ProductReview", productReviewSchema);
