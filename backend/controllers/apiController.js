import mongoose from "mongoose";
import HttpError from "../utils/HttpError.js";
import LandingPage from "../models/LandingPage.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ExperimentExposure from "../models/ExperimentExposure.js";
import { sendOrderNotification } from "../utils/orderNotifications.js";

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

const hasAttribution = (value) => Boolean(value?.source || value?.medium || value?.campaign);

const textList = (value, field, maxItems = 12) => {
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be a list.`);
  if (value.length > maxItems) throw new HttpError(400, `${field} can contain at most ${maxItems} items.`);
  return value
    .map((item) => text(item, field, 180))
    .filter(Boolean);
};

function landingPageSaveError(error) {
  if (error?.code === 11000) {
    return new HttpError(
      409,
      "A campaign already uses this URL slug. To change its headlines, edit that campaign or choose a different URL slug.",
    );
  }
  return error;
}

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
    variantHeadline: text(body.variantHeadline, "Variant B headline", 120),
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export async function getCampaignPreview(req, res) {
  const slug = typeof req.params.slug === "string" ? req.params.slug.toLowerCase() : "";
  const page = await LandingPage.findOne({ slug, published: true }).populate("product", "name").lean();
  if (!page) throw new HttpError(404, "This campaign page was not found.");
  const variant = req.query.ab_variant === "B" && page.variantHeadline ? "B" : "A";
  const headline = variant === "B" ? page.variantHeadline : page.headline;
  const title = `${page.product.name} | Alpha Male`;
  const description = page.subheadline;
  const imageUrl = page.heroImage;
  const publicApiUrl = (process.env.PUBLIC_API_URL || `http://localhost:${Number(process.env.PORT) || 5000}`).replace(/\/+$/, "");
  const publicClientUrl = (process.env.CLIENT_PUBLIC_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");
  const previewUrl = `${publicApiUrl}/api/campaign-preview/${encodeURIComponent(slug)}${variant === "B" ? "?ab_variant=B" : ""}`;
  const campaignUrl = `${publicClientUrl}/lp/${encodeURIComponent(slug)}`;
  const redirect = JSON.stringify(campaignUrl).replaceAll("<", "\\u003c");
  res.set("Cache-Control", "public, max-age=300");
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(campaignUrl)}"><meta property="og:title" content="${escapeHtml(headline)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:url" content="${escapeHtml(previewUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(headline)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(imageUrl)}"><meta http-equiv="refresh" content="0;url=${escapeHtml(campaignUrl)}"></head><body><p>Opening ${escapeHtml(title)}…</p><script>window.location.replace(${redirect})</script></body></html>`);
}

export async function recordHeadlineExposure(req, res) {
  const slug = text(req.body?.slug, "Campaign slug", 80, { required: true }).toLowerCase();
  const variant = req.body?.variant;
  const visitorId = text(req.body?.visitorId, "Experiment visitor ID", 36, { required: true });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, "Campaign slug is invalid.");
  if (!["A", "B"].includes(variant)) throw new HttpError(400, "Choose headline variant A or B.");
  if (!/^[0-9a-f-]{36}$/i.test(visitorId)) throw new HttpError(400, "Experiment visitor ID is invalid.");
  const page = await LandingPage.findOne({ slug, published: true }).select("variantHeadline").lean();
  if (!page) throw new HttpError(404, "This campaign page was not found.");
  if (!page.variantHeadline) throw new HttpError(409, "This campaign has no headline experiment configured.");
  try {
    await ExperimentExposure.updateOne(
      { campaignSlug: slug, visitorId },
      { $setOnInsert: { campaignSlug: slug, visitorId, variant } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  res.status(202).json({ recorded: true });
}

export async function getLandingPages(req, res) {
  const pages = await LandingPage.find().populate("product", "name price mrp").sort({ updatedAt: -1 }).lean();
  res.json(pages);
}

export async function createLandingPage(req, res) {
  const input = landingPageInput(req.body || {});
  const product = await Product.findById(input.product);
  if (!product?.active) throw new HttpError(400, "Choose an active product.");
  let page;
  try {
    page = await LandingPage.create(input);
  } catch (error) {
    throw landingPageSaveError(error);
  }
  res.status(201).json(page);
}

export async function updateLandingPage(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid campaign page.");
  const input = landingPageInput(req.body || {});
  const product = await Product.findById(input.product);
  if (!product?.active) throw new HttpError(400, "Choose an active product.");
  let page;
  try {
    page = await LandingPage.findByIdAndUpdate(req.params.id, input, {
      new: true,
      runValidators: true,
    });
  } catch (error) {
    throw landingPageSaveError(error);
  }
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
  const headlineVariant = body.headlineVariant === undefined ? "A" : body.headlineVariant;
  if (!["A", "B"].includes(headlineVariant)) throw new HttpError(400, "Choose headline variant A or B.");
  if (headlineVariant === "B" && !page.variantHeadline) throw new HttpError(400, "This campaign has no alternate headline configured.");
  const experimentVisitorId = text(body.experimentVisitorId, "Experiment visitor ID", 36);
  if (experimentVisitorId && !/^[0-9a-f-]{36}$/i.test(experimentVisitorId)) {
    throw new HttpError(400, "Experiment visitor ID is invalid.");
  }
  const product = await Product.findById(page.product);
  if (!product?.active) throw new HttpError(400, "This product is no longer available.");

  const attribution = body.utm && typeof body.utm === "object" ? body.utm : {};
  const utm = {
    source: text(attribution.source, "UTM source", 200),
    medium: text(attribution.medium, "UTM medium", 200),
    campaign: text(attribution.campaign, "UTM campaign", 200),
  };
  const customer = await Customer.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone, fullName, ...(email ? { email } : {}), firstUtm: utm } },
    { upsert: true, new: true, runValidators: true },
  );
  if (!hasAttribution(customer.firstUtm) && hasAttribution(utm)) {
    await Customer.updateOne(
      {
        _id: customer._id,
        "firstUtm.source": { $in: ["", null] },
        "firstUtm.medium": { $in: ["", null] },
        "firstUtm.campaign": { $in: ["", null] },
      },
      { $set: { firstUtm: utm } },
    );
  }
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
      id: customer._id,
      fullName,
      phone,
      email,
      address,
    },
    amount: product.price,
    utm,
    ...(page.variantHeadline ? { headlineVariant, ...(experimentVisitorId ? { experimentVisitorId } : {}) } : {}),
  });
  await sendOrderNotification(order, "order_placed").catch((error) => {
    console.error("Could not record the order-placed notification.", {
      orderNumber: order.orderNumber,
      error: error.message,
    });
  });
  res.status(201).json({ orderNumber: order.orderNumber, amount: order.amount });
}
