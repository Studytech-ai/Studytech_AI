// Application firewall: security headers, IP allow/block lists, request flood limits,
// scanner blocking, cross-site request checks and automatic temporary bans.
// It protects the app itself; it does not replace your host's or Windows' network firewall.
const PROD = process.env.NODE_ENV === "production";
const list = (v) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);
const BLOCKED = new Set(list(process.env.BLOCKED_IPS));
const ALLOWED = new Set(list(process.env.ALLOWED_IPS));
const TRUST_PROXY = process.env.TRUST_PROXY === "true" || PROD; // behind Render/Railway etc. in production

const BAN_MS = 30 * 60 * 1000, STRIKE_WINDOW = 10 * 60 * 1000, STRIKES_TO_BAN = 20;
const GLOBAL_LIMIT = 600, API_LIMIT = 120, WINDOW = 60 * 1000;
const SCANNER = /(^|\/)\.(env|git|svn|ht|aws|ssh|DS_Store)|wp-(admin|login|content|includes)|xmlrpc|phpmyadmin|\.(php|asp|aspx|jsp|cgi|sql|bak)(\?|$)|\/etc\/passwd|cgi-bin|\.\.[\\/]/i;

const bans = new Map();    // ip -> banned until
const strikes = new Map(); // ip -> [{t, w}]
const hits = new Map();    // key -> timestamps

// Behind a proxy the real client is the LAST x-forwarded-for entry (added by the proxy); anything earlier can be forged.
export function clientIp(req) {
  if (TRUST_PROXY) {
    const parts = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

function over(key, limit) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < WINDOW);
  arr.push(now); hits.set(key, arr);
  return arr.length > limit;
}

export function strike(req, weight, why) {
  const ip = clientIp(req), now = Date.now();
  const arr = (strikes.get(ip) || []).filter((s) => now - s.t < STRIKE_WINDOW);
  arr.push({ t: now, w: weight }); strikes.set(ip, arr);
  if (arr.reduce((n, s) => n + s.w, 0) >= STRIKES_TO_BAN) {
    bans.set(ip, now + BAN_MS); strikes.delete(ip);
    console.warn(`[firewall] banned ${ip} for 30 min (${why})`);
  }
}

setInterval(() => { // keep memory small
  const now = Date.now();
  for (const [k, v] of bans) if (v < now) bans.delete(k);
  for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW)) hits.delete(k);
  for (const [k, v] of strikes) if (!v.some((s) => now - s.t < STRIKE_WINDOW)) strikes.delete(k);
}, 60 * 1000).unref();

function deny(res, status, msg, retry) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  if (retry) res.setHeader("retry-after", String(retry));
  res.end(JSON.stringify({ error: msg }));
}

function headers(req, res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  if (PROD && process.env.FIREWALL_CSP !== "off") {
    res.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  }
  if (req.headers["x-forwarded-proto"] === "https") res.setHeader("strict-transport-security", "max-age=15552000");
}

// Connect-style middleware. Call next() only if the request is allowed.
export function shield(req, res, next) {
  const ip = clientIp(req), now = Date.now();
  headers(req, res);

  if (BLOCKED.has(ip) || (ALLOWED.size && !ALLOWED.has(ip))) return deny(res, 403, "Access denied.");
  const until = bans.get(ip);
  if (until && until > now) return deny(res, 429, "Too many suspicious requests. Try again later.", Math.ceil((until - now) / 1000));

  const url = req.url || "/";
  if (SCANNER.test(url) || url.length > 2000) { strike(req, 5, "scanner probe " + url.slice(0, 60)); return deny(res, 404, "Not found."); }
  if (PROD && over("all:" + ip, GLOBAL_LIMIT)) { strike(req, 1, "request flood"); return deny(res, 429, "Too many requests. Slow down.", 60); }

  if (url.startsWith("/api/")) {
    if (over("api:" + ip, API_LIMIT)) { strike(req, 2, "api flood"); return deny(res, 429, "Too many requests. Slow down.", 60); }
    if (req.method !== "GET" && req.method !== "HEAD") { // block cross-site form/script posts
      const origin = req.headers.origin;
      if (origin) {
        let host = ""; try { host = new URL(origin).host; } catch { /* bad origin */ }
        if (host !== req.headers.host) { strike(req, 5, "cross-origin post"); return deny(res, 403, "Cross-site request blocked."); }
      }
    }
  }
  next();
}
