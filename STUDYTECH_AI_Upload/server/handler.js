import { getUser, handleAuthRoute, rateLimited } from "./auth.js";
import { strike } from "./firewall.js";
import { handleData } from "./store.js";

import dns from "node:dns";
import net from "node:net";
// Many home/office networks have broken IPv6 routes: try IPv4 first and fail over quickly.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamilyAttemptTimeout?.(500);

// Secure proxy to an AI provider. API keys stay on the server.
// Uses Gemini if GEMINI_API_KEY is set, otherwise Anthropic if ANTHROPIC_API_KEY is set.
// Max AI questions per user per 24h (protects your Gemini quota on a public site). Change with DAILY_LIMIT.
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 150;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";
// Quick answers use a lighter, faster model. If it's unavailable we silently fall back to GEMINI_MODEL.
const GEMINI_FAST_MODEL = process.env.GEMINI_FAST_MODEL || "gemini-3.1-flash-lite-preview";

// Speed profiles: fast = light model, no thinking | balanced = light model, brief thinking | deep = main model.
function pick(speed) {
  if (speed === "deep") return { model: GEMINI_MODEL, level: THINKING };
  if (speed === "fast") return { model: GEMINI_FAST_MODEL, level: "minimal" };
  return { model: GEMINI_FAST_MODEL, level: THINKING === "minimal" ? "minimal" : "low" };
}

// Retry once on network errors (e.g. a pooled connection that Google already closed).
async function fetchRetry(url, opts, tries = 2) {
  for (let i = 0; ; i++) {
    try { return await fetch(url, opts); }
    catch (e) {
      if (opts.signal?.aborted || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

// Convert our Claude-style messages ({role, content: string | blocks}) to Gemini "contents".
export function toGeminiContents(messages) {
  return messages.map((m) => {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    const parts = blocks.map((b) =>
      b.type === "image"
        ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } }
        : { text: b.text }
    );
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
}

// Gemini 3 models think at "high" by default, which is slow. "low" is much faster for tutoring.
// Override with GEMINI_THINKING=minimal|low|medium|high in .env.
const THINKING = process.env.GEMINI_THINKING || "low";

async function callGemini({ system, messages, maxTokens, speed }) {
  let { model, level } = pick(speed);
  const send = (withThinking) =>
    fetchRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: toGeminiContents(messages),
        generationConfig: {
          maxOutputTokens: Math.min(Math.max(maxTokens * 4, 2048), 8192),
          ...(withThinking ? { thinkingConfig: { thinkingLevel: level } } : {}),
        },
      }),
    });
  const t0 = Date.now();
  let r = await send(true);
  if (r.status === 400) r = await send(false); // model doesn't accept the thinking setting
  if (r.status === 404 && model !== GEMINI_MODEL) { model = GEMINI_MODEL; r = await send(true); if (r.status === 400) r = await send(false); }
  const data = await r.json().catch(() => ({}));
  console.log(`[ai] ${model} full answer in ${Date.now() - t0} ms`);
  if (!r.ok) return { status: r.status, json: { error: data?.error?.message || "Gemini API error." } };
  const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (!text) {
    const why = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || "empty response";
    return { status: 502, json: { error: "Gemini returned no text (" + why + "). Try rephrasing." } };
  }
  return { status: 200, json: { text } };
}

// Streams Gemini text to the browser as server-sent events: data: {"t":"..."}
// Returns { status, json } if it failed before streaming started, otherwise null.
async function streamChat(body, res) {
  const { system, messages, maxTokens, fast, speed } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) return { status: 400, json: { error: "No messages provided." } };
  const args = { system, messages, maxTokens: Number(maxTokens) || 1000 };

  if (!process.env.GEMINI_API_KEY) {
    // Anthropic (or no key): no streaming, send the full answer as one chunk.
    const r = await handleChat(body);
    if (r.status !== 200) return r;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
    res.write("data: " + JSON.stringify({ t: r.json.text }) + "\n\n");
    res.end();
    return null;
  }

  const ac = new AbortController();
  res.on("close", () => ac.abort());
  let { model, level } = pick(speed || (fast ? "fast" : "balanced"));
  const t0 = Date.now();
  const send = (withThinking) =>
    fetchRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal: ac.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: args.system ? { parts: [{ text: args.system }] } : undefined,
        contents: toGeminiContents(args.messages),
        generationConfig: {
          maxOutputTokens: Math.min(Math.max(args.maxTokens * 4, 2048), 8192),
          ...(withThinking ? { thinkingConfig: { thinkingLevel: level } } : {}),
        },
      }),
    });
  let up = await send(true);
  if (up.status === 400) up = await send(false);
  if (up.status === 404 && model !== GEMINI_MODEL) { model = GEMINI_MODEL; up = await send(true); if (up.status === 400) up = await send(false); }
  if (!up.ok) {
    const data = await up.json().catch(() => ({}));
    return { status: up.status, json: { error: data?.error?.message || "Gemini API error." } };
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" });
  const reader = up.body.getReader();
  const dec = new TextDecoder();
  let buf = "", sent = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5));
          const t = (ev.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
          if (t) { if (!sent) console.log(`[ai] ${model} first words after ${Date.now() - t0} ms`); sent = true; res.write("data: " + JSON.stringify({ t }) + "\n\n"); }
        } catch { /* ignore partial line */ }
      }
    }
  } catch { /* client left or stream broke */ }
  if (!sent) res.write("data: " + JSON.stringify({ error: "Gemini returned no text. Try rephrasing." }) + "\n\n");
  res.end();
  return null;
}

async function callAnthropic({ system, messages, maxTokens }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: Math.min(maxTokens, 4000), system, messages }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { status: r.status, json: { error: data?.error?.message || "Anthropic API error." } };
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { status: 200, json: { text } };
}

export async function handleChat(body) {
  const { system, messages, maxTokens } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, json: { error: "No messages provided." } };
  }
  const args = { system, messages, maxTokens: Number(maxTokens) || 1000, speed: body?.speed };
  try {
    if (process.env.GEMINI_API_KEY) return await callGemini(args);
    if (process.env.ANTHROPIC_API_KEY) return await callAnthropic(args);
    return { status: 500, json: { error: "No API key found. Copy .env.example to .env, add GEMINI_API_KEY, then restart." } };
  } catch (e) {
    const code = e.cause?.code || e.cause?.message || "";
    return { status: 502, json: { error: "Could not reach the AI service: " + e.message + (code ? " (" + code + ")" : "") + ". Check internet, VPN, firewall or proxy." } };
  }
}

// Handles every /api/* route. Chat requires a signed-in user and is rate limited per user.
export function nodeMiddleware(req, res, next) {
  const url = req.url.split("?")[0];
  if (!url.startsWith("/api/")) return next();
  const send = (status, json, cookie) => {
    if (res.headersSent) return;
    if (status === 401 && url === "/api/auth/login") strike(req, 3, "failed login");
    else if ([400, 403, 413, 415].includes(status)) strike(req, 2, "bad request " + status);
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    if (cookie) res.setHeader("set-cookie", cookie);
    res.end(JSON.stringify(json));
  };
  if (req.method === "GET" && url === "/api/auth/me") return handleAuthRoute("me", req, {}).then((r) => send(r.status, r.json, r.cookie));
  if (req.method !== "POST") return send(405, { error: "Method not allowed." });
  if (!(req.headers["content-type"] || "").includes("application/json")) return send(415, { error: "Expected JSON." });

  let raw = "";
  const limit = url.startsWith("/api/chat") ? 12e6 : 2e5; // only chat may carry images
  let tooBig = false;
  req.on("data", (c) => { if (tooBig) return; raw += c; if (raw.length > limit) { tooBig = true; send(413, { error: "Request too large." }); req.destroy(); } });
  req.on("end", async () => {
    if (tooBig) return;
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch { return send(400, { error: "Invalid JSON." }); }
    try {
      if (url.startsWith("/api/auth/")) {
        const r = await handleAuthRoute(url.slice("/api/auth/".length), req, body);
        return send(r.status, r.json, r.cookie);
      }
      if (url.startsWith("/api/history/") || url.startsWith("/api/progress/")) {
        const user = getUser(req);
        if (!user) return send(401, { error: "Please sign in." });
        const r = handleData(url.slice("/api/".length), user, body);
        return send(r.status, r.json);
      }
      if (url === "/api/chat-stream") {
        const user = getUser(req);
        if (!user) return send(401, { error: "Please sign in to use the AI tutor." });
        if (rateLimited("chat:" + user.id, 30, 60 * 1000)) return send(429, { error: "Slow down a little: too many requests this minute." });
        if (rateLimited("day:" + user.id, DAILY_LIMIT, 24 * 3600 * 1000)) return send(429, { error: "You've reached today's question limit. Come back tomorrow!" });
        const r = await streamChat(body, res);
        if (r) send(r.status, r.json);
        return;
      }
      if (url === "/api/chat") {
        const user = getUser(req);
        if (!user) return send(401, { error: "Please sign in to use the AI tutor." });
        if (rateLimited("chat:" + user.id, 30, 60 * 1000)) return send(429, { error: "Slow down a little: too many requests this minute." });
        if (rateLimited("day:" + user.id, DAILY_LIMIT, 24 * 3600 * 1000)) return send(429, { error: "You've reached today's question limit. Come back tomorrow!" });
        const r = await handleChat(body);
        return send(r.status, r.json);
      }
      send(404, { error: "Not found." });
    } catch (e) {
      if (res.headersSent) return res.end();
      const code = e.cause?.code || e.cause?.message || "";
      send(502, { error: "Could not reach the AI service: " + e.message + (code ? " (" + code + ")" : "") + ". Check internet, VPN, firewall or proxy." });
    }
  });
}
