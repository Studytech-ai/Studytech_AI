// Saves chat history + progress. Server-side when logged in; browser localStorage in the standalone HTML.
const STANDALONE = import.meta.env.VITE_STANDALONE === "true";
const user = () => window.__STUDYTECH_USER__ || "local";
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(`studytech-${k}:${user()}`)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(`studytech-${k}:${user()}`, JSON.stringify(v)); } catch { /* storage full */ } };

async function api(route, body = {}) {
  const res = await fetch("/api/" + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("st-unauthorized"));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export async function loadProgress() {
  if (STANDALONE) return lsGet("progress", null);
  const { progress } = await api("progress/get");
  return progress ?? lsGet("progress", null); // migrate older browser-only progress
}
export async function saveProgress(p) { if (STANDALONE) return lsSet("progress", p); await api("progress/save", { progress: p }); }

export async function listChats() {
  if (STANDALONE) return Object.values(lsGet("chats", {})).map((c) => ({ id: c.id, title: c.title, subject: c.subject, mode: c.mode, updatedAt: c.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
  return (await api("history/list")).chats;
}
export async function getChat(id) {
  if (STANDALONE) return lsGet("chats", {})[id];
  return (await api("history/get", { id })).chat;
}
export async function saveChat(chat) {
  if (STANDALONE) { const all = lsGet("chats", {}); const updatedAt = Date.now(); all[chat.id] = { ...chat, updatedAt }; lsSet("chats", all); return { updatedAt }; }
  return api("history/save", { chat });
}
export async function deleteChat(id) {
  if (STANDALONE) { const all = lsGet("chats", {}); delete all[id]; lsSet("chats", all); return; }
  await api("history/delete", { id });
}
