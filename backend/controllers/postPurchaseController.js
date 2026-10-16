import { randomInt, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import HttpError from "../utils/HttpError.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import SupportTicket from "../models/SupportTicket.js";
import NotificationLog from "../models/NotificationLog.js";
import Customer from "../models/Customer.js";
import { sendOrderNotification } from "../utils/orderNotifications.js";

const RETURN_REASONS = ["damaged", "wrong_item", "not_as_described", "quality_issue", "other"];
const RETURN_WINDOW_DAYS = 7;
const ADMIN_RETURN_TRANSITIONS = {
  Requested: ["Approved", "Rejected"],
  Approved: ["Picked up"],
  "Picked up": ["Refunded"],
  Rejected: [],
  Refunded: [],
};

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

function validOrderNumber(value) {
  return text(value, "Order number", 50, true);
}

function validId(value, field) {
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, `Invalid ${field}.`);
  return value;
}

function publicOrder(order) {
  const deliveredEvent = [...(order.statusTimeline || [])].reverse()
    .find((entry) => entry.status === "Delivered");
  const deliveredAt = deliveredEvent?.changedAt || null;
  const returnDeadline = deliveredAt
    ? new Date(new Date(deliveredAt).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    : null;
  return {
    orderNumber: order.orderNumber,
    fulfillmentStatus: order.fulfillmentStatus || "New",
    statusTimeline: (order.statusTimeline || []).map(({ status, changedAt }) => ({ status, changedAt })),
    shipment: order.shipment?.awb ? {
      awb: order.shipment.awb,
      courierName: order.shipment.courierName,
      trackingUrl: order.shipment.trackingUrl,
    } : null,
    items: (order.items?.length ? order.items : [order.product]).filter(Boolean).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      product: item.product || item.id || null,
    })),
    return: {
      eligible: Boolean(returnDeadline && order.fulfillmentStatus === "Delivered" && Date.now() <= returnDeadline.getTime()),
      deliveredAt,
      deadline: returnDeadline,
      windowDays: RETURN_WINDOW_DAYS,
    },
  };
}

function validatePhoto(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 1_400_000) {
    throw new HttpError(400, "Return photos must be JPEG, PNG, or WebP images no larger than 1 MB.");
  }
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new HttpError(400, "Return photo must be a JPEG, PNG, or WebP image.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 1_000_000 || bytes.toString("base64") !== match[2]) {
    throw new HttpError(400, "Return photos must be valid images no larger than 1 MB.");
  }
  const mime = `image/${match[1]}`;
  const signatureMatches = mime === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!signatureMatches) throw new HttpError(400, "The uploaded file does not match its image type.");
  return value;
}

export async function trackOrder(req, res) {
  const orderNumber = validOrderNumber(req.body?.orderNumber);
  const customerPhone = phone(req.body?.phone);
  const order = await Order.findOne({ orderNumber, "customer.phone": customerPhone })
    .select("orderNumber fulfillmentStatus statusTimeline shipment items product")
    .lean();
  if (!order) throw new HttpError(404, "No order matches that order number and mobile number.");
  res.json(publicOrder(order));
}

export async function createReturnRequest(req, res) {
  const orderNumber = validOrderNumber(req.body?.orderNumber);
  const customerPhone = phone(req.body?.phone);
  const reason = text(req.body?.reason, "Return reason", 40, true);
  if (!RETURN_REASONS.includes(reason)) throw new HttpError(400, "Choose a valid return reason.");
  const message = text(req.body?.message, "Additional details", 1000);
  const photoDataUrl = validatePhoto(req.body?.photoDataUrl);
  if (!Array.isArray(req.body?.items) || req.body.items.length < 1 || req.body.items.length > 20) {
    throw new HttpError(400, "Choose at least one item to return.");
  }

  const order = await Order.findOne({ orderNumber, "customer.phone": customerPhone });
  if (!order) throw new HttpError(404, "No order matches that order number and mobile number.");
  const deliveredAt = [...order.statusTimeline].reverse().find((entry) => entry.status === "Delivered")?.changedAt;
  const returnDeadline = deliveredAt
    ? new Date(new Date(deliveredAt).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    : null;
  if (order.fulfillmentStatus !== "Delivered" || !returnDeadline || Date.now() > returnDeadline.getTime()) {
    throw new HttpError(409, `Returns are available only within ${RETURN_WINDOW_DAYS} days after delivery.`);
  }

  const lock = randomUUID();
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, returnRequestLock: { $exists: false } },
    { $set: { returnRequestLock: lock } },
    { new: true },
  ).select("+returnRequestLock");
  if (!claimed) throw new HttpError(409, "A return request is already being submitted for this order. Try again shortly.");

  try {
    const currentDelivery = [...claimed.statusTimeline].reverse().find((entry) => entry.status === "Delivered")?.changedAt;
    const currentDeadline = currentDelivery
      ? new Date(new Date(currentDelivery).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      : null;
    if (claimed.fulfillmentStatus !== "Delivered" || !currentDeadline || Date.now() > currentDeadline.getTime()) {
      throw new HttpError(409, `Returns are available only within ${RETURN_WINDOW_DAYS} days after delivery.`);
    }
    const orderItems = claimed.items?.length
      ? claimed.items
      : [{ product: claimed.product.id, name: claimed.product.name, quantity: claimed.product.quantity, unitPrice: claimed.product.unitPrice }];
    const normalizedItems = req.body.items.map((item) => {
      const index = Number(item?.index);
      const quantity = Number(item?.quantity);
      if (!Number.isSafeInteger(index) || index < 0 || index >= orderItems.length) {
        throw new HttpError(400, "A selected return item is invalid.");
      }
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new HttpError(400, "Return quantity must be a positive whole number.");
      }
      return { index, quantity };
    });
    if (new Set(normalizedItems.map((item) => item.index)).size !== normalizedItems.length) {
      throw new HttpError(400, "Each order item can be selected only once.");
    }
    const priorRequests = await ReturnRequest.find({
      order: claimed._id,
      status: { $ne: "Rejected" },
    }).select("items").lean();
    const alreadyReserved = new Map();
    for (const prior of priorRequests) {
      for (const item of prior.items) {
        const key = item.product?.toString() || item.name;
        alreadyReserved.set(key, (alreadyReserved.get(key) || 0) + item.quantity);
      }
    }
    const requestedByIndex = new Map(normalizedItems.map(({ index, quantity }) => [index, quantity]));
    const requestedByProduct = new Map();
    for (const { index, quantity } of normalizedItems) {
      const item = orderItems[index];
      const key = item.product?.toString() || item.name;
      requestedByProduct.set(key, (requestedByProduct.get(key) || 0) + quantity);
    }
    const orderQuantityByProduct = new Map();
    for (const item of orderItems) {
      const key = item.product?.toString() || item.name;
      orderQuantityByProduct.set(key, (orderQuantityByProduct.get(key) || 0) + item.quantity);
    }
    for (const [key, quantity] of requestedByProduct) {
      if (quantity + (alreadyReserved.get(key) || 0) > orderQuantityByProduct.get(key)) {
        const itemName = orderItems.find((item) => (item.product?.toString() || item.name) === key)?.name || "item";
        throw new HttpError(409, `Only ${Math.max(0, orderQuantityByProduct.get(key) - (alreadyReserved.get(key) || 0))} of ${itemName} remain available for return.`);
      }
    }
    const items = normalizedItems.map(({ index, quantity }) => {
      const orderItem = orderItems[index];
      return {
        ...(orderItem.product ? { product: orderItem.product } : {}),
        name: orderItem.name,
        quantity: requestedByIndex.get(index),
        unitPrice: orderItem.unitPrice,
      };
    });
    const returnRequest = await ReturnRequest.create({
      returnNumber: `RTN-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}`,
      order: claimed._id,
      customer: claimed.customer.id,
      orderNumber: claimed.orderNumber,
      phone: claimed.customer.phone,
      items,
      reason,
      message,
      ...(photoDataUrl ? { photoDataUrl } : {}),
      hasPhoto: Boolean(photoDataUrl),
      statusTimeline: [{ status: "Requested", actor: "Customer", changedAt: new Date() }],
    });
    res.status(201).json({
      returnNumber: returnRequest.returnNumber,
      status: returnRequest.status,
      message: "Your return request has been submitted for review.",
    });
  } finally {
    await Order.updateOne({ _id: claimed._id, returnRequestLock: lock }, { $unset: { returnRequestLock: 1 } });
  }
}

export async function listReturns(req, res) {
  const status = text(req.query.status, "Return status", 40);
  if (status && !["Requested", "Approved", "Rejected", "Picked up", "Refunded"].includes(status)) {
    throw new HttpError(400, "Unknown return status.");
  }
  const filter = status ? { status } : {};
  const returns = await ReturnRequest.find(filter)
    .select("-photoDataUrl")
    .populate("order", "amount amountPaid amountRefunded paymentMethod paymentStatus refundStatus razorpayPaymentId")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json(returns);
}

export async function getReturnPhoto(req, res) {
  const returnRequest = await ReturnRequest.findById(validId(req.params.id, "return request"))
    .select("+photoDataUrl")
    .lean();
  if (!returnRequest) throw new HttpError(404, "Return request was not found.");
  if (!returnRequest.photoDataUrl) throw new HttpError(404, "This return request has no photo.");
  const match = returnRequest.photoDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new HttpError(500, "The saved return photo is invalid.");
  res.set("Content-Type", match[1]);
  res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.send(Buffer.from(match[2], "base64"));
}

function orderMerchandiseSubtotal(order) {
  return order.items?.length
    ? order.items.reduce((sum, item) => sum + item.lineTotal, 0)
    : order.product.unitPrice * order.product.quantity;
}

async function createRazorpayRefund(order, returnRequest, amount) {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) throw new HttpError(503, "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to issue test-mode refunds.");
  if (!keyId.startsWith("rzp_test_")) throw new HttpError(503, "Razorpay refunds are restricted to test-mode credentials.");
  if (!order.razorpayPaymentId) throw new HttpError(409, "This order has no captured Razorpay payment to refund.");
  if (returnRequest.refundAttemptedAt && !returnRequest.razorpayRefundId) {
    throw new HttpError(409, "A previous refund attempt needs reconciliation in the Razorpay dashboard before retrying.");
  }
  await ReturnRequest.updateOne(
    { _id: returnRequest._id, status: "Picked up" },
    { $set: { refundAttemptedAt: new Date() } },
  );
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(order.razorpayPaymentId)}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount * 100,
        notes: { returnNumber: returnRequest.returnNumber, orderNumber: order.orderNumber },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, "Razorpay refund response was not received. Check the Razorpay dashboard before retrying.");
  }
  const refund = await response.json().catch(() => ({}));
  if (
    !response.ok
    || typeof refund.id !== "string"
    || refund.amount !== amount * 100
    || !["pending", "processed"].includes(refund.status)
  ) {
    await ReturnRequest.updateOne(
      { _id: returnRequest._id, status: "Picked up", razorpayRefundId: { $exists: false } },
      { $unset: { refundAttemptedAt: 1 } },
    );
    console.error("Razorpay refund request failed.", {
      status: response.status,
      code: refund.error?.code,
      description: refund.error?.description,
    });
    throw new HttpError(502, "Razorpay did not accept the refund. Check the test credentials and refund balance.");
  }
  return refund;
}

export async function updateReturn(req, res) {
  const id = validId(req.params.id, "return request");
  const nextStatus = text(req.body?.status, "Return status", 40, true);
  const actor = text(req.staff?.fullName, "Staff name", 100, true);
  const note = text(req.body?.note, "Return note", 500);
  const manualRefundReference = text(req.body?.manualRefundReference, "Manual refund reference", 100);
  const returnRequest = await ReturnRequest.findById(id);
  if (!returnRequest) throw new HttpError(404, "Return request was not found.");
  if (!["Requested", "Approved", "Rejected", "Picked up", "Refunded"].includes(nextStatus)) {
    throw new HttpError(400, "Unknown return status.");
  }
  if (!RETURN_REASONS.includes(returnRequest.reason)) throw new HttpError(409, "This return request has an invalid reason.");
  const lock = randomUUID();
  const claimedOrder = await Order.findOneAndUpdate(
    { _id: returnRequest.order, returnWorkflowLock: { $exists: false } },
    { $set: { returnWorkflowLock: lock } },
    { new: true },
  ).select("+returnWorkflowLock");
  if (!claimedOrder) throw new HttpError(409, "Another return action is being processed for this order. Try again shortly.");

  try {
    const current = await ReturnRequest.findById(id);
    if (!current) throw new HttpError(404, "Return request was not found.");
    if (current.status === nextStatus) throw new HttpError(409, `This return request is already ${nextStatus.toLowerCase()}.`);
    if (!ADMIN_RETURN_TRANSITIONS[current.status]?.includes(nextStatus)) {
      throw new HttpError(409, `Cannot move a return request from ${current.status} to ${nextStatus}.`);
    }
    const order = await Order.findById(current.order);
    if (!order) throw new HttpError(404, "The related order was not found.");
    const changedAt = new Date();

    if (nextStatus === "Approved") {
      const subtotal = orderMerchandiseSubtotal(order);
      const requestedSubtotal = current.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const netMerchandise = Math.max(0, subtotal - (order.discount || 0) - (order.prepaidDiscount || 0));
      const calculated = subtotal ? Math.floor((requestedSubtotal * netMerchandise) / subtotal) : 0;
      const priorReturns = await ReturnRequest.find({
        order: order._id,
        _id: { $ne: current._id },
        status: { $in: ["Approved", "Picked up", "Refunded"] },
      }).select("refundAmount status").lean();
      const pendingAmount = priorReturns
        .filter((item) => ["Approved", "Picked up"].includes(item.status))
        .reduce((sum, item) => sum + (item.refundAmount || 0), 0);
      const completedAmount = priorReturns
        .filter((item) => item.status === "Refunded")
        .reduce((sum, item) => sum + (item.refundAmount || 0), 0);
      const refundPool = order.razorpayPaymentId
        ? (order.amountPaid || 0) - (order.amountRefunded || 0)
        : order.amount;
      const alreadyRefunded = Math.max(order.amountRefunded || 0, completedAmount);
      current.refundAmount = Math.max(0, Math.min(calculated, refundPool - alreadyRefunded - pendingAmount));
    }

    if (nextStatus === "Refunded") {
      if (current.refundAmount > 0 && order.razorpayPaymentId) {
        const refund = await createRazorpayRefund(order, current, current.refundAmount);
        current.razorpayRefundId = refund.id;
        current.refundProviderStatus = refund.status === "processed" ? "processed" : "pending";
      } else if (current.refundAmount > 0 && !manualRefundReference) {
        throw new HttpError(400, "Enter the cash/COD refund reference before marking this return refunded.");
      }
      if (manualRefundReference) current.manualRefundReference = manualRefundReference;
    }

    current.status = nextStatus;
    current.statusTimeline.push({
      status: nextStatus,
      actor,
      changedAt,
      ...(note ? { note } : {}),
    });
    await current.save();

    if (nextStatus === "Refunded" && current.refundAmount > 0) {
      const amountRefunded = (order.amountRefunded || 0) + current.refundAmount;
      const updatedOrder = await Order.updateOne(
        { _id: order._id, returnWorkflowLock: lock },
        {
          $set: {
            amountRefunded,
            refundStatus: current.razorpayRefundId && current.refundProviderStatus === "pending"
              ? "refund_pending"
              : amountRefunded >= (order.amountPaid || order.amount) ? "refunded" : "refund_pending",
          },
        },
      );
      if (updatedOrder.modifiedCount !== 1) {
        throw new HttpError(409, "The refund request was recorded, but the order refund balance needs reconciliation.");
      }
    }
    const saved = await ReturnRequest.findById(id).select("-photoDataUrl").lean();
    res.json(saved);
  } finally {
    await Order.updateOne({ _id: claimedOrder._id, returnWorkflowLock: lock }, { $unset: { returnWorkflowLock: 1 } });
  }
}

export async function createSupportTicket(req, res) {
  const fullName = text(req.body?.fullName, "Full name", 100, true);
  const customerPhone = phone(req.body?.phone);
  const email = text(req.body?.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const subject = text(req.body?.subject, "Subject", 150, true);
  const message = text(req.body?.message, "Message", 3000, true);
  const orderNumber = text(req.body?.orderNumber, "Order number", 50);
  let order = null;
  if (orderNumber) {
    order = await Order.findOne({ orderNumber, "customer.phone": customerPhone }).select("_id orderNumber customer.id").lean();
    if (!order) throw new HttpError(404, "No order matches that order number and mobile number.");
  }
  const customer = await Customer.findOne({ phone: customerPhone }).select("_id").lean();
  const ticket = await SupportTicket.create({
    ticketNumber: `SUP-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}`,
    ...(customer ? { customer: customer._id } : {}),
    ...(order ? { order: order._id, orderNumber: order.orderNumber } : {}),
    fullName,
    phone: customerPhone,
    email,
    subject,
    message,
  });
  res.status(201).json({
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    message: "Your support request has been received.",
  });
}

export async function listSupportTickets(req, res) {
  const status = text(req.query.status, "Ticket status", 30);
  if (status && !["Open", "In progress", "Closed"].includes(status)) throw new HttpError(400, "Unknown ticket status.");
  const tickets = await SupportTicket.find(status ? { status } : {})
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  res.json(tickets);
}

export async function updateSupportTicket(req, res) {
  const id = validId(req.params.id, "support ticket");
  const ticket = await SupportTicket.findById(id);
  if (!ticket) throw new HttpError(404, "Support ticket was not found.");
  const nextStatus = text(req.body?.status, "Ticket status", 30);
  if (nextStatus && !["Open", "In progress", "Closed"].includes(nextStatus)) {
    throw new HttpError(400, "Choose Open, In progress, or Closed.");
  }
  const reply = text(req.body?.reply, "Reply", 3000);
  const author = text(req.staff?.fullName, "Staff name", 100, true);
  if (nextStatus) ticket.status = nextStatus;
  if (reply) {
    if (ticket.replies.length >= 100) throw new HttpError(409, "This ticket has reached its reply limit.");
    ticket.replies.push({ body: reply, author, internal: true, createdAt: new Date() });
  }
  if (!nextStatus && !reply) throw new HttpError(400, "Choose a status or enter an internal reply.");
  await ticket.save();
  res.json(ticket);
}

export async function listNotificationLogs(req, res) {
  const logs = await NotificationLog.find()
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json(logs);
}

export async function retryNotification(req, res) {
  const id = validId(req.params.id, "notification");
  const log = await NotificationLog.findById(id).select("+lock");
  if (!log) throw new HttpError(404, "Notification was not found.");
  if (!["failed", "partial"].includes(log.status)) throw new HttpError(409, "Only failed or partial notifications can be retried.");
  const order = await Order.findById(log.order).lean();
  if (!order) throw new HttpError(404, "The related order was not found.");
  const retried = await sendOrderNotification(order, log.event);
  res.json(retried);
}
