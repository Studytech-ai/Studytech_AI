import React, { useState, useRef, useEffect, useContext, createContext } from "react";
import { askClaude, askStream } from "./api.js";
import CodeBlock from "./CodeBlock.jsx";
import { loadProgress, saveProgress, listChats, getChat, saveChat, deleteChat } from "./store.js";
import PracticeView from "./PracticeView.jsx";
import {
  Sun, Moon, Send, Paperclip, X, Lightbulb, GraduationCap, BookOpen, Sparkles, Loader2, MessageCircle, Layers, ClipboardList, Shuffle, ThumbsUp, ThumbsDown, ChevronLeft, ChevronRight, Award, RotateCcw, FileText, Calendar, CheckSquare, Square, Play, Pause, Plus, Trash2, Flame, Trophy, Star, Zap, Target, PenTool, Clock, TrendingUp, Brain, Code2, Bug, Terminal, History,
} from "lucide-react";

const MODES = [
  { id: "quick", label: "Quick answer", icon: Zap,
    instruction: "QUICK mode. Give the shortest correct answer: one or two sentences, then a minimal code example in a fenced block if code is relevant. No preamble, no background, no closing question, no follow-up exercise. Add at most 2 short bullet notes only if there is a real gotcha. Stay under about 120 words plus code." },
  { id: "steps", label: "Walk me through it", icon: BookOpen,
    instruction: "Teach this step by step. Break the problem into small stages, explain the reasoning behind each stage before moving to the next, and end by asking a short question that checks whether they actually followed the logic. Use fenced code blocks (with language tags) for any code." },
  { id: "simple", label: "Explain simply", icon: Sparkles,
    instruction: "Explain this with a simple real-world analogy, like explaining to a new teammate who is smart but new to the topic. Use short sentences, a concrete everyday comparison, and plain words instead of jargon. If you must use a technical term, define it the moment you use it." },
  { id: "hint", label: "Just a hint", icon: Lightbulb,
    instruction: "Do not write the full solution. Give one nudge that points at the idea or the first move the learner is missing, then ask a guiding question that lets them take the next step themselves." },
  { id: "exam", label: "Interview-ready answer", icon: GraduationCap,
    instruction: "Answer the way a strong candidate would in a technical interview: state the approach first, then the solution with correct terminology, then time/space complexity or trade-offs. End with one line naming the core concept being tested and one likely follow-up question." },
  { id: "debug", label: "Debug my code", icon: Bug,
    instruction: "The user pasted code and/or an error. Find the root cause, not just the symptom. Explain WHY it fails in plain terms, show the minimal fix in a fenced code block with the correct language tag, and name how to avoid this class of bug. If the code or error message is missing, ask for it." },
  { id: "review", label: "Review my code", icon: Code2,
    instruction: "Do a senior-engineer code review of the pasted code. Cover: correctness and edge cases, readability and naming, performance (Big-O where relevant), security or maintainability risks, and idiomatic style for the language. Prioritize the 3 most valuable changes and show an improved version in a fenced code block with the language tag." },
  { id: "visual", label: "Show me visually", icon: PenTool,
    instruction: `Teach this with a simple diagram, not just prose. First write 2-3 short sentences of explanation. Then, on a new line, output a fenced block that starts with three backticks and the word diagram, containing ONLY valid JSON (no comments, no trailing text) shaped like {"title": string, "nodes": [{"id": string, "label": string (max 6 words)}], "edges": [{"from": string, "to": string, "label": string (optional, max 3 words)}]}. Use 3 to 6 nodes representing the real steps, stages, or parts of this concept, in the order they should be read top to bottom. Close the fence with three backticks and add nothing after it.` },
];

const SUBJECTS = ["JavaScript", "Python", "DSA", "SQL", "System Design", "Git & DevOps", "Other"];
const QUESTION_COUNTS = [5, 8, 10];
const QUIZ_TYPES = [
  { id: "mixed", label: "Mixed" },
  { id: "mcq", label: "Multiple choice" },
  { id: "tf", label: "True / False" },
  { id: "short", label: "Short answer" },
];

const REVISION_FORMATS = [
  { id: "notes", label: "Notes", icon: FileText,
    instruction: "Write clear, well-organized revision notes on this topic. Use short bolded headings for each sub-topic, bullet points for key ideas under each one, and keep every point concise — one idea per line. Where it helps, add a one-line 'why this matters' note." },
  { id: "formula", label: "Syntax & API reference", icon: Terminal,
    instruction: "Produce a syntax and API quick reference for this topic. For each key syntax pattern, function, command or method, give a one-line description and a tiny example in a fenced code block with the language tag. No long paragraphs." },
  { id: "cheat", label: "Cheat sheet", icon: Flame,
    instruction: "Produce a one-page cheat sheet with only the essentials: key terms with one-line definitions, the most important syntax, commands or rules (code in fenced blocks), and 3-5 common mistakes developers make on this topic. Extremely concise, bullet points only, nothing decorative." },
];

const STARTERS = [
  "Explain closures in JavaScript with a small example.",
  "What's the difference between a process and a thread?",
  "When should I use a hash map vs a binary search tree?",
  "Design a URL shortener: what are the key components?",
];

const EXAM_DURATIONS = [15, 30, 45];

const XP = { question: 3, flashcardKnown: 4, flashcardLearning: 2, quizCorrect: 8, quizWrong: 2, examComplete: 40 };

const ACHIEVEMENTS = [
  { id: "first_question", label: "First Question", desc: "Asked the tutor your first question.", icon: MessageCircle, check: (p) => p.questionsAsked >= 1 },
  { id: "first_quiz", label: "Quiz Taker", desc: "Completed your first quiz.", icon: ClipboardList, check: (p) => p.quizzesTaken >= 1 },
  { id: "streak_3", label: "On a Roll", desc: "Studied 3 days in a row.", icon: Flame, check: (p) => p.streak >= 3 },
  { id: "streak_7", label: "Locked In", desc: "Studied 7 days in a row.", icon: Flame, check: (p) => p.streak >= 7 },
  { id: "xp_100", label: "Rising Star", desc: "Earned 100 XP.", icon: Star, check: (p) => p.xp >= 100 },
  { id: "xp_500", label: "Scholar", desc: "Earned 500 XP.", icon: Trophy, check: (p) => p.xp >= 500 },
  { id: "flashcards_25", label: "Card Shark", desc: "Reviewed 25 flashcards.", icon: Layers, check: (p) => p.flashcardsReviewed >= 25 },
  { id: "first_exam", label: "Exam Ready", desc: "Completed your first mock exam.", icon: Target, check: (p) => p.examsCompleted >= 1 },
  { id: "perfect_quiz", label: "Perfect Score", desc: "Got every question right on a quiz.", icon: Zap, check: (p) => p.perfectQuizzes >= 1 },
];

const SYSTEM_PREAMBLE = `You are a senior software engineer and patient mentor inside a study app for developers and working professionals learning programming, computer science, and engineering skills. Build real understanding, not copy-paste answers. Core rules, always:
- Put ALL code in fenced code blocks with a language tag (for example \`\`\`python). Keep inline identifiers in single backticks.
- Be technically precise: correct terminology, accurate complexity, and honest about trade-offs and edge cases. If unsure, say so.
- Prefer a small working example over long theory. Show output or behaviour where it helps.
- Check for the likely misconception before correcting it directly. Warm, matter-of-fact tone, never condescending.
- Keep responses focused: short paragraphs or a tight list, not an essay.
- If an image is uploaded (screenshot, error, diagram, whiteboard), read it carefully first.
- In teaching modes (not Quick answer), end with a small next step such as a short exercise or question, never a generic "let me know if you have questions".
- Speed matters: answer the actual question first, in the first sentence. No long introductions.`;

function buildSystemPrompt(mode, subject) {
  const m = MODES.find((x) => x.id === mode);
  return `${SYSTEM_PREAMBLE}\n\nSubject context: the topic area is ${subject}.\nMode for this reply: ${m.instruction}`;
}

function formatInline(text) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, match, key = 0;
  while ((match = regex.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else parts.push(<code key={key++} style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: "5px", fontFamily: "var(--font-mono)", fontSize: "0.9em" }}>{token.slice(1, -1)}</code>);
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function ProseBody({ text }) {
  const lines = text.split("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)/);
        const bulleted = trimmed.match(/^[-*]\s+(.*)/);
        if (!trimmed) return <div key={i} style={{ height: "4px" }} />;
        if (numbered) {
          return (
            <div key={i} style={{ display: "flex", gap: "8px" }}>
              <span style={{ color: "var(--accent)", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: "0.85em", minWidth: "18px" }}>{numbered[1]}.</span>
              <span>{formatInline(numbered[2])}</span>
            </div>
          );
        }
        if (bulleted) {
          return (
            <div key={i} style={{ display: "flex", gap: "8px" }}>
              <span style={{ color: "var(--accent)" }}>•</span>
              <span>{formatInline(bulleted[1])}</span>
            </div>
          );
        }
        return <div key={i}>{formatInline(line)}</div>;
      })}
    </div>
  );
}

function MessageBody({ text }) {
  const parts = String(text).split(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g);
  if (parts.length === 1) return <ProseBody text={text} />;
  const nodes = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i] && parts[i].trim()) nodes.push(<ProseBody key={"p" + i} text={parts[i].trim()} />);
    if (i + 2 < parts.length) nodes.push(<CodeBlock key={"c" + i} lang={parts[i + 1]} code={parts[i + 2].replace(/\n$/, "")} />);
  }
  return <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{nodes}</div>;
}

function extractJson(raw) {
  let t = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const candidates = [t.indexOf("["), t.indexOf("{")].filter((i) => i >= 0);
  if (candidates.length === 0) throw new Error("No JSON found in response.");
  const first = Math.min(...candidates);
  const lastBrace = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  if (lastBrace === -1) throw new Error("No JSON found in response.");
  return JSON.parse(t.slice(first, lastBrace + 1));
}

function splitDiagram(raw) {
  const match = raw.match(/```diagram\s*([\s\S]*?)```/i);
  if (!match) return { text: raw, diagram: null };
  const before = raw.slice(0, match.index).trim();
  try {
    const diagram = JSON.parse(match[1].trim());
    return { text: before || raw, diagram };
  } catch (e) {
    return { text: raw, diagram: null };
  }
}

async function callClaude(system, userText, maxTokens = 1000) {
  return askClaude({ system, messages: [{ role: "user", content: userText }], maxTokens });
}

/* ---------------------------------------------------------------- */
/* Learning memory + gamification                                    */
/* ---------------------------------------------------------------- */

const DEFAULT_PROGRESS = {
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  weakTopics: {},
  questionsAsked: 0,
  quizzesTaken: 0,
  flashcardsReviewed: 0,
  examsCompleted: 0,
  perfectQuizzes: 0,
  achievements: [],
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const ProgressContext = createContext(null);
function useProgress() { return useContext(ProgressContext); }

function ProgressProvider({ children }) {
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const parsed = await loadProgress();
        if (!cancelled && parsed) setProgress((p) => ({ ...p, ...DEFAULT_PROGRESS, ...parsed }));
      } catch (e) {
        // no saved progress yet — start fresh
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { saveProgress(progress).catch(() => { /* will retry on next change */ }); }, 700);
    return () => clearTimeout(t);
  }, [progress, loaded]);

  function pushToast(text, Icon) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, Icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }

  function nextStreak(prev) {
    const today = todayKey();
    if (prev.lastActiveDate === today) return prev.streak || 1;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    if (prev.lastActiveDate === yesterday) return (prev.streak || 0) + 1;
    return 1;
  }

  function addWeak(weakTopics, subject, label) {
    const list = weakTopics[subject] || [];
    const entry = (label && label.trim()) || subject;
    const nextList = [entry, ...list.filter((l) => l !== entry)].slice(0, 6);
    return { ...weakTopics, [subject]: nextList };
  }

  function checkAchievements(next) {
    const newly = ACHIEVEMENTS.filter((a) => !next.achievements.includes(a.id) && a.check(next));
    if (newly.length === 0) return next;
    newly.forEach((a) => pushToast(`Achievement unlocked: ${a.label}`, a.icon));
    return { ...next, achievements: [...next.achievements, ...newly.map((a) => a.id)] };
  }

  function update(mutator) {
    setProgress((prev) => {
      const today = todayKey();
      const streak = nextStreak(prev);
      const base = { ...prev, streak, lastActiveDate: today };
      const mutated = mutator(base);
      return checkAchievements(mutated);
    });
  }

  function recordQuestion() {
    update((p) => ({ ...p, xp: p.xp + XP.question, questionsAsked: p.questionsAsked + 1 }));
  }

  function recordFlashcard(subject, known, label) {
    update((p) => {
      const next = {
        ...p,
        xp: p.xp + (known ? XP.flashcardKnown : XP.flashcardLearning),
        flashcardsReviewed: p.flashcardsReviewed + 1,
      };
      next.weakTopics = known ? p.weakTopics : addWeak(p.weakTopics, subject, label);
      return next;
    });
  }

  function recordQuizResult(subject, score, total, missedLabels) {
    update((p) => {
      let weakTopics = p.weakTopics;
      (missedLabels || []).forEach((label) => { weakTopics = addWeak(weakTopics, subject, label); });
      return {
        ...p,
        xp: p.xp + score * XP.quizCorrect + (total - score) * XP.quizWrong,
        quizzesTaken: p.quizzesTaken + 1,
        perfectQuizzes: p.perfectQuizzes + (score === total ? 1 : 0),
        weakTopics,
      };
    });
  }

  function recordExamResult(subject, readinessPct, missedLabels) {
    update((p) => {
      let weakTopics = p.weakTopics;
      (missedLabels || []).forEach((label) => { weakTopics = addWeak(weakTopics, subject, label); });
      return { ...p, xp: p.xp + XP.examComplete, examsCompleted: p.examsCompleted + 1, weakTopics };
    });
  }

  const value = { progress, recordQuestion, recordFlashcard, recordQuizResult, recordExamResult, pushToast };

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} />
    </ProgressContext.Provider>
  );
}

function ToastStack({ toasts }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", bottom: "18px", right: "18px", display: "flex", flexDirection: "column", gap: "8px", zIndex: 999 }}>
      {toasts.map((t) => {
        const Icon = t.Icon || Trophy;
        return (
          <div key={t.id} className="st-pop" style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--surface, #1B2148)", border: "1px solid var(--accent, #F2B84B)", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: "var(--text, #F3EFE4)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
            <Icon size={16} color="var(--accent, #F2B84B)" />
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProgressBadge() {
  const { progress } = useProgress();
  const [open, setOpen] = useState(false);
  const level = Math.floor(progress.xp / 100) + 1;
  const xpIntoLevel = progress.xp % 100;

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="View progress and achievements" style={{
        display: "flex", alignItems: "center", gap: "10px", background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "999px", padding: "6px 12px 6px 10px", cursor: "pointer", color: "var(--text)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12.5px", fontWeight: 600, color: progress.streak > 0 ? "var(--accent)" : "var(--text-muted)" }}>
          <Flame size={14} /> {progress.streak}
        </span>
        <span style={{ width: "1px", height: "14px", background: "var(--border)" }} />
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>Lv {level}</span>
          <span style={{ width: "48px", height: "5px", borderRadius: "4px", background: "var(--bg-2)", overflow: "hidden", display: "inline-block" }}>
            <span style={{ display: "block", width: `${xpIntoLevel}%`, height: "100%", background: "var(--accent)" }} />
          </span>
        </span>
      </button>
      {open && (
        <div className="st-pop" style={{ position: "absolute", top: "44px", right: 0, width: "270px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", zIndex: 40, boxShadow: "0 12px 32px rgba(0,0,0,0.28)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{progress.xp} XP · Level {level}</div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}><X size={14} /></button>
          </div>
          <div className="st-scrollbar" style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "230px", overflowY: "auto" }}>
            {ACHIEVEMENTS.map((a) => {
              const unlocked = progress.achievements.includes(a.id);
              const Icon = a.icon;
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", opacity: unlocked ? 1 : 0.4 }}>
                  <Icon size={15} color={unlocked ? "var(--accent)" : "var(--text-muted)"} style={{ marginTop: "2px", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{a.label}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{a.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* AI Whiteboard — renders a small diagram JSON as inline SVG        */
/* ---------------------------------------------------------------- */

function DiagramView({ diagram }) {
  if (!diagram || !Array.isArray(diagram.nodes) || diagram.nodes.length === 0) return null;
  const nodes = diagram.nodes.slice(0, 6);
  const nodeH = 46, gap = 26, width = 320;
  const height = nodes.length * nodeH + (nodes.length - 1) * gap + 20;
  const positions = {};
  nodes.forEach((n, i) => { positions[n.id] = { x: width / 2, y: 10 + i * (nodeH + gap) + nodeH / 2 }; });
  const edges = (diagram.edges || []).filter((e) => positions[e.from] && positions[e.to]);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", marginTop: "8px" }}>
      {diagram.title && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <PenTool size={12} /> {diagram.title}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", maxWidth: "360px" }}>
        <defs>
          <marker id="st-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = positions[e.from], b = positions[e.to];
          const midY = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y + nodeH / 2} x2={b.x} y2={b.y - nodeH / 2 - 6} stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#st-arrow)" opacity="0.75" />
              {e.label && <text x={a.x + 10} y={midY} fontSize="10" fill="var(--text-muted)">{e.label}</text>}
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = positions[n.id];
          return (
            <g key={n.id}>
              <rect x={p.x - 130} y={p.y - nodeH / 2} width="260" height={nodeH} rx="10" fill="var(--surface-2)" stroke="var(--border)" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fill="var(--text)">{n.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const TABS = [
  { id: "tutor", label: "Tutor", icon: MessageCircle },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "quiz", label: "Quiz", icon: ClipboardList },
  { id: "practice", label: "Practice", icon: Code2 },
  { id: "exam", label: "Mock Test", icon: Target },
  { id: "revision", label: "Revision", icon: FileText },
  { id: "planner", label: "Planner", icon: Calendar },
];

export default function StudyTechApp() {
  return (
    <ProgressProvider>
      <StudyTechAppInner />
    </ProgressProvider>
  );
}

function StudyTechAppInner() {
  const [theme, setTheme] = useState("dark");
  const [activeTab, setActiveTab] = useState("tutor");
  const isDark = theme === "dark";

  const vars = isDark
    ? {
        "--bg": "#0D1117", "--bg-2": "#161B22", "--surface": "#1C2128", "--surface-2": "#262C36",
        "--text": "#E6EDF3", "--text-muted": "#8B949E", "--accent": "#58A6FF", "--accent-2": "#3FB950",
        "--border": "#30363D", "--code-bg": "rgba(110,118,129,0.25)", "--code-block": "#0A0E14", "--danger": "#F85149", "--danger-bg": "rgba(248,81,73,0.14)",
        "--good": "#3FB950", "--good-bg": "rgba(63,185,80,0.14)", "--on-accent": "#06101F",
        "--syn-kw": "#FF7B72", "--syn-str": "#A5D6FF", "--syn-num": "#79C0FF", "--syn-fn": "#D2A8FF", "--syn-cm": "#6E7681",
      }
    : {
        "--bg": "#F6F8FA", "--bg-2": "#EAEEF2", "--surface": "#FFFFFF", "--surface-2": "#F3F5F8",
        "--text": "#1F2328", "--text-muted": "#59636E", "--accent": "#0969DA", "--accent-2": "#1A7F37",
        "--border": "#D0D7DE", "--code-bg": "rgba(129,139,152,0.2)", "--code-block": "#FFFFFF", "--danger": "#CF222E", "--danger-bg": "rgba(207,34,46,0.1)",
        "--good": "#1A7F37", "--good-bg": "rgba(26,127,55,0.1)", "--on-accent": "#FFFFFF",
        "--syn-kw": "#CF222E", "--syn-str": "#0A3069", "--syn-num": "#0550AE", "--syn-fn": "#8250DF", "--syn-cm": "#6E7781",
      };

  return (
    <div className="st-root" style={{ ...vars, background: "var(--bg)", color: "var(--text)", minHeight: "680px", height: "100%", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .st-root, .st-root * { box-sizing: border-box; }
        .st-root { --font-display: 'JetBrains Mono', ui-monospace, Consolas, monospace; --font-body: 'Inter', system-ui, sans-serif; --font-mono: 'JetBrains Mono', ui-monospace, Consolas, monospace; }
        .st-scrollbar::-webkit-scrollbar { width: 8px; }
        .st-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }
        @keyframes st-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes st-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
        @keyframes st-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes st-spin { to { transform: rotate(360deg); } }
        .st-spin { animation: st-spin 0.9s linear infinite; }
        .st-msg { animation: st-rise 0.28s ease-out; }
        .st-pop { animation: st-pop 0.22s ease-out; }
        .st-dot { animation: st-pulse 1.1s ease-in-out infinite; }
        .st-dot:nth-child(2) { animation-delay: 0.15s; }
        .st-dot:nth-child(3) { animation-delay: 0.3s; }
        .st-pill { transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
        .st-chip:hover { border-color: var(--accent) !important; }
        .st-flip-outer { perspective: 1200px; }
        .st-flip-inner { position: relative; width: 100%; height: 100%; transition: transform 0.5s; transform-style: preserve-3d; }
        .st-flip-inner.flipped { transform: rotateY(180deg); }
        .st-flip-face { position: absolute; inset: 0; backface-visibility: hidden; display: flex; align-items: center; justify-content: center; text-align: center; padding: 28px; border-radius: 18px; }
        .st-flip-back { transform: rotateY(180deg); }
        .st-opt:hover { border-color: var(--accent) !important; }
        @media (prefers-reduced-motion: reduce) {
          .st-msg, .st-dot, .st-pop { animation: none; }
          .st-flip-inner { transition: none; }
        }
      `}</style>

      <div style={{ position: "absolute", top: "-140px", left: "50%", transform: "translateX(-50%)", width: "560px", height: "280px", background: `radial-gradient(ellipse at center, var(--accent) 0%, transparent 70%)`, opacity: isDark ? 0.16 : 0.1, pointerEvents: "none" }} />

      {/* Header */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", letterSpacing: "-0.02em" }}><span style={{ color: "var(--accent-2)" }}>&gt;_ </span>studytech<span style={{ color: "var(--accent)" }}>.ai</span></span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>tutor, not answer key</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ProgressBadge />
          <button onClick={() => setTheme(isDark ? "light" : "dark")} aria-label="Toggle theme" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "999px", width: "38px", height: "38px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text)" }}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="st-scrollbar" style={{ display: "flex", gap: "6px", padding: "10px 24px", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className="st-pill" style={{
              display: "flex", alignItems: "center", gap: "7px", padding: "8px 16px", borderRadius: "10px", flexShrink: 0,
              border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-muted)",
              fontSize: "13.5px", fontWeight: 600, cursor: "pointer",
            }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "tutor" && <TutorView />}
      {activeTab === "flashcards" && <FlashcardsView />}
      {activeTab === "quiz" && <QuizView />}
      {activeTab === "practice" && <PracticeTab />}
      {activeTab === "exam" && <ExamView />}
      {activeTab === "revision" && <RevisionView />}
      {activeTab === "planner" && <PlannerView />}
    </div>
  );
}

function PracticeTab() {
  const { recordQuizResult } = useProgress();
  return <PracticeView ask={callClaude} extractJson={extractJson} MessageBody={MessageBody} CodeBlock={CodeBlock}
    onResult={(passed, title) => recordQuizResult("Practice", passed ? 1 : 0, 1, passed ? [] : [title])} />;
}

function TutorView() {
  const { recordQuestion } = useProgress();
  const [mode, setMode] = useState("quick");
  const [subject, setSubject] = useState("JavaScript");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const convRef = useRef(null);
  const [convId, setConvId] = useState(null);
  const [history, setHistory] = useState(null); // null = loading
  const [wide, setWide] = useState(() => window.innerWidth >= 768);
  const [showHistory, setShowHistory] = useState(() => window.innerWidth >= 768);
  const who = (window.__STUDYTECH_USER__ || "local").split("@")[0];

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 768);
    window.addEventListener("resize", onResize);
    listChats().then(setHistory).catch(() => setHistory([]));
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function newChat() { convRef.current = null; setConvId(null); setMessages([]); setError(null); if (!wide) setShowHistory(false); }
  async function openChat(id) {
    try {
      const c = await getChat(id);
      if (!c) return;
      setMessages(c.messages.map((m) => ({ ...m, image: null })));
      if (c.subject) setSubject(c.subject);
      if (c.mode && MODES.some((x) => x.id === c.mode)) setMode(c.mode);
      convRef.current = id; setConvId(id); setError(null);
      if (!wide) setShowHistory(false);
    } catch (e) { setError(e.message || "Couldn't open that chat."); }
  }
  async function removeChat(id, e) {
    e.stopPropagation();
    if (!window.confirm("Delete this chat?")) return;
    try { await deleteChat(id); setHistory((h) => (h || []).filter((x) => x.id !== id)); if (convRef.current === id) newChat(); } catch (err) { setError(err.message); }
  }
  async function persistChat(msgs) {
    const id = convRef.current || (window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    convRef.current = id; setConvId(id);
    const first = msgs.find((m) => m.role === "user");
    const chat = { id, title: (first?.text || "Chat").replace(/\s+/g, " ").slice(0, 60), subject, mode,
      messages: msgs.map((m) => ({ id: m.id, role: m.role, text: m.text, diagram: m.diagram || null, hadImage: !!m.image })) };
    try {
      const { updatedAt } = await saveChat(chat);
      setHistory((h) => [{ id, title: chat.title, subject, mode, updatedAt }, ...(h || []).filter((x) => x.id !== id)]);
    } catch { /* history save failed: chat still works */ }
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please upload an image file."); return; }
    const reader = new FileReader();
    reader.onload = () => setImage({ dataUrl: reader.result, mediaType: file.type, name: file.name });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function send(overrideText) {
    const text = (overrideText !== undefined ? overrideText : input).trim();
    if (!text && !image) return;
    setError(null);
    const userMsg = { id: Date.now(), role: "user", text: text || "(see attached image)", image: image ? image.dataUrl : null };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    const attachedImage = image;
    setImage(null);
    setLoading(true);
    recordQuestion();
    try {
      const apiMessages = nextMessages.map((m, idx) => {
        const isLast = idx === nextMessages.length - 1;
        if (isLast && attachedImage) {
          return { role: "user", content: [
            { type: "image", source: { type: "base64", media_type: attachedImage.mediaType, data: attachedImage.dataUrl.split(",")[1] } },
            { type: "text", text: m.text },
          ]};
        }
        return { role: m.role, content: m.text };
      });
      const aid = Date.now() + 1;
      let started = false;
      const textOut = await askStream({
        system: buildSystemPrompt(mode, subject), messages: apiMessages, maxTokens: 1000, speed: ["quick", "hint", "simple"].includes(mode) ? "fast" : "balanced",
        onText: (acc) => {
          const cut = acc.indexOf("```diagram");
          const shown = cut >= 0 ? acc.slice(0, cut) : acc;
          if (!started) { started = true; setLoading(false); setMessages((prev) => [...prev, { id: aid, role: "assistant", text: shown, diagram: null }]); }
          else setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, text: shown } : m)));
        },
      });
      const { text: bodyText, diagram } = splitDiagram(textOut || "I couldn't generate a response, try asking again.");
      setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, text: bodyText, diagram } : m)));
      persistChat([...nextMessages, { id: aid, role: "assistant", text: bodyText, diagram }]);
    } catch (err) {
      setError(err.message || "Couldn't reach the tutor. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const subjectCounts = messages.filter((m) => m.role === "user").length;

  return (
    <>
      <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => setShowHistory((v) => !v)} className="st-pill" style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "999px",
            border: `1px solid ${showHistory ? "var(--accent-2)" : "var(--border)"}`, background: "var(--surface)",
            color: showHistory ? "var(--accent-2)" : "var(--text)", fontSize: "13px", fontWeight: 500, cursor: "pointer",
          }}><History size={14} /> History{history && history.length ? ` (${history.length})` : ""}</button>
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)} className="st-pill" style={{
                display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "999px",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "var(--accent)" : "var(--surface)",
                color: active ? "var(--on-accent)" : "var(--text)",
                fontSize: "13px", fontWeight: 500, cursor: "pointer",
              }}><Icon size={14} /> {m.label}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {SUBJECTS.map((s) => (
            <button key={s} onClick={() => setSubject(s)} className="st-chip" style={{
              padding: "5px 11px", borderRadius: "8px", fontSize: "12px",
              border: `1px solid ${subject === s ? "var(--accent-2)" : "var(--border)"}`,
              background: subject === s ? "var(--surface-2)" : "transparent",
              color: subject === s ? "var(--accent-2)" : "var(--text-muted)", cursor: "pointer", fontWeight: 500,
            }}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {showHistory && (
          <div className="st-scrollbar" style={{ width: wide ? "250px" : "min(300px, 85%)", position: wide ? "static" : "absolute", top: 0, bottom: 0, left: 0, zIndex: 20, background: "var(--bg-2)", borderRight: "1px solid var(--border)", overflowY: "auto", padding: "12px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
            <button onClick={newChat} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "8px", padding: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}><Plus size={15} /> New chat</button>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "8px 2px 2px" }}>Your history</div>
            {history === null && <div style={{ fontSize: "12.5px", color: "var(--text-muted)", padding: "4px 2px" }}>Loading…</div>}
            {history && history.length === 0 && <div style={{ fontSize: "12.5px", color: "var(--text-muted)", padding: "4px 2px", lineHeight: 1.5 }}>No saved chats yet. Ask a question and it will be saved here automatically.</div>}
            {(history || []).map((h) => (
              <div key={h.id} onClick={() => openChat(h.id)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 9px", borderRadius: "8px", cursor: "pointer", border: `1px solid ${convId === h.id ? "var(--accent)" : "transparent"}`, background: convId === h.id ? "var(--surface-2)" : "transparent" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.title}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{h.subject || "Chat"} · {new Date(h.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                </div>
                <button onClick={(e) => removeChat(h.id, e)} title="Delete chat" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", display: "flex" }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div ref={scrollRef} className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {messages.length === 0 && (
            <div style={{ margin: "auto", maxWidth: "460px", textAlign: "center", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--accent)", margin: "0 auto", boxShadow: "0 0 24px var(--accent)" }} />
              <div style={{ fontFamily: "var(--font-display)", fontSize: "19px" }}>{who !== "local" ? `Welcome back, ${who}.` : "Ask a question, or paste your code."}</div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>I'll teach it, not just solve it. Try one of these, paste code to debug or review, or upload a screenshot of an error.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {STARTERS.map((s, i) => (
                  <button key={i} onClick={() => send(s)} style={{ textAlign: "left", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13px", cursor: "pointer" }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="st-msg" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "78%", display: "flex", gap: "10px", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                {m.role === "assistant" && <div style={{ flexShrink: 0, width: "26px", height: "26px", borderRadius: "50%", background: "var(--accent)", marginTop: "2px" }} />}
                <div style={{ background: m.role === "user" ? "var(--surface-2)" : "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "12px 14px", fontSize: "14px", lineHeight: 1.55 }}>
                  {m.image && <img src={m.image} alt="Uploaded image" style={{ maxWidth: "220px", borderRadius: "8px", marginBottom: "8px", display: "block" }} />}
                  <MessageBody text={m.text} />
                  {m.diagram && <DiagramView diagram={m.diagram} />}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="st-msg" style={{ display: "flex", gap: "10px" }}>
              <div style={{ flexShrink: 0, width: "26px", height: "26px", borderRadius: "50%", background: "var(--accent)" }} />
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "12px 16px", display: "flex", gap: "5px", alignItems: "center" }}>
                <span className="st-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--text-muted)" }} />
                <span className="st-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--text-muted)" }} />
                <span className="st-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--text-muted)" }} />
              </div>
            </div>
          )}
          {error && <div style={{ alignSelf: "center", fontSize: "12px", color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: "8px", padding: "8px 12px" }}>{error}</div>}
        </div>

        <div className="hidden md:block" style={{ width: "220px", borderLeft: "1px solid var(--border)", padding: "20px 18px", flexShrink: 0 }}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "10px" }}>This session</div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "13px" }}><strong style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{subjectCounts}</strong> question{subjectCounts === 1 ? "" : "s"} asked</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Focused on <strong style={{ color: "var(--text)" }}>{subject}</strong></div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Mode: <strong style={{ color: "var(--text)" }}>{MODES.find((m) => m.id === mode).label}</strong></div>
          </div>
          {subjectCounts >= 2 && (
            <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-muted)", padding: "12px", border: "1px dashed var(--border)", borderRadius: "10px" }}>
              Try explaining the last answer back to me in your own words — that's how it actually sticks.
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "14px 24px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {image && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
            <img src={image.dataUrl} alt="" style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "6px" }} />
            <span>{image.name}</span>
            <button onClick={() => setImage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}><X size={14} /></button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} aria-label="Attach image" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", width: "38px", height: "38px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text)" }}>
            <Paperclip size={16} />
          </button>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Ask a question, or paste code / an error (Shift+Enter for a new line)…" rows={2}
            style={{ flex: 1, resize: "none", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 12px", color: "var(--text)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", maxHeight: "120px" }} />
          <button onClick={() => send()} disabled={loading || (!input.trim() && !image)} aria-label="Send" style={{
            background: "var(--accent)", border: "none", borderRadius: "10px", width: "38px", height: "38px", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: loading ? "default" : "pointer",
            opacity: (!input.trim() && !image) ? 0.5 : 1, color: "var(--on-accent)",
          }}>{loading ? <Loader2 size={16} className="st-dot" /> : <Send size={16} />}</button>
        </div>
      </div>
    </>
  );
}

function SetupShell({ title, sub, subject, setSubject, topic, setTopic, extra, onGenerate, loading, error, generateLabel }) {
  return (
    <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: "480px", width: "100%", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "20px" }}>{title}</div>
          <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>{sub}</div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Subject</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {SUBJECTS.map((s) => (
              <button key={s} onClick={() => setSubject(s)} className="st-chip" style={{
                padding: "6px 12px", borderRadius: "8px", fontSize: "12.5px",
                border: `1px solid ${subject === s ? "var(--accent-2)" : "var(--border)"}`,
                background: subject === s ? "var(--surface-2)" : "transparent",
                color: subject === s ? "var(--accent-2)" : "var(--text-muted)", cursor: "pointer", fontWeight: 500,
              }}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Topic, or paste your notes / code</div>
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={5} placeholder="e.g. JavaScript promises and async/await, or paste your notes…"
            style={{ width: "100%", resize: "vertical", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", color: "var(--text)", fontSize: "13.5px", fontFamily: "var(--font-body)", outline: "none" }} />
        </div>
        {extra}
        {error && <div style={{ fontSize: "12px", color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: "8px", padding: "8px 12px" }}>{error}</div>}
        <button onClick={onGenerate} disabled={loading || !topic.trim()} style={{
          background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "10px", padding: "12px", fontSize: "14px", fontWeight: 600,
          cursor: loading ? "default" : "pointer", opacity: !topic.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        }}>{loading ? <><Loader2 size={16} className="st-dot" /> Generating…</> : generateLabel}</button>
      </div>
    </div>
  );
}

function FlashcardsView() {
  const { recordFlashcard } = useProgress();
  const [subject, setSubject] = useState("JavaScript");
  const [topic, setTopic] = useState("");
  const [cards, setCards] = useState(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const system = `You create study flashcards for a developer. For code topics, use short syntax or concept prompts and keep any code inline. Output ONLY a JSON array of 10 objects, nothing else — no prose, no markdown fences. Each object: {"front": string, "back": string}. "front" is a short question or term; "back" is a concise, correct answer or definition (max 2 sentences). Cover the most important facts and ideas a student needs to know.`;
      const raw = await callClaude(system, `Subject: ${subject}\nTopic or notes:\n${topic}`);
      const parsed = extractJson(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty");
      setCards(parsed);
      setIndex(0); setFlipped(false); setKnown({});
    } catch (e) {
      setError("Couldn't generate flashcards. Try rephrasing the topic.");
    } finally {
      setLoading(false);
    }
  }

  function mark(isKnown) {
    const currentCard = cards[index];
    setKnown((k) => ({ ...k, [index]: isKnown }));
    recordFlashcard(subject, isKnown, currentCard ? currentCard.front.split(" ").slice(0, 6).join(" ") : subject);
    setFlipped(false);
    setTimeout(() => setIndex((i) => Math.min(i + 1, cards.length - 1)), 120);
  }

  function shuffle() {
    const arr = [...cards];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setCards(arr); setIndex(0); setFlipped(false); setKnown({});
  }

  if (!cards) {
    return <SetupShell title="Generate flashcards" sub="Turn a topic or your notes into a deck of 10 flip cards."
      subject={subject} setSubject={setSubject} topic={topic} setTopic={setTopic}
      onGenerate={generate} loading={loading} error={error} generateLabel="Generate flashcards" />;
  }

  const card = cards[index];
  const knownCount = Object.values(known).filter(Boolean).length;
  const reviewedCount = Object.keys(known).length;

  return (
    <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: "460px", width: "100%", display: "flex", flexDirection: "column", gap: "18px", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{index + 1} / {cards.length} · {knownCount} known</span>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={shuffle} aria-label="Shuffle" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text)" }}><Shuffle size={14} /></button>
            <button onClick={() => setCards(null)} aria-label="New deck" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text)" }}><RotateCcw size={14} /></button>
          </div>
        </div>

        <div className="st-flip-outer" onClick={() => setFlipped((f) => !f)} style={{ width: "100%", height: "260px", cursor: "pointer" }}>
          <div className={`st-flip-inner${flipped ? " flipped" : ""}`}>
            <div className="st-flip-face" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: "17px", fontFamily: "var(--font-display)", lineHeight: 1.4 }}>{card.front}</div>
            </div>
            <div className="st-flip-face st-flip-back" style={{ background: "var(--surface-2)", border: "1px solid var(--accent)" }}>
              <div style={{ fontSize: "15px", lineHeight: 1.5 }}>{card.back}</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Tap the card to flip</div>

        <div style={{ display: "flex", gap: "10px", width: "100%" }}>
          <button onClick={() => mark(false)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "11px", borderRadius: "10px", border: "1px solid var(--danger)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}><ThumbsDown size={14} /> Still learning</button>
          <button onClick={() => mark(true)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "11px", borderRadius: "10px", border: "1px solid var(--good)", background: "var(--good-bg)", color: "var(--good)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}><ThumbsUp size={14} /> Got it</button>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => { setIndex((i) => Math.max(0, i - 1)); setFlipped(false); }} disabled={index === 0} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.4 : 1, display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}><ChevronLeft size={16} /> Prev</button>
          <button onClick={() => { setIndex((i) => Math.min(cards.length - 1, i + 1)); setFlipped(false); }} disabled={index === cards.length - 1} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: index === cards.length - 1 ? "default" : "pointer", opacity: index === cards.length - 1 ? 0.4 : 1, display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>Next <ChevronRight size={16} /></button>
        </div>

        {reviewedCount === cards.length && (
          <div className="st-pop" style={{ textAlign: "center", fontSize: "13px", color: "var(--text-muted)", padding: "12px", border: "1px dashed var(--border)", borderRadius: "10px", width: "100%" }}>
            Deck complete — {knownCount} of {cards.length} solid. {knownCount < cards.length ? "Shuffle and run through the ones you missed again." : "Nice work — try the quiz tab to test it under pressure."}
          </div>
        )}
      </div>
    </div>
  );
}

function QuizView() {
  const { recordQuizResult } = useProgress();
  const [subject, setSubject] = useState("JavaScript");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(8);
  const [qType, setQType] = useState("mixed");
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [shortDraft, setShortDraft] = useState({});
  const [shortRevealed, setShortRevealed] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const typeInstruction = qType === "mixed" ? "vary across mcq, tf, and short across the set" : `use only type "${qType}" for every question`;
      const system = `You write a quiz for a developer to test real understanding, not just recall. When useful, include a short code snippet inside the question using backticks, and test reasoning like predicting output, spotting bugs and choosing the right approach. Output ONLY a JSON array of exactly ${count} objects, nothing else — no prose, no markdown fences. Each object: {"type": "mcq"|"tf"|"short", "question": string, "options": string[] (exactly 4 plausible options for type mcq; omit or empty array for tf/short), "answer": string (must exactly match one of the options for mcq; "True" or "False" for tf; a model correct answer for short), "explanation": string (one sentence on why the answer is correct)}. Question type rule: ${typeInstruction}.`;
      const raw = await callClaude(system, `Subject: ${subject}\nTopic or notes:\n${topic}`, 1800);
      const parsed = extractJson(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty");
      setQuestions(parsed); setAnswers({}); setShortDraft({}); setShortRevealed({}); setSubmitted(false); setFeedback(null);
    } catch (e) {
      setError("Couldn't generate a quiz. Try rephrasing the topic.");
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(i, value) {
    if (submitted) return;
    setAnswers((a) => ({ ...a, [i]: value }));
  }

  function revealShort(i) {
    setShortRevealed((r) => ({ ...r, [i]: true }));
  }

  function selfGrade(i, correct) {
    setAnswers((a) => ({ ...a, [i]: correct ? "__self_correct" : "__self_incorrect" }));
  }

  const allAnswered = questions ? questions.every((_, i) => answers[i] !== undefined) : false;

  function isCorrect(q, i) {
    if (q.type === "short") return answers[i] === "__self_correct";
    return (answers[i] || "").trim().toLowerCase() === (q.answer || "").trim().toLowerCase();
  }

  async function submit() {
    setSubmitted(true);
    setFeedbackLoading(true);
    const score = questions.filter((q, i) => isCorrect(q, i)).length;
    const missedLabels = questions.filter((q, i) => !isCorrect(q, i)).map((q) => q.question.split(" ").slice(0, 6).join(" "));
    recordQuizResult(subject, score, questions.length, missedLabels);
    try {
      const summary = questions.map((q, i) => ({ question: q.question, correct: isCorrect(q, i) }));
      const missed = summary.filter((s) => !s.correct).map((s) => s.question);
      const system = `You are an encouraging tutor reviewing a student's quiz results. Write 3-4 short sentences: acknowledge what they did well, name the concept(s) behind anything they missed, and suggest one concrete next study step. Be specific, not generic.`;
      const text = await callClaude(system, `Score: ${summary.filter((s) => s.correct).length}/${summary.length}\nQuestions missed:\n${missed.length ? missed.join("\n") : "None — perfect score."}`, 300);
      setFeedback(text);
    } catch (e) {
      setFeedback(null);
    } finally {
      setFeedbackLoading(false);
    }
  }

  if (!questions) {
    return <SetupShell title="Generate a quiz" sub="Test yourself on a topic before it's tested on you."
      subject={subject} setSubject={setSubject} topic={topic} setTopic={setTopic}
      loading={loading} error={error} onGenerate={generate} generateLabel="Generate quiz"
      extra={
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Number of questions</div>
            <div style={{ display: "flex", gap: "8px" }}>
              {QUESTION_COUNTS.map((c) => (
                <button key={c} onClick={() => setCount(c)} style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${count === c ? "var(--accent)" : "var(--border)"}`, background: count === c ? "var(--accent)" : "var(--surface)", color: count === c ? "var(--on-accent)" : "var(--text)", cursor: "pointer", fontWeight: 500 }}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Question type</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {QUIZ_TYPES.map((t) => (
                <button key={t.id} onClick={() => setQType(t.id)} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12.5px", border: `1px solid ${qType === t.id ? "var(--accent)" : "var(--border)"}`, background: qType === t.id ? "var(--accent)" : "var(--surface)", color: qType === t.id ? "var(--on-accent)" : "var(--text)", cursor: "pointer", fontWeight: 500 }}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>
      } />;
  }

  if (submitted) {
    const score = questions.filter((q, i) => isCorrect(q, i)).length;
    return (
      <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: "560px", width: "100%", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "20px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--accent)", color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Award size={26} /></div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "20px" }}>{score} / {questions.length} correct</div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{subject} · {questions.length} questions</div>
            </div>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", fontSize: "13.5px", lineHeight: 1.6, minHeight: "40px" }}>
            {feedbackLoading ? <span style={{ color: "var(--text-muted)" }}>Putting together feedback…</span> : feedback ? <MessageBody text={feedback} /> : <span style={{ color: "var(--text-muted)" }}>Feedback unavailable this time — review the answers below.</span>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {questions.map((q, i) => {
              const correct = isCorrect(q, i);
              return (
                <div key={i} style={{ border: `1px solid ${correct ? "var(--good)" : "var(--danger)"}`, background: correct ? "var(--good-bg)" : "var(--danger-bg)", borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 600, marginBottom: "4px" }}>{i + 1}. {q.question}</div>
                  {q.type !== "short" && <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Your answer: {answers[i]} {!correct && `· Correct: ${q.answer}`}</div>}
                  <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "4px" }}>{q.explanation}</div>
                </div>
              );
            })}
          </div>

          <button onClick={() => setQuestions(null)} style={{ background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "10px", padding: "12px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Try another quiz</button>
        </div>
      </div>
    );
  }

  return (
    <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: "560px", width: "100%", display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "80px" }}>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{Object.keys(answers).length} / {questions.length} answered</div>
        {questions.map((q, i) => (
          <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "10px" }}>{i + 1}. {q.question}</div>
            {q.type === "mcq" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(q.options || []).map((opt, oi) => (
                  <button key={oi} onClick={() => selectAnswer(i, opt)} className="st-opt" style={{
                    textAlign: "left", padding: "10px 12px", borderRadius: "8px", fontSize: "13px",
                    border: `1px solid ${answers[i] === opt ? "var(--accent)" : "var(--border)"}`,
                    background: answers[i] === opt ? "var(--surface-2)" : "transparent", color: "var(--text)", cursor: "pointer",
                  }}>{opt}</button>
                ))}
              </div>
            )}
            {q.type === "tf" && (
              <div style={{ display: "flex", gap: "8px" }}>
                {["True", "False"].map((opt) => (
                  <button key={opt} onClick={() => selectAnswer(i, opt)} style={{
                    flex: 1, padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 500,
                    border: `1px solid ${answers[i] === opt ? "var(--accent)" : "var(--border)"}`,
                    background: answers[i] === opt ? "var(--surface-2)" : "transparent", color: "var(--text)", cursor: "pointer",
                  }}>{opt}</button>
                ))}
              </div>
            )}
            {q.type === "short" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <textarea value={shortDraft[i] || ""} onChange={(e) => setShortDraft((d) => ({ ...d, [i]: e.target.value }))} rows={2} placeholder="Write your answer…"
                  style={{ resize: "vertical", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px", color: "var(--text)", fontSize: "13px", fontFamily: "var(--font-body)", outline: "none" }} />
                {!shortRevealed[i] ? (
                  <button onClick={() => revealShort(i)} disabled={!shortDraft[i]} style={{ alignSelf: "flex-start", background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "6px 12px", fontSize: "12.5px", color: "var(--text)", cursor: "pointer", opacity: shortDraft[i] ? 1 : 0.5 }}>Check answer</button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ fontSize: "12.5px", color: "var(--text-muted)", background: "var(--bg-2)", padding: "8px 10px", borderRadius: "8px" }}>Model answer: {q.answer}</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => selfGrade(i, true)} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12.5px", border: `1px solid var(--good)`, background: answers[i] === "__self_correct" ? "var(--good-bg)" : "transparent", color: "var(--good)", cursor: "pointer" }}>I got it</button>
                      <button onClick={() => selfGrade(i, false)} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12.5px", border: `1px solid var(--danger)`, background: answers[i] === "__self_incorrect" ? "var(--danger-bg)" : "transparent", color: "var(--danger)", cursor: "pointer" }}>Need to review</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <button onClick={submit} disabled={!allAnswered} style={{
          background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "10px", padding: "13px", fontSize: "14px", fontWeight: 600,
          cursor: allAnswered ? "pointer" : "default", opacity: allAnswered ? 1 : 0.5,
        }}>Submit quiz</button>
      </div>
    </div>
  );
}

function ExamView() {
  const { progress, recordExamResult } = useProgress();
  const [subject, setSubject] = useState("JavaScript");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(30);
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [shortDraft, setShortDraft] = useState({});
  const [shortRevealed, setShortRevealed] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);

  const weakList = progress.weakTopics[subject] || [];

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(id); setRunning(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  function isCorrect(q, i) {
    if (q.type === "short") return answers[i] === "__self_correct";
    return (answers[i] || "").trim().toLowerCase() === (q.answer || "").trim().toLowerCase();
  }

  async function finish() {
    setRunning(false);
    setSubmitted(true);
    setFeedbackLoading(true);
    const totalMarks = questions.reduce((s, q) => s + (q.marks || 1), 0);
    const earnedMarks = questions.reduce((s, q, i) => s + (isCorrect(q, i) ? (q.marks || 1) : 0), 0);
    const readinessPct = totalMarks ? Math.round((earnedMarks / totalMarks) * 100) : 0;
    const missedLabels = questions.filter((q, i) => !isCorrect(q, i)).map((q) => q.question.split(" ").slice(0, 6).join(" "));
    recordExamResult(subject, readinessPct, missedLabels);
    try {
      const summary = questions.map((q, i) => ({ question: q.question, correct: isCorrect(q, i) }));
      const missedQ = summary.filter((s) => !s.correct).map((s) => s.question);
      const system = `You are reviewing a student's mock exam performance. In 3-4 sentences: give an honest readiness read (not falsely encouraging if the score is low), name the concept(s) behind what they missed, and give one concrete thing to study before the real exam.`;
      const text = await callClaude(system, `Readiness: ${readinessPct}%\nQuestions missed:\n${missedQ.length ? missedQ.join("\n") : "None — full marks."}`, 300);
      setFeedback(text);
    } catch (e) {
      setFeedback(null);
    } finally {
      setFeedbackLoading(false);
    }
  }

  // Auto-submit when the timer reaches zero (reads current state via a fresh closure, not the interval's stale one).
  useEffect(() => {
    if (secondsLeft === 0 && questions && !submitted && !running) {
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const qCount = Math.max(5, Math.round(duration / 3));
      const weakNote = weakList.length ? ` Where it fits naturally, include one or two questions that specifically test these areas the student has struggled with before: ${weakList.join(", ")}.` : "";
      const system = `You write a timed mock exam for a student preparing for a real test. Output ONLY a JSON array of exactly ${qCount} objects, nothing else — no prose, no markdown fences. Each object: {"type": "mcq"|"tf"|"short", "question": string, "options": string[] (exactly 4 for mcq, empty for tf/short), "answer": string (matches an option for mcq, "True"/"False" for tf, a model answer for short), "marks": number (1 to 5, harder or more involved questions worth more), "explanation": string (one sentence)}. Mix question types across the set, and order from easier to harder.${weakNote}`;
      const raw = await callClaude(system, `Subject: ${subject}\nTopic or chapters:\n${topic}`, 2200);
      const parsed = extractJson(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty");
      setQuestions(parsed); setAnswers({}); setShortDraft({}); setShortRevealed({}); setSubmitted(false); setFeedback(null);
      setSecondsLeft(duration * 60);
      setRunning(true);
    } catch (e) {
      setError("Couldn't generate a mock exam. Try rephrasing the topic.");
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(i, value) {
    if (submitted) return;
    setAnswers((a) => ({ ...a, [i]: value }));
  }
  function revealShort(i) { setShortRevealed((r) => ({ ...r, [i]: true })); }
  function selfGrade(i, correct) { setAnswers((a) => ({ ...a, [i]: correct ? "__self_correct" : "__self_incorrect" })); }

  const allAnswered = questions ? questions.every((_, i) => answers[i] !== undefined) : false;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (!questions) {
    return (
      <SetupShell
        title="Mock exam"
        sub="A timed, marks-weighted exam that grades itself — the closest thing to the real test."
        subject={subject} setSubject={setSubject} topic={topic} setTopic={setTopic}
        loading={loading} error={error} onGenerate={generate} generateLabel="Start exam"
        extra={
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Duration</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {EXAM_DURATIONS.map((d) => (
                  <button key={d} onClick={() => setDuration(d)} style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${duration === d ? "var(--accent)" : "var(--border)"}`, background: duration === d ? "var(--accent)" : "var(--surface)", color: duration === d ? "var(--on-accent)" : "var(--text)", cursor: "pointer", fontWeight: 500 }}>{d} min</button>
                ))}
              </div>
            </div>
            {weakList.length > 0 && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: "10px", padding: "10px 12px" }}>
                <Brain size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
                <span>This exam will lean on recent weak spots in {subject}: {weakList.join(", ")}.</span>
              </div>
            )}
          </div>
        }
      />
    );
  }

  if (submitted) {
    const totalMarks = questions.reduce((s, q) => s + (q.marks || 1), 0);
    const earnedMarks = questions.reduce((s, q, i) => s + (isCorrect(q, i) ? (q.marks || 1) : 0), 0);
    const readinessPct = totalMarks ? Math.round((earnedMarks / totalMarks) * 100) : 0;
    return (
      <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: "560px", width: "100%", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "20px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--accent)", color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><TrendingUp size={26} /></div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "20px" }}>{readinessPct}% ready</div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{earnedMarks}/{totalMarks} marks · {subject}</div>
            </div>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", fontSize: "13.5px", lineHeight: 1.6, minHeight: "40px" }}>
            {feedbackLoading ? <span style={{ color: "var(--text-muted)" }}>Reading your paper…</span> : feedback ? <MessageBody text={feedback} /> : <span style={{ color: "var(--text-muted)" }}>Feedback unavailable this time — review the answers below.</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {questions.map((q, i) => {
              const correct = isCorrect(q, i);
              return (
                <div key={i} style={{ border: `1px solid ${correct ? "var(--good)" : "var(--danger)"}`, background: correct ? "var(--good-bg)" : "var(--danger-bg)", borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 600, marginBottom: "4px" }}>{i + 1}. {q.question} <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--text-muted)" }}>({q.marks || 1} pt{(q.marks || 1) === 1 ? "" : "s"})</span></div>
                  {q.type !== "short" && <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Your answer: {answers[i]} {!correct && `· Correct: ${q.answer}`}</div>}
                  <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "4px" }}>{q.explanation}</div>
                </div>
              );
            })}
          </div>
          <button onClick={() => setQuestions(null)} style={{ background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "10px", padding: "12px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Take another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: "560px", width: "100%", display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "80px" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg)", padding: "6px 0 10px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{Object.keys(answers).length} / {questions.length} answered</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "13px", color: secondsLeft < 60 ? "var(--danger)" : "var(--text)", fontWeight: 600 }}><Clock size={14} /> {mm}:{ss}</span>
        </div>
        {questions.map((q, i) => (
          <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "10px" }}>{i + 1}. {q.question} <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, fontSize: "11px", color: "var(--text-muted)" }}>({q.marks || 1} pt{(q.marks || 1) === 1 ? "" : "s"})</span></div>
            {q.type === "mcq" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(q.options || []).map((opt, oi) => (
                  <button key={oi} onClick={() => selectAnswer(i, opt)} className="st-opt" style={{ textAlign: "left", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${answers[i] === opt ? "var(--accent)" : "var(--border)"}`, background: answers[i] === opt ? "var(--surface-2)" : "transparent", color: "var(--text)", cursor: "pointer" }}>{opt}</button>
                ))}
              </div>
            )}
            {q.type === "tf" && (
              <div style={{ display: "flex", gap: "8px" }}>
                {["True", "False"].map((opt) => (
                  <button key={opt} onClick={() => selectAnswer(i, opt)} style={{ flex: 1, padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, border: `1px solid ${answers[i] === opt ? "var(--accent)" : "var(--border)"}`, background: answers[i] === opt ? "var(--surface-2)" : "transparent", color: "var(--text)", cursor: "pointer" }}>{opt}</button>
                ))}
              </div>
            )}
            {q.type === "short" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <textarea value={shortDraft[i] || ""} onChange={(e) => setShortDraft((d) => ({ ...d, [i]: e.target.value }))} rows={2} placeholder="Write your answer…"
                  style={{ resize: "vertical", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px", color: "var(--text)", fontSize: "13px", fontFamily: "var(--font-body)", outline: "none" }} />
                {!shortRevealed[i] ? (
                  <button onClick={() => revealShort(i)} disabled={!shortDraft[i]} style={{ alignSelf: "flex-start", background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "6px 12px", fontSize: "12.5px", color: "var(--text)", cursor: "pointer", opacity: shortDraft[i] ? 1 : 0.5 }}>Check answer</button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ fontSize: "12.5px", color: "var(--text-muted)", background: "var(--bg-2)", padding: "8px 10px", borderRadius: "8px" }}>Model answer: {q.answer}</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => selfGrade(i, true)} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12.5px", border: `1px solid var(--good)`, background: answers[i] === "__self_correct" ? "var(--good-bg)" : "transparent", color: "var(--good)", cursor: "pointer" }}>I got it</button>
                      <button onClick={() => selfGrade(i, false)} style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12.5px", border: `1px solid var(--danger)`, background: answers[i] === "__self_incorrect" ? "var(--danger-bg)" : "transparent", color: "var(--danger)", cursor: "pointer" }}>Need to review</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <button onClick={finish} disabled={!allAnswered} style={{ background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "10px", padding: "13px", fontSize: "14px", fontWeight: 600, cursor: allAnswered ? "pointer" : "default", opacity: allAnswered ? 1 : 0.5 }}>Submit exam</button>
      </div>
    </div>
  );
}

function RevisionView() {
  const [subject, setSubject] = useState("JavaScript");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("notes");
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const f = REVISION_FORMATS.find((x) => x.id === format);
      const system = `You create study material for a student in grades 5-12. ${f.instruction} Do not add a preamble like "here are your notes" — start directly with the content. Keep the whole thing scannable in under a minute.`;
      const text = await callClaude(system, `Subject: ${subject}\nTopic or notes:\n${topic}`, 900);
      setContent(text);
    } catch (e) {
      setError("Couldn't generate that. Try rephrasing the topic.");
    } finally {
      setLoading(false);
    }
  }

  if (!content) {
    return (
      <SetupShell
        title="Smart revision"
        sub="Turn a topic into notes, a formula sheet, or a one-page cheat sheet."
        subject={subject} setSubject={setSubject} topic={topic} setTopic={setTopic}
        loading={loading} error={error} onGenerate={generate} generateLabel="Generate"
        extra={
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Format</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {REVISION_FORMATS.map((f) => {
                const Icon = f.icon;
                const active = format === f.id;
                return (
                  <button key={f.id} onClick={() => setFormat(f.id)} style={{
                    display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "8px", fontSize: "12.5px",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "var(--accent)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text)", cursor: "pointer", fontWeight: 500,
                  }}><Icon size={13} /> {f.label}</button>
                );
              })}
            </div>
          </div>
        }
      />
    );
  }

  const f = REVISION_FORMATS.find((x) => x.id === format);
  return (
    <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: "560px", width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "19px" }}>{f.label}</div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{subject}</div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={generate} disabled={loading} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", fontSize: "12.5px", color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>{loading ? <Loader2 size={13} className="st-dot" /> : <RotateCcw size={13} />} Regenerate</button>
            <button onClick={() => setContent(null)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", fontSize: "12.5px", color: "var(--text-muted)", cursor: "pointer" }}>New topic</button>
          </div>
        </div>
        <div className="st-pop" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "20px", fontSize: "14px" }}>
          {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : <MessageBody text={content} />}
        </div>
      </div>
    </div>
  );
}

function PlannerView() {
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [editingExam, setEditingExam] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [newTaskSubject, setNewTaskSubject] = useState("JavaScript");
  const [dailyGoal, setDailyGoal] = useState("");
  const [dailyGoalSet, setDailyGoalSet] = useState(false);
  const [dailyGoalDone, setDailyGoalDone] = useState(false);

  const FOCUS_SECS = 25 * 60;
  const BREAK_SECS = 5 * 60;
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECS);
  const [running, setRunning] = useState(false);
  const [timerMode, setTimerMode] = useState("focus");
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          setRunning(false);
          setJustFinished(true);
          const nextMode = timerMode === "focus" ? "break" : "focus";
          setTimerMode(nextMode);
          return nextMode === "focus" ? FOCUS_SECS : BREAK_SECS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, timerMode]);

  function toggleTimer() { setJustFinished(false); setRunning((r) => !r); }
  function resetTimer() { setRunning(false); setJustFinished(false); setTimerMode("focus"); setSecondsLeft(FOCUS_SECS); }

  function addTask() {
    if (!newTask.trim()) return;
    setTasks((t) => [...t, { id: Date.now(), text: newTask.trim(), subject: newTaskSubject, done: false }]);
    setNewTask("");
  }
  function toggleTask(id) { setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x))); }
  function removeTask(id) { setTasks((t) => t.filter((x) => x.id !== id)); }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const totalSecs = timerMode === "focus" ? FOCUS_SECS : BREAK_SECS;
  const progress = 1 - secondsLeft / totalSecs;

  let daysLeft = null;
  if (examDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(examDate + "T00:00:00");
    daysLeft = Math.ceil((target - today) / 86400000);
  }

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="st-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: "560px", width: "100%", display: "flex", flexDirection: "column", gap: "18px" }}>

        {/* Exam countdown */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px" }}>
          {editingExam ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Exam countdown</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input value={examName} onChange={(e) => setExamName(e.target.value)} placeholder="e.g. System design interview"
                  style={{ flex: "1 1 160px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 10px", color: "var(--text)", fontSize: "13px", outline: "none" }} />
                <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
                  style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 10px", color: "var(--text)", fontSize: "13px", outline: "none" }} />
              </div>
              <button onClick={() => examDate && examName && setEditingExam(false)} disabled={!examDate || !examName} style={{ alignSelf: "flex-start", background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "8px", padding: "8px 14px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", opacity: (!examDate || !examName) ? 0.5 : 1 }}>Set countdown</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "22px" }}>{daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"}` : daysLeft === 0 ? "Today" : "Passed"}</div>
                <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>until {examName}</div>
              </div>
              <button onClick={() => setEditingExam(true)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 12px", fontSize: "12px", color: "var(--text-muted)", cursor: "pointer" }}>Edit</button>
            </div>
          )}
        </div>

        {/* Pomodoro */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{timerMode === "focus" ? "Focus" : "Break"}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "42px", fontWeight: 500 }}>{mm}:{ss}</div>
          <div style={{ width: "100%", height: "6px", borderRadius: "4px", background: "var(--bg-2)", overflow: "hidden" }}>
            <div style={{ width: `${progress * 100}%`, height: "100%", background: "var(--accent)", transition: "width 1s linear" }} />
          </div>
          {justFinished && <div style={{ fontSize: "12.5px", color: "var(--accent)" }}>{timerMode === "break" ? "Focus session done — take a 5 minute break." : "Break's over — ready for another 25?"}</div>}
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={toggleTimer} style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              {running ? <Pause size={14} /> : <Play size={14} />} {running ? "Pause" : "Start"}
            </button>
            <button onClick={resetTimer} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", color: "var(--text)", cursor: "pointer" }}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {/* Daily goal */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>Today's goal</div>
          {!dailyGoalSet ? (
            <div style={{ display: "flex", gap: "8px" }}>
              <input value={dailyGoal} onChange={(e) => setDailyGoal(e.target.value)} placeholder="e.g. Finish 20 algebra practice problems"
                style={{ flex: 1, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 10px", color: "var(--text)", fontSize: "13px", outline: "none" }} />
              <button onClick={() => dailyGoal.trim() && setDailyGoalSet(true)} style={{ background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "8px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Set</button>
            </div>
          ) : (
            <button onClick={() => setDailyGoalDone((d) => !d)} style={{ display: "flex", alignItems: "center", gap: "10px", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left", padding: 0 }}>
              {dailyGoalDone ? <CheckSquare size={18} color="var(--good)" /> : <Square size={18} color="var(--text-muted)" />}
              <span style={{ fontSize: "13.5px", textDecoration: dailyGoalDone ? "line-through" : "none", color: dailyGoalDone ? "var(--text-muted)" : "var(--text)" }}>{dailyGoal}</span>
            </button>
          )}
        </div>

        {/* Task tracker */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Homework tracker</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{doneCount}/{tasks.length}</div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} placeholder="Add a task…"
              style={{ flex: "1 1 160px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 10px", color: "var(--text)", fontSize: "13px", outline: "none" }} />
            <select value={newTaskSubject} onChange={(e) => setNewTaskSubject(e.target.value)}
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 10px", color: "var(--text)", fontSize: "13px", outline: "none" }}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={addTask} style={{ background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "8px", width: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Plus size={16} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {tasks.length === 0 && <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Nothing tracked yet — add your first task above.</div>}
            {tasks.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", background: "var(--bg-2)" }}>
                <button onClick={() => toggleTask(t.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                  {t.done ? <CheckSquare size={17} color="var(--good)" /> : <Square size={17} color="var(--text-muted)" />}
                </button>
                <span style={{ flex: 1, fontSize: "13px", textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}>{t.text}</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "6px", padding: "2px 7px" }}>{t.subject}</span>
                <button onClick={() => removeTask(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
