import { randomUUID } from "node:crypto";
import HttpError from "./HttpError.js";
import NotificationLog from "../models/NotificationLog.js";

const EVENTS = {
  order_placed: { label: "Order confirmed", subject: "Your Alpha Male order is confirmed" },
  shipped: { label: "Shipped", subject: "Your Alpha Male order is on its way" },
  delivered: { label: "Delivered", subject: "Your Alpha Male order has been delivered" },
};

function requiredConfig(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, `${name} is not configured on the server.`);
  return value;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function orderMessage(order, event) {
  const definition = EVENTS[event];
  const baseUrl = (process.env.CLIENT_PUBLIC_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");
  const trackingUrl = `${baseUrl}/track`;
  const customerName = order.customer.fullName || "there";
  const text = `Hi ${customerName}, your order ${order.orderNumber} is ${definition.label.toLowerCase()}. Track it at ${trackingUrl}.`;
  return {
    subject: definition.subject,
    text,
    html: `<p>Hi ${escapeHtml(customerName)},</p><p>Your order <strong>${escapeHtml(order.orderNumber)}</strong> is ${escapeHtml(definition.label.toLowerCase())}.</p><p><a href="${escapeHtml(trackingUrl)}">Track your order</a></p>`,
    trackingUrl,
    customerName,
  };
}

async function sendEmail(order, content) {
  if (!order.customer.email) return { provider: "email", status: "skipped" };
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFICATION_FROM_EMAIL?.trim();
  if (!apiKey && !from && process.env.NODE_ENV !== "production") {
    console.info("Order email notification logged.", { orderNumber: order.orderNumber });
    return { provider: "log", status: "sent" };
  }
  if (!apiKey || !from) {
    throw new HttpError(503, "Set RESEND_API_KEY and NOTIFICATION_FROM_EMAIL to send customer email notifications.");
  }

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [order.customer.email],
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, "Email provider could not be reached. The notification is recorded for retry.");
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    console.error("Email provider rejected an order notification.", {
      status: response.status,
      name: failure.name,
    });
    throw new HttpError(502, "Email provider rejected the notification. Check the Resend configuration.");
  }
  return { provider: "resend", status: "sent" };
}

async function sendSms(order, content) {
  const accountSid = requiredConfig("TWILIO_ACCOUNT_SID");
  const authToken = requiredConfig("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!messagingServiceSid && !from) {
    throw new HttpError(503, "Set TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID for SMS notifications.");
  }
  const body = new URLSearchParams({
    To: `+91${order.customer.phone}`,
    Body: content.text,
    ...(messagingServiceSid ? { MessagingServiceSid: messagingServiceSid } : { From: from }),
  });
  let response;
  try {
    response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, "Twilio could not be reached. The notification is recorded for retry.");
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    console.error("Twilio rejected an order notification.", { status: response.status, code: failure.code });
    throw new HttpError(502, "Twilio rejected the SMS notification. Check the sender and recipient configuration.");
  }
  return { provider: "twilio-sms", status: "sent" };
}

async function sendWhatsApp(order, content) {
  const token = requiredConfig("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = requiredConfig("WHATSAPP_PHONE_NUMBER_ID");
  const templateName = requiredConfig("WHATSAPP_TEMPLATE_NAME");
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en_US";
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v22.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new HttpError(503, "WHATSAPP_GRAPH_API_VERSION must use the format vNN.N.");
  let response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: `91${order.customer.phone}`,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: content.customerName },
              { type: "text", text: order.orderNumber },
              { type: "text", text: EVENTS[order.notificationEvent]?.label || "updated" },
              { type: "text", text: content.trackingUrl },
            ],
          }],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, "WhatsApp Business could not be reached. The notification is recorded for retry.");
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    console.error("WhatsApp Business rejected an order notification.", {
      status: response.status,
      code: failure.error?.code,
    });
    throw new HttpError(502, "WhatsApp Business rejected the template notification. Check the template configuration.");
  }
  return { provider: "whatsapp-business", status: "sent" };
}

async function sendMessage(order, event, content) {
  const channel = (process.env.POST_PURCHASE_MESSAGE_CHANNEL || "mock").trim().toLowerCase();
  if (channel === "mock") {
    console.info("Order message notification logged.", { event, orderNumber: order.orderNumber });
    return { provider: "log", status: "sent" };
  }
  if (channel === "sms") return sendSms(order, content);
  if (channel === "whatsapp") return sendWhatsApp({ ...order, notificationEvent: event }, content);
  throw new HttpError(503, "POST_PURCHASE_MESSAGE_CHANNEL must be mock, sms, or whatsapp.");
}

export async function sendOrderNotification(order, event) {
  if (!EVENTS[event]) throw new HttpError(400, "Unsupported order notification event.");
  const eventKey = `${order._id}:${event}`;
  try {
    await NotificationLog.updateOne(
      { eventKey },
      {
        $setOnInsert: {
          eventKey,
          order: order._id,
          orderNumber: order.orderNumber,
          event,
          status: "queued",
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const lock = randomUUID();
  const claimed = await NotificationLog.findOneAndUpdate(
    { eventKey, status: { $in: ["queued", "failed", "partial"] } },
    { $set: { status: "processing", lock }, $inc: { attempts: 1 } },
    { new: true },
  ).select("+lock");
  if (!claimed) return NotificationLog.findOne({ eventKey }).lean();

  const content = orderMessage(order, event);
  const results = await Promise.allSettled([
    ["sent", "skipped"].includes(claimed.email.status) ? claimed.email : sendEmail(order, content),
    ["sent", "skipped"].includes(claimed.message.status) ? claimed.message : sendMessage(order, event, content),
  ]);
  const errorMessage = (reason) => reason instanceof Error ? reason.message : "Notification provider failed.";
  const email = results[0].status === "fulfilled"
    ? results[0].value
    : { provider: "resend", status: "failed", error: errorMessage(results[0].reason) };
  const message = results[1].status === "fulfilled"
    ? results[1].value
    : { provider: (process.env.POST_PURCHASE_MESSAGE_CHANNEL || "mock").trim().toLowerCase(), status: "failed", error: errorMessage(results[1].reason) };
  const failures = [email, message].filter((delivery) => delivery.status === "failed").length;
  const successes = [email, message].filter((delivery) => delivery.status === "sent").length;
  const status = failures === 2 ? "failed" : failures ? "partial" : successes ? "sent" : "failed";
  const saved = await NotificationLog.findOneAndUpdate(
    { _id: claimed._id, lock },
    { $set: { email, message, status }, $unset: { lock: 1 } },
    { new: true },
  );
  if (!saved) throw new HttpError(409, "Notification status changed while delivery was in progress.");
  if (failures) {
    console.error("One or more post-purchase notifications failed.", {
      eventKey,
      emailStatus: email.status,
      messageStatus: message.status,
    });
  }
  return saved.toObject();
}
