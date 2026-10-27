import React, { useEffect, useState } from "react";

const STANDALONE = import.meta.env.VITE_STANDALONE === "true";
const C = { bg: "#0D1117", card: "#161B22", border: "#30363D", text: "#E6EDF3", muted: "#8B949E", accent: "#58A6FF", good: "#3FB950", danger: "#F85149" };

async function post(route, body) {
  const res = await fetch("/api/auth/" + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(STANDALONE ? { email: "local" } : undefined); // undefined = checking
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (STANDALONE) return;
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => setUser(d?.user || null)).catch(() => setUser(null));
    const onUnauth = () => setUser(null);
    window.addEventListener("st-unauthorized", onUnauth);
    return () => window.removeEventListener("st-unauthorized", onUnauth);
  }, []);

  window.__STUDYTECH_USER__ = user?.email || "local"; // per-account progress key

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { const d = await post(mode === "login" ? "login" : "register", { email, password }); setUser(d.user); setPassword(""); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function logout() { try { await post("logout", {}); } finally { setUser(null); } }

  if (user === undefined) return <div style={{ background: C.bg, minHeight: "100vh" }} />;
  if (user) return (
    <>
      {children}
      {!STANDALONE && (
        <div style={{ position: "fixed", bottom: 12, left: 12, zIndex: 998, display: "flex", gap: 8, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 6px 5px 12px", fontSize: 12, color: C.muted, fontFamily: "system-ui, sans-serif" }}>
          {user.email}
          <button onClick={logout} style={{ background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>Log out</button>
        </div>
      )}
    </>
  );

  const input = { width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 12px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" };
  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter, system-ui, sans-serif", color: C.text }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 20 }}><span style={{ color: C.good }}>&gt;_ </span>studytech<span style={{ color: C.accent }}>.ai</span></div>
        <div style={{ color: C.muted, fontSize: 13 }}>{mode === "login" ? "Sign in to continue learning." : "Create your account."}</div>
        <input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        <input type="password" required minLength={mode === "login" ? 1 : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Password" : "Password (8+ characters)"} value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        {error && <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>}
        <button disabled={busy} style={{ background: C.accent, color: "#06101F", border: "none", borderRadius: 8, padding: 12, fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 13, cursor: "pointer" }}>
          {mode === "login" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
