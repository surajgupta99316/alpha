import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import Coupon from "../models/Coupon.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import OtpChallenge from "../models/OtpChallenge.js";
import Pincode from "../models/Pincode.js";
import Product from "../models/Product.js";
import HttpError from "../utils/HttpError.js";
import { createSessionToken, hashOtp, verifyOtpHash } from "../utils/customerAuth.js";
import { deliverOtp } from "../utils/otpDelivery.js";

const FREE_SHIPPING_THRESHOLD = 1499;
const SHIPPING_FEE = 49;

function cleanText(value, field, maxLength, required = false) {
  if (typeof value !== "string") {
    if (required) throw new HttpError(400, `${field} is required.`);
    return "";
  }
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${field} is required.`);
  if (result.length > maxLength) throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`);
  return result;
}

function validPhone(value) {
  const phone = cleanText(value, "Mobile number", 10, true);
  if (!/^[0-9]{10}$/.test(phone)) throw new HttpError(400, "Enter a valid 10-digit mobile number.");
  return phone;
}

function validPincode(value) {
  const pincode = cleanText(value, "Pincode", 6, true);
  if (!/^[0-9]{6}$/.test(pincode)) throw new HttpError(400, "Enter a valid 6-digit pincode.");
  return pincode;
}

function deliveryEstimate(deliveryDays) {
  const date = new Date();
  let remaining = deliveryDays;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1;
  }
  return `Delivery by ${new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(date)}`;
}

function priceForCoupon(coupon, subtotal) {
  if (subtotal < coupon.minimumOrderValue) {
    throw new HttpError(400, `This coupon requires a minimum order of ₹${coupon.minimumOrderValue}.`);
  }
  if (coupon.expiresAt <= new Date() || !coupon.active || coupon.usageCount >= coupon.usageLimit) {
    throw new HttpError(400, "This coupon is expired or has reached its usage limit.");
  }
  const discount = coupon.type === "percentage"
    ? Math.floor((subtotal * coupon.value) / 100)
    : coupon.value;
  return Math.min(discount, subtotal);
}

export async function getStoreProducts(req, res) {
  const filter = { active: true };
  const category = cleanText(req.query.category, "Category", 80);
  const search = cleanText(req.query.search, "Search", 80);
  if (category && category !== "All") filter.category = category;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { description: { $regex: escaped, $options: "i" } },
    ];
  }
  const sortBy = req.query.sort;
  const sort = sortBy === "price-asc"
    ? { price: 1 }
    : sortBy === "price-desc"
      ? { price: -1 }
      : sortBy === "name"
        ? { name: 1 }
        : { createdAt: 1 };
  const products = await Product.find(filter).sort(sort).lean();
  res.json(products);
}

export async function getStoreProduct(req, res) {
  const product = await Product.findOne({ slug: req.params.slug.toLowerCase(), active: true }).lean();
  if (!product) throw new HttpError(404, "This product was not found.");
  res.json(product);
}

export async function checkPincode(req, res) {
  const code = validPincode(req.params.code);
  const pincode = await Pincode.findOne({ code }).lean();
  if (!pincode) {
    return res.json({
      serviceable: false,
      pincode: code,
      message: "Delivery is not available for this pincode yet.",
    });
  }
  res.json({
    serviceable: pincode.serviceable,
    pincode: pincode.code,
    city: pincode.city,
    state: pincode.state,
    deliveryDays: pincode.deliveryDays,
    message: pincode.serviceable
      ? deliveryEstimate(pincode.deliveryDays)
      : "Delivery is not available for this pincode yet.",
  });
}

export async function getAvailableCoupons(req, res) {
  const coupons = await Coupon.find({
    active: true,
    expiresAt: { $gt: new Date() },
    $expr: { $lt: ["$usageCount", "$usageLimit"] },
  }).select("code type value minimumOrderValue expiresAt").sort({ minimumOrderValue: 1 }).lean();
  res.json(coupons);
}

export async function validateCoupon(req, res) {
  const code = cleanText(req.body?.code, "Coupon code", 30, true).toUpperCase();
  const subtotal = Number(req.body?.subtotal);
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) throw new HttpError(400, "Invalid cart subtotal.");
  const coupon = await Coupon.findOne({ code, active: true }).lean();
  if (!coupon) throw new HttpError(400, "This coupon is invalid or unavailable.");
  const discount = priceForCoupon(coupon, subtotal);
  res.json({ code, discount, subtotal, total: subtotal - discount });
}

export async function requestLoginOtp(req, res) {
  if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ error: "Mobile OTP delivery is not configured for this deployment." });
  }
  const phone = validPhone(req.body?.phone);
  const now = new Date();
  const prior = await OtpChallenge.findOne({ phone });
  if (prior && now - prior.lastSentAt < 60_000) {
    throw new HttpError(429, "Wait one minute before requesting another code.");
  }
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = hashOtp(code);
  await OtpChallenge.findOneAndUpdate(
    { phone },
    {
      phone,
      codeHash,
      expiresAt: new Date(now.getTime() + 5 * 60_000),
      attempts: 0,
      lastSentAt: now,
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  let delivery;
  try {
    delivery = await deliverOtp(phone, code);
  } catch (error) {
    await OtpChallenge.deleteOne({ phone, codeHash });
    throw error;
  }
  if (delivery === "console") {
    console.info(`[local OTP] ${phone}: ${code} (expires in 5 minutes)`);
    return res.json({ message: "Verification code sent. In local development, check the backend terminal." });
  }
  res.json({ message: "Verification code sent by SMS." });
}

export async function verifyLoginOtp(req, res) {
  const phone = validPhone(req.body?.phone);
  const code = cleanText(req.body?.code, "Verification code", 6, true);
  if (!/^[0-9]{6}$/.test(code)) throw new HttpError(400, "Enter the 6-digit verification code.");
  const challenge = await OtpChallenge.findOne({
    phone,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: 5 },
  });
  if (!challenge) throw new HttpError(400, "The code expired or is unavailable. Request a new code.");
  if (!verifyOtpHash(code, challenge.codeHash)) {
    await OtpChallenge.updateOne(
      { _id: challenge._id, attempts: { $lt: 5 } },
      { $inc: { attempts: 1 } },
    );
    throw new HttpError(400, "That code is incorrect.");
  }

  const consumed = await OtpChallenge.findOneAndDelete({
    _id: challenge._id,
    codeHash: challenge.codeHash,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: 5 },
  });
  if (!consumed) throw new HttpError(400, "The code was already used or expired. Request a new code.");

  const customer = await Customer.findOneAndUpdate(
    { phone },
    { $set: { lastLoginAt: new Date() }, $setOnInsert: { phone } },
    { upsert: true, new: true, runValidators: true },
  ).select("phone fullName email");
  res.json({ token: createSessionToken(customer._id), customer });
}

export async function getMyAccount(req, res) {
  res.json({ customer: req.customer });
}

export async function getMyOrders(req, res) {
  const orders = await Order.find({ "customer.id": req.customer._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("orderNumber items product amount subtotal discount shipping couponCode status paymentMethod paymentStatus paymentAmount amountPaid codDue createdAt")
    .lean();
  res.json(orders);
}

export async function createCheckoutOrder(req, res) {
  const body = req.body || {};
  const checkoutToken = cleanText(body.checkoutToken, "Checkout token", 80, true);
  const previousOrder = await Order.findOne({ checkoutToken }).select("orderNumber subtotal discount shipping amount");
  if (previousOrder) {
    return res.status(200).json({
      orderNumber: previousOrder.orderNumber,
      subtotal: previousOrder.subtotal,
      discount: previousOrder.discount,
      shipping: previousOrder.shipping,
      amount: previousOrder.amount,
      reused: true,
    });
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    throw new HttpError(400, "Your cart must contain between 1 and 20 products.");
  }

  const itemQuantities = new Map();
  for (const item of body.items) {
    if (!mongoose.isValidObjectId(item?.productId)) throw new HttpError(400, "A cart product is invalid.");
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      throw new HttpError(400, "Each product quantity must be between 1 and 10.");
    }
    const key = item.productId.toString();
    itemQuantities.set(key, (itemQuantities.get(key) || 0) + item.quantity);
  }
  if ([...itemQuantities.values()].some((quantity) => quantity > 10)) {
    throw new HttpError(400, "Maximum quantity per product is 10.");
  }

  const productIds = [...itemQuantities.keys()];
  const products = await Product.find({ _id: { $in: productIds }, active: true }).lean();
  if (products.length !== productIds.length) throw new HttpError(400, "A cart product is no longer available.");
  const items = products.map((product) => {
    const quantity = itemQuantities.get(product._id.toString());
    if (quantity > product.stock) throw new HttpError(400, `${product.name} does not have enough stock.`);
    return {
      product: product._id,
      name: product.name,
      imageUrl: product.imageUrl,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (!Number.isSafeInteger(subtotal)) throw new HttpError(400, "Cart total is invalid.");

  const fullName = cleanText(body.fullName, "Full name", 100, true);
  const phone = validPhone(body.phone);
  const email = cleanText(body.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const address = cleanText(body.address, "Delivery address", 500, true);
  const pincodeCode = validPincode(body.pincode);
  const pincode = await Pincode.findOne({ code: pincodeCode, serviceable: true }).lean();
  if (!pincode) throw new HttpError(400, "This pincode is not serviceable.");

  let customer;
  if (req.customer) {
    if (req.customer.phone !== phone) {
      throw new HttpError(400, "Use the mobile number associated with your signed-in account.");
    }
    customer = await Customer.findByIdAndUpdate(
      req.customer._id,
      { $set: { fullName, ...(email ? { email } : {}) } },
      { new: true, runValidators: true },
    );
    if (!customer) throw new HttpError(401, "Please sign in again before checking out.");
  } else {
    customer = await Customer.findOneAndUpdate(
      { phone },
      { $setOnInsert: { phone, fullName, ...(email ? { email } : {}) } },
      { upsert: true, new: true, runValidators: true },
    );
  }

  let discount = 0;
  let coupon;
  const couponCode = cleanText(body.couponCode, "Coupon code", 30).toUpperCase();
  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode, active: true }).lean();
    if (!coupon) throw new HttpError(400, "This coupon is invalid or unavailable.");
    discount = priceForCoupon(coupon, subtotal);
    const reserved = await Coupon.findOneAndUpdate(
      {
        _id: coupon._id,
        active: true,
        expiresAt: { $gt: new Date() },
        minimumOrderValue: { $lte: subtotal },
        $expr: { $lt: ["$usageCount", "$usageLimit"] },
      },
      { $inc: { usageCount: 1 } },
      { new: true },
    );
    if (!reserved) throw new HttpError(400, "This coupon has expired or reached its usage limit.");
    coupon = reserved;
    discount = Math.min(
      coupon.type === "percentage" ? Math.floor((subtotal * coupon.value) / 100) : coupon.value,
      subtotal,
    );
  }

  const shipping = subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  try {
    const order = await Order.create({
      orderNumber: `AM-${Date.now().toString(36).toUpperCase()}-${randomInt(0, 1_000_000).toString(36).toUpperCase().padStart(4, "0")}`,
      checkoutToken,
      items,
      product: {
        id: items[0].product,
        name: items[0].name,
        quantity: items[0].quantity,
        unitPrice: items[0].unitPrice,
      },
      customer: {
        id: customer._id,
        fullName,
        phone,
        email,
        address,
        pincode: pincode.code,
        city: pincode.city,
        state: pincode.state,
      },
      subtotal,
      discount,
      shipping,
      couponCode: coupon?.code,
      amount: subtotal - discount + shipping,
      status: "PendingPayment",
    });
    return res.status(201).json({
      orderNumber: order.orderNumber,
      subtotal,
      discount,
      shipping,
      amount: order.amount,
      checkoutToken,
      message: "Checkout saved. Choose how you’d like to pay.",
    });
  } catch (error) {
    if (coupon) await Coupon.updateOne({ _id: coupon._id, usageCount: { $gt: 0 } }, { $inc: { usageCount: -1 } });
    if (error.code === 11000) {
      const duplicate = await Order.findOne({ checkoutToken }).select("orderNumber subtotal discount shipping amount");
      if (duplicate) {
        return res.status(200).json({
          orderNumber: duplicate.orderNumber,
          subtotal: duplicate.subtotal,
          discount: duplicate.discount,
          shipping: duplicate.shipping,
          amount: duplicate.amount,
          reused: true,
        });
      }
    }
    throw error;
  }
}

function couponInput(body, existingUsage = 0) {
  const code = cleanText(body.code, "Coupon code", 30, true).toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HttpError(400, "Coupon code must use 3–30 letters, numbers, underscores, or hyphens.");
  if (!["flat", "percentage"].includes(body.type)) throw new HttpError(400, "Choose flat or percentage discount.");
  const value = Number(body.value);
  const minimumOrderValue = Number(body.minimumOrderValue);
  const usageLimit = Number(body.usageLimit);
  const expiresAt = new Date(body.expiresAt);
  if (!Number.isSafeInteger(value) || value < 1 || (body.type === "percentage" && value > 100)) {
    throw new HttpError(400, "Discount value must be a positive whole number; percentage cannot exceed 100.");
  }
  if (!Number.isSafeInteger(minimumOrderValue) || minimumOrderValue < 0) {
    throw new HttpError(400, "Minimum order value must be a non-negative whole number.");
  }
  if (!Number.isSafeInteger(usageLimit) || usageLimit < Math.max(1, existingUsage)) {
    throw new HttpError(400, `Usage limit cannot be less than existing usage (${existingUsage}).`);
  }
  if (Number.isNaN(expiresAt.getTime())) throw new HttpError(400, "Choose a valid expiry date.");
  return {
    code,
    type: body.type,
    value,
    minimumOrderValue,
    usageLimit,
    expiresAt,
    active: Boolean(body.active),
  };
}

export async function getAdminCoupons(req, res) {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
  res.json(coupons);
}

export async function createAdminCoupon(req, res) {
  const coupon = await Coupon.create(couponInput(req.body || {}));
  res.status(201).json(coupon);
}

export async function updateAdminCoupon(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid coupon.");
  const existing = await Coupon.findById(req.params.id);
  if (!existing) throw new HttpError(404, "Coupon was not found.");
  const coupon = await Coupon.findByIdAndUpdate(
    req.params.id,
    couponInput(req.body || {}, existing.usageCount),
    { new: true, runValidators: true },
  );
  res.json(coupon);
}
