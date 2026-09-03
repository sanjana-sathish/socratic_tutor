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
  questionIndex?: number; // which question this message belongs to (quiz mode)
};

type Mode = "chat" | "quiz";

type QuizState = {
  questionIndex: number;
  total: number;
  correctCount: number;
  hintsGiven: number;
  showRevealButton: boolean;
  showNextButton: boolean;
};

type Scorecard = {
  correct: number;
  total: number;
  percent: number;
  grade: string;
};

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
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);

  // Question transition animation
  const [chatVisible, setChatVisible] = useState(true);
  const prevQuestionIndexRef = useRef<number>(-1);

  // Quit-quiz confirmation popup
  const [quitTarget, setQuitTarget] = useState<Mode | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const quizFileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Animate out old question messages when question index changes
  useEffect(() => {
    if (quizState === null) return;
    const prev = prevQuestionIndexRef.current;
    const curr = quizState.questionIndex;
    if (prev !== -1 && curr !== prev) {
      // fade out → clear messages for old question → fade in
      setChatVisible(false);
      setTimeout(() => {
        setMessages((msgs) => {
          // Keep only messages that belong to the new question index or have no index
          // In practice after advance, we just clear and the next Q comes from API
          return msgs.filter((m) => m.questionIndex === curr);
        });
        setChatVisible(true);
      }, 320);
    }
    prevQuestionIndexRef.current = curr;
  }, [quizState?.questionIndex]);

  function conversationHistory() {
    return messages
      .slice(-10)
      .map((m) => `${m.role}: ${m.text}`)
      .join("\n");
  }

  function applyQuizState(result: Record<string, unknown>, newQuestionIndex?: number) {
    if (result.total_questions !== undefined) {
      setQuizState({
        questionIndex: (result.question_index as number) ?? 0,
        total: result.total_questions as number,
        correctCount: (result.correct_count as number) ?? 0,
        hintsGiven: (result.hints_given as number) ?? 0,
        showRevealButton: (result.show_reveal_button as boolean) ?? false,
        showNextButton: (result.show_next_button as boolean) ?? false,
      });
    }
    if (result.scorecard) {
      setScorecard(result.scorecard as Scorecard);
      setQuizStarted(false);
    }
    void newQuestionIndex; // suppress unused warning
  }

  async function send() {
    if ((!input.trim() && !file) || loading) return;

    const currentQIdx = quizState?.questionIndex ?? 0;

    const userMessage: Message = {
      role: "user",
      text: input.trim() || "[Image attached]",
      questionIndex: mode === "quiz" ? currentQIdx : undefined,
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

      const newQIdx = (result.question_index as number) ?? currentQIdx;
      const assistantMsg: Message = {
        role: "assistant",
        text: result.response || result.error,
        questionIndex: mode === "quiz" ? newQIdx : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setInput("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      if (mode === "quiz" && quizStarted) applyQuizState(result);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong while contacting the tutor." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function revealAnswer() {
    if (loading) return;
    setLoading(true);
    const form = new FormData();
    form.append("session_id", sessionId);
    try {
      const res = await fetch(`${API}/api/quiz/reveal`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Request failed");
      const result = await res.json();
      const newQIdx = (result.question_index as number) ?? quizState?.questionIndex ?? 0;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result.response || result.error, questionIndex: newQIdx },
      ]);
      applyQuizState(result);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Couldn't reveal the answer — check the backend is running." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function nextQuestion() {
    if (loading) return;
    setLoading(true);
    const form = new FormData();
    form.append("session_id", sessionId);
    try {
      const res = await fetch(`${API}/api/quiz/next`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Request failed");
      const result = await res.json();
      const newQIdx = (result.question_index as number) ?? quizState?.questionIndex ?? 0;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result.response || result.error, questionIndex: newQIdx },
      ]);
      applyQuizState(result);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Couldn't advance to the next question — check the backend is running." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startQuiz() {
    if (!quizFile || loading) return;
    setLoading(true);
    setElapsed(0);
    prevQuestionIndexRef.current = -1;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);

    const form = new FormData();
    form.append("session_id", sessionId);
    form.append("num_questions", String(numQuestions));
    form.append("file", quizFile);

    try {
      const res = await fetch(`${API}/api/quiz/start`, { method: "POST", body: form });
      const result = await res.json();

      setMessages([{ role: "assistant", text: result.response || result.error, questionIndex: 0 }]);
      if (!result.error) {
        setQuizStarted(true);
        prevQuestionIndexRef.current = 0;
        applyQuizState(result);
      }
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

  function resetAll() {
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setInput("");
    setFile(null);
    setQuizFile(null);
    setQuizStarted(false);
    setQuizState(null);
    setScorecard(null);
    setChatVisible(true);
    prevQuestionIndexRef.current = -1;
    if (fileRef.current) fileRef.current.value = "";
    if (quizFileRef.current) quizFileRef.current.value = "";
  }

  function newChat() {
    resetAll();
    setMode("chat");
  }

  // Called when user clicks mode button — guard if quiz active
  function requestSwitchMode(next: Mode) {
    if (next === mode) return;
    if (quizStarted) {
      setQuitTarget(next); // show confirmation popup
      return;
    }
    resetAll();
    setMode(next);
  }

  function confirmQuit() {
    const target = quitTarget;
    setQuitTarget(null);
    resetAll();
    if (target) setMode(target);
  }

  function cancelQuit() {
    setQuitTarget(null);
  }

  // Visible messages = only those belonging to the current question (quiz) or all (chat)
  const visibleMessages =
    mode === "quiz" && quizStarted && quizState !== null
      ? messages.filter(
          (m) => m.questionIndex === quizState.questionIndex || m.questionIndex === undefined
        )
      : messages;

  return (
    <div className="flex h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      {/* Quit-quiz confirmation popup */}
      {quitTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.40)", backdropFilter: "blur(3px)" }}
        >
          <div
            className="w-full max-w-xs mx-4 rounded-2xl p-6 shadow-2xl"
            style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
          >
            <p className="text-[15px] font-medium mb-1" style={{ color: "var(--ink)" }}>
              Quit the quiz?
            </p>
            <p className="text-[13px] mb-5" style={{ color: "var(--muted)" }}>
              Your progress and this session will be lost.
            </p>
            <div className="flex gap-2">
              <button
                onClick={cancelQuit}
                className="flex-1 rounded-xl py-2 text-sm font-medium transition border"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tan)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Keep going
              </button>
              <button
                onClick={confirmQuit}
                className="flex-1 rounded-xl py-2 text-sm font-medium text-white transition"
                style={{ background: "var(--accent)" }}
              >
                Quit quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className="hidden md:flex w-[260px] flex-col border-r"
        style={{ borderColor: "var(--line)" }}
      >
        {/* Top section - mode */}
        <div className="flex-1 p-4 pb-0">       
          {/* Mode label with accent line */}
          <div className="px-3 mb-1">
            <div className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--muted)" }}>
              Mode
            </div>
            <div className="h-px w-5 rounded-full mb-3" style={{ background: "var(--line)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <button
              id="mode-chat-btn"
              onClick={() => requestSwitchMode("chat")}
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
              id="mode-quiz-btn"
              onClick={() => requestSwitchMode("quiz")}
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
        </div>

        {/* Bottom section — subjects + new session */}
        <div className="p-4 pt-0">
          <div
            className="px-3 py-2 text-[12px] mb-3"
            style={{ color: "var(--muted)" }}
          >
            Physics · Chemistry · Biology · Math
          </div>
          <button
            id="new-session-btn"
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition border"
            style={{
              borderColor: "var(--line)",
              color: "var(--ink)",
              background: "transparent",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tan)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span className="text-base leading-none">+</span>
            New session
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col min-w-0">
        {/* Header with accent line below */}
        <header
          className="h-14 flex items-center px-6 shrink-0"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <button className="md:hidden mr-3 text-xl" style={{ color: "var(--ink)" }}>
            ☰
          </button>
          <div className="font-serif-display text-[18px]" style={{ color: "var(--ink)" }}>
            {mode === "chat" ? "Socratic Tutor" : "Quiz Me"}
          </div>
          {/* Accent underline dot */}
          <div
            className="ml-2 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent)", opacity: 0.7 }}
          />
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {/* Quiz progress bar — theme-matched background */}
          {mode === "quiz" && quizStarted && quizState && (
            <div
              className="sticky top-0 z-10 px-6 py-3 border-b"
              style={{
                borderColor: "var(--line)",
                background: "var(--paper)",
              }}
            >
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                    Question {quizState.questionIndex + 1} of {quizState.total}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                      ✓ {quizState.correctCount} correct
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                      {Math.round((quizState.questionIndex / quizState.total) * 100)}% done
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: quizState.total }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-1.5 rounded-full transition-all duration-500"
                      style={{
                        background:
                          i < quizState.questionIndex
                            ? "var(--accent)"
                            : i === quizState.questionIndex
                            ? "var(--accent)"
                            : "var(--tan)",
                        opacity: i === quizState.questionIndex ? 0.45 : 1,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chat area — animated transition on question change */}
          <div
            style={{
              opacity: chatVisible ? 1 : 0,
              transform: chatVisible ? "translateY(0)" : "translateY(6px)",
              transition: "opacity 300ms ease, transform 300ms ease",
            }}
          >
            {visibleMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center px-6 min-h-[60vh]">
                <div className="max-w-lg w-full text-center">
                  <h1
                    className="font-serif-display text-[32px] leading-tight"
                    style={{ color: "var(--ink)" }}
                  >
                    {mode === "chat" ? "What are you working on?" : "Upload something to be quizzed on"}
                  </h1>
                  <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    {mode === "chat"
                      ? "Ask a Physics, Chemistry, Biology, or Math question, or attach a diagram."
                      : "Choose how many questions you want. Wrong answers get hints, not just marked wrong."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto px-6 py-8">
                <div className="space-y-7">
                  {visibleMessages.map((message, index) => (
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

                  {/* Reveal Answer button — appears after MAX_HINTS failed attempts */}
                  {mode === "quiz" && quizStarted && quizState?.showRevealButton && !quizState?.showNextButton && !loading && (
                    <div className="flex justify-start">
                      <button
                        id="reveal-answer-btn"
                        onClick={revealAnswer}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition border"
                        style={{
                          borderColor: "var(--accent)",
                          color: "var(--accent)",
                          background: "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--accent)";
                          e.currentTarget.style.color = "#fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--accent)";
                        }}
                      >
                        💡 Reveal Answer
                      </button>
                    </div>
                  )}

                  {/* Next Question button — appears after answer has been revealed */}
                  {mode === "quiz" && quizStarted && quizState?.showNextButton && !loading && (
                    <div className="flex justify-start">
                      <button
                        id="next-question-btn"
                        onClick={nextQuestion}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition"
                        style={{
                          background: "var(--accent)",
                          color: "#fff",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = "0.85";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = "1";
                        }}
                      >
                        Next Question →
                      </button>
                    </div>
                  )}

                  {loading && (
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
        </div>

        {/* Quiz setup bar */}
        {mode === "quiz" && !quizStarted && !scorecard && (
          <div className="px-6 pb-4 shrink-0">
            <div
              className="max-w-2xl mx-auto flex items-center gap-3 rounded-2xl px-4 py-3 border"
              style={{ borderColor: "var(--line)", background: "var(--tan)" }}
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
                  style={{ borderColor: "var(--line)", color: "var(--ink)", background: "var(--paper)" }}
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

        {/* Composer — hidden while awaiting next question after reveal */}
        {(mode === "chat" || (quizStarted && !scorecard && !quizState?.showNextButton)) && (
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
                className="rounded-[28px] border transition"
                style={{ borderColor: "var(--line)", background: "var(--paper)" }}
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

        {/* Scorecard overlay */}
        {scorecard && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          >
            <div
              className="relative w-full max-w-sm mx-4 rounded-3xl p-8 text-center shadow-2xl"
              style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
            >
              {/* Score ring */}
              <div className="flex justify-center mb-6">
                <div
                  className="w-28 h-28 rounded-full flex flex-col items-center justify-center"
                  style={{
                    background: `conic-gradient(var(--accent) ${scorecard.percent * 3.6}deg, var(--tan) 0deg)`,
                  }}
                >
                  <div
                    className="w-20 h-20 rounded-full flex flex-col items-center justify-center"
                    style={{ background: "var(--paper)" }}
                  >
                    <span className="text-3xl font-bold" style={{ color: "var(--ink)" }}>
                      {scorecard.percent}%
                    </span>
                  </div>
                </div>
              </div>

              <h2 className="text-[22px] font-semibold mb-1" style={{ color: "var(--ink)" }}>
                Quiz Complete!
              </h2>
              <p className="text-[15px] mb-1" style={{ color: "var(--muted)" }}>
                {scorecard.correct} of {scorecard.total} correct
              </p>
              <p className="text-[14px] mt-3 mb-6" style={{ color: "var(--ink)" }}>
                {scorecard.grade}
              </p>

              <button
                onClick={newChat}
                id="scorecard-new-session"
                className="w-full rounded-2xl py-3 text-sm font-medium text-white transition"
                style={{ background: "var(--accent)" }}
              >
                Start a new session
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}