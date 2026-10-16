import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, match: /^[0-9]{10}$/, index: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    message: { type: String, maxlength: 1000, default: "" },
    status: { type: String, enum: ["New", "Contacted", "Interested", "Converted", "Lost"], default: "New", index: true },
    assignedTo: { type: String, trim: true, maxlength: 100, default: "" },
    followUpAt: { type: Date },
    utm: {
      source: { type: String, maxlength: 200, default: "" },
      medium: { type: String, maxlength: 200, default: "" },
      campaign: { type: String, maxlength: 200, default: "" },
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  },
  { timestamps: true },
);

leadSchema.index({ phone: 1, status: 1 });

export default mongoose.model("Lead", leadSchema);
