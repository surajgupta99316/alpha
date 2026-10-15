import mongoose from "mongoose";
import HttpError from "../utils/HttpError.js";
import LandingPage from "../models/LandingPage.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

const text = (value, field, maxLength, { required = false } = {}) => {
  if (typeof value !== "string") {
    if (required) throw new HttpError(400, `${field} is required.`);
    return "";
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(400, `${field} is required.`);
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
};

const textList = (value, field, maxItems = 12) => {
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be a list.`);
  if (value.length > maxItems) throw new HttpError(400, `${field} can contain at most ${maxItems} items.`);
  return value
    .map((item) => text(item, field, 180))
    .filter(Boolean);
};

function landingPageInput(body) {
  const slug = text(body.slug, "URL slug", 80, { required: true }).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, "URL slug can use lowercase letters, numbers, and hyphens.");
  }
  if (!mongoose.isValidObjectId(body.productId)) {
    throw new HttpError(400, "Choose a valid product.");
  }
  if (!Array.isArray(body.faqs) || !Array.isArray(body.testimonials)) {
    throw new HttpError(400, "FAQs and testimonials must be lists.");
  }
  const faqs = body.faqs;
  if (faqs.length > 12) throw new HttpError(400, "FAQs can contain at most 12 items.");
  const testimonials = body.testimonials;
  if (testimonials.length > 8) throw new HttpError(400, "Testimonials can contain at most 8 items.");
  const heroImage = text(body.heroImage, "Banner image URL", 1000, { required: true });
  let parsedImage;
  try {
    parsedImage = new URL(heroImage);
  } catch {
    throw new HttpError(400, "Banner image must be an absolute HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(parsedImage.protocol)) {
    throw new HttpError(400, "Banner image must be an absolute HTTP or HTTPS URL.");
  }

  return {
    product: body.productId,
    slug,
    headline: text(body.headline, "Headline", 120, { required: true }),
    subheadline: text(body.subheadline, "Supporting headline", 240, { required: true }),
    heroImage,
    offerText: text(body.offerText, "Offer text", 180, { required: true }),
    benefits: textList(body.benefits, "Benefits"),
    ingredients: textList(body.ingredients, "Ingredients"),
    faqs: faqs.map((faq) => ({
      question: text(faq?.question, "FAQ question", 180, { required: true }),
      answer: text(faq?.answer, "FAQ answer", 500, { required: true }),
    })),
    testimonials: testimonials.map((testimonial) => ({
      name: text(testimonial?.name, "Testimonial name", 100, { required: true }),
      quote: text(testimonial?.quote, "Testimonial quote", 500, { required: true }),
      isSample: true,
    })),
    published: Boolean(body.published),
  };
}

export function getHealth(req, res) {
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
}

export async function getProducts(req, res) {
  const products = await Product.find({ active: true }).sort({ name: 1 }).lean();
  res.json(products);
}

export async function getPublishedLandingPage(req, res) {
  const page = await LandingPage.findOne({ slug: req.params.slug.toLowerCase(), published: true })
    .populate("product")
    .lean();
  if (!page) throw new HttpError(404, "This campaign page was not found.");
  res.json(page);
}

export async function getLandingPages(req, res) {
  const pages = await LandingPage.find().populate("product", "name price mrp").sort({ updatedAt: -1 }).lean();
  res.json(pages);
}

export async function createLandingPage(req, res) {
  const input = landingPageInput(req.body || {});
  const product = await Product.findById(input.product);
  if (!product?.active) throw new HttpError(400, "Choose an active product.");
  const page = await LandingPage.create(input);
  res.status(201).json(page);
}

export async function updateLandingPage(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid campaign page.");
  const input = landingPageInput(req.body || {});
  const product = await Product.findById(input.product);
  if (!product?.active) throw new HttpError(400, "Choose an active product.");
  const page = await LandingPage.findByIdAndUpdate(req.params.id, input, {
    new: true,
    runValidators: true,
  });
  if (!page) throw new HttpError(404, "Campaign page was not found.");
  res.json(page);
}

export async function getOrders(req, res) {
  const orders = await Order.find()
    .populate("landingPage", "slug headline")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json(orders);
}

export async function createOrder(req, res) {
  const body = req.body || {};
  const fullName = text(body.fullName, "Full name", 100, { required: true });
  const phone = text(body.phone, "Mobile number", 10, { required: true });
  if (!/^[0-9]{10}$/.test(phone)) throw new HttpError(400, "Enter a valid 10-digit mobile number.");
  const address = text(body.address, "Delivery address", 500, { required: true });
  const email = text(body.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }

  const slug = text(body.slug, "Campaign URL", 80, { required: true }).toLowerCase();
  const page = await LandingPage.findOne({ slug, published: true });
  if (!page) throw new HttpError(404, "This campaign page is no longer available.");
  const product = await Product.findById(page.product);
  if (!product?.active) throw new HttpError(400, "This product is no longer available.");

  const attribution = body.utm && typeof body.utm === "object" ? body.utm : {};
  const utm = {
    source: text(attribution.source, "UTM source", 200),
    medium: text(attribution.medium, "UTM medium", 200),
    campaign: text(attribution.campaign, "UTM campaign", 200),
  };
  const order = await Order.create({
    orderNumber: `AM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    landingPage: page._id,
    product: {
      id: product._id,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
    },
    customer: {
      id: (await Customer.findOneAndUpdate(
        { phone },
        { $setOnInsert: { phone, fullName, ...(email ? { email } : {}) } },
        { upsert: true, new: true, runValidators: true },
      ))._id,
      fullName,
      phone,
      email,
      address,
    },
    amount: product.price,
    utm,
  });
  res.status(201).json({ orderNumber: order.orderNumber, amount: order.amount });
}
