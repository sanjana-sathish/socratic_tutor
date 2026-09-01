"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const API = "http://localhost:8000";

type Message = {
  role: "user" | "assistant";
  text: string;
};

type Mode = "chat" | "quiz";

export default function Home() {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<Mode>("chat");
  const [quizStarted, setQuizStarted] = useState(false);
  const [numQuestions, setNumQuestions] = useState(5);
  const [quizFile, setQuizFile] = useState<File | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const quizFileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function conversationHistory() {
    return messages
      .slice(-10)
      .map((m) => `${m.role}: ${m.text}`)
      .join("\n");
  }

  async function send() {
    if ((!input.trim() && !file) || loading) return;

    const userMessage: Message = {
      role: "user",
      text: input.trim() || "[Image attached]",
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const form = new FormData();
    form.append("session_id", sessionId);
    form.append("conversation_history", conversationHistory());
    form.append("message", input);

    const endpoint = mode === "quiz" && quizStarted ? "/api/quiz/answer" : "/api/chat";
    if (endpoint === "/api/chat" && file) {
      form.append("file", file);
    }

    try {
      const res = await fetch(`${API}${endpoint}`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Request failed");
      const result = await res.json();

      setMessages((prev) => [...prev, { role: "assistant", text: result.response || result.error }]);
      setInput("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong while contacting the tutor." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startQuiz() {
    if (!quizFile || loading) return;
    setLoading(true);
    setElapsed(0);
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);

    const form = new FormData();
    form.append("session_id", sessionId);
    form.append("num_questions", String(numQuestions));
    form.append("file", quizFile);

    try {
      const res = await fetch(`${API}/api/quiz/start`, { method: "POST", body: form });
      const result = await res.json();

      setMessages((prev) => [...prev, { role: "assistant", text: result.response || result.error }]);
      setQuizStarted(!result.error);
      setQuizFile(null);
      if (quizFileRef.current) quizFileRef.current.value = "";
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Couldn't start the quiz — check the backend is running." },
      ]);
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  function newChat() {
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setInput("");
    setFile(null);
    setQuizFile(null);
    setQuizStarted(false);
    setMode("chat");
    if (fileRef.current) fileRef.current.value = "";
    if (quizFileRef.current) quizFileRef.current.value = "";
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    if (next === "chat") setQuizStarted(false);
  }

  return (
    <div className="flex h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      {/* Sidebar */}
      <aside
        className="hidden md:flex w-[260px] flex-col p-4 border-r"
        style={{ borderColor: "var(--line)" }}
      >
        <button
          onClick={newChat}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition"
          style={{ color: "var(--ink)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tan)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span className="text-lg leading-none">+</span>
          New session
        </button>

        <div className="mt-8 mb-2 px-3 text-[13px]" style={{ color: "var(--muted)" }}>
          Mode
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => switchMode("chat")}
            className="text-left px-3 py-2.5 rounded-xl text-sm transition"
            style={{
              background: mode === "chat" ? "var(--tan)" : "transparent",
              color: mode === "chat" ? "var(--ink)" : "var(--muted)",
              fontWeight: mode === "chat" ? 500 : 400,
            }}
          >
            Ask a question
          </button>
          <button
            onClick={() => switchMode("quiz")}
            className="text-left px-3 py-2.5 rounded-xl text-sm transition"
            style={{
              background: mode === "quiz" ? "var(--tan)" : "transparent",
              color: mode === "quiz" ? "var(--ink)" : "var(--muted)",
              fontWeight: mode === "quiz" ? 500 : 400,
            }}
          >
            Quiz me
          </button>
        </div>

        <div className="flex-1" />

        <div className="px-3 py-3 text-[13px] border-t" style={{ color: "var(--muted)", borderColor: "var(--line)" }}>
          Physics · Chemistry · Biology · Math
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header
          className="h-16 flex items-center px-6 border-b md:border-none shrink-0"
          style={{ borderColor: "var(--line)" }}
        >
          <button className="md:hidden mr-3 text-xl" style={{ color: "var(--ink)" }}>
            ☰
          </button>
          <div className="font-serif-display text-[19px]" style={{ color: "var(--ink)" }}>
            {mode === "chat" ? "Socratic Tutor" : "Quiz Me"}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6">
              <div className="max-w-lg w-full text-center">
                <h1 className="font-serif-display text-[32px] leading-tight" style={{ color: "var(--ink)" }}>
                  {mode === "chat" ? "What are you working on?" : "Upload something to be quizzed on"}
                </h1>
                <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {mode === "chat"
                    ? "Ask a Physics, Chemistry, Biology, or Math question, or attach a diagram."
                    : "Choose how many questions you want. Wrong answers get taught, not just marked wrong."}
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-6 py-8">
              <div className="space-y-7">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                  >
                    {message.role === "user" ? (
                      <div
                        className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-br-md text-[15px] leading-relaxed"
                        style={{ background: "var(--tan)", color: "var(--ink)" }}
                      >
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {message.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div
                        className="
                          w-full prose prose-neutral max-w-none
                          text-[15px] leading-7
                          prose-p:my-2 prose-headings:mt-5 prose-headings:mb-2
                          prose-ul:my-2 prose-ol:my-2
                          prose-pre:rounded-xl
                        "
                        style={{ color: "var(--ink)" }}
                      >
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {message.text}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}

                {loading && mode === "chat" && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: "var(--muted)" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:150ms]"
                      style={{ background: "var(--muted)" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:300ms]"
                      style={{ background: "var(--muted)" }}
                    />
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>
          )}
        </div>

        {/* Quiz setup bar */}
        {mode === "quiz" && !quizStarted && (
          <div className="px-6 pb-4 shrink-0">
            <div
              className="max-w-2xl mx-auto flex items-center gap-3 rounded-2xl px-4 py-3 border"
              style={{ borderColor: "var(--line)", background: "#fff" }}
            >
              <input
                ref={quizFileRef}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => setQuizFile(e.target.files?.[0] || null)}
                className="text-sm flex-1"
                style={{ color: "var(--ink)" }}
              />
              <label className="text-sm flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                Questions
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="w-14 rounded-lg px-2 py-1 text-sm border"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                />
              </label>
              <button
                onClick={startQuiz}
                disabled={!quizFile || loading}
                className="rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-40 transition"
                style={{ background: "var(--accent)" }}
              >
                {loading ? `Working… ${elapsed}s` : "Start quiz"}
              </button>
            </div>
          </div>
        )}

        {/* Composer */}
        {(mode === "chat" || quizStarted) && (
          <div className="px-6 pb-6 shrink-0">
            <div className="max-w-2xl mx-auto">
              {file && mode === "chat" && (
                <div
                  className="mb-2 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                  style={{ background: "var(--tan)", color: "var(--ink)" }}
                >
                  <span className="max-w-[220px] truncate">{file.name}</span>
                  <button
                    onClick={() => setFile(null)}
                    style={{ color: "var(--muted)" }}
                    className="hover:opacity-70"
                  >
                    ×
                  </button>
                </div>
              )}

              <div
                className="rounded-[28px] border bg-white transition"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="flex items-end gap-2 px-3 py-3">
                  {mode === "chat" && (
                    <>
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg transition"
                        style={{ color: "var(--muted)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tan)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        title="Attach image"
                      >
                        +
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </>
                  )}

                  <textarea
                    value={input}
                    rows={2}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={mode === "chat" ? "Ask anything" : "Type your answer"}
                    className="flex-1 resize-none max-h-40 min-h-[52px] py-1.5 outline-none bg-transparent text-[15px] leading-6"
                    style={{ color: "var(--ink)" }}
                  />

                  <button
                    onClick={send}
                    disabled={loading || (!input.trim() && !file)}
                    className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white disabled:opacity-30 transition"
                    style={{ background: "var(--accent)" }}
                  >
                    ↑
                  </button>
                </div>
              </div>

              <div className="text-center text-[12px] mt-2.5" style={{ color: "var(--muted)" }}>
                AI can make mistakes. Check important answers.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}