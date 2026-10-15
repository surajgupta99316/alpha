import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import Customer from "../models/Customer.js";
import HttpError from "./HttpError.js";

const sessionSecret = process.env.AUTH_TOKEN_SECRET || randomBytes(32).toString("hex");
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

export function hashOtp(code, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(code, salt, 32).toString("hex")}`;
}

export function verifyOtpHash(code, storedHash) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(code, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken(customerId) {
  const payload = Buffer.from(JSON.stringify({
    sub: customerId.toString(),
    exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new HttpError(401, "Please sign in to continue.");
  const expected = createHmac("sha256", sessionSecret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HttpError(401, "Please sign in to continue.");
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(401, "Please sign in to continue.");
  }
  if (typeof decoded.sub !== "string" || decoded.exp <= Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, "Your sign-in has expired. Please sign in again.");
  }
  return decoded.sub;
}

export async function requireCustomer(req, res, next) {
  try {
    const match = (req.get("authorization") || "").match(/^Bearer (.+)$/i);
    if (!match) throw new HttpError(401, "Please sign in to continue.");
    await loadSessionCustomer(req, match[1]);
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalCustomer(req, res, next) {
  try {
    const authorization = req.get("authorization");
    if (!authorization) return next();
    const match = authorization.match(/^Bearer (.+)$/i);
    if (!match) throw new HttpError(401, "Please sign in again.");
    await loadSessionCustomer(req, match[1]);
    next();
  } catch (error) {
    next(error);
  }
}

async function loadSessionCustomer(req, token) {
  const customerId = verifySessionToken(token);
  const customer = await Customer.findById(customerId).select("phone fullName email").lean();
  if (!customer) throw new HttpError(401, "Please sign in to continue.");
  req.customer = customer;
}
