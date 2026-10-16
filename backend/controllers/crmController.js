import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import HttpError from "../utils/HttpError.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Lead from "../models/Lead.js";
import AbandonedCart from "../models/AbandonedCart.js";
import ProductReview from "../models/ProductReview.js";
import ReturnRequest from "../models/ReturnRequest.js";
import SupportTicket from "../models/SupportTicket.js";
import ExperimentExposure from "../models/ExperimentExposure.js";
import LandingPage from "../models/LandingPage.js";

const LEAD_STATUSES = ["New", "Contacted", "Interested", "Converted", "Lost"];
const PRODUCT_FIELDS = "name slug category description price mrp stock imageUrl active hsnCode lowStockThreshold";
const hasAttribution = (value) => Boolean(value?.source || value?.medium || value?.campaign);
const leadRequests = new Map();

function checkLeadRequestLimit(ip) {
  const now = Date.now();
  let bucket = leadRequests.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 15 * 60 * 1000 };
    leadRequests.set(ip, bucket);
  }
  if (leadRequests.size > 5000) {
    for (const [key, value] of leadRequests) {
      if (value.resetAt <= now) leadRequests.delete(key);
    }
  }
  bucket.count += 1;
  if (bucket.count > 6) throw new HttpError(429, "Too many callback requests. Please try again later.");
}

function text(value, field, maxLength, required = false) {
  if (typeof value !== "string") {
    if (required) throw new HttpError(400, `${field} is required.`);
    return "";
  }
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${field} is required.`);
  if (result.length > maxLength) throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`);
  return result;
}

function phone(value) {
  const result = text(value, "Mobile number", 10, true);
  if (!/^[0-9]{10}$/.test(result)) throw new HttpError(400, "Enter a valid 10-digit mobile number.");
  return result;
}

function dateFilter(req) {
  const fromValue = text(req.query.from, "Start date", 10);
  const toValue = text(req.query.to, "End date", 10);
  const filter = {};
  if (fromValue) {
    const from = new Date(`${fromValue}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromValue) || Number.isNaN(from.getTime()) || from.toISOString().slice(0, 10) !== fromValue) {
      throw new HttpError(400, "Start date must be a valid YYYY-MM-DD date.");
    }
    filter.$gte = from;
  }
  if (toValue) {
    const to = new Date(`${toValue}T23:59:59.999Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toValue) || Number.isNaN(to.getTime()) || to.toISOString().slice(0, 10) !== toValue) {
      throw new HttpError(400, "End date must be a valid YYYY-MM-DD date.");
    }
    filter.$lte = to;
  }
  if (filter.$gte && filter.$lte && filter.$gte > filter.$lte) {
    throw new HttpError(400, "Start date must be on or before end date.");
  }
  return filter;
}

function safeRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function escapeCsv(value) {
  let result = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}

function sendCsv(res, filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`\uFEFF${csv}`);
}

function productInput(body) {
  const name = text(body?.name, "Product name", 120, true);
  const slug = text(body?.slug, "Product URL slug", 120, true).toLowerCase();
  const category = text(body?.category, "Category", 80, true);
  const description = text(body?.description, "Description", 2000, true);
  const imageUrl = text(body?.imageUrl, "Image URL", 1000, true);
  let parsedUrl;
  try { parsedUrl = new URL(imageUrl); } catch { throw new HttpError(400, "Image URL must be an absolute HTTP or HTTPS URL."); }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new HttpError(400, "Image URL must use HTTP or HTTPS.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, "Product slug may contain lowercase letters, numbers, and hyphens.");
  const price = Number(body.price);
  const mrp = Number(body.mrp);
  const stock = Number(body.stock);
  const lowStockThreshold = Number(body.lowStockThreshold ?? 10);
  const hsnCode = text(body.hsnCode, "HSN code", 20, true);
  if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(mrp) || mrp < price) {
    throw new HttpError(400, "Selling price and MRP must be non-negative whole rupees, and MRP cannot be lower than price.");
  }
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1_000_000) throw new HttpError(400, "Stock must be a whole number between 0 and 1,000,000.");
  if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 1_000_000) {
    throw new HttpError(400, "Low-stock threshold must be a whole number between 0 and 1,000,000.");
  }
  if (!/^[0-9]{4,8}$/.test(hsnCode)) throw new HttpError(400, "HSN code must contain 4 to 8 digits.");
  if (body.active !== undefined && typeof body.active !== "boolean") throw new HttpError(400, "Product availability must be true or false.");
  return {
    name, slug, category, description, imageUrl, price, mrp, stock, hsnCode, lowStockThreshold,
    active: body.active !== false,
  };
}

function leadInput(body) {
  const fullName = text(body?.fullName, "Full name", 100, true);
  const leadPhone = phone(body?.phone);
  const email = text(body?.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const message = text(body?.message, "Message", 1000);
  const attribution = body?.utm && typeof body.utm === "object" && !Array.isArray(body.utm) ? body.utm : {};
  return {
    fullName,
    phone: leadPhone,
    email,
    message,
    utm: {
      source: text(attribution.source, "UTM source", 200),
      medium: text(attribution.medium, "UTM medium", 200),
      campaign: text(attribution.campaign, "UTM campaign", 200),
    },
  };
}

export async function createLead(req, res) {
  checkLeadRequestLimit(req.ip || req.socket?.remoteAddress || "unknown");
  const input = leadInput(req.body || {});
  const customer = await Customer.findOneAndUpdate(
    { phone: input.phone },
    { $setOnInsert: { phone: input.phone, fullName: input.fullName, email: input.email, firstUtm: input.utm } },
    { upsert: true, new: true, runValidators: true },
  );
  if (!hasAttribution(customer.firstUtm) && hasAttribution(input.utm)) {
    await Customer.updateOne(
      {
        _id: customer._id,
        "firstUtm.source": { $in: ["", null] },
        "firstUtm.medium": { $in: ["", null] },
        "firstUtm.campaign": { $in: ["", null] },
      },
      { $set: { firstUtm: input.utm } },
    );
  }
  const lead = await Lead.create({
    ...input,
    ...(customer ? { customer: customer._id } : {}),
  });
  res.status(201).json({ id: lead._id, status: lead.status, message: "Callback request received." });
}

export async function listLeads(req, res) {
  const status = text(req.query.status, "Lead status", 30);
  if (status && !LEAD_STATUSES.includes(status)) throw new HttpError(400, "Unknown lead status.");
  const filter = status ? { status } : {};
  if (req.query.search) {
    const query = text(req.query.search, "Search", 100);
    filter.$or = [
      { fullName: safeRegex(query) },
      { phone: safeRegex(query) },
      { email: safeRegex(query) },
    ];
  }
  const leads = await Lead.find(filter).sort({ updatedAt: -1 }).limit(500).lean();
  res.json(leads);
}

export async function updateLead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid lead reference.");
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new HttpError(404, "Lead was not found.");
  const body = req.body || {};
  if (body.status !== undefined) {
    if (!LEAD_STATUSES.includes(body.status)) throw new HttpError(400, "Unknown lead status.");
    lead.status = body.status;
  }
  if (body.assignedTo !== undefined) lead.assignedTo = text(body.assignedTo, "Assignee", 100);
  if (body.followUpAt !== undefined) {
    if (body.followUpAt === null || body.followUpAt === "") lead.followUpAt = undefined;
    else {
      const followUpAt = new Date(body.followUpAt);
      if (Number.isNaN(followUpAt.getTime())) throw new HttpError(400, "Choose a valid follow-up date.");
      lead.followUpAt = followUpAt;
    }
  }
  await lead.save();
  res.json(lead);
}

export async function saveAbandonedCartFromOrder(order) {
  if (!order.customer?.phone || !order.customer?.id) return;
  await AbandonedCart.updateOne(
    { order: order._id },
    {
      $setOnInsert: {
        order: order._id,
        customer: order.customer.id,
        orderNumber: order.orderNumber,
        fullName: order.customer.fullName,
        phone: order.customer.phone,
        email: order.customer.email || "",
        items: (order.items || []).map((item) => ({ name: item.name, quantity: item.quantity })),
        amount: order.amount,
        status: "pending",
        emailStatus: order.customer.email ? "queued" : "not_eligible",
        nextEmailAt: order.customer.email ? new Date(Date.now() + 60 * 60 * 1000) : undefined,
      },
    },
    { upsert: true },
  );
}

export async function markAbandonedCartConverted(orderId) {
  await AbandonedCart.updateOne({ order: orderId, status: { $ne: "converted" } }, { $set: { status: "converted" } });
}

export async function listAbandonedCarts(req, res) {
  const status = text(req.query.status, "Cart status", 20);
  if (status && !["pending", "converted", "contacted"].includes(status)) throw new HttpError(400, "Unknown abandoned cart status.");
  const carts = await AbandonedCart.find(status ? { status } : {})
    .select(req.staff.role === "admin" ? "" : "-items -amount")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
  res.json(carts);
}

export async function updateAbandonedCart(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid abandoned cart.");
  const status = req.body?.status;
  if (!["contacted", "pending"].includes(status)) throw new HttpError(400, "Choose contacted or pending.");
  const cart = await AbandonedCart.findByIdAndUpdate(
    req.params.id,
    { $set: { status } },
    { new: true, runValidators: true },
  ).select(req.staff.role === "admin" ? "" : "-items -amount");
  if (!cart) throw new HttpError(404, "Abandoned cart was not found.");
  res.json(cart);
}

export async function processAbandonedCartEmails() {
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.NOTIFICATION_FROM_EMAIL?.trim()) return;
  const now = new Date();
  const candidate = await AbandonedCart.findOneAndUpdate(
    {
      status: "pending",
      emailStatus: { $in: ["queued", "failed"] },
      emailAttempts: { $lt: 3 },
      nextEmailAt: { $lte: now },
      emailLock: { $exists: false },
    },
    { $set: { emailLock: randomBytes(16).toString("hex") }, $inc: { emailAttempts: 1 } },
    { new: true },
  ).select("+emailLock");
  if (!candidate) return false;
  const lock = candidate.emailLock;
  const order = await Order.findById(candidate.order).select("+checkoutToken").lean();
  if (!order || !["PendingPayment", "Failed", "CODPendingConfirmation"].includes(order.status)) {
    await AbandonedCart.updateOne(
      { _id: candidate._id, emailLock: lock },
      { $set: { status: "converted", emailStatus: "not_eligible" }, $unset: { emailLock: 1 } },
    );
    return true;
  }
  const origin = (process.env.CLIENT_PUBLIC_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");
  const resumeUrl = `${origin}/checkout/success/${encodeURIComponent(order.orderNumber)}?checkoutToken=${encodeURIComponent(order.checkoutToken)}`;
  const safeName = candidate.fullName.replace(/[&<>"']/g, "");
  let failure = "";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFICATION_FROM_EMAIL.trim(),
        to: [candidate.email],
        subject: "Your Alpha Male selection is waiting",
        text: `Hi ${safeName}, your saved Alpha Male checkout is still available. Continue here: ${resumeUrl}`,
        html: `<p>Hi ${safeName}, your saved Alpha Male checkout is still available.</p><p><a href="${resumeUrl}">Continue your checkout</a></p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      failure = `Resend rejected the email (HTTP ${response.status}${payload.name ? `, ${payload.name}` : ""}).`;
    }
  } catch {
    failure = "Resend could not be reached before the email timed out.";
  }
  const update = failure
    ? {
      $set: {
        emailStatus: "failed",
        nextEmailAt: candidate.emailAttempts < 3 ? new Date(Date.now() + candidate.emailAttempts * 60 * 60 * 1000) : undefined,
      },
      $unset: { emailLock: 1, ...(candidate.emailAttempts >= 3 ? { nextEmailAt: 1 } : {}) },
    }
    : {
      $set: { emailStatus: "sent", emailSentAt: new Date() },
      $unset: { emailLock: 1, nextEmailAt: 1 },
    };
  const saved = await AbandonedCart.updateOne({ _id: candidate._id, emailLock: lock }, update);
  if (saved.modifiedCount !== 1) throw new HttpError(409, "Abandoned-cart email status changed while sending.");
  if (failure) console.error("Abandoned-cart email failed.", { orderNumber: candidate.orderNumber, error: failure });
  return true;
}

export async function createProductReview(req, res) {
  const orderNumber = text(req.body?.orderNumber, "Order number", 50, true);
  const customerPhone = phone(req.body?.phone);
  const productId = req.body?.productId;
  if (!mongoose.isValidObjectId(productId)) throw new HttpError(400, "Choose a valid product.");
  const rating = Number(req.body?.rating);
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "Rating must be a whole number from 1 to 5.");
  const title = text(req.body?.title, "Review title", 100);
  const body = text(req.body?.body, "Review", 1500, true);
  const order = await Order.findOne({ orderNumber, "customer.phone": customerPhone, fulfillmentStatus: "Delivered" })
    .select("customer items product")
    .lean();
  if (!order) throw new HttpError(403, "Only a delivered order belonging to this mobile number can be reviewed.");
  const purchased = order.items?.some((item) => item.product?.toString() === productId)
    || order.product?.id?.toString() === productId;
  if (!purchased) throw new HttpError(403, "This product was not part of the delivered order.");
  const customer = await Customer.findById(order.customer.id).select("fullName").lean();
  const review = await ProductReview.create({
    order: order._id,
    customer: order.customer.id,
    product: productId,
    orderNumber,
    customerName: customer?.fullName || "Verified customer",
    rating,
    title,
    body,
  });
  res.status(201).json({ id: review._id, status: review.status, message: "Review submitted and pending moderation." });
}

export async function getApprovedReviews(req, res) {
  const product = await Product.findOne({ slug: text(req.params.slug, "Product slug", 120, true), active: true }).select("_id").lean();
  if (!product) throw new HttpError(404, "Product was not found.");
  const reviews = await ProductReview.find({ product: product._id, status: "approved" })
    .select("customerName rating title body createdAt")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json(reviews);
}

export async function listReviews(req, res) {
  const status = text(req.query.status, "Review status", 20);
  if (status && !["pending", "approved", "rejected"].includes(status)) throw new HttpError(400, "Unknown review status.");
  const reviews = await ProductReview.find(status ? { status } : {})
    .populate("product", "name slug")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json(reviews);
}

export async function moderateReview(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid product review.");
  const status = req.body?.status;
  if (!["approved", "rejected"].includes(status)) throw new HttpError(400, "Choose approved or rejected.");
  const moderationNote = text(req.body?.moderationNote, "Moderation note", 300);
  const review = await ProductReview.findByIdAndUpdate(
    req.params.id,
    { $set: { status, moderationNote } },
    { new: true, runValidators: true },
  ).populate("product", "name slug");
  if (!review) throw new HttpError(404, "Product review was not found.");
  res.json(review);
}

async function eligibleCustomerIds(segment) {
  const settledStatuses = ["Paid", "CODConfirmed"];
  const basePipeline = [{ $match: { status: { $in: settledStatuses }, fulfillmentStatus: { $nin: ["Cancelled", "RTO"] } } }];
  if (segment === "one_purchase_30_days_ago") {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await Order.aggregate([
      ...basePipeline,
      { $group: { _id: "$customer.id", count: { $sum: 1 }, lastOrderAt: { $max: "$createdAt" } } },
      { $match: { count: 1, lastOrderAt: { $lte: cutoff }, _id: { $ne: null } } },
      { $project: { _id: 1 } },
    ]);
    return rows.map((row) => row._id);
  }
  if (segment === "spent_above_5000") {
    const rows = await Order.aggregate([
      ...basePipeline,
      { $group: { _id: "$customer.id", spent: { $sum: "$amount" } } },
      { $match: { spent: { $gt: 5000 }, _id: { $ne: null } } },
      { $project: { _id: 1 } },
    ]);
    return rows.map((row) => row._id);
  }
  if (segment === "cod_rto") {
    const rows = await Order.aggregate([
      { $match: { paymentMethod: { $in: ["cod", "partial_cod"] }, fulfillmentStatus: "RTO", "customer.id": { $ne: null } } },
      { $group: { _id: "$customer.id" } },
    ]);
    return rows.map((row) => row._id);
  }
  throw new HttpError(400, "Choose one_purchase_30_days_ago, spent_above_5000, or cod_rto.");
}

export async function listCustomers(req, res) {
  const segment = text(req.query.segment, "Customer segment", 50);
  const search = text(req.query.search, "Search", 100);
  const filter = {};
  if (search) {
    const expression = safeRegex(search);
    filter.$or = [{ fullName: expression }, { phone: expression }, { email: expression }, { referralCode: expression }];
  }
  if (segment) filter._id = { $in: await eligibleCustomerIds(segment) };
  const customers = await Customer.find(filter)
    .select(req.staff.role === "admin" ? "" : "-loyaltyPoints -referralCode -referredBy")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
  res.json(customers.map((customer) => ({
    _id: customer._id,
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email,
    tags: customer.tags || [],
    firstUtm: customer.firstUtm || {},
    ...(req.staff.role === "admin" ? { loyaltyPoints: customer.loyaltyPoints || 0, referralCode: customer.referralCode || "" } : {}),
  })));
}

export async function getCustomer360(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid customer reference.");
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) throw new HttpError(404, "Customer was not found.");
  const filter = { "customer.id": customer._id };
  const [orders, returns, tickets, orderTotals] = await Promise.all([
    Order.find(filter).select(req.staff.role === "admin" ? "orderNumber status fulfillmentStatus paymentMethod paymentStatus amount amountPaid codDue items createdAt" : "orderNumber status fulfillmentStatus paymentMethod paymentStatus createdAt").sort({ createdAt: -1 }).limit(100).lean(),
    ReturnRequest.find({ customer: customer._id }).select(req.staff.role === "admin" ? "returnNumber orderNumber status reason createdAt refundAmount" : "returnNumber orderNumber status reason createdAt").sort({ createdAt: -1 }).limit(100).lean(),
    SupportTicket.find({ customer: customer._id }).select("ticketNumber orderNumber subject status createdAt").sort({ createdAt: -1 }).limit(100).lean(),
    Order.aggregate([
      { $match: { ...filter, status: { $in: ["Paid", "CODConfirmed"] }, fulfillmentStatus: { $nin: ["Cancelled", "RTO"] } } },
      { $group: { _id: null, totalSpent: { $sum: "$amount" }, orderCount: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    customer: {
      _id: customer._id,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      firstUtm: customer.firstUtm || {},
      tags: customer.tags || [],
      teamNotes: customer.teamNotes || [],
      ...(req.staff.role === "admin" ? {
        loyaltyPoints: customer.loyaltyPoints || 0,
        referralCode: customer.referralCode || "",
        totalSpent: orderTotals[0]?.totalSpent || 0,
        orderCount: orderTotals[0]?.orderCount || 0,
      } : {}),
    },
    orders,
    returns,
    tickets,
  });
}

export async function updateCustomerNotes(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid customer reference.");
  const action = req.body?.action;
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new HttpError(404, "Customer was not found.");
  if (action === "tags") {
    if (!Array.isArray(req.body.tags) || req.body.tags.length > 30) throw new HttpError(400, "Customer tags must be a list of at most 30 values.");
    const tags = [...new Set(req.body.tags.map((tag) => text(tag, "Tag", 40)).filter(Boolean))];
    customer.tags = tags;
  } else if (action === "note") {
    const body = text(req.body.body, "Team note", 1000, true);
    if (customer.teamNotes.length >= 100) throw new HttpError(409, "This customer has reached the team note limit.");
    customer.teamNotes.push({
      body,
      author: req.staff.fullName,
      createdAt: new Date(),
    });
  } else {
    throw new HttpError(400, "Choose tags or note.");
  }
  await customer.save();
  res.json({ tags: customer.tags, teamNotes: customer.teamNotes });
}

export async function getSegments(req, res) {
  const definitions = [
    ["one_purchase_30_days_ago", "Bought once, 30+ days ago"],
    ["spent_above_5000", "Spent above ₹5,000"],
    ["cod_rto", "COD customers with an RTO"],
  ];
  const segments = await Promise.all(definitions.map(async ([id, label]) => ({
    id,
    label,
    count: (await eligibleCustomerIds(id)).length,
  })));
  res.json(segments);
}

export async function dashboard(req, res) {
  const range = dateFilter(req);
  const orderFilter = Object.keys(range).length ? { createdAt: range } : {};
  const settled = { status: { $in: ["Paid", "CODConfirmed"] }, fulfillmentStatus: { $nin: ["Cancelled", "RTO"] }, ...orderFilter };
  const [daily, campaigns, variantOrders, variantExposures, allSettled, rtoOrders, shippedOrders, customerRepeat, methodCounts, totalOrders] = await Promise.all([
    Order.aggregate([
      { $match: settled },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$amount" }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: settled },
      { $group: { _id: { $ifNull: ["$utm.campaign", "Direct / untagged"] }, orders: { $sum: 1 }, revenue: { $sum: "$amount" } } },
      { $sort: { revenue: -1 } },
      { $limit: 30 },
    ]),
    Order.aggregate([
      { $match: { ...orderFilter, headlineVariant: { $in: ["A", "B"] } } },
      {
        $lookup: {
          from: LandingPage.collection.name,
          localField: "landingPage",
          foreignField: "_id",
          as: "campaign",
        },
      },
      { $unwind: "$campaign" },
      { $match: { "campaign.variantHeadline": { $exists: true, $ne: "" } } },
      {
        $group: {
          _id: { campaign: "$campaign.slug", variant: "$headlineVariant" },
          orders: { $sum: 1 },
          conversions: {
            $sum: {
              $cond: [{
                $and: [
                  { $in: ["$status", ["Paid", "CODConfirmed"]] },
                  { $not: [{ $in: ["$fulfillmentStatus", ["Cancelled", "RTO"]] }] },
                ],
              }, 1, 0],
            },
          },
          revenue: {
            $sum: {
              $cond: [{
                $and: [
                  { $in: ["$status", ["Paid", "CODConfirmed"]] },
                  { $not: [{ $in: ["$fulfillmentStatus", ["Cancelled", "RTO"]] }] },
                ],
              }, "$amount", 0],
            },
          },
        },
      },
    ]),
    ExperimentExposure.aggregate([
      ...(Object.keys(range).length ? [{ $match: { createdAt: range } }] : []),
      { $group: { _id: { campaign: "$campaignSlug", variant: "$variant" }, impressions: { $sum: 1 } } },
    ]),
    Order.aggregate([{ $match: settled }, { $group: { _id: null, revenue: { $sum: "$amount" }, orders: { $sum: 1 } } }]),
    Order.countDocuments({ ...orderFilter, fulfillmentStatus: "RTO" }),
    Order.countDocuments({ ...orderFilter, fulfillmentStatus: { $in: ["Shipped", "Out for delivery", "Delivered", "RTO", "Returned"] } }),
    Order.aggregate([
      { $match: settled },
      { $group: { _id: "$customer.id", count: { $sum: 1 } } },
      { $group: { _id: null, customers: { $sum: 1 }, repeatCustomers: { $sum: { $cond: [{ $gt: ["$count", 1] }, 1, 0] } } } },
    ]),
    Order.aggregate([
      { $match: settled },
      { $group: { _id: "$paymentMethod", orders: { $sum: 1 }, revenue: { $sum: "$amount" } } },
    ]),
    Order.countDocuments(orderFilter),
  ]);
  const summary = allSettled[0] || { revenue: 0, orders: 0 };
  const repeat = customerRepeat[0] || { customers: 0, repeatCustomers: 0 };
  res.json({
    summary: {
      revenue: summary.revenue,
      orders: summary.orders,
      aov: summary.orders ? Math.round(summary.revenue / summary.orders) : 0,
      rtoRate: shippedOrders ? Number(((rtoOrders / shippedOrders) * 100).toFixed(1)) : 0,
      repeatCustomerRate: repeat.customers ? Number(((repeat.repeatCustomers / repeat.customers) * 100).toFixed(1)) : 0,
      totalOrders,
    },
    daily,
    campaigns: campaigns.map((row) => ({ campaign: row._id || "Direct / untagged", orders: row.orders, revenue: row.revenue })),
    headlineVariants: [...new Set([
      ...variantOrders.map((row) => row._id.campaign),
      ...variantExposures.map((row) => row._id.campaign),
    ])].sort().flatMap((campaign) => ["A", "B"].map((variant) => {
      const matches = (row) => row._id.campaign === campaign && row._id.variant === variant;
      const orderRow = variantOrders.find(matches);
      const exposureRow = variantExposures.find(matches);
      const impressions = exposureRow?.impressions || 0;
      return {
        campaign,
        variant,
        impressions,
        orders: orderRow?.orders || 0,
        conversions: orderRow?.conversions || 0,
        conversionRate: impressions ? Number((((orderRow?.conversions || 0) / impressions) * 100).toFixed(1)) : 0,
        revenue: orderRow?.revenue || 0,
      };
    })),
    paymentMethods: methodCounts.map((row) => ({ method: row._id || "unknown", orders: row.orders, revenue: row.revenue })),
  });
}

export async function listProducts(req, res) {
  const products = await Product.find().select(PRODUCT_FIELDS).sort({ name: 1 }).lean();
  res.json({
    products,
    lowStock: products.filter((product) => product.stock <= product.lowStockThreshold),
  });
}

export async function createProduct(req, res) {
  const product = await Product.create(productInput(req.body || {}));
  res.status(201).json(product);
}

export async function updateProduct(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid product.");
  const product = await Product.findByIdAndUpdate(req.params.id, productInput(req.body || {}), { new: true, runValidators: true });
  if (!product) throw new HttpError(404, "Product was not found.");
  res.json(product);
}

export async function exportCsv(req, res) {
  const type = req.params.type;
  if (["leads", "customers"].includes(type) && !["admin", "sales_support"].includes(req.staff.role)) {
    throw new HttpError(403, "Your staff role cannot export customer or lead records.");
  }
  if (type === "orders" && !["admin", "operations"].includes(req.staff.role)) {
    throw new HttpError(403, "Your staff role cannot export order records.");
  }
  if (type === "leads") {
    const leads = await Lead.find().sort({ createdAt: -1 }).limit(10_000).lean();
    return sendCsv(res, "alpha-leads.csv",
      ["Name", "Phone", "Email", "Status", "Assigned To", "Follow Up", "UTM Source", "UTM Campaign", "Created At"],
      leads.map((lead) => [lead.fullName, lead.phone, lead.email, lead.status, lead.assignedTo, lead.followUpAt?.toISOString() || "", lead.utm?.source, lead.utm?.campaign, lead.createdAt.toISOString()]));
  }
  if (type === "customers") {
    const customers = await Customer.find().sort({ createdAt: -1 }).limit(10_000).lean();
    return sendCsv(res, "alpha-customers.csv",
      ["Name", "Phone", "Email", "Tags", "First UTM Source", ...(req.staff.role === "admin" ? ["Loyalty Points", "Referral Code"] : [])],
      customers.map((customer) => [
        customer.fullName, customer.phone, customer.email, (customer.tags || []).join("|"), customer.firstUtm?.source,
        ...(req.staff.role === "admin" ? [customer.loyaltyPoints || 0, customer.referralCode || ""] : []),
      ]));
  }
  if (type === "orders") {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(10_000).lean();
    return sendCsv(res, "alpha-orders.csv",
      ["Order Number", "Customer", "Phone", "Payment Status", "Fulfilment Status", "Payment Method", "Campaign", "Created At", ...(req.staff.role === "admin" ? ["Amount", "Amount Paid", "COD Due"] : [])],
      orders.map((order) => [
        order.orderNumber, order.customer.fullName, order.customer.phone, order.status, order.fulfillmentStatus,
        order.paymentMethod, order.utm?.campaign, order.createdAt.toISOString(),
        ...(req.staff.role === "admin" ? [order.amount, order.amountPaid, order.codDue] : []),
      ]));
  }
  throw new HttpError(400, "CSV type must be orders, customers, or leads.");
}

export async function generateReferralCode(customerId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = `ALPHA${randomBytes(4).toString("hex").toUpperCase()}`;
    try {
      const customer = await Customer.findOneAndUpdate(
        { _id: customerId, $or: [{ referralCode: { $exists: false } }, { referralCode: "" }] },
        { $set: { referralCode } },
        { new: true },
      );
      if (customer?.referralCode) return customer.referralCode;
      const existing = await Customer.findById(customerId).select("referralCode").lean();
      if (existing?.referralCode) return existing.referralCode;
    } catch (error) {
      if (error.code !== 11000 || attempt === 4) throw error;
    }
  }
  throw new HttpError(503, "Could not assign a loyalty referral code. Try again.");
}

export async function awardLoyaltyPoints(orderId) {
  const lock = randomBytes(16).toString("hex");
  const staleLockBefore = new Date(Date.now() - 5 * 60 * 1000);
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      fulfillmentStatus: "Delivered",
      loyaltyAwardedAt: { $exists: false },
      $or: [
        { loyaltyAwardLock: { $exists: false } },
        { loyaltyAwardLockAt: { $lte: staleLockBefore } },
      ],
    },
    { $set: { loyaltyAwardLock: lock, loyaltyAwardLockAt: new Date() } },
    { new: true },
  ).select("+loyaltyAwardLock +loyaltyAwardLockAt");
  if (!order) return false;
  try {
    if (order.customer?.id) {
      const points = Math.max(0, Math.floor((order.amount - (order.amountRefunded || 0)) / 100));
      const credited = await Customer.updateOne(
        { _id: order.customer.id, loyaltyAwardOrderIds: { $ne: order._id } },
        { $inc: { loyaltyPoints: points }, $addToSet: { loyaltyAwardOrderIds: order._id } },
      );
      if (credited.matchedCount !== 1) {
        const existingCustomer = await Customer.findById(order.customer.id).select("+loyaltyAwardOrderIds").lean();
        const alreadyCredited = existingCustomer?.loyaltyAwardOrderIds?.some((id) => id.toString() === order._id.toString());
        if (!alreadyCredited) throw new HttpError(404, "The delivered-order customer could not receive loyalty points.");
      }
    } else {
      throw new HttpError(409, "The delivered order has no customer to receive loyalty points.");
    }
    await Order.updateOne(
      { _id: order._id, loyaltyAwardLock: lock },
      { $set: { loyaltyAwardedAt: new Date() }, $unset: { loyaltyAwardLock: 1, loyaltyAwardLockAt: 1 } },
    );
    return true;
  } catch (error) {
    await Order.updateOne(
      { _id: order._id, loyaltyAwardLock: lock },
      { $unset: { loyaltyAwardLock: 1, loyaltyAwardLockAt: 1 } },
    );
    throw error;
  }
}
