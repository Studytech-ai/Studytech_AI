// Per-user data storage (chat history + progress), kept in data/userdata/<userId>.json.
// For production set DATA_DIR to a persistent disk (or swap this file for a database).
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "userdata");
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_CHATS = 200, MAX_MSGS = 300, MAX_TEXT = 40000;

function fileFor(userId) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("bad user");
  return path.join(DIR, userId + ".json");
}
function load(userId) {
  try { const d = JSON.parse(fs.readFileSync(fileFor(userId), "utf8")); return { chats: d.chats || {}, progress: d.progress ?? null }; }
  catch { return { chats: {}, progress: null }; }
}
function save(userId, data) {
  fs.mkdirSync(DIR, { recursive: true });
  const f = fileFor(userId), tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, f);
}
const str = (v, n) => String(v ?? "").slice(0, n);

function cleanChat(c) {
  if (!c || !SAFE_ID.test(String(c.id))) return null;
  const messages = (Array.isArray(c.messages) ? c.messages : []).slice(-MAX_MSGS).map((m) => {
    let diagram = null;
    try { if (m.diagram && JSON.stringify(m.diagram).length < 20000) diagram = m.diagram; } catch { /* drop */ }
    return { id: str(m.id, 40), role: m.role === "assistant" ? "assistant" : "user", text: str(m.text, MAX_TEXT), diagram, hadImage: !!m.hadImage };
  });
  if (!messages.length) return null;
  return { id: String(c.id), title: str(c.title, 120) || "Chat", subject: str(c.subject, 40), mode: str(c.mode, 20), messages };
}

export function handleData(route, user, body) {
  const db = load(user.id);
  switch (route) {
    case "history/list": {
      const list = Object.values(db.chats).map((c) => ({ id: c.id, title: c.title, subject: c.subject, mode: c.mode, updatedAt: c.updatedAt, count: c.messages.length }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return { status: 200, json: { chats: list } };
    }
    case "history/get": {
      const c = db.chats[String(body.id)];
      return c ? { status: 200, json: { chat: c } } : { status: 404, json: { error: "Chat not found." } };
    }
    case "history/save": {
      const c = cleanChat(body.chat);
      if (!c) return { status: 400, json: { error: "Invalid chat." } };
      c.updatedAt = Date.now();
      db.chats[c.id] = c;
      const ids = Object.keys(db.chats);
      if (ids.length > MAX_CHATS) ids.sort((a, b) => db.chats[a].updatedAt - db.chats[b].updatedAt).slice(0, ids.length - MAX_CHATS).forEach((k) => delete db.chats[k]);
      save(user.id, db);
      return { status: 200, json: { updatedAt: c.updatedAt } };
    }
    case "history/delete": {
      delete db.chats[String(body.id)];
      save(user.id, db);
      return { status: 200, json: { ok: true } };
    }
    case "progress/get": return { status: 200, json: { progress: db.progress } };
    case "progress/save": {
      if (!body.progress || typeof body.progress !== "object" || JSON.stringify(body.progress).length > 100000) return { status: 400, json: { error: "Invalid progress." } };
      db.progress = body.progress;
      save(user.id, db);
      return { status: 200, json: { ok: true } };
    }
    default: return { status: 404, json: { error: "Not found." } };
  }
}
