import mongoose from "mongoose";

const experimentExposureSchema = new mongoose.Schema(
  {
    campaignSlug: { type: String, required: true, trim: true, maxlength: 80 },
    visitorId: { type: String, required: true, match: /^[0-9a-f-]{36}$/i },
    variant: { type: String, enum: ["A", "B"], required: true },
  },
  { timestamps: true },
);

experimentExposureSchema.index({ campaignSlug: 1, visitorId: 1 }, { unique: true });
experimentExposureSchema.index({ variant: 1, createdAt: -1 });

export default mongoose.model("ExperimentExposure", experimentExposureSchema);
