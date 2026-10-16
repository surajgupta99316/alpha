import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import HttpError from "../utils/HttpError.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

const COD_LIMIT = 3000;
const PREPAID_DISCOUNT_PERCENT = 5;
const PARTIAL_COD_DEPOSIT_PERCENT = 25;

function requiredConfig(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, `${name} is not configured on the server.`);
  return value;
}

function getOrderTotal(order) {
  const itemSubtotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const orderTotal = itemSubtotal - order.discount + order.shipping;
  const discountedPrepaidTotal = orderTotal - (order.prepaidDiscount || 0);
  if (
    !Number.isSafeInteger(itemSubtotal)
    || itemSubtotal !== order.subtotal
    || order.discount < 0
    || order.shipping < 0
    || order.discount > itemSubtotal
    || ![orderTotal, discountedPrepaidTotal].includes(order.amount)
  ) {
    throw new HttpError(409, "This order has inconsistent saved totals. Contact support before paying.");
  }
  return orderTotal;
}

async function findOrder(req, body) {
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
  if (!orderNumber || orderNumber.length > 50) throw new HttpError(400, "A valid order number is required.");
  const filter = { orderNumber };
  if (req.customer) {
    filter["customer.id"] = req.customer._id;
  } else {
    const checkoutToken = typeof body.checkoutToken === "string" ? body.checkoutToken.trim() : "";
    if (!checkoutToken || checkoutToken.length > 80) {
      throw new HttpError(401, "Your checkout confirmation has expired. Sign in to access this order.");
    }
    filter.checkoutToken = checkoutToken;
  }
  const order = await Order.findOne(filter);
  if (!order) throw new HttpError(404, "This order was not found.");
  if (!order.items.length) throw new HttpError(400, "This legacy order cannot be paid through checkout.");
  return order;
}

function paymentSummary(order) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod || "",
    paymentStatus: order.paymentStatus || "created",
    subtotal: order.subtotal,
    orderTotal: order.subtotal - order.discount + order.shipping,
    couponDiscount: order.discount,
    prepaidDiscount: order.prepaidDiscount || 0,
    shipping: order.shipping,
    amount: order.amount,
    paymentAmount: order.paymentAmount ?? order.amount,
    amountPaid: order.amountPaid || 0,
    codDue: order.codDue || 0,
    codLimit: COD_LIMIT,
  };
}

export async function getPaymentSummary(req, res) {
  const order = await findOrder(req, req.body || {});
  res.json(paymentSummary(order));
}

export async function createRazorpayOrder(req, res) {
  const order = await findOrder(req, req.body || {});
  const convertingConfirmedCod = order.amountPaid === 0 && (
    (order.status === "CODConfirmed"
      && order.paymentMethod === "cod"
      && order.paymentStatus === "cod_pending")
    || (order.codConversionPending
      && Boolean(order.stockDeductedAt)
      && order.paymentMethod === "prepaid")
  );
  if (
    !["PendingPayment", "Failed", "CODPendingConfirmation"].includes(order.status)
    && !(convertingConfirmedCod && order.status === "CODConfirmed")
  ) {
    throw new HttpError(409, "This order is no longer available for online payment.");
  }
  const mode = req.body?.mode;
  if (!["prepaid", "partial_cod"].includes(mode)) {
    throw new HttpError(400, "Choose prepaid or partial COD payment.");
  }
  if ((convertingConfirmedCod || order.codConversionPending) && mode !== "prepaid") {
    throw new HttpError(400, "A confirmed COD order can only be converted to full prepaid payment.");
  }
  if (order.status === "PendingPayment" && order.paymentStatus === "created" && order.razorpayOrderId) {
    if (mode !== order.paymentMethod) {
      throw new HttpError(409, "Finish or retry the current payment attempt before choosing another payment method.");
    }
    const keyId = requiredConfig("RAZORPAY_KEY_ID");
    return res.status(200).json({
      keyId,
      razorpayOrderId: order.razorpayOrderId,
      amount: order.paymentAmount * 100,
      currency: "INR",
      mode,
      summary: paymentSummary(order),
    });
  }
  const orderTotal = getOrderTotal(order);
  const prepaidDiscount = mode === "prepaid"
    ? Math.floor((orderTotal * PREPAID_DISCOUNT_PERCENT) / 100)
    : 0;
  const amountDueNow = mode === "prepaid"
    ? orderTotal - prepaidDiscount
    : Math.ceil((orderTotal * PARTIAL_COD_DEPOSIT_PERCENT) / 100);
  const codDue = orderTotal - amountDueNow;
  if (amountDueNow < 1) throw new HttpError(400, "The payment amount must be at least ₹1.");
  if (mode === "partial_cod" && codDue > COD_LIMIT) {
    throw new HttpError(400, `Partial COD is available only when the remaining COD balance is ₹${COD_LIMIT} or less.`);
  }

  const keyId = requiredConfig("RAZORPAY_KEY_ID");
  const keySecret = requiredConfig("RAZORPAY_KEY_SECRET");
  const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  let response;
  try {
    response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountDueNow * 100,
        currency: "INR",
        receipt: order.orderNumber.slice(0, 40),
        notes: { orderNumber: order.orderNumber, paymentMode: mode },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, "Razorpay could not be reached. Please try again.");
  }
  const gatewayOrder = await response.json().catch(() => ({}));
  if (
    !response.ok
    || typeof gatewayOrder.id !== "string"
    || gatewayOrder.amount !== amountDueNow * 100
    || gatewayOrder.currency !== "INR"
  ) {
    console.error("Razorpay order creation failed.", {
      status: response.status,
      code: gatewayOrder.error?.code,
      description: gatewayOrder.error?.description,
    });
    throw new HttpError(502, "Razorpay could not create a payment order. Check the test credentials and try again.");
  }

  order.razorpayOrderId = gatewayOrder.id;
  order.paymentMethod = mode;
  order.paymentStatus = "created";
  order.status = "PendingPayment";
  order.codConversionPending = convertingConfirmedCod;
  order.paymentAmount = amountDueNow;
  order.prepaidDiscount = prepaidDiscount;
  order.codDue = mode === "partial_cod" ? codDue : 0;
  order.amount = mode === "prepaid" ? orderTotal - prepaidDiscount : orderTotal;
  await order.save();

  res.status(201).json({
    keyId,
    razorpayOrderId: gatewayOrder.id,
    amount: gatewayOrder.amount,
    currency: gatewayOrder.currency,
    mode,
    summary: paymentSummary(order),
  });
}

function validSignature(message, signature, secret) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function deductStockOnce(order, finalState) {
  if (order.stockDeductedAt) {
    const settled = await Order.findOneAndUpdate(
      {
        _id: order._id,
        stockDeductedAt: { $exists: true },
        status: { $in: ["PendingPayment", "Failed", "CODPendingConfirmation"] },
      },
      { $set: { ...finalState, codConversionPending: false } },
      { new: true },
    );
    if (settled) return settled;
    const latest = await Order.findById(order._id);
    if (latest?.stockDeductedAt && latest.status === finalState.status) return latest;
    throw new HttpError(409, "This order is already being confirmed or is no longer payable.");
  }
  const lock = randomUUID();
  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      stockDeductedAt: { $exists: false },
      settlementLock: { $exists: false },
      status: { $in: ["PendingPayment", "Failed", "CODPendingConfirmation"] },
    },
    { $set: { settlementLock: lock } },
    { new: true },
  ).select("+settlementLock");

  if (!claimed) {
    const latest = await Order.findById(order._id);
    if (latest?.stockDeductedAt && latest.status === finalState.status) return latest;
    throw new HttpError(409, "This order is already being confirmed or is no longer payable.");
  }

  const decremented = [];
  try {
    for (const item of claimed.items) {
      const result = await Product.updateOne(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
      );
      if (result.modifiedCount !== 1) {
        throw new HttpError(409, `${item.name} is no longer available in the requested quantity.`);
      }
      decremented.push(item);
    }

    const settled = await Order.findOneAndUpdate(
      { _id: claimed._id, settlementLock: lock },
      {
        $set: {
          ...finalState,
          stockDeductedAt: new Date(),
          codConversionPending: false,
        },
        $unset: { settlementLock: 1 },
      },
      { new: true },
    );
    if (!settled) throw new HttpError(409, "The order could not be confirmed. Please contact support.");
    return settled;
  } catch (error) {
    for (const item of decremented) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
    }
    await Order.updateOne({ _id: claimed._id, settlementLock: lock }, { $unset: { settlementLock: 1 } });
    throw error;
  }
}

export async function verifyRazorpayPayment(req, res) {
  const body = req.body || {};
  const order = await findOrder(req, body);
  const razorpayOrderId = typeof body.razorpayOrderId === "string" ? body.razorpayOrderId : "";
  const paymentId = typeof body.razorpayPaymentId === "string" ? body.razorpayPaymentId : "";
  if (!razorpayOrderId || !paymentId || razorpayOrderId !== order.razorpayOrderId) {
    throw new HttpError(400, "The payment does not match this order.");
  }
  const signature = typeof body.razorpaySignature === "string" ? body.razorpaySignature : "";
  const secret = requiredConfig("RAZORPAY_KEY_SECRET");
  if (!validSignature(`${razorpayOrderId}|${paymentId}`, signature, secret)) {
    throw new HttpError(400, "Razorpay payment verification failed. The order has not been marked paid.");
  }
  if (order.status === "Paid" || (order.status === "CODConfirmed" && order.paymentStatus !== "created")) {
    return res.json(paymentSummary(order));
  }
  const partial = order.paymentMethod === "partial_cod";
  const settled = await deductStockOnce(order, {
    status: partial ? "CODConfirmed" : "Paid",
    paymentStatus: partial ? "partially_paid" : "paid",
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    amountPaid: order.paymentAmount,
  });
  res.json(paymentSummary(settled));
}

export async function confirmCashOnDelivery(req, res) {
  const order = await findOrder(req, req.body || {});
  if (order.status === "CODConfirmed") return res.json(paymentSummary(order));
  if (!["PendingPayment", "Failed", "CODPendingConfirmation"].includes(order.status)) {
    throw new HttpError(409, "This order is not available for COD confirmation.");
  }
  if (req.body?.confirmed !== true) {
    throw new HttpError(400, "Confirm that you will pay the delivery amount when your order arrives.");
  }
  if (
    order.paymentStatus === "created"
    && order.paymentMethod
    && !order.codConversionPending
  ) {
    throw new HttpError(409, "Finish or retry the current online payment attempt before switching to COD.");
  }
  if (order.amountPaid > 0 && order.paymentMethod !== "cod") {
    throw new HttpError(409, "This order already has a successful online payment and cannot be switched to COD.");
  }
  const total = getOrderTotal(order);
  if (total > COD_LIMIT) throw new HttpError(400, `Cash on delivery is available only up to ₹${COD_LIMIT}.`);
  if (order.stockDeductedAt && order.codConversionPending) {
    order.status = "CODConfirmed";
    order.paymentMethod = "cod";
    order.paymentStatus = "cod_pending";
    order.paymentAmount = 0;
    order.amountPaid = 0;
    order.prepaidDiscount = 0;
    order.amount = total;
    order.codDue = total;
    order.codConversionPending = false;
    await order.save();
    return res.json(paymentSummary(order));
  }
  order.paymentMethod = "cod";
  order.paymentStatus = "cod_confirmed";
  order.paymentAmount = 0;
  order.prepaidDiscount = 0;
  order.amount = total;
  order.codDue = total;
  await order.save();
  const settled = await deductStockOnce(order, {
    status: "CODConfirmed",
    paymentStatus: "cod_pending",
    amountPaid: 0,
    codDue: total,
  });
  res.json(paymentSummary(settled));
}

export async function handleRazorpayWebhook(req, res) {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) throw new HttpError(400, "Invalid Razorpay webhook payload.");
  const signature = req.get("x-razorpay-signature") || "";
  const secret = requiredConfig("RAZORPAY_WEBHOOK_SECRET");
  if (!validSignature(rawBody, signature, secret)) {
    throw new HttpError(400, "Razorpay webhook signature verification failed.");
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid Razorpay webhook payload.");
  }
  const payment = event.payload?.payment?.entity;
  const gatewayOrderId = payment?.order_id;
  if (!gatewayOrderId || !["payment.captured", "payment.failed"].includes(event.event)) {
    return res.json({ received: true, processed: false });
  }
  const order = await Order.findOne({ razorpayOrderId: gatewayOrderId });
  if (!order) return res.json({ received: true, processed: false });

  if (event.event === "payment.failed") {
    if (!["Paid", "CODConfirmed"].includes(order.status)) {
      await Order.updateOne(
        { _id: order._id, razorpayOrderId: gatewayOrderId, status: { $nin: ["Paid", "CODConfirmed"] } },
        { $set: { status: "Failed", paymentStatus: "failed" } },
      );
    }
    return res.json({ received: true, processed: true });
  }

  if (payment.currency !== "INR" || payment.amount !== order.paymentAmount * 100) {
    throw new HttpError(400, "Captured Razorpay amount does not match the server order.");
  }
  if (order.status === "Paid" || (order.status === "CODConfirmed" && order.paymentStatus !== "created")) {
    return res.json({ received: true, processed: true });
  }
  const partial = order.paymentMethod === "partial_cod";
  await deductStockOnce(order, {
    status: partial ? "CODConfirmed" : "Paid",
    paymentStatus: partial ? "partially_paid" : "paid",
    razorpayPaymentId: payment.id,
    amountPaid: order.paymentAmount,
  });
  res.json({ received: true, processed: true });
}
