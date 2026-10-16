import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import PDFDocument from "pdfkit";
import { PDFDocument as PDFMerger } from "pdf-lib";
import bwipjs from "bwip-js";
import mongoose from "mongoose";
import HttpError from "../utils/HttpError.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Sequence from "../models/Sequence.js";
import { sendOrderNotification } from "../utils/orderNotifications.js";
import { awardLoyaltyPoints } from "./crmController.js";

async function awardDeliveredOrder(order) {
  await awardLoyaltyPoints(order._id).catch((error) => {
    console.error("Could not award loyalty points for the delivered order.", {
      orderNumber: order.orderNumber,
      error: error.message,
    });
  });
}

const PAGE_SIZE_MAX = 100;
const BULK_LIMIT = 50;
const GST_RATE = 18;
const HSN_CODE = "33030020";
const FULFILMENT_STATUSES = [
  "New",
  "Confirmed",
  "Packed",
  "Shipped",
  "Out for delivery",
  "Delivered",
  "Cancelled",
  "RTO",
  "Returned",
];
const STATUS_TRANSITIONS = {
  New: ["Confirmed", "Cancelled"],
  Confirmed: ["Packed", "Cancelled"],
  Packed: ["Cancelled"],
  Shipped: ["Out for delivery", "RTO"],
  "Out for delivery": ["Delivered", "RTO"],
  Delivered: ["Returned"],
  RTO: ["Returned"],
  Cancelled: [],
  Returned: [],
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

function actorName(req) {
  return text(req.staff?.fullName, "Staff name", 100, true);
}

function fulfilmentStatusFilter(status) {
  return status === "New"
    ? { $or: [{ fulfillmentStatus: "New" }, { fulfillmentStatus: { $exists: false } }] }
    : { fulfillmentStatus: status };
}

function validOrderId(value) {
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, "Invalid order reference.");
  return value;
}

function orderItems(order) {
  if (order.items?.length) return order.items;
  return order.product
    ? [{ name: order.product.name, quantity: order.product.quantity, unitPrice: order.product.unitPrice, lineTotal: order.product.unitPrice * order.product.quantity }]
    : [];
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDate(value, field, endOfDay = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${field} must be a YYYY-MM-DD date.`);
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} is invalid.`);
  }
  return date;
}

function orderSummary(order) {
  return {
    ...order,
    items: orderItems(order),
    checkoutToken: undefined,
    razorpaySignature: undefined,
    settlementLock: undefined,
  };
}

async function findOrder(id) {
  const order = await Order.findById(validOrderId(id))
    .populate("landingPage", "slug headline")
    .lean();
  if (!order) throw new HttpError(404, "Order was not found.");
  return orderSummary(order);
}

export async function listFulfilmentOrders(req, res) {
  const filter = {};
  const conditions = [];
  const search = text(req.query.search, "Search", 100);
  const status = text(req.query.status, "Fulfilment status", 40);
  const paymentMethod = text(req.query.paymentMethod, "Payment method", 20);
  const campaignSource = text(req.query.campaignSource, "Campaign source", 100);
  const from = parseDate(req.query.from, "Start date");
  const to = parseDate(req.query.to, "End date", true);
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 25);

  if (!Number.isSafeInteger(page) || page < 1) throw new HttpError(400, "Page must be a positive whole number.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    throw new HttpError(400, `Page size must be between 1 and ${PAGE_SIZE_MAX}.`);
  }
  if (status && !FULFILMENT_STATUSES.includes(status)) throw new HttpError(400, "Unknown fulfilment status.");
  if (paymentMethod && !["prepaid", "cod"].includes(paymentMethod)) throw new HttpError(400, "Unknown payment method filter.");
  if (from && to && from > to) throw new HttpError(400, "Start date must be on or before end date.");

  if (search) {
    const expression = new RegExp(escapedRegex(search), "i");
    conditions.push({ $or: [
      { orderNumber: expression },
      { "customer.fullName": expression },
      { "customer.phone": expression },
    ] });
  }
  if (status === "New") {
    conditions.push({ $or: [{ fulfillmentStatus: "New" }, { fulfillmentStatus: { $exists: false } }] });
  } else if (status) {
    filter.fulfillmentStatus = status;
  }
  if (conditions.length) filter.$and = conditions;
  if (paymentMethod === "prepaid") filter.paymentMethod = "prepaid";
  if (paymentMethod === "cod") filter.paymentMethod = { $in: ["cod", "partial_cod"] };
  if (campaignSource) filter["utm.source"] = new RegExp(`^${escapedRegex(campaignSource)}$`, "i");
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select("-checkoutToken -razorpaySignature -settlementLock")
      .populate("landingPage", "slug headline")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Order.countDocuments(filter),
  ]);
  res.json({
    orders: orders.map(orderSummary),
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    statuses: FULFILMENT_STATUSES,
  });
}

export async function getFulfilmentOrder(req, res) {
  res.json(await findOrder(req.params.id));
}

export async function changeFulfilmentStatus(req, res) {
  const order = await Order.findById(validOrderId(req.params.id));
  if (!order) throw new HttpError(404, "Order was not found.");
  const previousStatus = order.fulfillmentStatus;
  const nextStatus = text(req.body?.status, "Status", 40, true);
  const actor = actorName(req);
  const note = text(req.body?.note, "Timeline note", 500);
  if (!FULFILMENT_STATUSES.includes(nextStatus)) throw new HttpError(400, "Unknown fulfilment status.");
  if (nextStatus === previousStatus) throw new HttpError(409, "The order already has that fulfilment status.");
  if (!STATUS_TRANSITIONS[previousStatus]?.includes(nextStatus)) {
    throw new HttpError(409, `Cannot move an order from ${previousStatus} to ${nextStatus}.`);
  }
  if (nextStatus === "Confirmed" && !["Paid", "CODConfirmed", "New"].includes(order.status)) {
    throw new HttpError(409, "Only paid, COD-confirmed, or legacy campaign orders can be confirmed for fulfilment.");
  }
  if (nextStatus === "Shipped" && !order.shipment?.awb) {
    throw new HttpError(409, "Book a courier shipment before marking this order shipped.");
  }
  if (["Out for delivery", "Delivered", "RTO"].includes(nextStatus)) {
    throw new HttpError(409, "Courier delivery statuses must be received through the signed courier webhook.");
  }

  if (nextStatus === "Cancelled" && order.shipment?.awb) {
    throw new HttpError(409, "A courier-booked shipment cannot be cancelled here. Use NDR or request return-to-origin.");
  }
  if (nextStatus === "Cancelled" && order.stockDeductedAt && !order.stockRestoredAt) {
    const lock = randomUUID();
    const claimed = await Order.findOneAndUpdate(
      {
        _id: order._id,
        ...fulfilmentStatusFilter(previousStatus),
        stockDeductedAt: { $exists: true },
        stockRestoredAt: { $exists: false },
        stockRestoreLock: { $exists: false },
      },
      { $set: { stockRestoreLock: lock } },
      { new: true },
    ).select("+stockRestoreLock");
    if (!claimed) throw new HttpError(409, "This order is already being cancelled or its inventory was already restored.");
    const restored = [];
    try {
      for (const item of claimed.items.length ? claimed.items : [{
        product: claimed.product.id,
        quantity: claimed.product.quantity,
        name: claimed.product.name,
      }]) {
        const result = await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
        if (result.modifiedCount !== 1) throw new HttpError(409, `Could not restore stock for ${item.name}.`);
        restored.push(item);
      }
      const changedAt = new Date();
      const refundStatus = claimed.amountPaid > 0 ? "refund_pending" : "not_required";
      const saved = await Order.findOneAndUpdate(
        { _id: claimed._id, ...fulfilmentStatusFilter(claimed.fulfillmentStatus), stockRestoreLock: lock },
        {
          $set: {
            fulfillmentStatus: nextStatus,
            stockRestoredAt: changedAt,
            refundStatus,
          },
          $push: {
            statusTimeline: {
              status: nextStatus,
              actor,
              changedAt,
              note: note || (refundStatus === "refund_pending"
                ? "Cancelled before courier handoff; online refund requires separate processing."
                : "Cancelled before courier handoff."),
            },
          },
          $unset: { stockRestoreLock: 1 },
        },
        { new: true },
      );
      if (!saved) throw new HttpError(409, "The order could not be cancelled. Refresh and check its inventory state.");
      return res.json(orderSummary(saved.toObject()));
    } catch (error) {
      for (const item of restored) await Product.updateOne({ _id: item.product }, { $inc: { stock: -item.quantity } });
      await Order.updateOne({ _id: claimed._id, stockRestoreLock: lock }, { $unset: { stockRestoreLock: 1 } });
      throw error;
    }
  }

  const changedAt = new Date();
  order.fulfillmentStatus = nextStatus;
  if (nextStatus === "Cancelled" || nextStatus === "Returned") {
    order.refundStatus = order.amountPaid > 0 ? "refund_pending" : "not_required";
  }
  const timelineNote = note || (
    nextStatus === "Returned" && order.amountPaid > 0
      ? "Returned for inspection; process any refund separately."
      : nextStatus === "Cancelled" && order.amountPaid > 0
        ? "Cancelled before courier handoff; online refund requires separate processing."
        : ""
  );
  const update = {
    $set: {
      fulfillmentStatus: nextStatus,
      ...(nextStatus === "Cancelled" || nextStatus === "Returned" ? { refundStatus: order.refundStatus } : {}),
    },
    $push: {
      statusTimeline: {
        status: nextStatus,
        actor,
        changedAt,
        ...(timelineNote ? { note: timelineNote } : {}),
      },
    },
  };
  const saved = await Order.findOneAndUpdate(
    {
      _id: order._id,
      ...fulfilmentStatusFilter(previousStatus),
      ...(nextStatus === "Cancelled" ? { settlementLock: { $exists: false } } : {}),
      ...(nextStatus === "Returned" ? {
        returnRequestLock: { $exists: false },
        returnWorkflowLock: { $exists: false },
      } : {}),
    },
    update,
    { new: true },
  );
  if (!saved) throw new HttpError(409, "The order changed while saving this action. Refresh and try again.");
  res.json(orderSummary(saved.toObject()));
}

export async function addInternalNote(req, res) {
  const order = await Order.findById(validOrderId(req.params.id));
  if (!order) throw new HttpError(404, "Order was not found.");
  if (order.internalNotes.length >= 200) throw new HttpError(409, "This order has reached its internal note limit.");
  const body = text(req.body?.body, "Note", 2000, true);
  order.internalNotes.push({ body, author: actorName(req), createdAt: new Date() });
  await order.save();
  res.status(201).json({ notes: order.internalNotes });
}

async function nextInvoiceNumber() {
  let sequence;
  try {
    sequence = await Sequence.findOneAndUpdate(
      { name: "gst-invoice" },
      { $inc: { value: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    sequence = await Sequence.findOneAndUpdate({ name: "gst-invoice" }, { $inc: { value: 1 } }, { new: true });
  }
  const now = new Date();
  const fiscalStart = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `AM/${fiscalStart}-${String(fiscalStart + 1).slice(-2)}/${String(sequence.value).padStart(6, "0")}`;
}

async function ensureInvoiceNumber(orderId) {
  let order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (order.invoiceNumber) return order;
  const invoiceNumber = await nextInvoiceNumber();
  order = await Order.findOneAndUpdate(
    { _id: orderId, invoiceNumber: { $exists: false } },
    { $set: { invoiceNumber } },
    { new: true },
  );
  if (!order) order = await Order.findById(orderId);
  return order;
}

function invoiceEligible(order) {
  if (!["Paid", "CODConfirmed", "New"].includes(order.status)) {
    throw new HttpError(409, "Issue a tax invoice only after payment/COD confirmation.");
  }
}

function gstConfig() {
  const gstin = process.env.COMPANY_GSTIN?.trim().toUpperCase() || "";
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(gstin)) {
    throw new HttpError(503, "Configure a valid 15-character COMPANY_GSTIN in the backend .env before issuing GST invoices.");
  }
  const state = process.env.COMPANY_STATE?.trim() || "";
  const name = process.env.COMPANY_NAME?.trim() || "";
  const address = process.env.COMPANY_ADDRESS?.trim() || "";
  if (!state || !name || !address || state.length > 80 || name.length > 150 || address.length > 500) {
    throw new HttpError(503, "Configure COMPANY_NAME, COMPANY_ADDRESS, and COMPANY_STATE in the backend .env before issuing GST invoices.");
  }
  const hsn = text(process.env.HSN_CODE, "HSN code", 20) || HSN_CODE;
  if (!/^[0-9]{4,8}$/.test(hsn)) throw new HttpError(503, "HSN_CODE must contain 4 to 8 digits.");
  const configuredRate = Number(process.env.GST_RATE || GST_RATE);
  if (!Number.isFinite(configuredRate) || configuredRate <= 0 || configuredRate > 100) {
    throw new HttpError(503, "GST_RATE must be greater than 0 and no more than 100.");
  }
  return { gstin, state, name, address, hsn, gstRate: configuredRate };
}

function amountInWords(amount) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function underThousand(value) {
    const parts = [];
    if (value >= 100) parts.push(`${ones[Math.floor(value / 100)]} Hundred`);
    value %= 100;
    if (value >= 20) parts.push(`${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`);
    else if (value) parts.push(ones[value]);
    return parts.join(" ");
  }
  if (!Number.isSafeInteger(amount) || amount < 0) throw new HttpError(400, "Invoice total must be a non-negative whole rupee amount.");
  if (amount === 0) return "Zero Rupees Only";
  const groups = [
    [Math.floor(amount / 10_000_000), "Crore"],
    [Math.floor((amount % 10_000_000) / 100_000), "Lakh"],
    [Math.floor((amount % 100_000) / 1_000), "Thousand"],
    [amount % 1_000, ""],
  ];
  const words = groups.filter(([value]) => value > 0).map(([value, suffix]) => `${underThousand(value)}${suffix ? ` ${suffix}` : ""}`);
  return `${words.join(" ")} Rupees Only`;
}

function money(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function createPdf(configure) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const document = new PDFDocument({ autoFirstPage: false, compress: true, margin: 36 });
    document.on("data", (chunk) => chunks.push(chunk));
    document.once("error", reject);
    document.once("end", () => resolve(Buffer.concat(chunks)));
    configure(document).then(() => document.end()).catch(reject);
  });
}

function drawInvoice(document, order, config) {
  invoiceEligible(order);
  document.addPage({ size: "A4", margin: 42 });
  const width = document.page.width - 84;
  const buyerState = (order.customer.state || "").trim().toLowerCase();
  if (!buyerState) {
    throw new HttpError(409, "Customer state is missing. Confirm the delivery state before issuing a GST invoice.");
  }
  const sameState = buyerState && buyerState === config.state.trim().toLowerCase();
  const invoiceTotal = Math.round(order.amount);
  const taxable = invoiceTotal / (1 + config.gstRate / 100);
  const tax = invoiceTotal - taxable;
  const cgst = sameState ? tax / 2 : 0;
  const sgst = sameState ? tax / 2 : 0;
  const igst = sameState ? 0 : tax;
  document.font("Helvetica-Bold").fontSize(19).text(config.name, { continued: false });
  document.font("Helvetica").fontSize(9).text(config.address);
  document.text(`GSTIN: ${config.gstin}`);
  document.moveDown(0.6);
  document.font("Helvetica-Bold").fontSize(15).text("TAX INVOICE", { align: "right" });
  document.font("Helvetica").fontSize(9).text(`Invoice no: ${order.invoiceNumber}`, { align: "right" });
  document.text(`Invoice date: ${new Date().toLocaleDateString("en-IN")}`, { align: "right" });
  document.text(`Order no: ${order.orderNumber}`, { align: "right" });
  document.moveDown(1);
  document.font("Helvetica-Bold").fontSize(10).text("BILL TO");
  document.font("Helvetica").fontSize(9)
    .text(order.customer.fullName)
    .text(order.customer.address)
    .text([order.customer.city, order.customer.state, order.customer.pincode].filter(Boolean).join(", "))
    .text(`Phone: ${order.customer.phone}`);

  const columns = [0, width * 0.51, width * 0.65, width * 0.79, width * 0.9];
  const drawTableHeader = (top) => {
    document.rect(42, top, width, 23).fill("#191b18");
    document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8)
      .text("ITEM / HSN", 48, top + 7, { width: columns[1] - 12 })
      .text("QTY", 42 + columns[1], top + 7, { width: columns[2] - columns[1], align: "right" })
      .text("RATE", 42 + columns[2], top + 7, { width: columns[3] - columns[2], align: "right" })
      .text("TAXABLE", 42 + columns[3], top + 7, { width: columns[4] - columns[3], align: "right" })
      .text("TOTAL", 42 + columns[4], top + 7, { width: width - columns[4] - 6, align: "right" });
  };
  let y = document.y + 18;
  drawTableHeader(y);
  y += 23;
  document.fillColor("#191b18").font("Helvetica").fontSize(8);
  for (const item of orderItems(order)) {
    if (y + 34 > document.page.height - 120) {
      document.addPage({ size: "A4", margin: 42 });
      y = 42;
      drawTableHeader(y);
      y += 23;
      document.fillColor("#191b18").font("Helvetica").fontSize(8);
    }
    const lineTotal = Number(item.lineTotal ?? item.unitPrice * item.quantity);
    const lineTaxable = lineTotal / (1 + config.gstRate / 100);
    document.rect(42, y, width, 34).stroke("#d9d8d0");
    document.text(item.name, 48, y + 5, { width: columns[1] - 12 });
    document.text(`HSN ${config.hsn}`, 48, y + 18, { width: columns[1] - 12 });
    document.text(String(item.quantity), 42 + columns[1], y + 11, { width: columns[2] - columns[1], align: "right" });
    document.text(money(item.unitPrice), 42 + columns[2], y + 11, { width: columns[3] - columns[2], align: "right" });
    document.text(money(lineTaxable), 42 + columns[3], y + 11, { width: columns[4] - columns[3], align: "right" });
    document.text(money(lineTotal), 42 + columns[4], y + 11, { width: width - columns[4] - 6, align: "right" });
    y += 34;
  }
  const extraRows = [
    ["Shipping", money(order.shipping || 0)],
    ...(order.discount > 0 ? [["Coupon discount", `-${money(order.discount)}`]] : []),
    ...(order.prepaidDiscount > 0 ? [["Prepaid discount", `-${money(order.prepaidDiscount)}`]] : []),
    ["Taxable value", money(taxable)],
    ...(sameState ? [["CGST", money(cgst)], ["SGST", money(sgst)]] : [["IGST", money(igst)]]),
    ["Invoice total", money(invoiceTotal)],
  ];
  y += 12;
  document.font("Helvetica").fontSize(9);
  for (const [label, value] of extraRows) {
    document.text(label, 42 + width * 0.54, y, { width: width * 0.28 });
    document.font(label === "Invoice total" ? "Helvetica-Bold" : "Helvetica")
      .text(value, 42 + width * 0.82, y, { width: width * 0.17, align: "right" })
      .font("Helvetica");
    y += 17;
  }
  document.font("Helvetica-Bold").fontSize(9).text(`Amount in words: ${amountInWords(invoiceTotal)}`, 42, y + 8, { width });
  document.font("Helvetica").fontSize(8).fillColor("#64665f")
    .text("Prices are shown inclusive of applicable GST. This is a computer-generated invoice.", 42, document.page.height - 68, { width, align: "center" });
}

async function invoicePdf(order) {
  const config = gstConfig();
  invoiceEligible(order);
  const current = await ensureInvoiceNumber(order._id);
  return createPdf(async (document) => drawInvoice(document, current.toObject(), config));
}

async function qrCode(value) {
  return bwipjs.toBuffer({ bcid: "qrcode", text: value, scale: 4, padding: 2 });
}

async function labelPdf(order) {
  if (!order.shipment?.awb) throw new HttpError(409, `Book a courier for ${order.orderNumber} before printing its shipping label.`);
  return createPdf(async (document) => {
    document.addPage({ size: [288, 432], margin: 18 });
    const width = document.page.width - 36;
    document.font("Helvetica-Bold").fontSize(15).text("ALPHA MALE", { align: "center" });
    document.font("Helvetica").fontSize(9).text(order.shipment.courierName || "Courier", { align: "center" });
    document.moveDown(0.5);
    document.font("Helvetica-Bold").fontSize(10).text(`AWB  ${order.shipment.awb}`, { align: "center" });
    document.moveDown(0.5);
    const qr = await qrCode(order.orderNumber);
    document.image(qr, (document.page.width - 88) / 2, document.y, { width: 88, height: 88 });
    document.y += 98;
    document.font("Helvetica-Bold").fontSize(9).text(`ORDER  ${order.orderNumber}`);
    document.moveDown(0.5);
    document.fontSize(8).text(`SHIP TO: ${order.customer.fullName.toUpperCase()}`);
    document.font("Helvetica").text(order.customer.address, { width });
    document.text([order.customer.city, order.customer.state, order.customer.pincode].filter(Boolean).join(", "));
    document.text(`PHONE: ${order.customer.phone}`);
    document.moveDown(0.5);
    document.font("Helvetica-Bold").fontSize(10).text(
      order.codDue > 0 ? `COD COLLECT: ${money(order.codDue)}` : "PREPAID - NO COLLECTION",
      { align: "center" },
    );
    document.moveDown(0.5);
    document.font("Helvetica").fontSize(8)
      .text(`WEIGHT: ${Number(order.shipment.weightKg || 0).toFixed(2)} kg`)
      .text(`ITEMS: ${orderItems(order).reduce((sum, item) => sum + item.quantity, 0)} unit(s)`);
    document.moveDown(1);
    document.fontSize(7).fillColor("#64665f").text("Mock courier label for local assignment testing.", { align: "center" });
  });
}

async function mergePdfs(buffers) {
  const output = await PDFMerger.create();
  for (const buffer of buffers) {
    const source = await PDFMerger.load(buffer);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  return Buffer.from(await output.save());
}

function sendPdf(res, buffer, filename) {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
  });
  res.send(buffer);
}

export async function printInvoice(req, res) {
  const order = await findOrder(req.params.id);
  sendPdf(res, await invoicePdf(order), `${order.orderNumber}-invoice.pdf`);
}

export async function printShippingLabel(req, res) {
  const order = await findOrder(req.params.id);
  sendPdf(res, await labelPdf(order), `${order.orderNumber}-shipping-label.pdf`);
}

async function getBulkOrders(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > BULK_LIMIT) {
    throw new HttpError(400, `Select between 1 and ${BULK_LIMIT} orders.`);
  }
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new HttpError(400, "One or more selected order references are invalid.");
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length !== ids.length) throw new HttpError(400, "Duplicate order selections are not allowed.");
  const orders = await Order.find({ _id: { $in: uniqueIds } })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  if (orders.length !== uniqueIds.length) throw new HttpError(404, "One or more selected orders were not found.");
  return orders.map(orderSummary);
}

export async function bulkPrint(req, res) {
  const orders = await getBulkOrders(req.body?.orderIds);
  const type = text(req.body?.type, "Print type", 20, true);
  if (!["invoices", "labels", "both"].includes(type)) throw new HttpError(400, "Choose invoices, labels, or both.");
  const buffers = [];
  if (type === "invoices" || type === "both") {
    for (const order of orders) buffers.push(await invoicePdf(order));
  }
  if (type === "labels" || type === "both") {
    for (const order of orders) buffers.push(await labelPdf(order));
  }
  sendPdf(res, await mergePdfs(buffers), `alpha-${type}-${Date.now()}.pdf`);
}

async function packingListPdf(orders) {
  const totals = new Map();
  for (const order of orders) {
    for (const item of orderItems(order)) {
      totals.set(item.name, (totals.get(item.name) || 0) + item.quantity);
    }
  }
  return createPdf(async (document) => {
    document.addPage({ size: "A4", margin: 42 });
    document.font("Helvetica-Bold").fontSize(18).text("ALPHA MALE · PICK LIST");
    document.font("Helvetica").fontSize(9).text(`Generated ${new Date().toLocaleString("en-IN")} · ${orders.length} orders`);
    document.moveDown(1);
    for (const [name, quantity] of [...totals.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      document.font("Helvetica-Bold").fontSize(11).text(name, { continued: true });
      document.font("Helvetica").text(`  × ${quantity}`, { align: "right" });
      document.moveDown(0.4);
    }
    document.moveDown(1);
    document.font("Helvetica-Bold").fontSize(10).text("Orders in this pick list");
    document.font("Helvetica").fontSize(8);
    for (const order of orders) document.text(`${order.orderNumber} · ${order.customer.fullName} · ${orderItems(order).reduce((sum, item) => sum + item.quantity, 0)} unit(s)`);
  });
}

export async function downloadPackingList(req, res) {
  const orders = await getBulkOrders(req.body?.orderIds);
  sendPdf(res, await packingListPdf(orders), `alpha-pick-list-${Date.now()}.pdf`);
}

export async function bulkPack(req, res) {
  const orders = await getBulkOrders(req.body?.orderIds);
  const actor = actorName(req);
  const invalid = orders.find((order) => order.fulfillmentStatus !== "Confirmed");
  if (invalid) throw new HttpError(409, `${invalid.orderNumber} is ${invalid.fulfillmentStatus}; only Confirmed orders can be packed in bulk.`);
  const changedAt = new Date();
  const result = await Order.updateMany(
    { _id: { $in: orders.map((order) => order._id) }, fulfillmentStatus: "Confirmed" },
    {
      $set: { fulfillmentStatus: "Packed" },
      $push: { statusTimeline: { status: "Packed", actor, changedAt } },
    },
  );
  if (result.modifiedCount !== orders.length) {
    throw new HttpError(409, `${result.modifiedCount} of ${orders.length} orders were packed before another order changed. Refresh and check each order.`);
  }
  res.json({ packed: result.modifiedCount });
}

function courierForPincode(pincode, state) {
  const prefix = String(pincode || "").charAt(0);
  if (["1", "2"].includes(prefix)) return "Mock Ground North";
  if (["3", "4"].includes(prefix)) return "Mock Express West";
  if (["5", "6"].includes(prefix)) return "Mock Express South";
  if (["7", "8"].includes(prefix)) return "Mock National East";
  const normalized = (state || "").trim().toLowerCase();
  if (["maharashtra", "goa", "gujarat"].includes(normalized)) return "Mock Express West";
  if (["delhi", "new delhi", "punjab", "haryana", "uttar pradesh", "rajasthan"].includes(normalized)) return "Mock Ground North";
  if (["karnataka", "tamil nadu", "kerala", "telangana", "andhra pradesh"].includes(normalized)) return "Mock Express South";
  return "Mock National Courier";
}

export async function bookShipment(req, res) {
  if ((process.env.COURIER_MODE || "mock").trim().toLowerCase() !== "mock") {
    throw new HttpError(503, "This build supports the mocked courier only; no live Shiprocket booking is configured.");
  }
  const id = validOrderId(req.params.id);
  const weightKg = Number(req.body?.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 0.01 || weightKg > 50) {
    throw new HttpError(400, "Shipment weight must be between 0.01 and 50 kg.");
  }
  const actor = actorName(req);
  const order = await Order.findById(id);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (order.shipment?.awb) {
    await sendOrderNotification(order, "shipped").catch((error) => {
      console.error("Could not record the shipped notification.", {
        orderNumber: order.orderNumber,
        error: error.message,
      });
    });
    return res.json(orderSummary(order.toObject()));
  }
  if (order.fulfillmentStatus !== "Packed") throw new HttpError(409, "Pack the order before booking a courier.");
  const awb = `AMX${Date.now().toString(36).toUpperCase()}${randomInt(1000, 9999)}`;
  const courierName = courierForPincode(order.customer.pincode, order.customer.state);
  const changedAt = new Date();
  const booked = await Order.findOneAndUpdate(
    { _id: id, fulfillmentStatus: "Packed", "shipment.awb": { $exists: false } },
    {
      $set: {
        fulfillmentStatus: "Shipped",
        shipment: {
          provider: "mock",
          courierName,
          awb,
          trackingUrl: "",
          weightKg,
          bookedAt: changedAt,
          ndrAttempts: 0,
          processedEvents: [],
        },
      },
      $push: { statusTimeline: { status: "Shipped", actor, changedAt, note: "Mock courier shipment booked." } },
    },
    { new: true },
  );
  if (!booked) throw new HttpError(409, "Shipment booking changed concurrently. Refresh the order and try again.");
  await sendOrderNotification(booked, "shipped").catch((error) => {
    console.error("Could not record the shipped notification.", {
      orderNumber: booked.orderNumber,
      error: error.message,
    });
  });
  res.status(201).json(orderSummary(booked.toObject()));
}

function webhookSignature(rawBody, signature, secret) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function handleCourierWebhook(req, res) {
  if (!Buffer.isBuffer(req.body)) throw new HttpError(400, "Invalid courier webhook payload.");
  const secret = process.env.COURIER_WEBHOOK_SECRET?.trim();
  if (!secret) throw new HttpError(503, "COURIER_WEBHOOK_SECRET is not configured on the server.");
  if (!webhookSignature(req.body, req.get("x-courier-signature") || "", secret)) {
    throw new HttpError(400, "Courier webhook signature verification failed.");
  }
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid courier webhook payload.");
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new HttpError(400, "Invalid courier webhook payload.");
  }
  const eventId = text(event.eventId, "Courier event ID", 100, true);
  const awb = text(event.awb, "AWB", 60, true);
  const eventStatus = text(event.status, "Courier status", 30, true).toLowerCase();
  const targetStatus = {
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    rto: "RTO",
    ndr: "Out for delivery",
  }[eventStatus];
  if (!targetStatus) throw new HttpError(400, "Unsupported courier event status.");
  const order = await Order.findOne({ "shipment.awb": awb });
  if (!order) throw new HttpError(404, "No order matches this AWB.");
  if (order.shipment.processedEvents?.includes(eventId)) {
    if (targetStatus === "Delivered") {
      await awardDeliveredOrder(order);
      await sendOrderNotification(order, "delivered").catch((error) => {
        console.error("Could not record the delivered notification.", {
          orderNumber: order.orderNumber,
          error: error.message,
        });
      });
    }
    return res.json({ received: true, duplicate: true });
  }
  const previousStatus = order.fulfillmentStatus;
  if (!STATUS_TRANSITIONS[previousStatus]?.includes(targetStatus) && previousStatus !== targetStatus) {
    throw new HttpError(409, `Courier cannot move this order from ${previousStatus} to ${targetStatus}.`);
  }
  const actor = "Mock courier webhook";
  const changedAt = new Date();
  const update = {
    $set: { fulfillmentStatus: targetStatus },
    $addToSet: { "shipment.processedEvents": eventId },
    $push: {
      statusTimeline: {
        status: targetStatus,
        actor,
        changedAt,
        ...(eventStatus === "ndr" ? { note: `NDR: ${text(event.note, "NDR note", 300) || "Delivery attempt failed."}` } : {}),
      },
    },
  };
  if (eventStatus === "ndr") {
    update.$inc = { "shipment.ndrAttempts": 1 };
    update.$set["shipment.ndrStatus"] = "action_required";
  } else if (order.shipment.ndrStatus === "action_required") {
    update.$set["shipment.ndrStatus"] = "reattempt_requested";
  }
  const saved = await Order.findOneAndUpdate(
    {
      _id: order._id,
      fulfillmentStatus: previousStatus,
      "shipment.awb": awb,
      "shipment.processedEvents": { $ne: eventId },
    },
    update,
    { new: true },
  );
  if (!saved) {
    const latest = await Order.findById(order._id).lean();
    if (latest?.shipment?.processedEvents?.includes(eventId)) return res.json({ received: true, duplicate: true });
    throw new HttpError(409, "Order changed while processing this courier event. Retry with the same event ID.");
  }
  if (targetStatus === "Delivered") {
    await awardDeliveredOrder(saved);
    await sendOrderNotification(saved, "delivered").catch((error) => {
      console.error("Could not record the delivered notification.", {
        orderNumber: saved.orderNumber,
        error: error.message,
      });
    });
  }
  res.json({ received: true, status: saved.fulfillmentStatus, ndrAttempts: saved.shipment.ndrAttempts });
}

export async function resolveNdr(req, res) {
  const id = validOrderId(req.params.id);
  const action = text(req.body?.action, "NDR action", 20, true);
  const actor = actorName(req);
  if (!["reattempt", "cancel"].includes(action)) throw new HttpError(400, "Choose reattempt or cancel.");
  const order = await Order.findById(id);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (order.shipment?.ndrStatus !== "action_required") throw new HttpError(409, "This order has no NDR awaiting action.");
  const changedAt = new Date();
  if (action === "reattempt") {
    order.fulfillmentStatus = "Shipped";
    order.shipment.ndrStatus = "reattempt_requested";
    order.statusTimeline.push({ status: "Shipped", actor, changedAt, note: "Delivery reattempt requested after NDR." });
  } else {
    order.fulfillmentStatus = "RTO";
    order.shipment.ndrStatus = "cancelled";
    order.statusTimeline.push({ status: "RTO", actor, changedAt, note: "Shipment cancelled after NDR; return to origin requested." });
  }
  await order.save();
  res.json(orderSummary(order.toObject()));
}

export async function printManifest(req, res) {
  const orders = await getBulkOrders(req.body?.orderIds);
  const shipped = orders.filter((order) => order.shipment?.awb && ["Shipped", "Out for delivery"].includes(order.fulfillmentStatus));
  if (shipped.length !== orders.length) throw new HttpError(409, "A pickup manifest can include only courier-booked orders that are not delivered or returned.");
  const manifestId = `MNF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomInt(1000, 9999)}`;
  await Order.updateMany(
    { _id: { $in: shipped.map((order) => order._id) }, "shipment.awb": { $exists: true } },
    { $set: { "shipment.manifestId": manifestId } },
  );
  const buffer = await createPdf(async (document) => {
    document.addPage({ size: "A4", margin: 42 });
    document.font("Helvetica-Bold").fontSize(18).text("COURIER PICKUP MANIFEST");
    document.font("Helvetica").fontSize(9).text(`Manifest ${manifestId} · ${new Date().toLocaleString("en-IN")}`);
    document.moveDown(1);
    document.font("Helvetica-Bold").fontSize(8).text("AWB                         ORDER                          COURIER                  COD");
    document.moveDown(0.5);
    for (const order of shipped) {
      document.font("Helvetica").fontSize(8).text(`${order.shipment.awb}     ${order.orderNumber}     ${order.shipment.courierName}     ${money(order.codDue || 0)}`);
      document.moveDown(0.35);
    }
    document.moveDown(1);
    document.font("Helvetica-Bold").fontSize(9).text(`Total shipments: ${shipped.length}`);
  });
  sendPdf(res, buffer, `${manifestId}.pdf`);
}
