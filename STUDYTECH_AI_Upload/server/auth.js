// Lightweight auth: email + password accounts, signed HttpOnly cookie sessions, rate limiting.
// No external dependencies. Users are stored in data/users.json (set DATA_DIR to a persistent disk in production).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { clientIp } from "./firewall.js";

const scrypt = promisify(crypto.scrypt);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const COOKIE = "st_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  if (process.env.NODE_ENV === "production") console.warn("[auth] SESSION_SECRET is not set: users will be logged out on every restart. Set a long random value.");
  SECRET = crypto.randomBytes(32).toString("hex");
}

/* ---------- user store ---------- */
let users = null;
function loadUsers() {
  if (users) return users;
  try { users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch { users = {}; }
  return users;
}
function saveUsers() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
  fs.renameSync(tmp, USERS_FILE);
}

/* ---------- passwords ---------- */
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return salt.toString("hex") + ":" + hash.toString("hex");
}
async function verifyPassword(pw, stored) {
  const [saltHex, hashHex] = stored.split(":");
  const hash = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

/* ---------- sessions ---------- */
const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (payload) => crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

function makeToken(user) {
  const payload = b64(JSON.stringify({ id: user.id, email: user.email, exp: Date.now() + MAX_AGE * 1000 }));
  return payload + "." + sign(payload);
}
function readToken(token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function cookieHeader(req, value, maxAge) {
  const secure = process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https";
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function getUser(req) {
  const data = readToken(parseCookies(req)[COOKIE]);
  return data ? { id: data.id, email: data.email } : null;
}

/* ---------- rate limiting (in memory) ---------- */
const hits = new Map();
export function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return arr.length > limit;
}
export { clientIp };

/* ---------- routes: returns { status, json, cookie? } ---------- */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const allowed = () => (process.env.ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function handleAuthRoute(route, req, body) {
  if (route === "me") {
    const u = getUser(req);
    return u ? { status: 200, json: { user: u } } : { status: 401, json: { error: "Not signed in." } };
  }
  if (route === "logout") return { status: 200, json: { ok: true }, cookie: cookieHeader(req, "", 0) };

  if (route !== "login" && route !== "register") return { status: 404, json: { error: "Not found." } };
  if (rateLimited("auth:" + clientIp(req), 10, 15 * 60 * 1000)) return { status: 429, json: { error: "Too many attempts. Try again in a few minutes." } };

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!EMAIL.test(email)) return { status: 400, json: { error: "Enter a valid email address." } };
  const db = loadUsers();

  if (route === "register") {
    if (process.env.DISABLE_SIGNUP === "true") return { status: 403, json: { error: "Sign-ups are closed." } };
    if (allowed().length && !allowed().includes("*") && !allowed().includes(email)) return { status: 403, json: { error: "This email isn't on the invite list." } };
    if (password.length < 8 || password.length > 200) return { status: 400, json: { error: "Password must be at least 8 characters." } };
    if (db[email]) return { status: 409, json: { error: "An account with this email already exists. Sign in instead." } };
    db[email] = { id: crypto.randomUUID(), email, pw: await hashPassword(password), createdAt: new Date().toISOString() };
    saveUsers();
    return { status: 200, json: { user: { id: db[email].id, email } }, cookie: cookieHeader(req, makeToken(db[email]), MAX_AGE) };
  }

  const u = db[email];
  // Always run a hash to keep timing similar whether or not the account exists.
  const ok = u ? await verifyPassword(password, u.pw) : (await hashPassword(password), false);
  if (!ok) return { status: 401, json: { error: "Wrong email or password." } };
  return { status: 200, json: { user: { id: u.id, email } }, cookie: cookieHeader(req, makeToken(u), MAX_AGE) };
}
