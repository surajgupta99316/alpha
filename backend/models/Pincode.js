import mongoose from "mongoose";

const pincodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, match: /^[0-9]{6}$/ },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    deliveryDays: { type: Number, required: true, min: 1, max: 30 },
    serviceable: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model("Pincode", pincodeSchema);
