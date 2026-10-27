// Browser-side AI helper.
// - Server build (npm run dev): talks to our own /api/chat proxy.
// - Standalone build (studytech.html): calls Gemini directly using a key you enter once.
const STANDALONE = import.meta.env.VITE_STANDALONE === "true";
const KEY_NAME = "studytech-gemini-key";
const MODEL = "gemini-3.7-flash";
const FAST_MODEL = "gemini-3.1-flash-lite-preview";
const levelFor = (speed) => (speed === "fast" ? "minimal" : "low");
const modelFor = (speed) => (speed === "deep" ? MODEL : FAST_MODEL);

function toGeminiContents(messages) {
  return messages.map((m) => {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    const parts = blocks.map((b) =>
      b.type === "image" ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } } : { text: b.text }
    );
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
}

function getKey() {
  let key = localStorage.getItem(KEY_NAME);
  if (!key) {
    key = (window.prompt("Paste your Gemini API key (saved only in this browser):") || "").trim();
    if (!key) throw new Error("A Gemini API key is needed. Send your message again and paste your key.");
    localStorage.setItem(KEY_NAME, key);
  }
  return key;
}

async function askGeminiDirect({ system, messages, maxTokens, speed }) {
  let model = modelFor(speed);
  const key = getKey();
  const send = (withThinking) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: toGeminiContents(messages),
      generationConfig: {
        maxOutputTokens: Math.min(Math.max(maxTokens * 4, 2048), 8192),
        ...(withThinking ? { thinkingConfig: { thinkingLevel: levelFor(speed) } } : {}),
      },
    }),
  });
  let res;
  try {
    res = await send(true);
    if (res.status === 404 && model !== MODEL) { model = MODEL; res = await send(true); }
    if (res.status === 400) { const probe = await res.clone().json().catch(() => ({})); if (/think/i.test(probe?.error?.message || "")) res = await send(false); }
  } catch {
    throw new Error("Can't reach Google. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 || res.status === 401 || res.status === 403) localStorage.removeItem(KEY_NAME); // ask again next time
    throw new Error((data?.error?.message || "Gemini error") + (res.status === 429 ? " (rate limit, wait a minute)" : ""));
  }
  const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (!text) throw new Error("Gemini returned no text. Try rephrasing.");
  return text;
}

async function askServer({ system, messages, maxTokens, speed }) {
  let res;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system, messages, maxTokens, speed }),
    });
  } catch {
    throw new Error("Can't reach the server. Is `npm run dev` still running?");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("st-unauthorized"));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data.text || "";
}

export async function askClaude({ system, messages, maxTokens = 1000, speed = "balanced" }) {
  return STANDALONE ? askGeminiDirect({ system, messages, maxTokens, speed }) : askServer({ system, messages, maxTokens, speed });
}

// Streaming version: calls onText(fullTextSoFar) as words arrive. Resolves with the full text.
export async function askStream({ system, messages, maxTokens = 1000, speed = "balanced", onText }) {
  let acc = "";
  const handle = (t) => { acc += t; onText && onText(acc); };

  if (STANDALONE) {
    const key = getKey();
    let res;
    const body = (withThinking) => JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: toGeminiContents(messages),
      generationConfig: { maxOutputTokens: Math.min(Math.max(maxTokens * 4, 2048), 8192), ...(withThinking ? { thinkingConfig: { thinkingLevel: levelFor(speed) } } : {}) },
    });
    let model = modelFor(speed);
    const go = (w) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: body(w) });
    try { res = await go(true); if (res.status === 404 && model !== MODEL) { model = MODEL; res = await go(true); } if (res.status === 400) { const p = await res.clone().json().catch(() => ({})); if (/think/i.test(p?.error?.message || "")) res = await go(false); } }
    catch { throw new Error("Can't reach Google. Check your internet connection."); }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if ([400, 401, 403].includes(res.status)) localStorage.removeItem(KEY_NAME);
      throw new Error((d?.error?.message || "Gemini error") + (res.status === 429 ? " (rate limit, wait a minute)" : ""));
    }
    await readSse(res, (ev) => { const t = (ev.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join(""); if (t) handle(t); });
    if (!acc) throw new Error("Gemini returned no text. Try rephrasing.");
    return acc;
  }

  let res;
  try {
    res = await fetch("/api/chat-stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ system, messages, maxTokens, speed }) });
  } catch { throw new Error("Can't reach the server. Is `npm run dev` still running?"); }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) window.dispatchEvent(new Event("st-unauthorized"));
    throw new Error(d.error || "Something went wrong.");
  }
  let err = null;
  await readSse(res, (ev) => { if (ev.error) err = ev.error; else if (ev.t) handle(ev.t); });
  if (err && !acc) throw new Error(err);
  return acc;
}

async function readSse(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) { try { onEvent(JSON.parse(line.slice(5))); } catch { /* partial */ } }
    }
  }
}
