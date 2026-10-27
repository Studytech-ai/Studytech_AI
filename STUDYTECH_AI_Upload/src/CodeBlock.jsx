import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

const KEYWORDS = new Set(("function return const let var if else for while do switch case break continue new class extends import from export default async await try catch finally throw typeof instanceof in of this super static public private protected interface type enum implements void null undefined true false True False None def lambda elif pass with as yield not and or is raise global nonlocal del self int float string bool char long double struct template namespace using include fn mut impl pub use match loop where select insert update delete create table drop alter join left right inner outer on group order by having limit values set and not null primary key foreign references distinct union go func package defer chan map").split(" "));
const KEYWORDS_CI = new Set(["select","insert","update","delete","create","table","drop","alter","join","left","right","inner","outer","on","group","order","by","having","limit","values","set","from","where","distinct","union","primary","key","foreign","references","as","and","or","not","null","in","is"]);

const TOKEN = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*\b)/g;

export function highlight(code) {
  const out = [];
  let last = 0, m, k = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [tok, cm, str, num, id] = m;
    let color = null;
    if (cm) color = "var(--syn-cm)";
    else if (str) color = "var(--syn-str)";
    else if (num) color = "var(--syn-num)";
    else if (id) {
      if (KEYWORDS.has(id) || KEYWORDS_CI.has(id.toLowerCase())) color = "var(--syn-kw)";
      else if (code[TOKEN.lastIndex] === "(") color = "var(--syn-fn)";
    }
    out.push(color ? <span key={k++} style={{ color, fontStyle: cm ? "italic" : "normal" }}>{tok}</span> : tok);
    last = TOKEN.lastIndex;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export default function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden", background: "var(--code-block)", margin: "4px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", background: "var(--bg-2)", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}>
        <span>{lang || "code"}</span>
        <button onClick={copy} style={{ display: "flex", alignItems: "center", gap: "5px", background: "transparent", border: "none", color: copied ? "var(--good)" : "var(--text-muted)", cursor: "pointer", fontSize: "11.5px", fontFamily: "inherit" }}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="st-scrollbar" style={{ margin: 0, padding: "12px 14px", overflowX: "auto", fontFamily: "var(--font-mono)", fontSize: "12.5px", lineHeight: 1.6, color: "var(--text)", tabSize: 2 }}><code>{highlight(code)}</code></pre>
    </div>
  );
}
