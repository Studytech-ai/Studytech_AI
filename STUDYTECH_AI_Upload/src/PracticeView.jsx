import React, { useState } from "react";
import { Loader2, Play, Lightbulb, Code2, RotateCcw } from "lucide-react";

const LANGS = ["JavaScript", "Python", "TypeScript", "Java", "C++", "SQL"];
const LEVELS = ["Easy", "Medium", "Hard"];
const STYLES = [{ id: "challenge", label: "Coding challenge" }, { id: "interview", label: "Interview question" }];

const chip = (active) => ({
  padding: "6px 12px", borderRadius: "8px", fontSize: "12.5px", fontWeight: 500, cursor: "pointer",
  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  background: active ? "var(--accent)" : "var(--surface)", color: active ? "var(--on-accent)" : "var(--text)",
});
const label = { fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" };

export default function PracticeView({ ask, extractJson, MessageBody, CodeBlock, onResult }) {
  const [lang, setLang] = useState("JavaScript");
  const [level, setLevel] = useState("Easy");
  const [style, setStyle] = useState("challenge");
  const [topic, setTopic] = useState("");
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState("");
  const [hintsShown, setHintsShown] = useState(0);
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(null); // "gen" | "review"
  const [error, setError] = useState(null);

  async function generate() {
    setLoading("gen"); setError(null); setReview(null); setHintsShown(0);
    try {
      const system = `You write ${style === "interview" ? "technical interview questions in the style of top tech company interviews" : "focused coding challenges for learning"}. Output ONLY a JSON object, no prose, no markdown fences: {"title": string, "description": string (clear problem statement, 2-5 sentences), "examples": [{"input": string, "output": string}] (2 items), "constraints": string[] (2-3 items), "starterCode": string (a ${lang} function stub with a comment, no solution), "hints": string[] (3 hints, progressively more revealing, never the full solution)}. Difficulty: ${level}. Language: ${lang}.`;
      const raw = await ask(system, `Topic (optional): ${topic || "your choice — pick a classic, useful problem"}`, 1500);
      const p = extractJson(raw);
      setProblem(p); setCode(p.starterCode || "");
    } catch (e) {
      setError(e.message && !/JSON/i.test(e.message) ? e.message : "Couldn't build a challenge. Try again.");
    } finally { setLoading(null); }
  }

  async function submit() {
    if (!code.trim()) return;
    setLoading("review"); setError(null);
    try {
      const system = `You are a senior engineer doing a code review for a learner. First line must be exactly one of: VERDICT: PASS, VERDICT: PARTIAL, or VERDICT: FAIL (PASS only if the logic is correct for all reasonable cases including edge cases). Then give: **Correctness** (trace one failing or edge case if any), **Complexity** (time and space, Big-O), **Improvements** (readability, idioms, naming), and **Cleaner solution** as a fenced code block in ${lang}. Be specific and honest, concise, no fluff. Do not run code; reason about it.`;
      const raw = await ask(system, `Problem: ${problem.title}\n${problem.description}\n\nMy ${lang} solution:\n\`\`\`${lang.toLowerCase()}\n${code}\n\`\`\``, 1800);
      const m = raw.match(/VERDICT:\s*(PASS|PARTIAL|FAIL)/i);
      const verdict = m ? m[1].toUpperCase() : "PARTIAL";
      setReview({ verdict, text: raw.replace(/^.*VERDICT:.*\n?/i, "").trim() });
      onResult(verdict === "PASS", problem.title);
    } catch (e) { setError(e.message || "Review failed. Try again."); }
    finally { setLoading(null); }
  }

  function onKeyDown(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      const t = e.target, s = t.selectionStart;
      const next = code.slice(0, s) + "  " + code.slice(t.selectionEnd);
      setCode(next);
      requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  }

  const verdictColor = review && (review.verdict === "PASS" ? "var(--good)" : review.verdict === "FAIL" ? "var(--danger)" : "var(--accent)");

  return (
    <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ maxWidth: "860px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "20px" }}>Coding practice</h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "13px" }}>Get a challenge, write your solution, and receive a senior-engineer style review.</p>
        </div>
        <div><div style={label}>Language</div><div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{LANGS.map((l) => <button key={l} onClick={() => setLang(l)} style={chip(lang === l)}>{l}</button>)}</div></div>
        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <div><div style={label}>Difficulty</div><div style={{ display: "flex", gap: "6px" }}>{LEVELS.map((l) => <button key={l} onClick={() => setLevel(l)} style={chip(level === l)}>{l}</button>)}</div></div>
          <div><div style={label}>Type</div><div style={{ display: "flex", gap: "6px" }}>{STYLES.map((s) => <button key={s.id} onClick={() => setStyle(s.id)} style={chip(style === s.id)}>{s.label}</button>)}</div></div>
        </div>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Optional topic: arrays, recursion, joins, REST API…" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 12px", color: "var(--text)", fontSize: "13.5px", outline: "none" }} />
        <button onClick={generate} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "10px", padding: "12px", fontSize: "14px", fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading === "gen" ? <Loader2 size={16} className="st-spin" /> : <Code2 size={16} />} {problem ? "New challenge" : "Generate challenge"}
        </button>
        {error && <div style={{ color: "var(--danger)", fontSize: "13px" }}>{error}</div>}

        {problem && (
          <div className="st-pop" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "8px" }}>{problem.title} <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)", marginLeft: "6px" }}>{level.toUpperCase()}</span></div>
              <div style={{ fontSize: "13.5px", lineHeight: 1.6, marginBottom: "10px" }}>{problem.description}</div>
              {(problem.examples || []).map((ex, i) => <CodeBlock key={i} lang={`example ${i + 1}`} code={`Input:  ${ex.input}\nOutput: ${ex.output}`} />)}
              {(problem.constraints || []).length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12.5px", color: "var(--text-muted)" }}>{problem.constraints.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden", background: "var(--code-block)" }}>
              <div style={{ padding: "6px 12px", background: "var(--bg-2)", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}>solution.{({ JavaScript: "js", Python: "py", TypeScript: "ts", Java: "java", "C++": "cpp", SQL: "sql" })[lang]}  ·  Tab indents · Ctrl+Enter submits</div>
              <textarea value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown} spellCheck={false} rows={12}
                style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "vertical", padding: "12px 14px", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "13px", lineHeight: 1.6, tabSize: 2 }} />
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button onClick={submit} disabled={loading || !code.trim()} style={{ display: "flex", alignItems: "center", gap: "7px", background: "var(--accent-2)", color: "var(--on-accent)", border: "none", borderRadius: "10px", padding: "10px 16px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
                {loading === "review" ? <Loader2 size={15} className="st-spin" /> : <Play size={15} />} Submit for review
              </button>
              <button onClick={() => setHintsShown((h) => Math.min(h + 1, (problem.hints || []).length))} disabled={hintsShown >= (problem.hints || []).length} style={{ display: "flex", alignItems: "center", gap: "7px", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", cursor: "pointer" }}><Lightbulb size={15} /> Hint ({hintsShown}/{(problem.hints || []).length})</button>
              <button onClick={() => { setCode(problem.starterCode || ""); setReview(null); }} style={{ display: "flex", alignItems: "center", gap: "7px", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", cursor: "pointer" }}><RotateCcw size={14} /> Reset</button>
            </div>

            {(problem.hints || []).slice(0, hintsShown).map((h, i) => <div key={i} className="st-pop" style={{ fontSize: "13px", background: "var(--code-bg)", borderRadius: "8px", padding: "9px 12px" }}><strong>Hint {i + 1}:</strong> {h}</div>)}

            {review && (
              <div className="st-pop" style={{ background: "var(--surface)", border: `1px solid ${verdictColor}`, borderRadius: "12px", padding: "16px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: verdictColor, marginBottom: "10px" }}>{review.verdict === "PASS" ? "✓ LOOKS CORRECT" : review.verdict === "FAIL" ? "✗ NEEDS WORK" : "~ PARTIALLY CORRECT"}</div>
                <MessageBody text={review.text} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
