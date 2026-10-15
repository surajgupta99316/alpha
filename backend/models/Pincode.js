import mongoose from "mongoose";

const pincodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, match: /^[0-9]{6}$/ },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    serviceable: { type: Boolean, default: true },
    deliveryDays: { type: Number, default: 4, min: 1, max: 30 },
  },
  { timestamps: true },
);

export default mongoose.model("Pincode", pincodeSchema);
