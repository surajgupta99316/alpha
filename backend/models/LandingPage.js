import mongoose from "mongoose";

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const testimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quote: { type: String, required: true, trim: true },
    isSample: { type: Boolean, default: true },
  },
  { _id: false },
);

const landingPageSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    headline: { type: String, required: true, trim: true, maxlength: 120 },
    subheadline: { type: String, required: true, trim: true, maxlength: 240 },
    heroImage: { type: String, required: true, trim: true },
    offerText: { type: String, required: true, trim: true, maxlength: 180 },
    benefits: [{ type: String, trim: true }],
    ingredients: [{ type: String, trim: true }],
    faqs: [faqSchema],
    testimonials: [testimonialSchema],
    published: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("LandingPage", landingPageSchema);
