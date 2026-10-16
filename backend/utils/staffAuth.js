import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import StaffUser from "../models/StaffUser.js";
import HttpError from "./HttpError.js";

const STAFF_ROLES = ["admin", "operations", "sales_support"];
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 8;
const loginAttempts = new Map();
const secret = process.env.AUTH_TOKEN_SECRET || randomBytes(32).toString("hex");

function loginBucket(key) {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing || existing.resetAt <= now) {
    const created = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(key, created);
    return created;
  }
  return existing;
}

function consumeLoginAttempt(key) {
  const bucket = loginBucket(key);
  bucket.count += 1;
  return bucket.count <= LOGIN_LIMIT;
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

export async function loginStaff(req, res) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, "Enter a valid staff email.");
  }
  if (!password || password.length > 200) throw new HttpError(400, "Enter your password.");
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const bucketKey = `${ip}:${email}`;
  if (!consumeLoginAttempt(bucketKey)) throw new HttpError(429, "Too many login attempts. Wait 15 minutes before trying again.");
  const user = await StaffUser.findOne({ email, active: true }).select("+passwordHash");
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(
    password,
    "$2b$12$w9q4GkGrqkZC15Yg9t6F/OGFcSTWPK2ZB0iHR4Mbw8wWzJFnrljjW",
  );
  if (!valid || !user) throw new HttpError(401, "Email or password is incorrect.");
  clearLoginAttempts(bucketKey);
  user.lastLoginAt = new Date();
  await user.save();
  const token = createStaffToken(user);
  res.json({
    token,
    staff: { id: user._id, email: user.email, fullName: user.fullName, role: user.role },
  });
}

export function createStaffToken(user) {
  const payload = Buffer.from(JSON.stringify({
    sub: user._id.toString(),
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function staffIdFromToken(token) {
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) throw new HttpError(401, "Staff session is invalid. Sign in again.");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HttpError(401, "Staff session is invalid. Sign in again.");
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(401, "Staff session is invalid. Sign in again.");
  }
  if (typeof decoded.sub !== "string" || !Number.isSafeInteger(decoded.exp) || decoded.exp <= Date.now() / 1000) {
    throw new HttpError(401, "Staff session has expired. Sign in again.");
  }
  return decoded.sub;
}

export async function requireStaff(req, res, next) {
  try {
    const match = (req.get("authorization") || "").match(/^Bearer (.+)$/i);
    if (!match) throw new HttpError(401, "Staff sign-in is required.");
    const user = await StaffUser.findOne({ _id: staffIdFromToken(match[1]), active: true })
      .select("email fullName role active")
      .lean();
    if (!user || !STAFF_ROLES.includes(user.role)) throw new HttpError(401, "Staff account is unavailable.");
    req.staff = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireStaffRoles(...roles) {
  return (req, res, next) => {
    if (!req.staff) return next(new HttpError(401, "Staff sign-in is required."));
    if (req.staff.role !== "admin" && !roles.includes(req.staff.role)) {
      return next(new HttpError(403, "Your staff role does not allow this action."));
    }
    next();
  };
}

export function currentStaff(req, res) {
  res.json({ staff: req.staff });
}

export async function createStaffUser(req, res) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const role = req.body?.role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, "Enter a valid staff email.");
  }
  if (!fullName || fullName.length > 100) throw new HttpError(400, "Enter a name up to 100 characters.");
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,200}$/.test(password)) {
    throw new HttpError(400, "Password must be 12–200 characters and include uppercase, lowercase, a number, and a symbol.");
  }
  if (!STAFF_ROLES.includes(role)) throw new HttpError(400, "Choose Admin, Operations, or Sales/Support.");
  const user = await StaffUser.create({
    email,
    fullName,
    passwordHash: await bcrypt.hash(password, 12),
    role,
  });
  res.status(201).json({ id: user._id, email: user.email, fullName: user.fullName, role: user.role });
}

export async function listStaffUsers(req, res) {
  const users = await StaffUser.find().select("email fullName role active lastLoginAt createdAt").sort({ createdAt: 1 }).lean();
  res.json(users);
}

export async function setStaffActive(req, res) {
  const active = req.body?.active;
  if (typeof active !== "boolean") throw new HttpError(400, "Active must be true or false.");
  const user = await StaffUser.findById(req.params.id);
  if (!user) throw new HttpError(404, "Staff user was not found.");
  if (user._id.equals(req.staff._id) && !active) throw new HttpError(409, "You cannot deactivate your own staff account.");
  if (user.role === "admin" && active === false) {
    const activeAdmins = await StaffUser.countDocuments({ role: "admin", active: true });
    if (activeAdmins <= 1) throw new HttpError(409, "At least one active admin account must remain.");
  }
  user.active = active;
  await user.save();
  res.json({ id: user._id, email: user.email, fullName: user.fullName, role: user.role, active: user.active });
}
