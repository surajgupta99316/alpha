import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, match: /^[0-9]{10}$/ },
    fullName: { type: String, trim: true, maxlength: 100, default: "" },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export default mongoose.model("Customer", customerSchema);
